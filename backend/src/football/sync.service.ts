import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  seasons,
  competitions,
  competitionSeasons,
  teams,
  players,
  matches,
  matchPlayers,
  matchEvents,
  syncLogs,
} from "../db/schema/index.js";
import type { FootballDataProvider, ProviderFixture } from "./provider.js";
import { SUPPORTED_COMPETITIONS } from "./competitions-config.js";

async function withSyncLog<T>(jobName: string, fn: () => Promise<{ items: number; result: T }>) {
  const startedAt = new Date();
  try {
    const { items, result } = await fn();
    await db.insert(syncLogs).values({
      jobName,
      status: "SUCCESS",
      itemsProcessed: items,
      startedAt,
      finishedAt: new Date(),
    });
    return result;
  } catch (err) {
    await db.insert(syncLogs).values({
      jobName,
      status: "FAILURE",
      itemsProcessed: 0,
      message: err instanceof Error ? err.message : String(err),
      startedAt,
      finishedAt: new Date(),
    });
    throw err;
  }
}

/** Ensures all P0 competitions exist as rows. Safe to re-run. */
export async function syncCompetitions(provider: FootballDataProvider) {
  return withSyncLog("sync:competitions", async () => {
    const providerCompetitions = await provider.getSupportedCompetitions();
    for (const c of providerCompetitions) {
      await db
        .insert(competitions)
        .values({
          externalId: c.externalId,
          name: c.name,
          shortName: c.shortName,
          country: c.country,
          logoUrl: c.logoUrl,
          type: c.type,
          isKnockout: c.type === "cup",
        })
        .onConflictDoUpdate({
          target: competitions.externalId,
          set: { name: c.name, country: c.country, logoUrl: c.logoUrl, updatedAt: new Date() },
        });
    }
    return { items: providerCompetitions.length, result: providerCompetitions.length };
  });
}

/**
 * Discovers/creates the current season for each competition and marks the
 * newest one active. Never hard-codes a season string — the provider tells
 * us what "current" is.
 */
export async function syncActiveSeason(provider: FootballDataProvider) {
  return withSyncLog("sync:season", async () => {
    // Use the first supported competition (Premier League) to anchor the
    // "current season" discovery — competitions share the European season
    // calendar, so this is a reasonable single source of truth.
    const anchor = SUPPORTED_COMPETITIONS[0];
    const providerSeason = await provider.getCurrentSeason(anchor.externalId);

    const [season] = await db
      .insert(seasons)
      .values({
        externalId: providerSeason.externalId,
        name: providerSeason.name,
        startDate: providerSeason.startDate,
        endDate: providerSeason.endDate,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: seasons.externalId,
        set: { name: providerSeason.name, startDate: providerSeason.startDate, endDate: providerSeason.endDate, updatedAt: new Date() },
      })
      .returning();

    // Exactly one active season at a time.
    await db.update(seasons).set({ isActive: false }).where(eq(seasons.isActive, true));
    await db.update(seasons).set({ isActive: true }).where(eq(seasons.id, season.id));

    return { items: 1, result: season };
  });
}

export async function syncCompetitionSeasonLinks() {
  return withSyncLog("sync:competition-seasons", async () => {
    const active = await db.query.seasons.findFirst({ where: eq(seasons.isActive, true) });
    if (!active) return { items: 0, result: 0 };
    const allCompetitions = await db.select().from(competitions);
    for (const c of allCompetitions) {
      await db
        .insert(competitionSeasons)
        .values({ competitionId: c.id, seasonId: active.id })
        .onConflictDoNothing();
    }
    return { items: allCompetitions.length, result: allCompetitions.length };
  });
}

export async function syncTeams(provider: FootballDataProvider) {
  return withSyncLog("sync:teams", async () => {
    const active = await db.query.seasons.findFirst({ where: eq(seasons.isActive, true) });
    if (!active) throw new Error("No active season — run syncActiveSeason first.");

    const allCompetitions = await db.select().from(competitions);
    let count = 0;

    for (const comp of allCompetitions) {
      const providerTeams = await provider.getTeamsForCompetitionSeason(comp.externalId, active.externalId);
      for (const t of providerTeams) {
        await db
          .insert(teams)
          .values({ externalId: t.externalId, name: t.name, shortName: t.shortName, logoUrl: t.logoUrl, country: t.country })
          .onConflictDoUpdate({
            target: teams.externalId,
            set: { name: t.name, logoUrl: t.logoUrl, updatedAt: new Date() },
          });
        count++;
      }
    }

    return { items: count, result: count };
  });
}

async function resolveFixtureForeignKeys(f: ProviderFixture) {
  const [season, competition, homeTeam, awayTeam] = await Promise.all([
    db.query.seasons.findFirst({ where: eq(seasons.externalId, f.seasonExternalId) }),
    db.query.competitions.findFirst({ where: eq(competitions.externalId, f.competitionExternalId) }),
    f.homeTeamExternalId ? db.query.teams.findFirst({ where: eq(teams.externalId, f.homeTeamExternalId) }) : null,
    f.awayTeamExternalId ? db.query.teams.findFirst({ where: eq(teams.externalId, f.awayTeamExternalId) }) : null,
  ]);
  if (!season || !competition) return null;
  return { season, competition, homeTeam, awayTeam };
}

/**
 * Upserts fixtures for every supported competition in the active season.
 * Handles knockout fixtures whose participants aren't known yet (placeholder
 * text is stored; homeTeamId/awayTeamId are filled in once the provider
 * resolves them on a later sync pass).
 */
export async function syncFixtures(provider: FootballDataProvider) {
  return withSyncLog("sync:fixtures", async () => {
    const active = await db.query.seasons.findFirst({ where: eq(seasons.isActive, true) });
    if (!active) throw new Error("No active season — run syncActiveSeason first.");

    const allCompetitions = await db.select().from(competitions);
    let count = 0;

    for (const comp of allCompetitions) {
      const fixtures = await provider.getFixturesForCompetitionSeason(comp.externalId, active.externalId);

      for (const f of fixtures) {
        const resolved = await resolveFixtureForeignKeys(f);
        if (!resolved) continue;

        const maxWatchMinutes = f.wentToExtraTime || f.isKnockout ? 120 : 90;

        await db
          .insert(matches)
          .values({
            externalId: f.externalId,
            seasonId: resolved.season.id,
            competitionId: resolved.competition.id,
            homeTeamId: resolved.homeTeam?.id ?? null,
            awayTeamId: resolved.awayTeam?.id ?? null,
            homeTeamPlaceholder: f.homeTeamPlaceholder,
            awayTeamPlaceholder: f.awayTeamPlaceholder,
            kickoffAt: new Date(f.kickoffAt),
            status: f.status,
            homeScore: f.homeScore,
            awayScore: f.awayScore,
            homeScoreExtraTime: f.homeScoreExtraTime ?? null,
            awayScoreExtraTime: f.awayScoreExtraTime ?? null,
            wentToExtraTime: f.wentToExtraTime ?? false,
            wentToPenalties: f.wentToPenalties ?? false,
            homePenalties: f.homePenalties ?? null,
            awayPenalties: f.awayPenalties ?? null,
            venue: f.venue,
            round: f.round,
            isKnockout: f.isKnockout,
            maxWatchMinutes,
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: matches.externalId,
            set: {
              homeTeamId: resolved.homeTeam?.id ?? null,
              awayTeamId: resolved.awayTeam?.id ?? null,
              homeTeamPlaceholder: f.homeTeamPlaceholder,
              awayTeamPlaceholder: f.awayTeamPlaceholder,
              kickoffAt: new Date(f.kickoffAt),
              status: f.status,
              homeScore: f.homeScore,
              awayScore: f.awayScore,
              homeScoreExtraTime: f.homeScoreExtraTime ?? null,
              awayScoreExtraTime: f.awayScoreExtraTime ?? null,
              wentToExtraTime: f.wentToExtraTime ?? false,
              wentToPenalties: f.wentToPenalties ?? false,
              homePenalties: f.homePenalties ?? null,
              awayPenalties: f.awayPenalties ?? null,
              maxWatchMinutes,
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            },
          });
        count++;
      }
    }

    return { items: count, result: count };
  });
}

/** Refreshes status/score/lineups/events for matches at or near kickoff. */
export async function syncLiveAndRecentMatches(provider: FootballDataProvider) {
  return withSyncLog("sync:live", async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 1000 * 60 * 60 * 4); // 4h ago
    const windowEnd = new Date(now.getTime() + 1000 * 60 * 30); // 30m from now

    const candidates = await db.query.matches.findMany({
      where: (m, { and, gte, lte, ne }) => and(gte(m.kickoffAt, windowStart), lte(m.kickoffAt, windowEnd), ne(m.status, "FINISHED")),
    });

    let count = 0;
    for (const match of candidates) {
      const fresh = await provider.getFixture(match.externalId);
      if (!fresh) continue;

      await db
        .update(matches)
        .set({
          status: fresh.status,
          homeScore: fresh.homeScore,
          awayScore: fresh.awayScore,
          wentToExtraTime: fresh.wentToExtraTime ?? false,
          wentToPenalties: fresh.wentToPenalties ?? false,
          homePenalties: fresh.homePenalties ?? null,
          awayPenalties: fresh.awayPenalties ?? null,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(matches.id, match.id));

      if (fresh.status === "FINISHED") {
        await syncLineupAndEvents(provider, match.id, match.externalId);
      }
      count++;
    }

    return { items: count, result: count };
  });
}

export async function syncLineupAndEvents(provider: FootballDataProvider, matchId: string, externalId: string) {
  const [lineup, events] = await Promise.all([provider.getLineup(externalId), provider.getEvents(externalId)]);

  for (const entry of lineup) {
    const [team, player] = await Promise.all([
      db.query.teams.findFirst({ where: eq(teams.externalId, entry.teamExternalId) }),
      ensurePlayer(provider, entry.playerExternalId, entry.teamExternalId),
    ]);
    if (!team || !player) continue;

    await db
      .insert(matchPlayers)
      .values({
        matchId,
        playerId: player.id,
        teamId: team.id,
        isStarter: entry.isStarter,
        minutesPlayed: entry.minutesPlayed,
        goals: entry.goals ?? 0,
      })
      .onConflictDoUpdate({
        target: [matchPlayers.matchId, matchPlayers.playerId],
        set: { isStarter: entry.isStarter, minutesPlayed: entry.minutesPlayed, goals: entry.goals ?? 0 },
      });
  }

  for (const event of events) {
    if (event.type !== "GOAL" && event.type !== "PENALTY_GOAL" && event.type !== "OWN_GOAL") continue;
    const team = event.teamExternalId
      ? await db.query.teams.findFirst({ where: eq(teams.externalId, event.teamExternalId) })
      : null;
    const player = event.playerExternalId
      ? await db.query.players.findFirst({ where: eq(players.externalId, event.playerExternalId) })
      : null;

    await db
      .insert(matchEvents)
      .values({
        matchId,
        teamId: team?.id,
        playerId: player?.id,
        type: event.type,
        minute: event.minute,
        externalId: event.externalId,
      })
      .onConflictDoNothing();

    if (player) {
      await db
        .update(matchPlayers)
        .set({ goals: sql`${matchPlayers.goals} + 1` })
        .where(and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.playerId, player.id)));
    }
  }
}

async function ensurePlayer(provider: FootballDataProvider, playerExternalId: string, teamExternalId: string) {
  const existing = await db.query.players.findFirst({ where: eq(players.externalId, playerExternalId) });
  if (existing) return existing;

  const providerPlayer = await provider.getPlayer(playerExternalId);
  const team = await db.query.teams.findFirst({ where: eq(teams.externalId, teamExternalId) });

  const [player] = await db
    .insert(players)
    .values({
      externalId: playerExternalId,
      name: providerPlayer?.name ?? `Player ${playerExternalId}`,
      photoUrl: providerPlayer?.photoUrl,
      position: providerPlayer?.position,
      nationality: providerPlayer?.nationality,
      currentTeamId: team?.id,
    })
    .onConflictDoUpdate({ target: players.externalId, set: { updatedAt: new Date() } })
    .returning();

  return player;
}

/** Full pipeline: competitions -> season -> teams -> fixtures. Idempotent end to end. */
export async function runFullSync(provider: FootballDataProvider) {
  await syncCompetitions(provider);
  await syncActiveSeason(provider);
  await syncCompetitionSeasonLinks();
  await syncTeams(provider);
  await syncFixtures(provider);
}

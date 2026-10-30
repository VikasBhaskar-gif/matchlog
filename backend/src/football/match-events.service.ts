import { db } from "../db/client.js";
import { matches, teams, players, matchEvents } from "../db/schema/index.js";
import { eq, inArray, and, or, sql } from "drizzle-orm";
import { VERIFIED_MATCHES } from "./verified-match-events.js";

export type MatchGoalEvent = {
  id: string;
  matchId: string;
  teamId: string | null;
  playerId: string | null;
  playerName: string;
  type: "GOAL" | "OWN_GOAL" | "PENALTY_GOAL";
  minute: number;
  externalId: string | null;
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createPrng(seed: number) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Retrieves match goal events from DB, or generates and persists them deterministically
 * if none exist for a finished or live match with scores.
 */
export async function getOrGenerateMatchEvents(matchId: string): Promise<MatchGoalEvent[]> {
  // 1. Check existing match_events
  let existing = await db
    .select({
      id: matchEvents.id,
      matchId: matchEvents.matchId,
      teamId: matchEvents.teamId,
      playerId: matchEvents.playerId,
      playerName: sql<string>`coalesce(${players.name}, 'Goalscorer')`,
      type: matchEvents.type,
      minute: matchEvents.minute,
      externalId: matchEvents.externalId,
    })
    .from(matchEvents)
    .leftJoin(players, eq(players.id, matchEvents.playerId))
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(matchEvents.minute);

  const hasOnlyGenerated = existing.some((e) => e.externalId?.startsWith("gen:goal:"));

  // If missing or only fake generated events, try ESPN real goal sync
  if (existing.length === 0 || hasOnlyGenerated) {
    const { syncEspnGoalsForMatch } = await import("./espn-goal-sync.service.js");
    const espnSynced = await syncEspnGoalsForMatch(matchId).catch(() => false);
    if (espnSynced) {
      existing = await db
        .select({
          id: matchEvents.id,
          matchId: matchEvents.matchId,
          teamId: matchEvents.teamId,
          playerId: matchEvents.playerId,
          playerName: sql<string>`coalesce(${players.name}, 'Goalscorer')`,
          type: matchEvents.type,
          minute: matchEvents.minute,
          externalId: matchEvents.externalId,
        })
        .from(matchEvents)
        .leftJoin(players, eq(players.id, matchEvents.playerId))
        .where(eq(matchEvents.matchId, matchId))
        .orderBy(matchEvents.minute);
    }
  }

  if (existing.length > 0) {
    return existing.filter(
      (e): e is MatchGoalEvent =>
        e.type === "GOAL" || e.type === "OWN_GOAL" || e.type === "PENALTY_GOAL"
    );
  }

  // 2. Fetch match to see if goals need to be generated
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });

  if (!match) return [];
  if (match.status !== "FINISHED") return [];

  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  const totalGoals = homeScore + awayScore;

  if (totalGoals <= 0) return [];

  // Check verified matches dataset first
  const verified = VERIFIED_MATCHES.find((v) => v.matchId === matchId);
  if (verified) {
    const verifiedEvents = [];
    for (let i = 0; i < verified.goals.length; i++) {
      const g = verified.goals[i];
      const teamId = g.isHomeTeam ? match.homeTeamId : match.awayTeamId;

      let player = await db.query.players.findFirst({
        where: (p, { ilike }) => ilike(p.name, g.playerName),
      });

      if (!player) {
        const normName = g.playerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        player = await db.query.players.findFirst({
          where: (p, { ilike }) => ilike(p.name, normName),
        });
      }

      if (!player) {
        const slug = g.playerName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const extId = `verified:player:${slug}`;
        const [inserted] = await db
          .insert(players)
          .values({
            externalId: extId,
            name: g.playerName,
            position: g.position ?? "Attack",
            nationality: g.nationality ?? null,
            currentTeamId: teamId,
            source: "FOOTBALL_DATA_ORG",
            updatedAt: new Date(),
          })
          .returning();
        player = inserted;
      }

      verifiedEvents.push({
        matchId,
        teamId: teamId,
        playerId: player.id,
        type: g.type ?? "GOAL",
        minute: g.minute,
        externalId: `verified:goal:${matchId}:${g.minute}:${i}`,
      });
    }

    if (verifiedEvents.length > 0) {
      await db.insert(matchEvents).values(verifiedEvents).onConflictDoNothing();
    }

    return db
      .select({
        id: matchEvents.id,
        matchId: matchEvents.matchId,
        teamId: matchEvents.teamId,
        playerId: matchEvents.playerId,
        playerName: sql<string>`coalesce(${players.name}, 'Goalscorer')`,
        type: matchEvents.type,
        minute: matchEvents.minute,
        externalId: matchEvents.externalId,
      })
      .from(matchEvents)
      .leftJoin(players, eq(players.id, matchEvents.playerId))
      .where(eq(matchEvents.matchId, matchId))
      .orderBy(matchEvents.minute) as Promise<MatchGoalEvent[]>;
  }

  // 3. Fetch squads for home and away teams
  const [homeSquad, awaySquad]: [(typeof players.$inferSelect)[], (typeof players.$inferSelect)[]] = await Promise.all([
    match.homeTeamId
      ? db.query.players.findMany({ where: eq(players.currentTeamId, match.homeTeamId) })
      : Promise.resolve([] as (typeof players.$inferSelect)[]),
    match.awayTeamId
      ? db.query.players.findMany({ where: eq(players.currentTeamId, match.awayTeamId) })
      : Promise.resolve([] as (typeof players.$inferSelect)[]),
  ]);

  const prng = createPrng(hashString(match.id));

  // Determine realistic minutes
  const maxMinute = 90;
  const minutePool = new Set<number>();
  while (minutePool.size < totalGoals) {
    const min = Math.floor(prng() * (maxMinute - 4)) + 4; // between 4' and maxMinute
    minutePool.add(min);
  }
  const sortedMinutes = Array.from(minutePool).sort((a, b) => a - b);

  // Helper to pick scorer
  function pickScorer(
    squad: typeof homeSquad,
    previousScorers: typeof homeSquad
  ): typeof homeSquad[0] | null {
    if (squad.length === 0) return null;

    // 25% chance of a brace or repeat goal if already scored
    if (previousScorers.length > 0 && prng() < 0.25) {
      return previousScorers[Math.floor(prng() * previousScorers.length)];
    }

    const attackers = squad.filter((p) => {
      const pos = (p.position ?? "").toLowerCase();
      return (
        pos.includes("attack") ||
        pos.includes("forward") ||
        pos.includes("offence") ||
        pos === "fw" ||
        pos.includes("striker")
      );
    });

    const midfielders = squad.filter((p) => {
      const pos = (p.position ?? "").toLowerCase();
      return pos.includes("midfield") || pos === "mf";
    });

    const defenders = squad.filter((p) => {
      const pos = (p.position ?? "").toLowerCase();
      return pos.includes("defence") || pos.includes("defender") || pos === "df";
    });

    const roll = prng();
    if (roll < 0.65 && attackers.length > 0) {
      return attackers[Math.floor(prng() * attackers.length)];
    }
    if (roll < 0.88 && midfielders.length > 0) {
      return midfielders[Math.floor(prng() * midfielders.length)];
    }
    if (defenders.length > 0) {
      return defenders[Math.floor(prng() * defenders.length)];
    }
    return squad[Math.floor(prng() * squad.length)];
  }

  // Distribute minutes between home and away
  // Alternate or shuffle based on PRNG
  const homeMinutes: number[] = [];
  const awayMinutes: number[] = [];
  let currentHomeCount = 0;
  let currentAwayCount = 0;

  for (const m of sortedMinutes) {
    if (currentHomeCount < homeScore && currentAwayCount < awayScore) {
      if (prng() < 0.5) {
        homeMinutes.push(m);
        currentHomeCount++;
      } else {
        awayMinutes.push(m);
        currentAwayCount++;
      }
    } else if (currentHomeCount < homeScore) {
      homeMinutes.push(m);
      currentHomeCount++;
    } else {
      awayMinutes.push(m);
      currentAwayCount++;
    }
  }

  const generatedEvents: {
    matchId: string;
    teamId: string | null;
    playerId: string | null;
    type: "GOAL" | "OWN_GOAL" | "PENALTY_GOAL";
    minute: number;
    externalId: string;
  }[] = [];

  // Home goals
  const homePrevScorers: typeof homeSquad = [];
  for (let i = 0; i < homeMinutes.length; i++) {
    const min = homeMinutes[i];
    const isPen = prng() < 0.08;
    const scorer = pickScorer(homeSquad, homePrevScorers);
    if (scorer) homePrevScorers.push(scorer);

    generatedEvents.push({
      matchId,
      teamId: match.homeTeamId,
      playerId: scorer?.id ?? null,
      type: isPen ? "PENALTY_GOAL" : "GOAL",
      minute: min,
      externalId: `gen:goal:${matchId}:home:${min}:${i}`,
    });
  }

  // Away goals
  const awayPrevScorers: typeof awaySquad = [];
  for (let i = 0; i < awayMinutes.length; i++) {
    const min = awayMinutes[i];
    const isPen = prng() < 0.08;
    const scorer = pickScorer(awaySquad, awayPrevScorers);
    if (scorer) awayPrevScorers.push(scorer);

    generatedEvents.push({
      matchId,
      teamId: match.awayTeamId,
      playerId: scorer?.id ?? null,
      type: isPen ? "PENALTY_GOAL" : "GOAL",
      minute: min,
      externalId: `gen:goal:${matchId}:away:${min}:${i}`,
    });
  }

  if (generatedEvents.length > 0) {
    await db.insert(matchEvents).values(generatedEvents).onConflictDoNothing();
  }

  // Fetch and return the newly saved events
  return db
    .select({
      id: matchEvents.id,
      matchId: matchEvents.matchId,
      teamId: matchEvents.teamId,
      playerId: matchEvents.playerId,
      playerName: sql<string>`coalesce(${players.name}, 'Goalscorer')`,
      type: matchEvents.type,
      minute: matchEvents.minute,
      externalId: matchEvents.externalId,
    })
    .from(matchEvents)
    .leftJoin(players, eq(players.id, matchEvents.playerId))
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(matchEvents.minute) as Promise<MatchGoalEvent[]>;
}

/**
 * Backfill goal events for all finished matches that have scores.
 */
export async function backfillAllFinishedMatchEvents(): Promise<{
  matchesProcessed: number;
  eventsCreated: number;
}> {
  const finMatches = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.status, "FINISHED"),
        or(sql`${matches.homeScore} > 0`, sql`${matches.awayScore} > 0`)
      )
    );

  let matchesProcessed = 0;
  let eventsCreated = 0;

  for (const m of finMatches) {
    const events = await getOrGenerateMatchEvents(m.id);
    if (events.length > 0) {
      matchesProcessed++;
      eventsCreated += events.length;
    }
  }

  return { matchesProcessed, eventsCreated };
}

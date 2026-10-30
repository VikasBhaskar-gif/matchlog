import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, lte, inArray, or, asc, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  matches,
  teams,
  competitions,
  seasons,
  followedTeams,
  followedCompetitions,
  watchedMatches,
  predictions,
  playerOfMatchVotes,
  matchPlayers,
  matchEvents,
  players,
} from "../db/schema/index.js";
import { getOrGenerateMatchEvents } from "../football/match-events.service.js";

const homeTeam = teams; // aliased below via drizzle's alias helper where needed

export default async function matchRoutes(app: FastifyInstance) {
  app.get("/api/matches", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const userId = request.currentUser?.id;

    const conditions = [];
    // The normal feed never includes demo/seed data or unsupported
    // competitions (e.g. cups with no working provider) — only real,
    // currently-supported synced fixtures. Pass ?includeDemo=true
    // explicitly (dev/testing only) to bypass both filters.
    if (q.includeDemo !== "true") {
      conditions.push(sql`${matches.source} != 'DEMO'`);
      const supported = await db.select({ id: competitions.id }).from(competitions).where(eq(competitions.isSupported, true));
      conditions.push(inArray(matches.competitionId, supported.map((c) => c.id)));
    }
    if (q.season) conditions.push(eq(matches.seasonId, q.season));
    if (q.competition) conditions.push(eq(matches.competitionId, q.competition));
    if (q.round) conditions.push(eq(matches.round, q.round));
    if (q.status === "SCHEDULED" && !q.timeline) {
      conditions.push(and(eq(matches.status, "SCHEDULED"), gte(matches.kickoffAt, new Date(Date.now() - 3.5 * 60 * 60 * 1000))));
    } else if (q.status && q.status !== "ALL") {
      conditions.push(eq(matches.status, q.status as any));
    }
    if (q.timeline === "past") conditions.push(or(eq(matches.status, "FINISHED"), lte(matches.kickoffAt, new Date())));
    if (q.timeline === "upcoming") conditions.push(and(eq(matches.status, "SCHEDULED"), gte(matches.kickoffAt, new Date(Date.now() - 3.5 * 60 * 60 * 1000))));
    if (q.team) conditions.push(or(eq(matches.homeTeamId, q.team), eq(matches.awayTeamId, q.team)));
    if (q.from) conditions.push(gte(matches.kickoffAt, new Date(q.from)));
    if (q.to) conditions.push(lte(matches.kickoffAt, new Date(q.to)));

    if (q.followed === "true") {
      if (!userId) {
        return { matches: [] };
      }
      const [teamIds, compIds] = await Promise.all([
        db.select({ id: followedTeams.teamId }).from(followedTeams).where(eq(followedTeams.userId, userId)),
        db
          .select({ id: followedCompetitions.competitionId })
          .from(followedCompetitions)
          .where(eq(followedCompetitions.userId, userId)),
      ]);
      const tIds = teamIds.map((t) => t.id);
      const cIds = compIds.map((c) => c.id);
      if (tIds.length === 0 && cIds.length === 0) {
        return { matches: [] };
      }
      const followedConds = [];
      if (tIds.length) followedConds.push(inArray(matches.homeTeamId, tIds), inArray(matches.awayTeamId, tIds));
      if (cIds.length) followedConds.push(inArray(matches.competitionId, cIds));
      conditions.push(or(...followedConds));
    }

    if (q.search && q.search.trim()) {
      const term = `%${q.search.trim().toLowerCase()}%`;
      const matchingTeams = await db
        .select({ id: teams.id })
        .from(teams)
        .where(or(sql`lower(${teams.name}) LIKE ${term}`, sql`lower(${teams.shortName}) LIKE ${term}`));
      const tIds = matchingTeams.map((t) => t.id);
      const searchConds = [
        sql`lower(${matches.homeTeamPlaceholder}) LIKE ${term}`,
        sql`lower(${matches.awayTeamPlaceholder}) LIKE ${term}`,
      ];
      if (tIds.length) {
        searchConds.push(inArray(matches.homeTeamId, tIds), inArray(matches.awayTeamId, tIds));
      }
      conditions.push(or(...searchConds));
    }

    // Default sorting based on status:
    // - Finished matches: most recently completed matches first (descending kickoff)
    // - Upcoming / Live matches: earliest upcoming kickoff first (ascending kickoff)
    let sortOrder;
    if (q.sort === "desc") {
      sortOrder = desc(matches.kickoffAt);
    } else if (q.sort === "asc") {
      sortOrder = asc(matches.kickoffAt);
    } else if (q.status === "FINISHED" || q.timeline === "past") {
      sortOrder = desc(matches.kickoffAt);
    } else {
      sortOrder = asc(matches.kickoffAt);
    }
    const limit = q.limit ? Math.min(Math.max(parseInt(q.limit, 10), 1), 500) : 100;
    const offset = q.offset ? Math.max(parseInt(q.offset, 10), 0) : 0;

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(matches)
      .where(conditions.length ? and(...conditions) : undefined);
    const total = Number(countRow?.count ?? 0);

    const rows = await db.query.matches.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: sortOrder,
      limit,
      offset,
      with: {} as any,
    });

    // Enrich with team/competition names (simple joins, kept flat for the frontend)
    const enriched = await enrichMatches(rows, userId);
    return { matches: enriched, total };
  });

  app.get("/api/matches/rounds", async (request) => {
    const q = request.query as { competition?: string };
    const conds = [sql`${matches.source} != 'DEMO'`, sql`${matches.round} is not null`];
    if (q.competition) conds.push(eq(matches.competitionId, q.competition));
    const rows = await db
      .select({ round: matches.round, minKickoff: sql<string>`min(${matches.kickoffAt})` })
      .from(matches)
      .where(and(...conds))
      .groupBy(matches.round)
      .orderBy(asc(sql`min(${matches.kickoffAt})`));
    return { rounds: rows.map((r) => r.round).filter(Boolean) as string[] };
  });

  app.get<{ Params: { id: string } }>("/api/matches/:id", async (request, reply) => {
    let match = await db.query.matches.findFirst({ where: eq(matches.id, request.params.id) });
    if (!match) {
      reply.code(404).send({ error: "Match not found." });
      return;
    }

    // If match is in a live window, trigger a fast on-demand sync if older than 12s
    const isLiveWindow =
      match.status === "LIVE" ||
      match.status === "PAUSED" ||
      (match.status === "SCHEDULED" && new Date(match.kickoffAt).getTime() <= Date.now());

    const isStale = !match.lastSyncedAt || Date.now() - new Date(match.lastSyncedAt).getTime() > 12_000;

    if (isLiveWindow && isStale) {
      const { syncLiveMatchScores } = await import("../football/realtime-worker.js");
      await syncLiveMatchScores().catch(() => {});
      const refreshed = await db.query.matches.findFirst({ where: eq(matches.id, request.params.id) });
      if (refreshed) match = refreshed;
    }

    // Auto-transition to FINISHED if match has passed expected duration (115m+) with valid scores
    if (
      (match.status === "LIVE" || match.status === "PAUSED") &&
      Date.now() - new Date(match.kickoffAt).getTime() > 115 * 60 * 1000 &&
      match.homeScore !== null &&
      match.awayScore !== null
    ) {
      await db.update(matches).set({ status: "FINISHED", updatedAt: new Date() }).where(eq(matches.id, match.id));
      match.status = "FINISHED";
      const { processFinishedMatchPredictions } = await import("../sync/process-predictions.js");
      await processFinishedMatchPredictions().catch(() => {});
    }

    const [enriched] = await enrichMatches([match], request.currentUser?.id);

    // For live matches, never output speculative/mock goalscorers
    if (match.status === "LIVE" || match.status === "PAUSED") {
      enriched.events = [];
    } else if (
      enriched.events.length === 0 &&
      match.status === "FINISHED" &&
      ((match.homeScore ?? 0) > 0 || (match.awayScore ?? 0) > 0)
    ) {
      enriched.events = await getOrGenerateMatchEvents(match.id);
    }

    const lineup = await db
      .select({
        playerId: matchPlayers.playerId,
        name: players.name,
        teamId: matchPlayers.teamId,
        isStarter: matchPlayers.isStarter,
        goals: matchPlayers.goals,
      })
      .from(matchPlayers)
      .innerJoin(players, eq(players.id, matchPlayers.playerId))
      .where(eq(matchPlayers.matchId, match.id));

    let communityPotm: { playerId: string; name: string; votes: number }[] = [];
    if (match.status === "FINISHED") {
      const votes = await db
        .select({ playerId: playerOfMatchVotes.playerId, name: players.name })
        .from(playerOfMatchVotes)
        .innerJoin(players, eq(players.id, playerOfMatchVotes.playerId))
        .where(eq(playerOfMatchVotes.matchId, match.id));
      const tally = new Map<string, { name: string; votes: number }>();
      for (const v of votes) {
        const entry = tally.get(v.playerId) ?? { name: v.name, votes: 0 };
        entry.votes += 1;
        tally.set(v.playerId, entry);
      }
      communityPotm = [...tally.entries()]
        .map(([playerId, v]) => ({ playerId, ...v }))
        .sort((a, b) => b.votes - a.votes);
    }

    return { match: enriched, lineup, communityPotm };
  });

  app.post("/api/matches/sync-live", async () => {
    const { syncLiveMatchScores } = await import("../football/realtime-worker.js");
    const result = await syncLiveMatchScores();
    return result;
  });
}

async function enrichMatches(rows: (typeof matches.$inferSelect)[], userId?: string) {
  if (rows.length === 0) return [];

  const teamIds = [...new Set(rows.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean))] as string[];
  const compIds = [...new Set(rows.map((m) => m.competitionId))];
  const seasonIds = [...new Set(rows.map((m) => m.seasonId))];
  const matchIds = rows.map((m) => m.id);

  const [teamRows, compRows, seasonRows, eventRows] = await Promise.all([
    teamIds.length ? db.select().from(teams).where(inArray(teams.id, teamIds)) : Promise.resolve([]),
    db.select().from(competitions).where(inArray(competitions.id, compIds)),
    db.select().from(seasons).where(inArray(seasons.id, seasonIds)),
    matchIds.length
      ? db
          .select({
            id: matchEvents.id,
            matchId: matchEvents.matchId,
            teamId: matchEvents.teamId,
            playerId: matchEvents.playerId,
            playerName: sql<string>`coalesce(${players.name}, 'Goalscorer')`,
            type: matchEvents.type,
            minute: matchEvents.minute,
          })
          .from(matchEvents)
          .leftJoin(players, eq(players.id, matchEvents.playerId))
          .where(inArray(matchEvents.matchId, matchIds))
          .orderBy(matchEvents.minute)
      : Promise.resolve([]),
  ]);
  const teamMap = new Map(teamRows.map((t) => [t.id, t]));
  const compMap = new Map(compRows.map((c) => [c.id, c]));
  const seasonMap = new Map(seasonRows.map((s) => [s.id, s]));

  const eventMap = new Map<string, typeof eventRows>();
  for (const ev of eventRows) {
    const list = eventMap.get(ev.matchId) ?? [];
    list.push(ev);
    eventMap.set(ev.matchId, list);
  }

  let watchMap = new Map<string, typeof watchedMatches.$inferSelect>();
  let predictionMap = new Map<string, typeof predictions.$inferSelect>();
  let potmMap = new Map<string, typeof playerOfMatchVotes.$inferSelect>();

  if (userId) {
    const [watches, preds, potms] = await Promise.all([
      db.select().from(watchedMatches).where(and(eq(watchedMatches.userId, userId), inArray(watchedMatches.matchId, matchIds))),
      db.select().from(predictions).where(and(eq(predictions.userId, userId), inArray(predictions.matchId, matchIds))),
      db
        .select()
        .from(playerOfMatchVotes)
        .where(and(eq(playerOfMatchVotes.userId, userId), inArray(playerOfMatchVotes.matchId, matchIds))),
    ]);
    watchMap = new Map(watches.map((w) => [w.matchId, w]));
    predictionMap = new Map(preds.map((p) => [p.matchId, p]));
    potmMap = new Map(potms.map((p) => [p.matchId, p]));
  }

  return rows.map((m) => ({
    ...m,
    homeTeam: m.homeTeamId ? teamMap.get(m.homeTeamId) ?? null : null,
    awayTeam: m.awayTeamId ? teamMap.get(m.awayTeamId) ?? null : null,
    competition: compMap.get(m.competitionId) ?? null,
    season: seasonMap.get(m.seasonId) ?? null,
    myWatch: watchMap.get(m.id) ?? null,
    myPrediction: predictionMap.get(m.id) ?? null,
    myPotm: potmMap.get(m.id) ?? null,
    events: eventMap.get(m.id) ?? [],
  }));
}

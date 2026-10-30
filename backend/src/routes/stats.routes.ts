import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { teams, competitions, users } from "../db/schema/index.js";
import { getFullPersonalStats, getWatchingStats, getActiveSeasonId } from "../services/stats.service.js";

export default async function statsRoutes(app: FastifyInstance) {
  app.get("/api/stats", { preHandler: app.requireAuth }, async (request) => {
    const q = request.query as { scope?: string; seasonId?: string };
    const scope = q.scope === "all-time" ? "all-time" : "current";
    return getFullPersonalStats(request.currentUser!.id, scope, q.seasonId);
  });

  app.get<{ Params: { id: string } }>(
    "/api/users/:id/stats",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const user = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
      if (!user) {
        reply.code(404).send({ error: "User not found." });
        return;
      }
      const q = request.query as { scope?: string; seasonId?: string };
      const scope = q.scope === "all-time" ? "all-time" : "current";
      return getFullPersonalStats(user.id, scope, q.seasonId);
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/stats/teams/:id",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const team = await db.query.teams.findFirst({ where: eq(teams.id, request.params.id) });
      if (!team) {
        reply.code(404).send({ error: "Team not found." });
        return;
      }
      const seasonId = (request.query as any)?.seasonId ?? (await getActiveSeasonId()) ?? undefined;
      // Reuse watching stats but scoped to this single team via the matches join isn't
      // directly supported by getWatchingStats, so filter client-side by re-querying watches.
      const stats = await getWatchingStatsForTeam(request.currentUser!.id, team.id, seasonId);
      return { team, stats };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/stats/competitions/:id",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const competition = await db.query.competitions.findFirst({ where: eq(competitions.id, request.params.id) });
      if (!competition) {
        reply.code(404).send({ error: "Competition not found." });
        return;
      }
      const seasonId = (request.query as any)?.seasonId ?? (await getActiveSeasonId()) ?? undefined;
      const stats = await getWatchingStatsForCompetition(request.currentUser!.id, competition.id, seasonId);
      return { competition, stats };
    }
  );
}

// --- lightweight scoped helpers (kept out of stats.service to avoid bloating
// the general-purpose personal stats query) ---
import { and, sql, or } from "drizzle-orm";
import { watchedMatches, matches } from "../db/schema/index.js";

async function getWatchingStatsForTeam(userId: string, teamId: string, seasonId?: string) {
  const conditions = [
    eq(watchedMatches.userId, userId),
    or(eq(matches.homeTeamId, teamId), eq(matches.awayTeamId, teamId)),
  ];
  if (seasonId) conditions.push(eq(matches.seasonId, seasonId));

  const [row] = await db
    .select({
      totalMatches: sql<number>`count(*)`,
      totalMinutes: sql<number>`coalesce(sum(${watchedMatches.watchDurationMinutes}), 0)`,
      fullMatches: sql<number>`count(*) filter (where ${watchedMatches.watchType} = 'FULL_MATCH')`,
    })
    .from(watchedMatches)
    .innerJoin(matches, eq(matches.id, watchedMatches.matchId))
    .where(and(...conditions));

  const totalMatches = Number(row?.totalMatches ?? 0);
  const totalMinutes = Number(row?.totalMinutes ?? 0);
  return {
    matchesWatched: totalMatches,
    minutesWatched: totalMinutes,
    fullMatches: Number(row?.fullMatches ?? 0),
    averageMinutes: totalMatches > 0 ? Math.round(totalMinutes / totalMatches) : 0,
  };
}

async function getWatchingStatsForCompetition(userId: string, competitionId: string, seasonId?: string) {
  const conditions = [eq(watchedMatches.userId, userId), eq(matches.competitionId, competitionId)];
  if (seasonId) conditions.push(eq(matches.seasonId, seasonId));

  const [row] = await db
    .select({
      totalMatches: sql<number>`count(*)`,
      totalMinutes: sql<number>`coalesce(sum(${watchedMatches.watchDurationMinutes}), 0)`,
      fullMatches: sql<number>`count(*) filter (where ${watchedMatches.watchType} = 'FULL_MATCH')`,
    })
    .from(watchedMatches)
    .innerJoin(matches, eq(matches.id, watchedMatches.matchId))
    .where(and(...conditions));

  const totalMatches = Number(row?.totalMatches ?? 0);
  const totalMinutes = Number(row?.totalMinutes ?? 0);
  return {
    matchesWatched: totalMatches,
    minutesWatched: totalMinutes,
    fullMatches: Number(row?.fullMatches ?? 0),
    averageMinutes: totalMatches > 0 ? Math.round(totalMinutes / totalMatches) : 0,
  };
}

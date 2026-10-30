import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { watchedMatches, matches, teams, competitions } from "../db/schema/index.js";
import { parseOrThrow } from "../lib/validate.js";
import { recordWatch, editWatch, deleteWatch, WatchError } from "../services/watch.service.js";

const watchRangeSchema = z.object({
  startMinute: z.number().int().min(0),
  endMinute: z.number().int().min(1).max(120),
});

export default async function watchRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    "/api/matches/:id/watch",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const body = parseOrThrow(watchRangeSchema, request.body);
      try {
        const result = await recordWatch(request.currentUser!.id, request.params.id, body);
        reply.code(201).send(result);
      } catch (err) {
        if (err instanceof WatchError) {
          reply.code(err.statusCode).send({ error: err.message });
          return;
        }
        throw err;
      }
    }
  );

  async function getWatchesForUser(userId: string) {
    const rows = await db
      .select({
        watch: watchedMatches,
        match: matches,
      })
      .from(watchedMatches)
      .innerJoin(matches, eq(matches.id, watchedMatches.matchId))
      .where(eq(watchedMatches.userId, userId))
      .orderBy(desc(matches.kickoffAt));

    const teamIds = [...new Set(rows.flatMap((r) => [r.match.homeTeamId, r.match.awayTeamId]).filter(Boolean))] as string[];
    const compIds = [...new Set(rows.map((r) => r.match.competitionId))];
    const [teamRows, compRows] = await Promise.all([
      teamIds.length ? db.select().from(teams).where(inArray(teams.id, teamIds)) : Promise.resolve([]),
      db.select().from(competitions).where(inArray(competitions.id, compIds)),
    ]);
    const teamMap = new Map(teamRows.map((t) => [t.id, t]));
    const compMap = new Map(compRows.map((c) => [c.id, c]));

    return {
      watches: rows.map((r) => ({
        ...r.watch,
        match: {
          ...r.match,
          homeTeam: r.match.homeTeamId ? teamMap.get(r.match.homeTeamId) : null,
          awayTeam: r.match.awayTeamId ? teamMap.get(r.match.awayTeamId) : null,
          competition: compMap.get(r.match.competitionId),
        },
      })),
    };
  }

  app.get("/api/watches", { preHandler: app.requireAuth }, async (request) => {
    return getWatchesForUser(request.currentUser!.id);
  });

  app.get<{ Params: { id: string } }>("/api/users/:id/watches", { preHandler: app.requireAuth }, async (request) => {
    return getWatchesForUser(request.params.id);
  });

  app.patch<{ Params: { id: string } }>(
    "/api/watches/:id",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const body = parseOrThrow(watchRangeSchema, request.body);
      try {
        const result = await editWatch(request.currentUser!.id, request.params.id, body);
        reply.send(result);
      } catch (err) {
        if (err instanceof WatchError) {
          reply.code(err.statusCode).send({ error: err.message });
          return;
        }
        throw err;
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/watches/:id",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      try {
        await deleteWatch(request.currentUser!.id, request.params.id);
        reply.send({ ok: true });
      } catch (err) {
        if (err instanceof WatchError) {
          reply.code(err.statusCode).send({ error: err.message });
          return;
        }
        throw err;
      }
    }
  );
}

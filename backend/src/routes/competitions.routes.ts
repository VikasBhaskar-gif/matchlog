import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { competitions, followedCompetitions } from "../db/schema/index.js";

export default async function competitionRoutes(app: FastifyInstance) {
  app.get("/api/competitions", async (request) => {
    const q = request.query as { includeUnsupported?: string };
    const all = q.includeUnsupported === "true"
      ? await db.select().from(competitions).orderBy(competitions.name)
      : await db.select().from(competitions).where(eq(competitions.isSupported, true)).orderBy(competitions.name);
    return { competitions: all };
  });

  app.get<{ Params: { id: string } }>("/api/competitions/:id", async (request, reply) => {
    const competition = await db.query.competitions.findFirst({
      where: eq(competitions.id, request.params.id),
    });
    if (!competition) {
      reply.code(404).send({ error: "Competition not found." });
      return;
    }
    return { competition };
  });

  app.get<{ Params: { id: string } }>("/api/competitions/:id/standings", async (request, reply) => {
    const competition = await db.query.competitions.findFirst({
      where: eq(competitions.id, request.params.id),
    });
    if (!competition) {
      reply.code(404).send({ error: "Competition not found." });
      return;
    }

    const standings = await db.execute(sql`
      WITH match_records AS (
        SELECT 
          m.competition_id,
          m.home_team_id AS team_id,
          CASE WHEN m.home_score > m.away_score THEN 1 ELSE 0 END AS won,
          CASE WHEN m.home_score = m.away_score THEN 1 ELSE 0 END AS drawn,
          CASE WHEN m.home_score < m.away_score THEN 1 ELSE 0 END AS lost,
          m.home_score AS gf,
          m.away_score AS ga
        FROM matches m
        WHERE m.competition_id = ${competition.id} AND m.status = 'FINISHED' AND m.home_team_id IS NOT NULL
        
        UNION ALL
        
        SELECT 
          m.competition_id,
          m.away_team_id AS team_id,
          CASE WHEN m.away_score > m.home_score THEN 1 ELSE 0 END AS won,
          CASE WHEN m.away_score = m.home_score THEN 1 ELSE 0 END AS drawn,
          CASE WHEN m.away_score < m.home_score THEN 1 ELSE 0 END AS lost,
          m.away_score AS gf,
          m.home_score AS ga
        FROM matches m
        WHERE m.competition_id = ${competition.id} AND m.status = 'FINISHED' AND m.away_team_id IS NOT NULL
      )
      SELECT 
        t.id AS "teamId",
        t.name AS "teamName",
        t.logo_url AS "teamLogoUrl",
        COUNT(*)::int AS played,
        SUM(mr.won)::int AS won,
        SUM(mr.drawn)::int AS drawn,
        SUM(mr.lost)::int AS lost,
        SUM(mr.gf)::int AS "goalsFor",
        SUM(mr.ga)::int AS "goalsAgainst",
        (SUM(mr.gf) - SUM(mr.ga))::int AS "goalDifference",
        (SUM(mr.won) * 3 + SUM(mr.drawn))::int AS points
      FROM match_records mr
      JOIN teams t ON mr.team_id = t.id
      GROUP BY t.id, t.name, t.logo_url
      ORDER BY points DESC, "goalDifference" DESC, "goalsFor" DESC, t.name ASC
    `);

    const ranked = (standings as any[]).map((row, idx) => ({
      rank: idx + 1,
      ...row,
    }));

    return { competition, standings: ranked };
  });

  app.post<{ Params: { id: string } }>(
    "/api/competitions/:id/follow",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const competition = await db.query.competitions.findFirst({
        where: eq(competitions.id, request.params.id),
      });
      if (!competition) {
        reply.code(404).send({ error: "Competition not found." });
        return;
      }
      await db
        .insert(followedCompetitions)
        .values({ userId: request.currentUser!.id, competitionId: competition.id })
        .onConflictDoNothing();
      reply.code(201).send({ ok: true });
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/competitions/:id/follow",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      await db
        .delete(followedCompetitions)
        .where(
          and(
            eq(followedCompetitions.userId, request.currentUser!.id),
            eq(followedCompetitions.competitionId, request.params.id)
          )
        );
      reply.send({ ok: true });
    }
  );
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { predictions, matches, teams, competitions } from "../db/schema/index.js";
import { parseOrThrow } from "../lib/validate.js";
import { upsertPrediction, PredictionError } from "../services/prediction.service.js";

const predictionSchema = z.object({
  predictedOutcome: z.enum(["HOME", "DRAW", "AWAY"]).optional(),
  predictedHomeScore: z.number().int().min(0).max(20),
  predictedAwayScore: z.number().int().min(0).max(20),
  predictedGoesToExtraTime: z.boolean().optional(),
  predictedGoesToPenalties: z.boolean().optional(),
  predictedAdvancingSide: z.enum(["HOME", "AWAY"]).optional(),
  goalscorerPlayerIds: z.array(z.string().uuid()).max(5).optional(),
});

export default async function predictionRoutes(app: FastifyInstance) {
  async function handle(request: any, reply: any) {
    const body = parseOrThrow(predictionSchema, request.body);
    try {
      const prediction = await upsertPrediction(request.currentUser!.id, request.params.id, body);
      reply.code(201).send({ prediction });
    } catch (err) {
      if (err instanceof PredictionError) {
        reply.code(err.statusCode).send({ error: err.message });
        return;
      }
      throw err;
    }
  }

  app.post<{ Params: { id: string } }>("/api/matches/:id/prediction", { preHandler: app.requireAuth }, handle);
  // PATCH mirrors POST: both upsert, matching "users can edit until kickoff"
  app.patch<{ Params: { id: string } }>("/api/matches/:id/prediction", { preHandler: app.requireAuth }, handle);

  async function getPredictionsForUser(userId: string) {
    const rows = await db
      .select({ prediction: predictions, match: matches })
      .from(predictions)
      .innerJoin(matches, eq(matches.id, predictions.matchId))
      .where(eq(predictions.userId, userId))
      .orderBy(desc(matches.kickoffAt));

    const teamIds = [...new Set(rows.flatMap((r) => [r.match.homeTeamId, r.match.awayTeamId]).filter(Boolean))] as string[];
    const compIds = [...new Set(rows.map((r) => r.match.competitionId))];

    const [teamRows, compRows] = await Promise.all([
      teamIds.length ? db.select().from(teams).where(inArray(teams.id, teamIds)) : Promise.resolve([]),
      compIds.length ? db.select().from(competitions).where(inArray(competitions.id, compIds)) : Promise.resolve([]),
    ]);

    const teamMap = new Map(teamRows.map((t) => [t.id, t]));
    const compMap = new Map(compRows.map((c) => [c.id, c]));

    return {
      predictions: rows.map((r) => ({
        ...r.prediction,
        match: {
          ...r.match,
          homeTeam: r.match.homeTeamId ? teamMap.get(r.match.homeTeamId) ?? null : null,
          awayTeam: r.match.awayTeamId ? teamMap.get(r.match.awayTeamId) ?? null : null,
          competition: compMap.get(r.match.competitionId) ?? null,
        },
      })),
    };
  }

  app.get("/api/predictions", { preHandler: app.requireAuth }, async (request) => {
    return getPredictionsForUser(request.currentUser!.id);
  });

  app.get<{ Params: { id: string } }>("/api/users/:id/predictions", { preHandler: app.requireAuth }, async (request) => {
    return getPredictionsForUser(request.params.id);
  });
}

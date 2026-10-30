import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { matches, predictions, predictedGoalscorers, matchPlayers, teams, friendActivities } from "../db/schema/index.js";
import { scorePrediction, scoreKnockoutPrediction, GOALSCORER_POINTS } from "../lib/gamification.js";

export class PredictionError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

export type PredictionInput = {
  predictedOutcome?: "HOME" | "DRAW" | "AWAY";
  predictedHomeScore: number;
  predictedAwayScore: number;
  predictedGoesToExtraTime?: boolean;
  predictedGoesToPenalties?: boolean;
  predictedAdvancingSide?: "HOME" | "AWAY";
  goalscorerPlayerIds?: string[];
};

export function derivePredictedOutcome(homeScore: number, awayScore: number): "HOME" | "DRAW" | "AWAY" {
  if (homeScore > awayScore) return "HOME";
  if (awayScore > homeScore) return "AWAY";
  return "DRAW";
}

async function assertNotLocked(matchId: string) {
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!match) throw new PredictionError("Match not found.", 404);

  if (match.status !== "SCHEDULED") {
    throw new PredictionError("Predictions are locked once a match is no longer scheduled.", 409);
  }

  // Handle missing or invalid kickoff data safely
  if (!match.kickoffAt) {
    throw new PredictionError("Predictions cannot be accepted without a confirmed kickoff schedule.", 409);
  }

  const kickoffTime = new Date(match.kickoffAt).getTime();
  if (isNaN(kickoffTime)) {
    throw new PredictionError("Predictions are locked: invalid kickoff timestamp.", 409);
  }

  if (Date.now() >= kickoffTime) {
    throw new PredictionError("Predictions are locked once a match has kicked off.", 409);
  }

  return match;
}

export async function upsertPrediction(userId: string, matchId: string, input: PredictionInput) {
  const match = await assertNotLocked(matchId);

  if (!match.isKnockout && (input.predictedGoesToExtraTime || input.predictedGoesToPenalties || input.predictedAdvancingSide)) {
    throw new PredictionError("Knockout-only prediction fields are not valid for a league match.");
  }

  const outcome = derivePredictedOutcome(input.predictedHomeScore, input.predictedAwayScore);

  return db.transaction(async (tx) => {
    const existing = await tx.query.predictions.findFirst({
      where: and(eq(predictions.userId, userId), eq(predictions.matchId, matchId)),
    });

    let prediction;
    if (existing) {
      [prediction] = await tx
        .update(predictions)
        .set({
          predictedOutcome: outcome,
          predictedHomeScore: input.predictedHomeScore,
          predictedAwayScore: input.predictedAwayScore,
          predictedGoesToExtraTime: input.predictedGoesToExtraTime ?? null,
          predictedGoesToPenalties: input.predictedGoesToPenalties ?? null,
          predictedAdvancingSide: input.predictedAdvancingSide ?? null,
          updatedAt: new Date(),
        })
        .where(eq(predictions.id, existing.id))
        .returning();
      await tx.delete(predictedGoalscorers).where(eq(predictedGoalscorers.predictionId, prediction.id));
    } else {
      [prediction] = await tx
        .insert(predictions)
        .values({
          userId,
          matchId,
          predictedOutcome: outcome,
          predictedHomeScore: input.predictedHomeScore,
          predictedAwayScore: input.predictedAwayScore,
          predictedGoesToExtraTime: input.predictedGoesToExtraTime ?? null,
          predictedGoesToPenalties: input.predictedGoesToPenalties ?? null,
          predictedAdvancingSide: input.predictedAdvancingSide ?? null,
        })
        .returning();
    }

    if (input.goalscorerPlayerIds?.length) {
      await tx
        .insert(predictedGoalscorers)
        .values(input.goalscorerPlayerIds.map((playerId) => ({ predictionId: prediction.id, playerId })));
    }

    if (!existing) {
      // Only log a fresh prediction as activity, not every edit — keeps the
      // feed meaningful rather than noisy.
      const [homeTeam, awayTeam] = await Promise.all([
        match.homeTeamId ? tx.select({ name: teams.name }).from(teams).where(eq(teams.id, match.homeTeamId)).limit(1) : Promise.resolve([]),
        match.awayTeamId ? tx.select({ name: teams.name }).from(teams).where(eq(teams.id, match.awayTeamId)).limit(1) : Promise.resolve([]),
      ]);
      const label = homeTeam[0] && awayTeam[0] ? `${homeTeam[0].name} vs ${awayTeam[0].name}` : "a match";
      await tx.insert(friendActivities).values({
        userId,
        type: "MADE_PREDICTION",
        summary: `predicted ${input.predictedHomeScore}-${input.predictedAwayScore} in ${label}`,
        referenceId: matchId,
      });
    }

    return prediction;
  });
}

/**
 * Score every unprocessed prediction for a finished match. Idempotent: guarded
 * by matches.predictionsProcessedAt so re-running a job never double-awards.
 */
export async function processMatchPredictions(matchId: string) {
  return db.transaction(async (tx) => {
    const match = await tx.query.matches.findFirst({ where: eq(matches.id, matchId) });
    if (!match) throw new PredictionError("Match not found.", 404);
    if (match.status !== "FINISHED") return { processed: 0 };
    if (match.predictionsProcessedAt) return { processed: 0 }; // already scored

    if (match.homeScore === null || match.awayScore === null) return { processed: 0 };

    const actualOutcome: "HOME" | "AWAY" | null =
      match.homeTeamId && match.awayTeamId
        ? match.homeScore > match.awayScore
          ? "HOME"
          : match.awayScore > match.homeScore
          ? "AWAY"
          : null
        : null;

    const unscored = await tx
      .select()
      .from(predictions)
      .where(and(eq(predictions.matchId, matchId), isNull(predictions.pointsAwarded)));

    let goalscorers: { playerId: string; goals: number }[] = [];
    if (match.isKnockout || unscored.some((p) => p.predictedGoesToExtraTime !== null)) {
      // no-op placeholder; goalscorer lookups happen per-prediction below
    }
    const scorers = await tx
      .select({ playerId: matchPlayers.playerId, goals: matchPlayers.goals })
      .from(matchPlayers)
      .where(and(eq(matchPlayers.matchId, matchId)));
    const scorerSet = new Set(scorers.filter((s) => s.goals > 0).map((s) => s.playerId));

    for (const prediction of unscored) {
      let points = scorePrediction({
        predictedOutcome: prediction.predictedOutcome,
        predictedHomeScore: prediction.predictedHomeScore,
        predictedAwayScore: prediction.predictedAwayScore,
        actualHomeScore: match.homeScore,
        actualAwayScore: match.awayScore,
      });

      if (match.isKnockout) {
        points += scoreKnockoutPrediction({
          predictedGoesToExtraTime: prediction.predictedGoesToExtraTime,
          predictedGoesToPenalties: prediction.predictedGoesToPenalties,
          predictedAdvancingSide: prediction.predictedAdvancingSide,
          actualWentToExtraTime: match.wentToExtraTime,
          actualWentToPenalties: match.wentToPenalties,
          actualAdvancingSide: actualOutcome,
        });
      }

      const predictedScorers = await tx
        .select()
        .from(predictedGoalscorers)
        .where(eq(predictedGoalscorers.predictionId, prediction.id));

      for (const ps of predictedScorers) {
        const wasCorrect = scorerSet.has(ps.playerId);
        if (wasCorrect) points += GOALSCORER_POINTS;
        await tx
          .update(predictedGoalscorers)
          .set({ wasCorrect })
          .where(eq(predictedGoalscorers.id, ps.id));
      }

      await tx
        .update(predictions)
        .set({ pointsAwarded: points, scoredAt: new Date() })
        .where(eq(predictions.id, prediction.id));
    }

    await tx.update(matches).set({ predictionsProcessedAt: new Date() }).where(eq(matches.id, matchId));

    return { processed: unscored.length };
  });
}

/**
 * Re-score all finished match predictions with the updated points system.
 */
export async function rescoreAllPredictions() {
  const finished = await db
    .select({
      id: predictions.id,
      predictedOutcome: predictions.predictedOutcome,
      predictedHomeScore: predictions.predictedHomeScore,
      predictedAwayScore: predictions.predictedAwayScore,
      actualHomeScore: matches.homeScore,
      actualAwayScore: matches.awayScore,
    })
    .from(predictions)
    .innerJoin(matches, eq(matches.id, predictions.matchId))
    .where(eq(matches.status, "FINISHED"));

  for (const p of finished) {
    if (p.actualHomeScore === null || p.actualAwayScore === null) continue;
    const points = scorePrediction({
      predictedOutcome: p.predictedOutcome,
      predictedHomeScore: p.predictedHomeScore,
      predictedAwayScore: p.predictedAwayScore,
      actualHomeScore: p.actualHomeScore,
      actualAwayScore: p.actualAwayScore,
    });
    await db
      .update(predictions)
      .set({ pointsAwarded: points, scoredAt: new Date() })
      .where(eq(predictions.id, p.id));
  }
}

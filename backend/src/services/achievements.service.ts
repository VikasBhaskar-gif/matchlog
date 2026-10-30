import { and, count, eq, gte, sql } from "drizzle-orm";
import type { Tx } from "../db/client.js";
import { achievements, userAchievements, watchedMatches, predictions } from "../db/schema/index.js";

/**
 * Evaluate all achievements for a user and unlock any newly-earned ones.
 * Safe to call repeatedly (idempotent via unique constraint + existence check).
 * Runs inside the caller's transaction (tx) so it stays consistent with the
 * watch/prediction write that triggered it.
 */
export async function evaluateAchievements(tx: Tx, userId: string): Promise<string[]> {
  const unlocked: string[] = [];

  const already = await tx
    .select({ code: achievements.code })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
    .where(eq(userAchievements.userId, userId));
  const alreadyCodes = new Set(already.map((a) => a.code));

  async function unlock(code: string) {
    if (alreadyCodes.has(code)) return;
    const achievement = await tx.query.achievements.findFirst({
      where: eq(achievements.code, code),
    });
    if (!achievement) return; // not seeded yet
    await tx
      .insert(userAchievements)
      .values({ userId, achievementId: achievement.id })
      .onConflictDoNothing();
    unlocked.push(code);
  }

  const [watchStats] = await tx
    .select({
      totalMatches: count(),
      totalMinutes: sql<number>`coalesce(sum(${watchedMatches.watchDurationMinutes}), 0)`,
      fullMatches: sql<number>`count(*) filter (where ${watchedMatches.watchType} = 'FULL_MATCH')`,
    })
    .from(watchedMatches)
    .where(eq(watchedMatches.userId, userId));

  if (watchStats.totalMatches >= 1) await unlock("FIRST_WATCH");
  if (watchStats.totalMatches >= 10) await unlock("10_MATCHES");
  if (watchStats.totalMatches >= 50) await unlock("50_MATCHES");
  if (watchStats.totalMatches >= 100) await unlock("100_MATCHES");
  if (watchStats.fullMatches >= 10) await unlock("FULL_TIME_FAN");
  if (Number(watchStats.totalMinutes) >= 1000) await unlock("MARATHON");

  const [predictionStats] = await tx
    .select({
      totalPoints: sql<number>`coalesce(sum(${predictions.pointsAwarded}), 0)`,
    })
    .from(predictions)
    .where(eq(predictions.userId, userId));
  if (Number(predictionStats.totalPoints) >= 100) await unlock("PREDICTION_MASTER");

  return unlocked;
}

export async function evaluateStreakAchievements(tx: Tx, userId: string, currentStreak: number) {
  if (currentStreak >= 10) {
    const achievement = await tx.query.achievements.findFirst({
      where: eq(achievements.code, "HOT_STREAK"),
    });
    if (achievement) {
      await tx
        .insert(userAchievements)
        .values({ userId, achievementId: achievement.id })
        .onConflictDoNothing();
    }
  }
}

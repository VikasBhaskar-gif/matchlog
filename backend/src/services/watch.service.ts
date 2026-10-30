import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import type { Tx } from "../db/client.js";
import { matches, watchedMatches, users, teams, friendActivities, playerOfMatchVotes } from "../db/schema/index.js";
import { calculateWatchXp } from "../lib/gamification.js";

export class WatchError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

/**
 * Checks whether a given match kickoff date falls on the current calendar day,
 * checking both UTC and local date representations consistently.
 */
export function isMatchCalendarDay(kickoffAt: Date | string, referenceDate: Date = new Date()): boolean {
  const matchDate = new Date(kickoffAt);
  if (isNaN(matchDate.getTime())) return false;

  // Compare in UTC
  const matchUtc = matchDate.toISOString().slice(0, 10);
  const refUtc = referenceDate.toISOString().slice(0, 10);
  if (matchUtc === refUtc) return true;

  // Compare in local date format
  const matchLocal = `${matchDate.getFullYear()}-${String(matchDate.getMonth() + 1).padStart(2, "0")}-${String(matchDate.getDate()).padStart(2, "0")}`;
  const refLocal = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}-${String(referenceDate.getDate()).padStart(2, "0")}`;
  return matchLocal === refLocal;
}

/**
 * Completed historical and live matches can be recorded.
 * Scheduled matches can only be recorded after kickoff has started.
 */
export function canRecordWatch(match: { status: string; kickoffAt: Date | string }, referenceDate: Date = new Date()): boolean {
  if (match.status === "FINISHED" || match.status === "LIVE" || match.status === "PAUSED") return true;
  const kickoffMs = new Date(match.kickoffAt).getTime();
  return !isNaN(kickoffMs) && kickoffMs <= referenceDate.getTime();
}

// A watch record older than this many days before the new match's kickoff
// breaks the streak. "Consecutive matches watched", not calendar days.
const STREAK_GAP_DAYS = 21;

export type WatchType = "FULL_MATCH" | "FIRST_HALF" | "SECOND_HALF" | "CUSTOM";

function deriveWatchType(start: number, end: number): WatchType {
  if (start === 0 && end === 90) return "FULL_MATCH";
  if (start === 0 && end === 45) return "FIRST_HALF";
  if (start === 45 && end === 90) return "SECOND_HALF";
  return "CUSTOM";
}

function validateRange(start: number, end: number, maxMinutes: number) {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new WatchError("start_minute and end_minute must be integers.");
  }
  if (start < 0 || end > maxMinutes) {
    throw new WatchError(`Watch range must be within 0-${maxMinutes} minutes for this match.`);
  }
  if (end <= start) {
    throw new WatchError("end_minute must be greater than start_minute.");
  }
}

async function applyStreak(tx: Tx, userId: string, kickoffAt: Date) {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;

  let newStreak: number;
  if (!user.lastWatchedMatchKickoff) {
    newStreak = 1;
  } else {
    const gapMs = Math.abs(kickoffAt.getTime() - user.lastWatchedMatchKickoff.getTime());
    const gapDays = gapMs / (1000 * 60 * 60 * 24);
    newStreak = gapDays <= STREAK_GAP_DAYS ? user.currentStreak + 1 : 1;
  }

  const longestStreak = Math.max(user.longestStreak, newStreak);
  const lastKickoff =
    !user.lastWatchedMatchKickoff || kickoffAt > user.lastWatchedMatchKickoff
      ? kickoffAt
      : user.lastWatchedMatchKickoff;

  await tx
    .update(users)
    .set({ currentStreak: newStreak, longestStreak, lastWatchedMatchKickoff: lastKickoff, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function recordWatch(
  userId: string,
  matchId: string,
  input: { startMinute: number; endMinute: number }
) {
  return db.transaction(async (tx) => {
    const match = await tx.query.matches.findFirst({ where: eq(matches.id, matchId) });
    if (!match) throw new WatchError("Match not found.", 404);

    // Enforce watch recording rules: match must have started
    if (!canRecordWatch(match)) {
      throw new WatchError("Watching can only be recorded after the match has started.", 400);
    }

    validateRange(input.startMinute, input.endMinute, match.maxWatchMinutes);

    const existing = await tx.query.watchedMatches.findFirst({
      where: and(eq(watchedMatches.userId, userId), eq(watchedMatches.matchId, matchId)),
    });
    if (existing) {
      throw new WatchError("You've already recorded this match. Edit your existing record instead.", 409);
    }

    const duration = input.endMinute - input.startMinute;
    const watchType = deriveWatchType(input.startMinute, input.endMinute);
    const xpEarned = calculateWatchXp(duration);

    const [record] = await tx
      .insert(watchedMatches)
      .values({
        userId,
        matchId,
        watchType,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        watchDurationMinutes: duration,
        xpEarned,
      })
      .returning();

    await applyStreak(tx, userId, match.kickoffAt);

    await tx
      .update(users)
      .set({
        totalXp: sql`${users.totalXp} + ${xpEarned}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const [homeTeam, awayTeam] = await Promise.all([
      match.homeTeamId ? tx.select({ name: teams.name }).from(teams).where(eq(teams.id, match.homeTeamId)).limit(1) : Promise.resolve([]),
      match.awayTeamId ? tx.select({ name: teams.name }).from(teams).where(eq(teams.id, match.awayTeamId)).limit(1) : Promise.resolve([]),
    ]);
    const matchLabel = homeTeam[0] && awayTeam[0] ? `${homeTeam[0].name} vs ${awayTeam[0].name}` : "a match";
    await tx.insert(friendActivities).values({
      userId,
      type: "WATCHED_MATCH",
      summary: `watched ${matchLabel}`,
      referenceId: matchId,
    });

    return { record, watchDurationMinutes: duration, xpEarned };
  });
}

export async function editWatch(
  userId: string,
  watchId: string,
  input: { startMinute: number; endMinute: number }
) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.watchedMatches.findFirst({
      where: and(eq(watchedMatches.id, watchId), eq(watchedMatches.userId, userId)),
    });
    if (!existing) throw new WatchError("Watch record not found.", 404);

    const match = await tx.query.matches.findFirst({ where: eq(matches.id, existing.matchId) });
    if (!match) throw new WatchError("Match not found.", 404);

    validateRange(input.startMinute, input.endMinute, match.maxWatchMinutes);

    const duration = input.endMinute - input.startMinute;
    const watchType = deriveWatchType(input.startMinute, input.endMinute);
    const newXp = calculateWatchXp(duration);
    const xpDelta = newXp - existing.xpEarned;

    const [updated] = await tx
      .update(watchedMatches)
      .set({
        watchType,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        watchDurationMinutes: duration,
        xpEarned: newXp,
        updatedAt: new Date(),
      })
      .where(eq(watchedMatches.id, watchId))
      .returning();

    if (xpDelta !== 0) {
      await tx
        .update(users)
        .set({
          totalXp: sql`${users.totalXp} + ${xpDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    return { record: updated, watchDurationMinutes: duration, xpDelta };
  });
}

export async function deleteWatch(userId: string, watchId: string) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.watchedMatches.findFirst({
      where: and(eq(watchedMatches.id, watchId), eq(watchedMatches.userId, userId)),
    });
    if (!existing) throw new WatchError("Watch record not found.", 404);

    // Also remove any MOTM vote associated with this match for this user
    await tx
      .delete(playerOfMatchVotes)
      .where(and(eq(playerOfMatchVotes.userId, userId), eq(playerOfMatchVotes.matchId, existing.matchId)));

    await tx.delete(watchedMatches).where(eq(watchedMatches.id, watchId));

    if (existing.xpEarned > 0) {
      await tx
        .update(users)
        .set({
          totalXp: sql`GREATEST(0, ${users.totalXp} - ${existing.xpEarned})`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }
  });
}

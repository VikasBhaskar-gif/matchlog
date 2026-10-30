import { and, eq, sql, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  watchedMatches,
  matches,
  predictions,
  playerOfMatchVotes,
  users,
  teams,
  competitions,
  seasons,
} from "../db/schema/index.js";
import { getLevelForXp } from "../lib/gamification.js";

export async function getActiveSeasonId(): Promise<string | null> {
  const active = await db.query.seasons.findFirst({ where: eq(seasons.isActive, true) });
  return active?.id ?? null;
}

export async function getWatchingStats(userId: string, seasonId?: string) {
  const conditions = [eq(watchedMatches.userId, userId)];
  if (seasonId) conditions.push(eq(matches.seasonId, seasonId));

  const [row] = await db
    .select({
      totalMatches: sql<number>`count(*)`,
      totalMinutes: sql<number>`coalesce(sum(${watchedMatches.watchDurationMinutes}), 0)`,
      fullMatches: sql<number>`count(*) filter (where ${watchedMatches.watchType} = 'FULL_MATCH')`,
      partialMatches: sql<number>`count(*) filter (where ${watchedMatches.watchType} != 'FULL_MATCH')`,
    })
    .from(watchedMatches)
    .innerJoin(matches, eq(matches.id, watchedMatches.matchId))
    .where(and(...conditions));

  const totalMatches = Number(row?.totalMatches ?? 0);
  const totalMinutes = Number(row?.totalMinutes ?? 0);

  // Most-watched team: tally home + away appearances in JS (simpler & safer
  // than a UNION subquery through the query builder).
  const teamAppearances = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
    })
    .from(watchedMatches)
    .innerJoin(matches, eq(matches.id, watchedMatches.matchId))
    .where(and(...conditions));

  const teamCounts = new Map<string, number>();
  for (const row of teamAppearances) {
    if (row.homeTeamId) teamCounts.set(row.homeTeamId, (teamCounts.get(row.homeTeamId) ?? 0) + 1);
    if (row.awayTeamId) teamCounts.set(row.awayTeamId, (teamCounts.get(row.awayTeamId) ?? 0) + 1);
  }
  let mostWatchedTeamRow: { teamId: string; teamName: string; logoUrl: string | null; matchCount: number } | null = null;
  if (teamCounts.size > 0) {
    const [topTeamId, topCount] = [...teamCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const team = await db.query.teams.findFirst({ where: eq(teams.id, topTeamId) });
    if (team) mostWatchedTeamRow = { teamId: team.id, teamName: team.name, logoUrl: team.logoUrl ?? null, matchCount: topCount };
  }

  const [mostWatchedCompRow] = await db
    .select({
      competitionId: matches.competitionId,
      name: competitions.name,
      matchCount: sql<number>`count(*)`,
    })
    .from(watchedMatches)
    .innerJoin(matches, eq(matches.id, watchedMatches.matchId))
    .innerJoin(competitions, eq(competitions.id, matches.competitionId))
    .where(and(...conditions))
    .groupBy(matches.competitionId, competitions.name)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });

  return {
    totalMatches,
    totalMinutes,
    fullMatches: Number(row?.fullMatches ?? 0),
    partialMatches: Number(row?.partialMatches ?? 0),
    averageMinutesPerMatch: totalMatches > 0 ? Math.round(totalMinutes / totalMatches) : 0,
    currentStreak: user?.currentStreak ?? 0,
    longestStreak: user?.longestStreak ?? 0,
    mostWatchedTeam: mostWatchedTeamRow
      ? { id: mostWatchedTeamRow.teamId, name: mostWatchedTeamRow.teamName, logoUrl: mostWatchedTeamRow.logoUrl, matches: Number(mostWatchedTeamRow.matchCount) }
      : null,
    mostWatchedCompetition: mostWatchedCompRow
      ? { id: mostWatchedCompRow.competitionId, name: mostWatchedCompRow.name, matches: Number(mostWatchedCompRow.matchCount) }
      : null,
  };
}

export async function getPredictionStats(userId: string, seasonId?: string) {
  const conditions = [eq(predictions.userId, userId), sql`${predictions.pointsAwarded} is not null`];
  if (seasonId) conditions.push(eq(matches.seasonId, seasonId));

  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      totalPoints: sql<number>`coalesce(sum(${predictions.pointsAwarded}), 0)`,
      correctResults: sql<number>`count(*) filter (where ${predictions.pointsAwarded} >= 3)`,
      exactScores: sql<number>`count(*) filter (where ${predictions.pointsAwarded} >= 8)`,
    })
    .from(predictions)
    .innerJoin(matches, eq(matches.id, predictions.matchId))
    .where(and(...conditions));

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(predictions)
    .innerJoin(matches, eq(matches.id, predictions.matchId))
    .where(seasonId ? and(eq(predictions.userId, userId), eq(matches.seasonId, seasonId)) : eq(predictions.userId, userId));

  const scored = Number(row?.total ?? 0);
  return {
    totalPredictions: Number(totalRow?.total ?? 0),
    predictionPoints: Number(row?.totalPoints ?? 0),
    correctResults: Number(row?.correctResults ?? 0),
    exactScores: Number(row?.exactScores ?? 0),
    accuracy: scored > 0 ? Math.round((Number(row?.correctResults ?? 0) / scored) * 100) : 0,
  };
}

export async function getPotmStats(userId: string) {
  const [row] = await db
    .select({ total: sql<number>`count(distinct ${playerOfMatchVotes.matchId})` })
    .from(playerOfMatchVotes)
    .innerJoin(
      watchedMatches,
      and(eq(watchedMatches.matchId, playerOfMatchVotes.matchId), eq(watchedMatches.userId, userId))
    )
    .where(eq(playerOfMatchVotes.userId, userId));

  const [mostSelected] = await db
    .select({
      playerId: playerOfMatchVotes.playerId,
      count: sql<number>`count(*)`,
    })
    .from(playerOfMatchVotes)
    .innerJoin(
      watchedMatches,
      and(eq(watchedMatches.matchId, playerOfMatchVotes.matchId), eq(watchedMatches.userId, userId))
    )
    .where(eq(playerOfMatchVotes.userId, userId))
    .groupBy(playerOfMatchVotes.playerId)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  return {
    totalSelections: Number(row?.total ?? 0),
    mostSelectedPlayerId: mostSelected?.playerId ?? null,
  };
}

export async function getFullPersonalStats(userId: string, scope: "current" | "all-time", explicitSeasonId?: string) {
  const seasonId = explicitSeasonId ?? (scope === "current" ? (await getActiveSeasonId()) ?? undefined : undefined);

  const [watching, predictionStats, potm] = await Promise.all([
    getWatchingStats(userId, seasonId),
    getPredictionStats(userId, seasonId),
    getPotmStats(userId),
  ]);

  return {
    scope,
    seasonId: seasonId ?? null,
    watching,
    predictions: predictionStats,
    potm,
  };
}

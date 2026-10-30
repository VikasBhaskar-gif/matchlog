import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, watchedMatches, matches, predictions } from "../db/schema/index.js";
import { getActiveSeasonId } from "../services/stats.service.js";

type LeaderboardType = "minutes" | "matches";
type Scope = "season" | "all-time" | "monthly";

export default async function leaderboardRoutes(app: FastifyInstance) {
  app.get("/api/leaderboards", async (request) => {
    const q = request.query as { type?: string; scope?: string; seasonId?: string; limit?: string };
    const type = (q.type as LeaderboardType) === "matches" ? "matches" : "minutes";
    const scope = (q.scope as Scope) ?? "all-time";
    const limit = Math.min(Number(q.limit ?? 50), 100);

    let seasonId: string | undefined = q.seasonId;
    if (scope === "season" && !seasonId) {
      seasonId = (await getActiveSeasonId()) ?? undefined;
    }

    let monthStart: Date | undefined;
    let monthEnd: Date | undefined;
    if (scope === "monthly") {
      const now = new Date();
      // Current calendar month in UTC: from 1st of month 00:00:00.000Z to 1st of next month 00:00:00.000Z
      monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    }

    const conditions = [];
    if (seasonId) conditions.push(eq(matches.seasonId, seasonId));
    if (monthStart && monthEnd) {
      conditions.push(gte(matches.kickoffAt, monthStart));
      conditions.push(lt(matches.kickoffAt, monthEnd));
    }

    const valueExpr =
      type === "matches" ? sql<number>`count(*)` : sql<number>`coalesce(sum(${watchedMatches.watchDurationMinutes}), 0)`;

    const rows = await db
      .select({
        userId: users.id,
        username: users.username,
        avatar: users.avatar,
        value: valueExpr,
      })
      .from(watchedMatches)
      .innerJoin(users, eq(users.id, watchedMatches.userId))
      .innerJoin(matches, eq(matches.id, watchedMatches.matchId))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(users.id, users.username, users.avatar)
      .orderBy(desc(valueExpr))
      .limit(limit);

    return { type, scope, entries: rows.map((r) => ({ ...r, value: Number(r.value) })) };
  });
}

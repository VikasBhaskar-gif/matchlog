import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { achievements, userAchievements } from "../db/schema/index.js";

export default async function achievementRoutes(app: FastifyInstance) {
  app.get("/api/achievements", async () => {
    const all = await db.select().from(achievements).orderBy(achievements.createdAt);
    return { achievements: all };
  });

  app.get("/api/achievements/me", { preHandler: app.requireAuth }, async (request) => {
    const rows = await db
      .select({ achievement: achievements, unlockedAt: userAchievements.unlockedAt })
      .from(userAchievements)
      .innerJoin(achievements, eq(achievements.id, userAchievements.achievementId))
      .where(eq(userAchievements.userId, request.currentUser!.id));

    return { achievements: rows.map((r) => ({ ...r.achievement, unlockedAt: r.unlockedAt })) };
  });
}

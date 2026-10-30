import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, sql, desc, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { matchReviews, matchReviewLikes, users, matches } from "../db/schema/index.js";
import { parseOrThrow } from "../lib/validate.js";

/**
 * Review submission rules:
 * - content is optional (may be null/empty)
 * - matchQualityRating and refereeRating are optional
 * - At least one of content, matchQualityRating, or refereeRating must be provided
 * - content, if provided, must be 1–500 chars
 */
const createReviewSchema = z
  .object({
    content: z
      .string()
      .max(10000, "Review must be 10,000 characters or less")
      .refine(
        (val) => {
          if (!val) return true;
          const words = val.trim().split(/\s+/).filter(Boolean);
          return words.length <= 300;
        },
        { message: "Review must be 300 words or less" }
      )
      .optional()
      .transform((v) => (v?.trim() === "" ? undefined : v?.trim())),
    matchQualityRating: z.number().int().min(1).max(5).optional(),
    refereeRating: z.number().int().min(1).max(5).optional(),
  })
  .refine(
    (data) =>
      (data.content !== undefined && data.content.length > 0) ||
      data.matchQualityRating !== undefined ||
      data.refereeRating !== undefined,
    {
      message:
        "Provide at least some text, a match rating, or a referee rating.",
    }
  );

export default async function reviewRoutes(app: FastifyInstance) {
  // Get all reviews for a match, sorted by most liked
  app.get<{ Params: { id: string } }>("/api/matches/:id/reviews", async (request) => {
    const matchId = request.params.id;
    const currentUserId = request.currentUser?.id;

    const rows = await db
      .select({
        id: matchReviews.id,
        userId: matchReviews.userId,
        username: users.username,
        userAvatar: users.avatar,
        content: matchReviews.content,
        matchQualityRating: matchReviews.matchQualityRating,
        refereeRating: matchReviews.refereeRating,
        likesCount: matchReviews.likesCount,
        createdAt: matchReviews.createdAt,
        updatedAt: matchReviews.updatedAt,
      })
      .from(matchReviews)
      .innerJoin(users, eq(users.id, matchReviews.userId))
      .where(eq(matchReviews.matchId, matchId))
      .orderBy(desc(matchReviews.likesCount), desc(matchReviews.createdAt));

    let likedReviewIds = new Set<string>();
    if (currentUserId && rows.length > 0) {
      const likes = await db
        .select({ reviewId: matchReviewLikes.reviewId })
        .from(matchReviewLikes)
        .where(
          and(
            eq(matchReviewLikes.userId, currentUserId),
            inArray(matchReviewLikes.reviewId, rows.map((r) => r.id))
          )
        );
      likedReviewIds = new Set(likes.map((l) => l.reviewId));
    }

    const reviews = rows.map((r) => ({
      ...r,
      hasLiked: likedReviewIds.has(r.id),
      isMyReview: currentUserId ? r.userId === currentUserId : false,
    }));

    // Aggregate rating statistics — count from non-null ratings only
    const [stats] = await db
      .select({
        totalReviews: sql<number>`count(*)`,
        qualityRatingCount: sql<number>`count(${matchReviews.matchQualityRating})`,
        refereeRatingCount: sql<number>`count(${matchReviews.refereeRating})`,
        avgQuality: sql<number>`round(avg(${matchReviews.matchQualityRating})::numeric, 1)`,
        avgReferee: sql<number>`round(avg(${matchReviews.refereeRating})::numeric, 1)`,
      })
      .from(matchReviews)
      .where(eq(matchReviews.matchId, matchId));

    return {
      reviews,
      stats: {
        totalReviews: Number(stats?.totalReviews ?? 0),
        qualityRatingCount: Number(stats?.qualityRatingCount ?? 0),
        refereeRatingCount: Number(stats?.refereeRatingCount ?? 0),
        averageMatchQuality: stats?.avgQuality ? Number(stats.avgQuality) : null,
        averageRefereeRating: stats?.avgReferee ? Number(stats.avgReferee) : null,
      },
    };
  });

  // Post or update match review (1 review per user per match)
  app.post<{ Params: { id: string } }>(
    "/api/matches/:id/reviews",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const matchId = request.params.id;
      const userId = request.currentUser!.id;
      const body = parseOrThrow(createReviewSchema, request.body);

      const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
      if (!match) {
        reply.code(404).send({ error: "Match not found." });
        return;
      }

      if (match.status !== "FINISHED") {
        reply
          .code(400)
          .send({ error: "Match reviews and ratings can only be submitted once the match is completed." });
        return;
      }

      const existing = await db.query.matchReviews.findFirst({
        where: and(eq(matchReviews.userId, userId), eq(matchReviews.matchId, matchId)),
      });

      const contentValue = body.content ?? null;

      let review;
      if (existing) {
        [review] = await db
          .update(matchReviews)
          .set({
            content: contentValue,
            matchQualityRating: body.matchQualityRating ?? null,
            refereeRating: body.refereeRating ?? null,
            updatedAt: new Date(),
          })
          .where(eq(matchReviews.id, existing.id))
          .returning();
      } else {
        [review] = await db
          .insert(matchReviews)
          .values({
            userId,
            matchId,
            content: contentValue,
            matchQualityRating: body.matchQualityRating ?? null,
            refereeRating: body.refereeRating ?? null,
          })
          .returning();
      }

      reply.code(201).send({ review });
    }
  );

  // Delete current user's review for a match
  app.delete<{ Params: { id: string } }>(
    "/api/matches/:id/reviews",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const matchId = request.params.id;
      const userId = request.currentUser!.id;

      await db
        .delete(matchReviews)
        .where(and(eq(matchReviews.userId, userId), eq(matchReviews.matchId, matchId)));

      reply.send({ ok: true });
    }
  );

  // Toggle like on a review
  app.post<{ Params: { id: string } }>(
    "/api/reviews/:id/like",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const reviewId = request.params.id;
      const userId = request.currentUser!.id;

      const review = await db.query.matchReviews.findFirst({ where: eq(matchReviews.id, reviewId) });
      if (!review) {
        reply.code(404).send({ error: "Review not found." });
        return;
      }

      const existingLike = await db.query.matchReviewLikes.findFirst({
        where: and(eq(matchReviewLikes.userId, userId), eq(matchReviewLikes.reviewId, reviewId)),
      });

      if (existingLike) {
        await db.delete(matchReviewLikes).where(eq(matchReviewLikes.id, existingLike.id));
        const [updated] = await db
          .update(matchReviews)
          .set({ likesCount: sql`greatest(0, ${matchReviews.likesCount} - 1)` })
          .where(eq(matchReviews.id, reviewId))
          .returning();
        reply.send({ hasLiked: false, likesCount: updated.likesCount });
      } else {
        await db.insert(matchReviewLikes).values({ userId, reviewId }).onConflictDoNothing();
        const [updated] = await db
          .update(matchReviews)
          .set({ likesCount: sql`${matchReviews.likesCount} + 1` })
          .where(eq(matchReviews.id, reviewId))
          .returning();
        reply.send({ hasLiked: true, likesCount: updated.likesCount });
      }
    }
  );
}

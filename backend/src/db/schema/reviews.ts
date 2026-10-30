import { pgTable, uuid, text, timestamp, integer, smallint, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { matches } from "./football.js";

export const matchReviews = pgTable(
  "match_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    content: text("content"),
    matchQualityRating: smallint("match_quality_rating"), // 1-5
    refereeRating: smallint("referee_rating"), // 1-5
    likesCount: integer("likes_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("match_reviews_user_match_unique").on(table.userId, table.matchId),
    index("match_reviews_match_idx").on(table.matchId),
    check("review_content_length", sql`char_length(${table.content}) <= 10000`),
  ]
);

export const matchReviewLikes = pgTable(
  "match_review_likes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id").notNull().references(() => matchReviews.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("match_review_likes_unique").on(table.userId, table.reviewId),
    index("match_review_likes_review_idx").on(table.reviewId),
  ]
);

import { pgTable, uuid, timestamp, uniqueIndex, index, pgEnum, check, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const friendRequestStatusEnum = pgEnum("friend_request_status", ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"]);

export const friendRequests = pgTable(
  "friend_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    receiverId: uuid("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: friendRequestStatusEnum("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A sender/receiver pair can only have ONE pending request outstanding
    // at a time — a partial unique index rather than a blanket unique
    // constraint, so a previously declined/cancelled request doesn't
    // permanently block sending a new one later.
    uniqueIndex("friend_requests_pending_unique")
      .on(table.senderId, table.receiverId)
      .where(sql`${table.status} = 'PENDING'`),
    index("friend_requests_sender_idx").on(table.senderId),
    index("friend_requests_receiver_idx").on(table.receiverId),
    check("friend_requests_no_self_request", sql`${table.senderId} != ${table.receiverId}`),
  ]
);

export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Always stored with userAId < userBId (as a UUID-text comparison) so a
    // friendship between two users can only ever exist as a single row,
    // regardless of who originally sent the request.
    userAId: uuid("user_a_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    userBId: uuid("user_b_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("friendships_pair_unique").on(table.userAId, table.userBId),
    index("friendships_user_a_idx").on(table.userAId),
    index("friendships_user_b_idx").on(table.userBId),
    check("friendships_no_self_friend", sql`${table.userAId} != ${table.userBId}`),
    check("friendships_ordered_pair", sql`${table.userAId} < ${table.userBId}`),
  ]
);

// ---------------------------------------------------------------------------
// Friend activity feed — small, purpose-built events tied to Matchlog's
// actual core loop (watch/predict/achievement/level), not a generic social
// feed. `summary` is a pre-rendered, human-readable line ("watched Arsenal
// 2-1 Chelsea") built at write time; kept simple since this is a lightweight
// feed, not an audit log that needs re-rendering from structured data later.
// ---------------------------------------------------------------------------
export const friendActivityTypeEnum = pgEnum("friend_activity_type", [
  "WATCHED_MATCH",
  "MADE_PREDICTION",
  "UNLOCKED_ACHIEVEMENT",
  "REACHED_LEVEL",
]);

export const friendActivities = pgTable(
  "friend_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: friendActivityTypeEnum("type").notNull(),
    summary: text("summary").notNull(),
    // Optional pointer to the thing this activity is about, e.g. a match id
    // — lets the frontend deep-link ("watched Arsenal 2-1 Chelsea" -> match page).
    referenceId: uuid("reference_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("friend_activities_user_idx").on(table.userId, table.createdAt)]
);

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  smallint,
  uniqueIndex,
  index,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { matches, players, teams } from "./football.js";

// ---------------------------------------------------------------------------
// Watched matches — the core Matchlog record
// ---------------------------------------------------------------------------
export const watchTypeEnum = pgEnum("watch_type", [
  "FULL_MATCH",
  "FIRST_HALF",
  "SECOND_HALF",
  "CUSTOM",
]);

export const watchedMatches = pgTable(
  "watched_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    watchType: watchTypeEnum("watch_type").notNull(),
    startMinute: smallint("start_minute").notNull(),
    endMinute: smallint("end_minute").notNull(),
    watchDurationMinutes: smallint("watch_duration_minutes").notNull(),
    xpEarned: integer("xp_earned").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("watched_matches_unique").on(table.userId, table.matchId),
    index("watched_matches_user_idx").on(table.userId),
    index("watched_matches_match_idx").on(table.matchId),
  ]
);

// ---------------------------------------------------------------------------
// XP transactions — the auditable ledger. user.total_xp is a cache derived
// from summing this table (maintained transactionally on write).
// ---------------------------------------------------------------------------
export const xpSourceTypeEnum = pgEnum("xp_source_type", [
  "MATCH_WATCH",
  "WATCH_ADJUSTMENT",
  "STREAK_BONUS",
  "ACHIEVEMENT",
  "FIRST_FOLLOWED_TEAM_MATCH",
  "FIRST_FOLLOWED_COMPETITION_MATCH",
  "OTHER",
]);

export const xpTransactions = pgTable(
  "xp_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceType: xpSourceTypeEnum("source_type").notNull(),
    // e.g. the watched_matches.id or achievements.id this transaction is about
    sourceId: uuid("source_id"),
    xpAmount: integer("xp_amount").notNull(), // can be negative (adjustments)
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("xp_transactions_user_idx").on(table.userId),
    index("xp_transactions_source_idx").on(table.sourceType, table.sourceId),
  ]
);

// ---------------------------------------------------------------------------
// Predictions
// ---------------------------------------------------------------------------
export const predictedOutcomeEnum = pgEnum("predicted_outcome", ["HOME", "DRAW", "AWAY"]);
export const knockoutAdvanceEnum = pgEnum("knockout_advance", ["HOME", "AWAY"]);

export const predictions = pgTable(
  "predictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    predictedOutcome: predictedOutcomeEnum("predicted_outcome").notNull(),
    predictedHomeScore: smallint("predicted_home_score").notNull(),
    predictedAwayScore: smallint("predicted_away_score").notNull(),
    // Knockout-only fields (null for league matches)
    predictedGoesToExtraTime: boolean("predicted_goes_to_extra_time"),
    predictedGoesToPenalties: boolean("predicted_goes_to_penalties"),
    predictedAdvancingSide: knockoutAdvanceEnum("predicted_advancing_side"),
    // Result of scoring, filled in once the match finishes and is processed
    pointsAwarded: integer("points_awarded"),
    scoredAt: timestamp("scored_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("predictions_unique").on(table.userId, table.matchId),
    index("predictions_user_idx").on(table.userId),
    index("predictions_match_idx").on(table.matchId),
  ]
);

export const predictedGoalscorers = pgTable(
  "predicted_goalscorers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    predictionId: uuid("prediction_id")
      .notNull()
      .references(() => predictions.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    wasCorrect: boolean("was_correct"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("predicted_goalscorers_unique").on(table.predictionId, table.playerId),
  ]
);

// ---------------------------------------------------------------------------
// Player of the Match (user's personal pick)
// ---------------------------------------------------------------------------
export const playerOfMatchVotes = pgTable(
  "player_of_match_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("potm_votes_unique").on(table.userId, table.matchId),
    index("potm_votes_match_idx").on(table.matchId),
  ]
);

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
export const achievements = pgTable("achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // e.g. "FIRST_WATCH", "100_MATCHES"
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userAchievements = pgTable(
  "user_achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("user_achievements_unique").on(table.userId, table.achievementId)]
);

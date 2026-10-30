import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  date,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------
// Never hard-code a season string anywhere else in the app. Everything hangs
// off this table; the "active" season is a row, not a constant.
export const seasons = pgTable("seasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  // API-Football's own season identifier, e.g. 2026 (they key seasons by start year)
  externalId: text("external_id").notNull().unique(),
  // Human label, e.g. "2026/27"
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const matchSourceEnum = pgEnum("match_source", ["OPENFOOTBALL", "FOOTBALL_DATA_ORG", "API_FOOTBALL", "DEMO"]);

// ---------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------
export const competitions = pgTable("competitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").notNull().unique(), // API-Football league id
  name: text("name").notNull(),
  shortName: text("short_name"),
  country: text("country"),
  logoUrl: text("logo_url"),
  type: text("type").notNull().default("league"), // 'league' | 'cup'
  isKnockout: boolean("is_knockout").notNull().default(false), // whole-competition knockout (e.g. FA Cup)
  // Which pipeline produced this row — mirrors matches.source. Lets the API
  // hide demo/unsupported competitions from the real dropdown without
  // relying on name matching.
  source: matchSourceEnum("source").notNull().default("OPENFOOTBALL"),
  // False for a competition that isn't backed by a live, working data
  // pipeline right now (kept as a row for future re-enablement, e.g. the
  // four cup competitions with no provider yet). Never shown in the normal UI.
  isSupported: boolean("is_supported").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A competition's participation in a given season (keeps competitions reusable
// across seasons without duplicating the competition row every year).
export const competitionSeasons = pgTable(
  "competition_seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("competition_seasons_unique").on(table.competitionId, table.seasonId),
  ]
);

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  logoUrl: text("logo_url"),
  country: text("country"),
  // Same identity discipline as competitions/matches — lets team search and
  // follow-lookup exclude demo rows instead of accidentally matching e.g.
  // demo "Arsenal" ahead of real "Arsenal FC" on a name search.
  source: matchSourceEnum("source").notNull().default("OPENFOOTBALL"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------
export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").notNull().unique(),
  name: text("name").notNull(),
  photoUrl: text("photo_url"),
  position: text("position"),
  nationality: text("nationality"),
  currentTeamId: uuid("current_team_id").references(() => teams.id, { onDelete: "set null" }),
  source: matchSourceEnum("source").notNull().default("OPENFOOTBALL"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------
export const matchStatusEnum = pgEnum("match_status", [
  "SCHEDULED",
  "LIVE",
  "PAUSED",
  "FINISHED",
  "POSTPONED",
  "CANCELLED",
  "SUSPENDED",
]);


export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id").notNull().unique(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "restrict" }),
    // Which pipeline produced this row. Used to keep demo/seed fixtures out
    // of the real feed, and to know which provider "owns" a row for re-sync.
    source: matchSourceEnum("source").notNull().default("OPENFOOTBALL"),
    homeTeamId: uuid("home_team_id").references(() => teams.id, { onDelete: "set null" }),
    awayTeamId: uuid("away_team_id").references(() => teams.id, { onDelete: "set null" }),
    // Knockout fixtures can be imported before both participants are known
    // (e.g. "Winner of QF1 vs Winner of QF2"); these are nullable until the
    // sync job resolves them.
    homeTeamPlaceholder: text("home_team_placeholder"),
    awayTeamPlaceholder: text("away_team_placeholder"),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    status: matchStatusEnum("status").notNull().default("SCHEDULED"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    homeScoreHalfTime: integer("home_score_half_time"),
    awayScoreHalfTime: integer("away_score_half_time"),
    homeScoreExtraTime: integer("home_score_extra_time"),
    awayScoreExtraTime: integer("away_score_extra_time"),
    wentToPenalties: boolean("went_to_penalties").notNull().default(false),
    homePenalties: integer("home_penalties"),
    awayPenalties: integer("away_penalties"),
    wentToExtraTime: boolean("went_to_extra_time").notNull().default(false),
    venue: text("venue"),
    round: text("round"), // e.g. "Regular Season - 12", "Quarter-final"
    isKnockout: boolean("is_knockout").notNull().default(false),
    // duration of regulation+ET actually played, used to bound watch ranges (90 or 120)
    maxWatchMinutes: integer("max_watch_minutes").notNull().default(90),
    // False when the source only confirmed the date, not the kickoff clock
    // time (common for fixtures scheduled far in advance, before broadcast
    // slots are announced). kickoffAt still holds a best-effort anchor for
    // sorting, but the UI must not present it as a real kickoff time.
    kickoffTimeConfirmed: boolean("kickoff_time_confirmed").notNull().default(true),
    homeFormation: text("home_formation"),
    awayFormation: text("away_formation"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    predictionsProcessedAt: timestamp("predictions_processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("matches_season_idx").on(table.seasonId),
    index("matches_competition_idx").on(table.competitionId),
    index("matches_kickoff_idx").on(table.kickoffAt),
    index("matches_home_team_idx").on(table.homeTeamId),
    index("matches_away_team_idx").on(table.awayTeamId),
    index("matches_status_idx").on(table.status),
  ]
);

// ---------------------------------------------------------------------------
// Match lineups / participants (who actually played, used to compute
// "minutes watched with player X")
// ---------------------------------------------------------------------------
export const matchPlayers = pgTable(
  "match_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    isStarter: boolean("is_starter").notNull().default(false),
    minutesPlayed: integer("minutes_played"),
    subInMinute: integer("sub_in_minute"),
    goals: integer("goals").notNull().default(0),
    tacticalPosition: text("tactical_position"),
    formationPlace: integer("formation_place"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("match_players_unique").on(table.matchId, table.playerId),
    index("match_players_match_idx").on(table.matchId),
    index("match_players_player_idx").on(table.playerId),
  ]
);

// ---------------------------------------------------------------------------
// Match events (goals mainly — needed for goalscorer predictions)
// ---------------------------------------------------------------------------
export const matchEventTypeEnum = pgEnum("match_event_type", [
  "GOAL",
  "OWN_GOAL",
  "PENALTY_GOAL",
  "RED_CARD",
  "YELLOW_CARD",
  "SUBSTITUTION",
]);

export const matchEvents = pgTable(
  "match_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "set null" }),
    type: matchEventTypeEnum("type").notNull(),
    minute: integer("minute").notNull(),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("match_events_match_idx").on(table.matchId),
    uniqueIndex("match_events_external_unique").on(table.matchId, table.externalId),
  ]
);

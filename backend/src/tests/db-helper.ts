import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export async function resetDb() {
  if (!process.env.DATABASE_URL?.includes("test") && process.env.NODE_ENV !== "test") {
    throw new Error("DANGER: resetDb called on non-test database! Aborting.");
  }
  await db.execute(sql`
    TRUNCATE TABLE
      friend_activities,
      friendships,
      friend_requests,
      sync_logs,
      user_achievements,
      achievements,
      player_of_match_votes,
      predicted_goalscorers,
      predictions,
      xp_transactions,
      watched_matches,
      match_events,
      match_players,
      matches,
      followed_players,
      followed_competitions,
      followed_teams,
      players,
      teams,
      competition_seasons,
      competitions,
      seasons,
      sessions,
      users
    RESTART IDENTITY CASCADE
  `);
}

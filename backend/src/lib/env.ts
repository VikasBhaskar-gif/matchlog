import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";

const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "backend/.env"),
  path.resolve(process.cwd(), "../.env"),
];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Optional: OpenFootball (the default football data source) needs no key
  // at all. This is only required if you switch the sync to the
  // ApiFootballProvider — see README "Football data source" section.
  API_FOOTBALL_KEY: z.string().optional(),
  API_FOOTBALL_BASE_URL: z.string().url().default("https://v3.football.api-sports.io"),
  // football-data.org — used for UEFA Champions League. Free tier: 10
  // requests/minute, 12 competitions, delayed (not live) scores. Optional at
  // the env-validation level so the app still boots without it; the
  // football-data.org provider itself throws a clear error if a sync is
  // attempted without a token configured.
  FOOTBALL_DATA_API_TOKEN: z.string().default("f9a102dabf644881bbdff8c52f74a3cb"),
  FOOTBALL_DATA_BASE_URL: z.string().url().default("https://api.football-data.org/v4"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  APP_URL: z.string().url().default("http://localhost:5173"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // --- Phase 3: configurable match status/result sync cadence ---------
  // Everything here is a *ceiling* on how often we'd poll a match in that
  // bucket; the actual sync run (cron or manual) still has to happen for
  // any polling to occur. Minutes, not milliseconds, for readability in .env.
  MATCH_SYNC_UPCOMING_INTERVAL_MINUTES: z.coerce.number().positive().default(360), // 6h — mainly catches postponements/reschedules
  MATCH_SYNC_LIVE_INTERVAL_MINUTES: z.coerce.number().positive().default(10), // matches in their live window
  MATCH_SYNC_RECENTLY_FINISHED_INTERVAL_MINUTES: z.coerce.number().positive().default(15),
  MATCH_SYNC_RECENTLY_FINISHED_WINDOW_HOURS: z.coerce.number().positive().default(6), // how long "recently finished" keeps getting polled
  MATCH_SYNC_LIVE_WINDOW_HOURS_AFTER_KICKOFF: z.coerce.number().positive().default(3.5), // covers 90min + ET + delay buffer
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;

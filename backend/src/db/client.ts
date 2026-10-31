import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env.js";
import * as schema from "./schema/index.js";

export function getDbSsl(rawUrl: string): false | "prefer" | { rejectUnauthorized: boolean } {
  try {
    const url = new URL(rawUrl);
    // Local connections never use SSL
    if (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1" ||
      url.searchParams.get("sslmode") === "disable"
    ) {
      return false;
    }
    // Explicit require/no-verify in query params
    const sslmode = url.searchParams.get("sslmode");
    if (sslmode === "require" || sslmode === "no-verify") {
      return { rejectUnauthorized: false };
    }
    // Remote databases (Render internal dpg-*, Render external, Supabase, Neon, etc.)
    // 'prefer' lets postgres.js negotiate TLS with rejectUnauthorized: false if supported/required,
    // while gracefully falling back to unencrypted if the database has SSL disabled.
    return "prefer";
  } catch {}
  return "prefer";
}

const sslOption = getDbSsl(env.DATABASE_URL);

const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  ssl: sslOption,
});

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export { schema };

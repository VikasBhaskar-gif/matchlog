import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env.js";
import * as schema from "./schema/index.js";

export function getDbSsl(rawUrl: string): false | { rejectUnauthorized: boolean } {
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
    // All remote / cloud databases (Render internal dpg-*, Render external, Neon, Supabase)
    // require TLS with rejectUnauthorized: false for self-signed certificates.
    return { rejectUnauthorized: false };
  } catch {}
  return { rejectUnauthorized: false };
}

const sslOption = getDbSsl(env.DATABASE_URL);

const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  ssl: sslOption,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export { schema };

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
    // Explicit sslmode in query params
    const sslmode = url.searchParams.get("sslmode");
    if (sslmode === "require" || sslmode === "no-verify" || sslmode === "prefer") {
      return { rejectUnauthorized: false };
    }
    // If it's a Render internal host (dpg-xxxx-a with no dots), it connects via private VPC network without SSL
    if (url.hostname.startsWith("dpg-") && !url.hostname.includes(".")) {
      return false;
    }
    // External remote databases (e.g. *.render.com, *.neon.tech, *.supabase.co, AWS, etc.)
    if (url.hostname.includes(".") || process.env.NODE_ENV === "production") {
      return { rejectUnauthorized: false };
    }
  } catch {}
  return false;
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

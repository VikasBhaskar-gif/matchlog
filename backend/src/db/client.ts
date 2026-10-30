import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env.js";
import * as schema from "./schema/index.js";

const sslOption =
  env.NODE_ENV === "production" || env.DATABASE_URL.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false;

const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  ssl: sslOption,
});

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export { schema };

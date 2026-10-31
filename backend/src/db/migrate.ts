import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../lib/env.js";
import { getDbSsl } from "./client.js";

async function main() {
  const sql = postgres(env.DATABASE_URL, { max: 1, ssl: getDbSsl(env.DATABASE_URL) });
  const db = drizzle(sql);
  console.log(`Running migrations against ${env.DATABASE_URL.replace(/:[^:@]*@/, ":****@")}`);
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations complete.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

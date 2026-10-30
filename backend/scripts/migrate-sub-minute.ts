import { db } from "../src/db/client.js";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE match_players ADD COLUMN IF NOT EXISTS sub_in_minute integer;
  `);
  console.log("Migration sub_in_minute executed successfully!");
}

main().catch(console.error).finally(() => process.exit(0));

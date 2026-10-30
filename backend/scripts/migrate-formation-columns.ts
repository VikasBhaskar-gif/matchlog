import { db } from "../src/db/client.js";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE match_players ADD COLUMN IF NOT EXISTS tactical_position text;
    ALTER TABLE match_players ADD COLUMN IF NOT EXISTS formation_place integer;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_formation text;
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_formation text;
  `);
  console.log("Migration executed successfully!");
}

main().catch(console.error).finally(() => process.exit(0));

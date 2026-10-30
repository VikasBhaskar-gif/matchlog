import { db } from "../src/db/client.js";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    UPDATE match_players
    SET sub_in_minute = GREATEST(1, 90 - minutes_played)
    WHERE is_starter = false
      AND sub_in_minute IS NULL
      AND minutes_played IS NOT NULL
      AND minutes_played > 0;
  `);

  console.log("Updated sub_in_minute for existing substitutes!");
}

main().catch(console.error).finally(() => process.exit(0));

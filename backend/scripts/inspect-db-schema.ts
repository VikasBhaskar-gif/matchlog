import { db } from "../src/db/client.js";
import { sql } from "drizzle-orm";

async function main() {
  const res: any = await db.execute(sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'match_players'
    ORDER BY ordinal_position;
  `);
  console.log("match_players columns:", Array.isArray(res) ? res : res.rows ?? res);
}

main().catch(console.error).finally(() => process.exit(0));

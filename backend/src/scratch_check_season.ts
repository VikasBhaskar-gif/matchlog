import { db } from "./db/client.js";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    SELECT 
      c.name as competition_name,
      count(*) as total_matches,
      count(*) filter (where m.status = 'FINISHED') as finished_matches,
      count(*) filter (where m.status = 'SCHEDULED') as scheduled_matches,
      min(m.kickoff_at) as earliest_kickoff,
      max(m.kickoff_at) as latest_kickoff,
      min(m.round) as sample_min_round,
      max(m.round) as sample_max_round
    FROM matches m
    JOIN competitions c ON m.competition_id = c.id
    GROUP BY c.name
    ORDER BY c.name
  `);
  console.table(result);

  // Check sample finished matches
  const sampleFinished = await db.execute(sql`
    SELECT c.name as comp, m.round, m.status, m.home_score, m.away_score, m.kickoff_at
    FROM matches m
    JOIN competitions c ON m.competition_id = c.id
    WHERE m.status = 'FINISHED'
    ORDER BY m.kickoff_at ASC
    LIMIT 5
  `);
  console.log("Earliest finished matches in DB:");
  console.table(sampleFinished);

  process.exit(0);
}

main().catch(console.error);

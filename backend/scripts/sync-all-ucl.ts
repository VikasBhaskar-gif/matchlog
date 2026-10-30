import { db } from "../src/db/client.js";
import { matches, competitions } from "../src/db/schema/index.js";
import { syncEspnLineupForMatch } from "../src/football/espn-lineup-sync.service.js";
import { eq, and, ilike } from "drizzle-orm";

async function main() {
  const uclComp = await db.query.competitions.findFirst({
    where: (c, { ilike }) => ilike(c.name, "%Champions%"),
  });
  if (!uclComp) {
    console.log("UCL competition not found");
    return;
  }

  const uclMatches = await db.query.matches.findMany({
    where: and(eq(matches.competitionId, uclComp.id), eq(matches.status, "FINISHED")),
  });

  console.log(`Found ${uclMatches.length} finished UCL matches.`);
  let count = 0;
  for (const m of uclMatches) {
    try {
      const ok = await syncEspnLineupForMatch(m.id);
      if (ok) {
        count++;
        console.log(`✓ Synced UCL match ${m.id}`);
      }
    } catch (e) {
      console.error(`Error on match ${m.id}:`, e);
    }
  }
  console.log(`Successfully synced ${count}/${uclMatches.length} UCL matches!`);
}

main().catch(console.error).finally(() => process.exit(0));

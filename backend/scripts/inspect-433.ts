import { db } from "../src/db/client.js";
import { matches, matchPlayers, teams } from "../src/db/schema/index.js";
import { eq, or } from "drizzle-orm";

async function main() {
  const mList = await db.query.matches.findMany({
    where: or(eq(matches.homeFormation, "4-3-3"), eq(matches.awayFormation, "4-3-3")),
    limit: 5,
  });

  console.log(`Found ${mList.length} matches with 4-3-3:`);
  for (const m of mList) {
    const h = await db.query.teams.findFirst({ where: eq(teams.id, m.homeTeamId!) });
    const a = await db.query.teams.findFirst({ where: eq(teams.id, m.awayTeamId!) });
    console.log(`\nMatch: ${h?.name} vs ${a?.name} | Home: ${m.homeFormation} | Away: ${m.awayFormation}`);

    const starters = await db.query.matchPlayers.findMany({
      where: eq(matchPlayers.matchId, m.id),
    });
    const startersList = starters.filter(s => s.isStarter);
    for (const s of startersList) {
      console.log(`    place: ${s.formationPlace} | pos: ${s.tacticalPosition}`);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));

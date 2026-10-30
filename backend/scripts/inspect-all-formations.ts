import { db } from "../src/db/client.js";
import { matches, matchPlayers, teams } from "../src/db/schema/index.js";
import { eq, isNotNull } from "drizzle-orm";

async function main() {
  const mList = await db.query.matches.findMany({
    where: isNotNull(matches.homeFormation),
    limit: 15,
  });

  console.log(`Found ${mList.length} matches with formations:`);
  for (const m of mList) {
    const h = await db.query.teams.findFirst({ where: eq(teams.id, m.homeTeamId!) });
    const a = await db.query.teams.findFirst({ where: eq(teams.id, m.awayTeamId!) });
    console.log(`\nMatch: ${h?.name} vs ${a?.name} | Home: ${m.homeFormation} | Away: ${m.awayFormation}`);

    const starters = await db.query.matchPlayers.findMany({
      where: eq(matchPlayers.matchId, m.id),
    });
    const homeStarters = starters.filter(s => s.teamId === m.homeTeamId && s.isStarter);
    console.log(`  Home starters (${homeStarters.length}):`);
    for (const s of homeStarters) {
      console.log(`    place: ${s.formationPlace} | pos: ${s.tacticalPosition}`);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));

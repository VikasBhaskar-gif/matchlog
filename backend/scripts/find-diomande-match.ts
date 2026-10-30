import { db } from "../src/db/client.js";
import { matches, matchPlayers, players, teams } from "../src/db/schema/index.js";
import { eq, and } from "drizzle-orm";

async function main() {
  const dio = await db.query.players.findFirst({ where: eq(players.name, "Yan Diomande") });
  const mps = await db.query.matchPlayers.findMany({
    where: and(eq(matchPlayers.playerId, dio!.id), eq(matchPlayers.isStarter, true))
  });

  for (const mp of mps) {
    const m = await db.query.matches.findFirst({ where: eq(matches.id, mp.matchId) });
    const h = await db.query.teams.findFirst({ where: eq(teams.id, m!.homeTeamId!) });
    const a = await db.query.teams.findFirst({ where: eq(teams.id, m!.awayTeamId!) });
    console.log("Match:", m!.id, h?.name, "vs", a?.name);
    
    const starters = await db
      .select({
        name: players.name,
        tacticalPosition: matchPlayers.tacticalPosition,
        formationPlace: matchPlayers.formationPlace,
      })
      .from(matchPlayers)
      .innerJoin(players, eq(matchPlayers.playerId, players.id))
      .where(and(eq(matchPlayers.matchId, m!.id), eq(matchPlayers.isStarter, true)));
    
    for (const s of starters) {
      console.log(`  ${s.name} | pos: ${s.tacticalPosition} | place: ${s.formationPlace}`);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));

import { db } from "../src/db/client.js";
import { matches, matchPlayers, players, teams } from "../src/db/schema/index.js";
import { eq, ilike } from "drizzle-orm";

async function main() {
  const rm = await db.query.teams.findFirst({ where: (t, { ilike }) => ilike(t.name, "%Real Madrid%") });
  if (!rm) return;

  const mps = await db
    .select({
      matchId: matchPlayers.matchId,
      name: players.name,
      pos: matchPlayers.tacticalPosition,
      place: matchPlayers.formationPlace,
      minutes: matchPlayers.minutesPlayed,
      isStarter: matchPlayers.isStarter,
    })
    .from(matchPlayers)
    .innerJoin(players, eq(matchPlayers.playerId, players.id))
    .where(eq(matchPlayers.teamId, rm.id));

  // Find match where Mbappé, Bellingham, Vinicius played
  const matchIds = Array.from(new Set(mps.map(m => m.matchId)));
  for (const mid of matchIds) {
    const list = mps.filter(m => m.matchId === mid && m.isStarter);
    if (list.some(p => p.name.includes("Mbappé")) && list.some(p => p.name.includes("Bellingham"))) {
      const match = await db.query.matches.findFirst({ where: eq(matches.id, mid) });
      const h = await db.query.teams.findFirst({ where: eq(teams.id, match!.homeTeamId!) });
      const a = await db.query.teams.findFirst({ where: eq(teams.id, match!.awayTeamId!) });
      console.log(`\nMatch: ${h?.name} vs ${a?.name} | HomeForm: ${match?.homeFormation} | AwayForm: ${match?.awayFormation}`);
      for (const p of list) {
        console.log(`  ${p.name} | pos: ${p.pos} | place: ${p.place}`);
      }
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));

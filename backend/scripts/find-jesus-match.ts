import { db } from "../src/db/client.js";
import { matches, teams, matchPlayers, players } from "../src/db/schema/index.js";
import { eq, and } from "drizzle-orm";

async function main() {
  const g = await db.query.players.findFirst({ where: eq(players.name, "Gabriel Jesus") });
  if (!g) return;

  const mps = await db.query.matchPlayers.findMany({
    where: and(eq(matchPlayers.playerId, g.id), eq(matchPlayers.isStarter, true)),
  });

  for (const mp of mps) {
    const m = await db.query.matches.findFirst({ where: eq(matches.id, mp.matchId) });
    const h = await db.query.teams.findFirst({ where: eq(teams.id, m!.homeTeamId!) });
    const a = await db.query.teams.findFirst({ where: eq(teams.id, m!.awayTeamId!) });
    console.log(m!.id, h?.name, "vs", a?.name, m!.homeFormation, m!.awayFormation);

    const starters = await db
      .select({
        name: players.name,
        tacticalPosition: matchPlayers.tacticalPosition,
        formationPlace: matchPlayers.formationPlace,
        isStarter: matchPlayers.isStarter,
        minutesPlayed: matchPlayers.minutesPlayed,
      })
      .from(matchPlayers)
      .innerJoin(players, eq(players.id, matchPlayers.playerId))
      .where(eq(matchPlayers.matchId, m!.id));

    console.log("Starters count:", starters.filter((s) => s.isStarter).length);
    for (const s of starters) {
      console.log(`  ${s.name} | isStarter: ${s.isStarter} | pos: ${s.tacticalPosition} | place: ${s.formationPlace} | mins: ${s.minutesPlayed}`);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));

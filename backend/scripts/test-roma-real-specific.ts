import { db } from "../src/db/client.js";
import { matches, matchPlayers, players, teams } from "../src/db/schema/index.js";
import { eq } from "drizzle-orm";

async function main() {
  const m = await db.query.matches.findFirst({
    where: eq(matches.id, "41f156cc-2193-462e-bf63-0c132ef66830")
  });
  if (!m) return;
  console.log("Match:", m.homeTeamId, "vs", m.awayTeamId);

  const rows = await db
    .select({
      id: players.id,
      name: players.name,
      tacticalPosition: matchPlayers.tacticalPosition,
      formationPlace: matchPlayers.formationPlace,
      position: players.position,
      teamId: matchPlayers.teamId,
      isStarter: matchPlayers.isStarter,
    })
    .from(matchPlayers)
    .innerJoin(players, eq(matchPlayers.playerId, players.id))
    .where(eq(matchPlayers.matchId, m.id));

  console.log(`Total rows: ${rows.length}`);
  for (const s of rows) {
    console.log(`  ${s.name} | team: ${s.teamId} | starter: ${s.isStarter} | tp: '${s.tacticalPosition}' | place: ${s.formationPlace}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));

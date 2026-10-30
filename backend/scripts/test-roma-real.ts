import { db } from "../src/db/client.js";
import { matches, matchPlayers, players, teams } from "../src/db/schema/index.js";
import { eq } from "drizzle-orm";

async function main() {
  const rm = await db.query.teams.findFirst({ where: (t, { ilike }) => ilike(t.name, "%Real Madrid%") });
  const roma = await db.query.teams.findFirst({ where: (t, { ilike }) => ilike(t.name, "%Roma%") });
  const m = await db.query.matches.findFirst({
    where: eq(matches.awayTeamId, rm!.id)
  });
  if (!m) return;

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

  const rmStarters = rows.filter(r => r.teamId === rm!.id && r.isStarter);

  for (const s of rmStarters) {
    const tp = (s.tacticalPosition || "").toLowerCase().trim();
    const pos = (s.position || "").toLowerCase().trim();
    const text = `${tp} ${pos}`;
    console.log(`Player: ${s.name}`);
    console.log(`  tp: '${tp}', pos: '${pos}', place: ${s.formationPlace}`);
    console.log(`  text: '${text}'`);
  }
}

main().catch(console.error).finally(() => process.exit(0));

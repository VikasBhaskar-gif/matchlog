import { db } from "../src/db/client.js";
import { players, teams } from "../src/db/schema/index.js";
import { eq, and, ilike } from "drizzle-orm";

async function main() {
  const barca = await db.query.teams.findFirst({ where: (t, { ilike }) => ilike(t.name, "%Barcelona%") });
  const barcaPlayers = await db.query.players.findMany({
    where: eq(players.currentTeamId, barca!.id),
  });

  console.log(`Barcelona players (${barcaPlayers.length}):`);
  for (const p of barcaPlayers.slice(0, 15)) {
    console.log(`  ${p.name}: ${p.photoUrl}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));

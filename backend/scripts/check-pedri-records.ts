import { db } from "../src/db/client.js";
import { players, matchPlayers } from "../src/db/schema/index.js";
import { ilike, eq } from "drizzle-orm";

async function main() {
  const pedris = await db.query.players.findMany({ where: (p, { ilike }) => ilike(p.name, "%Pedri%") });
  console.log("Pedris found:", pedris.length);
  for (const p of pedris) {
    const mpCount = await db.query.matchPlayers.findMany({ where: eq(matchPlayers.playerId, p.id) });
    console.log(`  ID: ${p.id} | Name: ${p.name} | ExternalId: ${p.externalId} | matchPlayers count: ${mpCount.length}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));

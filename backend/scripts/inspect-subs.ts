import { db } from "../src/db/client.js";
import { matchPlayers, players } from "../src/db/schema/index.js";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      name: players.name,
      isStarter: matchPlayers.isStarter,
      mins: matchPlayers.minutesPlayed,
      subInMinute: matchPlayers.subInMinute,
    })
    .from(matchPlayers)
    .innerJoin(players, eq(matchPlayers.playerId, players.id))
    .where(eq(matchPlayers.matchId, "1a2ee2e8-d518-41d4-b8a2-e3b246b9eea2"));

  for (const r of rows) {
    if (!r.isStarter) {
      console.log(`${r.name} | isStarter: ${r.isStarter} | subInMinute: ${r.subInMinute} | mins: ${r.mins}`);
    }
  }
}
main().catch(console.error).finally(() => process.exit(0));

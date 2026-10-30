import { db } from "../src/db/client.js";
import { matches, matchPlayers, players, teams } from "../src/db/schema/index.js";
import { eq, and } from "drizzle-orm";

async function main() {
  const m = await db.query.matches.findFirst({
    where: eq(matches.id, "5d5ee9be-7db9-41b3-ada2-24772050e2df")
  });
  if (!m) return;

  const mps = await db
    .select({
      name: players.name,
      isStarter: matchPlayers.isStarter,
      minutesPlayed: matchPlayers.minutesPlayed,
      subInMinute: matchPlayers.subInMinute,
      tacticalPosition: matchPlayers.tacticalPosition,
    })
    .from(matchPlayers)
    .innerJoin(players, eq(matchPlayers.playerId, players.id))
    .where(eq(matchPlayers.matchId, m.id));

  for (const p of mps) {
    if (p.name.includes("Jong")) {
      console.log("FDJ in Barca vs Real:", p);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));

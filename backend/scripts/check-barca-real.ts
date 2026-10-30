import { db } from "../src/db/client.js";
import { matches, teams, players, matchPlayers } from "../src/db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";

async function main() {
  const barca = await db.query.teams.findFirst({ where: (t, { ilike }) => ilike(t.name, "%Barcelona%") });
  const madrid = await db.query.teams.findFirst({ where: (t, { ilike }) => ilike(t.name, "%Real Madrid%") });

  const m = await db.query.matches.findFirst({
    where: and(eq(matches.homeTeamId, barca!.id), eq(matches.awayTeamId, madrid!.id)),
  });

  const starters = await db
    .select({
      name: players.name,
      tacticalPosition: matchPlayers.tacticalPosition,
      formationPlace: matchPlayers.formationPlace,
      photoUrl: players.photoUrl,
    })
    .from(matchPlayers)
    .innerJoin(players, eq(players.id, matchPlayers.playerId))
    .where(and(eq(matchPlayers.matchId, m!.id), eq(matchPlayers.isStarter, true), eq(matchPlayers.teamId, madrid!.id)));

  console.log("Madrid starters count:", starters.length);
  console.log(starters);
}

main().catch(console.error).finally(() => process.exit(0));

import { db } from "../src/db/client.js";
import { players, teams } from "../src/db/schema/index.js";
import { fetchFotmobPlayerPhoto } from "../src/football/player-photo.service.js";
import { eq, or, inArray } from "drizzle-orm";

async function main() {
  const targetTeams = await db.query.teams.findMany({
    where: (t, { or, ilike }) => or(ilike(t.name, "%Barcelona%"), ilike(t.name, "%Real Madrid%")),
  });

  const teamIds = targetTeams.map((t) => t.id);
  const teamMap = new Map(targetTeams.map((t) => [t.id, t.name]));

  const teamPlayers = await db.query.players.findMany({
    where: inArray(players.currentTeamId, teamIds),
  });

  console.log(`Updating ${teamPlayers.length} players for Barca and Madrid...`);
  for (const p of teamPlayers) {
    const teamName = p.currentTeamId ? teamMap.get(p.currentTeamId) : undefined;
    const photo = await fetchFotmobPlayerPhoto(p.name, teamName);
    if (photo) {
      await db.update(players).set({ photoUrl: photo }).where(eq(players.id, p.id));
      console.log(`✓ ${p.name} => ${photo}`);
    } else {
      console.log(`- ${p.name} => Not found in FotMob`);
    }
  }

  console.log("Finished updating Barca & Madrid players!");
}

main().catch(console.error).finally(() => process.exit(0));

import { db } from "../src/db/client.js";
import { players, teams } from "../src/db/schema/index.js";
import { fetchFotmobPlayerPhoto } from "../src/football/player-photo.service.js";
import { eq, or, inArray } from "drizzle-orm";

async function main() {
  console.log("Starting FotMob headshot cutout sync...");

  const allTeams = await db.query.teams.findMany({
    where: (t, { or, ilike }) =>
      or(
        ilike(t.name, "%Barcelona%"),
        ilike(t.name, "%Real Madrid%"),
        ilike(t.name, "%Paris%"),
        ilike(t.name, "%Manchester City%"),
        ilike(t.name, "%Arsenal%"),
        ilike(t.name, "%Liverpool%"),
        ilike(t.name, "%Bayern%"),
        ilike(t.name, "%Atlético%"),
        ilike(t.name, "%Tottenham%"),
        ilike(t.name, "%Chelsea%"),
        ilike(t.name, "%Inter%"),
        ilike(t.name, "%Juventus%"),
        ilike(t.name, "%Milan%"),
        ilike(t.name, "%Dortmund%"),
        ilike(t.name, "%Leverkusen%")
      ),
  });

  const teamMap = new Map(allTeams.map((t) => [t.id, t.name]));
  const teamIds = allTeams.map((t) => t.id);

  const teamPlayers = await db.query.players.findMany({
    where: inArray(players.currentTeamId, teamIds),
  });

  console.log(`Found ${teamPlayers.length} players across ${allTeams.length} top clubs.`);

  let updatedCount = 0;
  for (const p of teamPlayers) {
    const teamName = p.currentTeamId ? teamMap.get(p.currentTeamId) : undefined;
    const photo = await fetchFotmobPlayerPhoto(p.name, teamName);
    if (photo) {
      await db.update(players).set({ photoUrl: photo }).where(eq(players.id, p.id));
      console.log(`✓ ${p.name} (${teamName || "No team"}) => ${photo}`);
      updatedCount++;
    } else {
      console.log(`- ${p.name} (${teamName || "No team"}) => Not found in FotMob`);
    }
  }

  console.log(`Done! Successfully updated ${updatedCount}/${teamPlayers.length} players with official FotMob cutout headshots!`);
}

main().catch(console.error).finally(() => process.exit(0));

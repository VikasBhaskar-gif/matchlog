import { db } from "../src/db/client.js";
import { players, matchPlayers, teams } from "../src/db/schema/index.js";
import { resolvePlayerHeadshot } from "../src/football/player-photo.service.js";
import { isNull, eq } from "drizzle-orm";

async function main() {
  const missingPlayers = await db
    .select({
      id: players.id,
      name: players.name,
      teamId: players.currentTeamId,
      photoUrl: players.photoUrl,
    })
    .from(players)
    .where(isNull(players.photoUrl));

  console.log(`Found ${missingPlayers.length} players with missing photos.`);

  let updated = 0;
  for (const p of missingPlayers) {
    let teamName = "";
    if (p.teamId) {
      const t = await db.query.teams.findFirst({ where: eq(teams.id, p.teamId) });
      if (t) teamName = t.name;
    }

    try {
      const url = await resolvePlayerHeadshot(p.name, teamName);
      if (url) {
        await db.update(players).set({ photoUrl: url }).where(eq(players.id, p.id));
        console.log(`✓ Updated ${p.name}: ${url}`);
        updated++;
      }
    } catch (e) {
      // ignore
    }
  }

  console.log(`Done! Updated ${updated} players with headshots.`);
}

main().catch(console.error).finally(() => process.exit(0));

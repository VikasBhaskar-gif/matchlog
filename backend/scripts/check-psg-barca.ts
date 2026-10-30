import { db } from "../src/db/client.js";
import { matches, teams } from "../src/db/schema/index.js";
import { syncEspnLineupForMatch } from "../src/football/espn-lineup-sync.service.js";
import { eq, and, or, ilike } from "drizzle-orm";

async function main() {
  const psg = await db.query.teams.findFirst({ where: ilike(teams.name, "%Paris%") });
  const barca = await db.query.teams.findFirst({ where: ilike(teams.name, "%Barcelona%") });
  console.log("PSG:", psg?.id, "Barca:", barca?.id);

  if (psg && barca) {
    const ms = await db.query.matches.findMany({
      where: or(
        and(eq(matches.homeTeamId, psg.id), eq(matches.awayTeamId, barca.id)),
        and(eq(matches.homeTeamId, barca.id), eq(matches.awayTeamId, psg.id))
      ),
    });
    for (const m of ms) {
      console.log("Match:", m.id, m.status, m.homeScore, "-", m.awayScore, "HomeForm:", m.homeFormation);
      // Let's sync this match
      await syncEspnLineupForMatch(m.id);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));

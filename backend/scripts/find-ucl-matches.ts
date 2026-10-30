import { db } from "../src/db/client.js";
import { matches, teams } from "../src/db/schema/index.js";
import { eq, or, ilike } from "drizzle-orm";

async function main() {
  const barca = await db.query.teams.findFirst({ where: ilike(teams.name, "%Barcelona%") });
  const allMatches = await db.query.matches.findMany({
    where: or(eq(matches.homeTeamId, barca!.id), eq(matches.awayTeamId, barca!.id)),
  });

  for (const m of allMatches) {
    const h = await db.query.teams.findFirst({ where: eq(teams.id, m.homeTeamId!) });
    const a = await db.query.teams.findFirst({ where: eq(teams.id, m.awayTeamId!) });
    console.log(m.id, h?.name, "vs", a?.name, m.homeScore, "-", m.awayScore, m.status, m.kickoffAt);
  }
}

main().catch(console.error).finally(() => process.exit(0));

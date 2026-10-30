import { db } from "../src/db/client.js";
import { matches, teams } from "../src/db/schema/index.js";
import { eq, and } from "drizzle-orm";

async function main() {
  const barca = await db.query.teams.findFirst({ where: (t, { ilike }) => ilike(t.name, "%Barcelona%") });
  const madrid = await db.query.teams.findFirst({ where: (t, { ilike }) => ilike(t.name, "%Real Madrid%") });

  const m = await db.query.matches.findFirst({
    where: and(eq(matches.homeTeamId, barca!.id), eq(matches.awayTeamId, madrid!.id)),
  });

  const res = await fetch(`http://localhost:4000/api/matches/${m!.id}/potm`);
  const data = await res.json();

  console.log("Status:", res.status);
  console.log("Home formation:", data.homeFormation);
  console.log("Away formation:", data.awayFormation);
  console.log("Has lineup data:", data.hasLineupData);
  console.log("Home candidates count:", data.candidates?.home?.length);
  console.log("\nBarcelona Starters (with tactical positions and photos):");
  for (const c of (data.candidates?.home ?? []).filter((p: any) => p.isStarter)) {
    console.log(`  ${c.name} | pos: ${c.position} | tactical: ${c.tacticalPosition} | place: ${c.formationPlace} | photo: ${c.photoUrl ? 'YES' : 'NO'}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));

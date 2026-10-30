import { db } from "../src/db/client.js";
import { matches, matchPlayers, players, teams } from "../src/db/schema/index.js";
import { eq } from "drizzle-orm";

async function main() {
  const res = await fetch("http://localhost:4000/api/matches/0fa600cb-7f06-4e5c-ad21-59738fa3e86e/potm");
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Away candidates count:", data.candidates?.away?.length);
  const awayStarters = data.candidates?.away?.filter((p: any) => p.isStarter);
  console.log("Real Madrid Starters:");
  for (const p of awayStarters) {
    console.log(`  ${p.name} | tactical: ${p.tacticalPosition} | place: ${p.formationPlace}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));

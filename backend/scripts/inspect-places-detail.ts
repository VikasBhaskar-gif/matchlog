import { db } from "../src/db/client.js";
import { matchPlayers } from "../src/db/schema/index.js";
import { isNotNull } from "drizzle-orm";

async function main() {
  const rows = await db.query.matchPlayers.findMany({
    where: isNotNull(matchPlayers.formationPlace),
    columns: {
      formationPlace: true,
      tacticalPosition: true,
    }
  });

  const map = new Map<number, Set<string>>();
  for (const r of rows) {
    if (r.formationPlace === null) continue;
    if (!map.has(r.formationPlace)) map.set(r.formationPlace, new Set());
    if (r.tacticalPosition) map.get(r.formationPlace)!.add(r.tacticalPosition);
  }

  const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
  for (const k of sortedKeys) {
    console.log(`Place ${k}:`, Array.from(map.get(k)!));
  }
}

main().catch(console.error).finally(() => process.exit(0));

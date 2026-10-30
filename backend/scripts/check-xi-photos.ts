import { db } from "../src/db/client.js";
import { players } from "../src/db/schema/index.js";
import { inArray } from "drizzle-orm";

async function main() {
  const names = [
    "Raphinha", "Lamine Yamal", "Pedri", "Anthony Gordon",
    "Joan García", "Pau Cubarsí", "Xavi Espart", "Gerard Martín",
    "Rodri", "Fermín López", "João Cancelo"
  ];
  const found = await db.query.players.findMany({
    where: inArray(players.name, names),
  });
  for (const p of found) {
    console.log(`${p.name} => ${p.photoUrl}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));

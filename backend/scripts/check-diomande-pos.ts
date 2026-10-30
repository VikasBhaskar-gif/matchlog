import { db } from "../src/db/client.js";
import { players } from "../src/db/schema/index.js";
import { eq } from "drizzle-orm";

async function main() {
  const p = await db.query.players.findFirst({ where: eq(players.name, "Yan Diomande") });
  console.log("Diomande:", p);
  const v = await db.query.players.findFirst({ where: eq(players.name, "Vinicius Junior") });
  console.log("Vinicius:", v);
  const b = await db.query.players.findFirst({ where: eq(players.name, "Jude Bellingham") });
  console.log("Bellingham:", b);
}

main().catch(console.error).finally(() => process.exit(0));

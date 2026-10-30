import { db } from "../src/db/client.js";
import { players, users, sessions } from "../src/db/schema/index.js";
import { eq } from "drizzle-orm";

async function main() {
  const fdj = await db.query.players.findFirst({ where: eq(players.name, "Frenkie de Jong") });
  const user = await db.query.users.findFirst();
  const session = await db.query.sessions.findFirst({ where: eq(sessions.userId, user!.id) });

  const res = await fetch(`http://localhost:4000/api/players/${fdj!.id}/my-stats`, {
    headers: {
      cookie: `matchlog_session=${session?.id}`,
    }
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Frenkie de Jong my-stats API response:", data);

  const yamal = await db.query.players.findFirst({ where: eq(players.name, "Lamine Yamal") });
  const res2 = await fetch(`http://localhost:4000/api/players/${yamal!.id}/my-stats`, {
    headers: {
      cookie: `matchlog_session=${session?.id}`,
    }
  });
  console.log("Lamine Yamal my-stats API response:", await res2.json());

}

main().catch(console.error).finally(() => process.exit(0));

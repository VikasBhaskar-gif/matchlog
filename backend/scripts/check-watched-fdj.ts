import { db } from "../src/db/client.js";
import { watchedMatches, matches, matchPlayers, teams, players } from "../src/db/schema/index.js";
import { eq, sql } from "drizzle-orm";

async function main() {
  const watches = await db.query.watchedMatches.findMany();
  console.log(`User has watched ${watches.length} matches.`);

  const barca = await db.query.teams.findFirst({ where: (t, { ilike }) => ilike(t.name, "%Barcelona%") });
  const fdj = await db.query.players.findFirst({ where: (p, { ilike }) => ilike(p.name, "%Frenkie de Jong%") });
  console.log("Frenkie de Jong ID:", fdj?.id);

  for (const w of watches) {
    const m = await db.query.matches.findFirst({ where: eq(matches.id, w.matchId) });
    const h = await db.query.teams.findFirst({ where: eq(teams.id, m!.homeTeamId!) });
    const a = await db.query.teams.findFirst({ where: eq(teams.id, m!.awayTeamId!) });

    const isBarcaMatch = m!.homeTeamId === barca!.id || m!.awayTeamId === barca!.id;
    const mpCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(matchPlayers)
      .where(eq(matchPlayers.matchId, m!.id));

    const fdjPlayed = await db.query.matchPlayers.findFirst({
      where: (mp, { and, eq }) => and(eq(mp.matchId, m!.id), eq(mp.playerId, fdj!.id))
    });

    console.log(`Match: ${h?.name} vs ${a?.name} | Barca: ${isBarcaMatch} | Starters/Subs in DB: ${mpCount[0].count} | FDJ in match: ${!!fdjPlayed} (starter: ${fdjPlayed?.isStarter}, mins: ${fdjPlayed?.minutesPlayed})`);
  }
}

main().catch(console.error).finally(() => process.exit(0));

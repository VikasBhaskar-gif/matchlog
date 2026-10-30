import { db } from "../src/db/client.js";
import { matches, teams, players, matchEvents } from "../src/db/schema/index.js";
import { eq } from "drizzle-orm";
import { VERIFIED_MATCHES } from "../src/football/verified-match-events.js";

export async function applyVerifiedScorers() {
  console.log(`Applying verified scorers for ${VERIFIED_MATCHES.length} matches...`);

  for (const vm of VERIFIED_MATCHES) {
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, vm.matchId),
    });
    if (!match) {
      console.warn(`Match ${vm.matchId} not found in DB!`);
      continue;
    }

    // 1. Delete any previously generated match events for this match
    await db.delete(matchEvents).where(eq(matchEvents.matchId, vm.matchId));

    // 2. Ensure all players exist and have proper team association
    const newEvents = [];
    for (let i = 0; i < vm.goals.length; i++) {
      const g = vm.goals[i];
      const teamId = g.isHomeTeam ? match.homeTeamId : match.awayTeamId;

      let player = await db.query.players.findFirst({
        where: (p, { ilike }) => ilike(p.name, g.playerName),
      });

      if (!player) {
        const normName = g.playerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        player = await db.query.players.findFirst({
          where: (p, { ilike }) => ilike(p.name, normName),
        });
      }

      if (!player) {
        const slug = g.playerName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const extId = `verified:player:${slug}`;
        const [inserted] = await db
          .insert(players)
          .values({
            externalId: extId,
            name: g.playerName,
            position: g.position ?? "Attack",
            nationality: g.nationality ?? null,
            currentTeamId: teamId,
            source: "FOOTBALL_DATA_ORG",
            updatedAt: new Date(),
          })
          .returning();
        player = inserted;
      }

      newEvents.push({
        matchId: vm.matchId,
        teamId: teamId,
        playerId: player.id,
        type: g.type ?? "GOAL",
        minute: g.minute,
        externalId: `verified:goal:${vm.matchId}:${g.minute}:${i}`,
      });
    }

    if (newEvents.length > 0) {
      await db.insert(matchEvents).values(newEvents);
    }
    console.log(`✓ Applied ${newEvents.length} verified events for match ${vm.matchId}`);
  }

  console.log("Verified scorers applied successfully!");
}

if (process.argv[1]?.endsWith("apply-verified-scorers.ts")) {
  applyVerifiedScorers().then(() => process.exit(0)).catch(console.error);
}

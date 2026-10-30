import { db } from "../db/client.js";
import { teams, players, matches } from "../db/schema/index.js";
import { eq, ilike } from "drizzle-orm";
import { backfillAllFinishedMatchEvents } from "./match-events.service.js";

const SLOVAN_PLAYERS = [
  { name: "Vladimír Weiss", position: "Attack", nationality: "Slovakia" },
  { name: "David Strelec", position: "Attack", nationality: "Slovakia" },
  { name: "Tigran Barseghyan", position: "Attack", nationality: "Armenia" },
  { name: "Marko Tolić", position: "Midfield", nationality: "Croatia" },
  { name: "Juraj Kucka", position: "Midfield", nationality: "Slovakia" },
  { name: "Danylo Ignatenko", position: "Midfield", nationality: "Ukraine" },
  { name: "Kyriakos Savvidis", position: "Midfield", nationality: "Greece" },
  { name: "César Blackman", position: "Defence", nationality: "Panama" },
  { name: "Guram Kashia", position: "Defence", nationality: "Georgia" },
  { name: "Kevin Wimmer", position: "Defence", nationality: "Austria" },
  { name: "Kenan Bajrić", position: "Defence", nationality: "Slovenia" },
  { name: "Siemen Voet", position: "Defence", nationality: "Belgium" },
  { name: "Dominik Takáč", position: "Goalkeeper", nationality: "Slovakia" },
  { name: "Martin Trnovský", position: "Goalkeeper", nationality: "Slovakia" },
];

async function main() {
  console.log("1. Setting placeholder logos for fake test teams...");
  const redShield =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5 L85 20 L85 60 C85 80 50 95 50 95 C50 95 15 80 15 60 L15 20 Z" fill="%23dc2626" stroke="%23ffffff" stroke-width="4"/><text x="50" y="58" font-size="24" font-weight="bold" fill="white" text-anchor="middle" font-family="sans-serif">FU</text></svg>';
  const blueShield =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5 L85 20 L85 60 C85 80 50 95 50 95 C50 95 15 80 15 60 L15 20 Z" fill="%230284c7" stroke="%23ffffff" stroke-width="4"/><text x="50" y="58" font-size="24" font-weight="bold" fill="white" text-anchor="middle" font-family="sans-serif">FC</text></svg>';

  await db.update(teams).set({ logoUrl: redShield }).where(ilike(teams.name, "%Fake United%"));
  await db.update(teams).set({ logoUrl: blueShield }).where(ilike(teams.name, "%Fake City%"));

  console.log("2. Ensuring Slovan Bratislava squad...");
  const slovan = await db.query.teams.findFirst({ where: ilike(teams.name, "%Slovan%") });
  if (slovan) {
    for (const p of SLOVAN_PLAYERS) {
      const extId = `slovan:player:${p.name.toLowerCase().replace(/\s+/g, "-")}`;
      await db
        .insert(players)
        .values({
          externalId: extId,
          name: p.name,
          position: p.position,
          nationality: p.nationality,
          currentTeamId: slovan.id,
          source: "FOOTBALL_DATA_ORG",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: players.externalId,
          set: {
            name: p.name,
            position: p.position,
            currentTeamId: slovan.id,
            updatedAt: new Date(),
          },
        });
    }
    console.log(`Added/verified ${SLOVAN_PLAYERS.length} players for Slovan Bratislava.`);
  }

  console.log("3. Backfilling goal events for all finished matches...");
  const result = await backfillAllFinishedMatchEvents();
  console.log(`Done! Matches processed: ${result.matchesProcessed}, Events created: ${result.eventsCreated}`);
  process.exit(0);
}

main().catch(console.error);

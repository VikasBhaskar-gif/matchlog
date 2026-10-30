import { db } from "../db/client.js";
import { teams, players } from "../db/schema/index.js";
import { env } from "../lib/env.js";
import { RateLimiter } from "./rate-limiter.js";
import { normalizeTeamName } from "./openfootball-ids.js";
import { eq, or, ilike } from "drizzle-orm";

const rateLimiter = new RateLimiter(8, 60_000);

const LEAGUE_CODES = ["PL", "PD", "SA", "BL1", "FL1", "CL"];

type FdoPlayer = {
  id: number;
  name: string;
  position?: string;
  nationality?: string;
  dateOfBirth?: string;
};

type FdoTeam = {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
  crest?: string;
  squad?: FdoPlayer[];
};

export async function syncRealPlayers(): Promise<{ teamsMatched: number; playersUpserted: number }> {
  if (!env.FOOTBALL_DATA_API_TOKEN) {
    console.warn("FOOTBALL_DATA_API_TOKEN is missing. Cannot sync real players from football-data.org.");
    return { teamsMatched: 0, playersUpserted: 0 };
  }

  const allDbTeams = await db.query.teams.findMany();
  console.log(`Loaded ${allDbTeams.length} teams from DB.`);

  let teamsMatched = 0;
  let playersUpserted = 0;

  for (const code of LEAGUE_CODES) {
    console.log(`Fetching teams and squads for competition ${code}...`);
    await rateLimiter.acquire();

    const res = await fetch(`${env.FOOTBALL_DATA_BASE_URL}/competitions/${code}/teams`, {
      headers: { "X-Auth-Token": env.FOOTBALL_DATA_API_TOKEN },
    });

    if (!res.ok) {
      console.error(`Failed to fetch ${code} teams: ${res.status} ${res.statusText}`);
      continue;
    }

    const data = (await res.json()) as { teams: FdoTeam[] };
    console.log(`Got ${data.teams.length} teams for ${code}.`);

    for (const fdoTeam of data.teams) {
      const normalizedFdoName = normalizeTeamName(fdoTeam.name).toLowerCase();
      const normalizedShort = fdoTeam.shortName ? normalizeTeamName(fdoTeam.shortName).toLowerCase() : "";

      // Match against DB team
      const matchedDbTeam = allDbTeams.find((t) => {
        const dbName = normalizeTeamName(t.name).toLowerCase();
        const dbShort = t.shortName ? normalizeTeamName(t.shortName).toLowerCase() : "";
        return (
          dbName === normalizedFdoName ||
          (normalizedShort && dbName === normalizedShort) ||
          (dbShort && dbShort === normalizedShort) ||
          dbName.includes(normalizedShort || normalizedFdoName) ||
          normalizedFdoName.includes(dbName)
        );
      });

      if (!matchedDbTeam) {
        console.log(`  Team not matched in DB: "${fdoTeam.name}" (${fdoTeam.shortName || ""})`);
        continue;
      }

      teamsMatched++;

      // Update team logoUrl/shortName if missing
      await db
        .update(teams)
        .set({
          logoUrl: matchedDbTeam.logoUrl || fdoTeam.crest || null,
          shortName: matchedDbTeam.shortName || fdoTeam.shortName || null,
          updatedAt: new Date(),
        })
        .where(eq(teams.id, matchedDbTeam.id));

      if (!fdoTeam.squad || fdoTeam.squad.length === 0) continue;

      for (const p of fdoTeam.squad) {
        if (!p.name) continue;
        const externalId = `fdo:player:${p.id}`;

        const normalizedPosition =
          p.position?.toLowerCase() === "offence" ? "Attack" : p.position || null;

        await db
          .insert(players)
          .values({
            externalId,
            name: p.name,
            position: normalizedPosition,
            nationality: p.nationality || null,
            currentTeamId: matchedDbTeam.id,
            source: "FOOTBALL_DATA_ORG",
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: players.externalId,
            set: {
              name: p.name,
              position: normalizedPosition,
              nationality: p.nationality || null,
              currentTeamId: matchedDbTeam.id,
              source: "FOOTBALL_DATA_ORG",
              updatedAt: new Date(),
            },
          });

        playersUpserted++;
      }
    }
  }

  console.log(`Player sync finished: ${teamsMatched} teams matched, ${playersUpserted} players upserted.`);
  return { teamsMatched, playersUpserted };
}

if (process.argv[1]?.endsWith("sync-players.ts")) {
  syncRealPlayers().then(() => process.exit(0)).catch(console.error);
}

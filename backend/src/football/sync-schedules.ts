import { db } from "../db/client.js";
import { matches, teams } from "../db/schema/index.js";
import { env } from "../lib/env.js";
import { eq, and, sql, or, ilike } from "drizzle-orm";
import { normalizeTeamName } from "./openfootball-ids.js";

const COMPETITION_FDO_CODES = [
  { code: "PL", name: "Premier League" },
  { code: "PD", name: "La Liga" },
  { code: "SA", name: "Serie A" },
  { code: "BL1", name: "Bundesliga" },
  { code: "FL1", name: "Ligue 1" },
  { code: "CL", name: "UEFA Champions League" },
];

export async function syncRealSchedulesAndLogos(): Promise<{ matchesUpdated: number; teamsFixed: number }> {
  console.log("1. Fixing Deportivo Alavés and Deportivo La Coruña logos and short names...");
  let teamsFixed = 0;

  // Deportivo Alaves: real FDO ID 263, crest 263.png
  await db
    .update(teams)
    .set({
      shortName: "Alavés",
      logoUrl: "https://crests.football-data.org/263.png",
      updatedAt: new Date(),
    })
    .where(ilike(teams.name, "%Alav%"));
  teamsFixed++;

  // RC Deportivo La Coruna: real FDO ID 560, crest 560.png
  await db
    .update(teams)
    .set({
      shortName: "Deportivo",
      logoUrl: "https://crests.football-data.org/560.png",
      updatedAt: new Date(),
    })
    .where(ilike(teams.name, "%Deportivo La Coru%"));
  teamsFixed++;

  if (!env.FOOTBALL_DATA_API_TOKEN) {
    console.warn("FOOTBALL_DATA_API_TOKEN is missing. Cannot fetch real match schedules.");
    return { matchesUpdated: 0, teamsFixed };
  }

  const allTeams = await db.select().from(teams);
  console.log(`Loaded ${allTeams.length} teams from DB.`);

  function findDbTeam(fdoTeam: { id: number; name: string; shortName?: string }) {
    const fdoNorm = normalizeTeamName(fdoTeam.name).toLowerCase();
    const shortNorm = fdoTeam.shortName ? normalizeTeamName(fdoTeam.shortName).toLowerCase() : "";

    // Exact match
    const exact = allTeams.find((t) => normalizeTeamName(t.name).toLowerCase() === fdoNorm);
    if (exact) return exact;

    // Specific non-generic short name
    if (shortNorm && !["deportivo", "real", "fc", "cf", "sporting", "racing", "athletic", "city", "united"].includes(shortNorm)) {
      const byShort = allTeams.find((t) => {
        const dbShort = t.shortName ? normalizeTeamName(t.shortName).toLowerCase() : "";
        return dbShort === shortNorm;
      });
      if (byShort) return byShort;
    }

    // Substring match
    return allTeams.find((t) => {
      const dbNorm = normalizeTeamName(t.name).toLowerCase();
      return dbNorm.includes(fdoNorm) || fdoNorm.includes(dbNorm);
    });
  }

  let matchesUpdated = 0;

  for (const { code, name } of COMPETITION_FDO_CODES) {
    console.log(`Fetching schedule and results for ${name} (${code})...`);
    try {
      const res = await fetch(`${env.FOOTBALL_DATA_BASE_URL}/competitions/${code}/matches`, {
        headers: { "X-Auth-Token": env.FOOTBALL_DATA_API_TOKEN },
      });
      if (!res.ok) {
        console.warn(`Failed to fetch ${code} matches: HTTP ${res.status}`);
        continue;
      }

      const data = (await res.json()) as any;
      const fdoMatches = data.matches || [];
      console.log(`  Got ${fdoMatches.length} matches for ${code}.`);

      for (const m of fdoMatches) {
        const homeDb = findDbTeam(m.homeTeam);
        const awayDb = findDbTeam(m.awayTeam);
        if (!homeDb || !awayDb) continue;

        const isFinished = m.status === "FINISHED";
        const isLive = m.status === "IN_PLAY" || m.status === "PAUSED";
        const homeScore = m.score?.fullTime?.home ?? null;
        const awayScore = m.score?.fullTime?.away ?? null;

        const status = isFinished ? "FINISHED" : isLive ? "LIVE" : "SCHEDULED";
        const kickoffAt = new Date(m.utcDate);
        const kickoffTimeConfirmed = m.status === "TIMED" || isFinished || isLive;

        // Match round (matchday)
        const roundNum = m.matchday ? `Matchday ${m.matchday}` : null;

        // Find existing match by home and away team
        const existing = await db.query.matches.findFirst({
          where: and(
            eq(matches.homeTeamId, homeDb.id),
            eq(matches.awayTeamId, awayDb.id),
            roundNum ? ilike(matches.round, `%${roundNum}%`) : undefined
          ),
        });

        if (existing) {
          const updateData: any = {
            kickoffAt,
            kickoffTimeConfirmed,
            updatedAt: new Date(),
          };
          if (isFinished && homeScore !== null && awayScore !== null) {
            updateData.status = "FINISHED";
            updateData.homeScore = homeScore;
            updateData.awayScore = awayScore;
          } else if (isLive && homeScore !== null && awayScore !== null) {
            updateData.status = "LIVE";
            updateData.homeScore = homeScore;
            updateData.awayScore = awayScore;
          }

          await db.update(matches).set(updateData).where(eq(matches.id, existing.id));
          matchesUpdated++;
        }
      }
    } catch (err: any) {
      console.error(`Error syncing ${code}:`, err.message);
    }
  }

  console.log(`Sync completed: ${matchesUpdated} match schedules updated, ${teamsFixed} teams fixed.`);
  return { matchesUpdated, teamsFixed };
}

if (process.argv[1]?.endsWith("sync-schedules.ts")) {
  syncRealSchedulesAndLogos().then(() => process.exit(0)).catch(console.error);
}

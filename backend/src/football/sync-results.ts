import { db } from "../db/client.js";
import { matches, teams } from "../db/schema/index.js";
import { env } from "../lib/env.js";
import { eq, and, sql } from "drizzle-orm";

const DOMESTIC_FDO_CODES = [
  { code: "PL", name: "Premier League" },
  { code: "PD", name: "La Liga" },
  { code: "SA", name: "Serie A" },
  { code: "BL1", name: "Bundesliga" },
  { code: "FL1", name: "Ligue 1" },
];

export async function syncDomesticResultsFromFdo(): Promise<{ updated: number }> {
  if (!env.FOOTBALL_DATA_API_TOKEN) return { updated: 0 };

  const allTeams = await db.select({ id: teams.id, name: teams.name }).from(teams);
  const teamMap = new Map<string, string>();
  for (const t of allTeams) {
    teamMap.set(t.name.toLowerCase().trim(), t.id);
  }

  let totalUpdated = 0;

  for (const { code } of DOMESTIC_FDO_CODES) {
    try {
      const res = await fetch(`${env.FOOTBALL_DATA_BASE_URL}/competitions/${code}/matches?status=FINISHED`, {
        headers: { "X-Auth-Token": env.FOOTBALL_DATA_API_TOKEN },
      });
      if (!res.ok) continue;

      const data = (await res.json()) as any;
      const fdoMatches = data.matches || [];

      for (const m of fdoMatches) {
        const hName = m.homeTeam?.name?.toLowerCase()?.trim();
        const aName = m.awayTeam?.name?.toLowerCase()?.trim();
        const hId = teamMap.get(hName);
        const aId = teamMap.get(aName);
        if (!hId || !aId) continue;

        const homeScore = m.score?.fullTime?.home;
        const awayScore = m.score?.fullTime?.away;
        if (homeScore === null || awayScore === null || homeScore === undefined || awayScore === undefined) continue;

        const updated = await db
          .update(matches)
          .set({
            status: "FINISHED",
            homeScore,
            awayScore,
            updatedAt: new Date(),
          })
          .where(and(eq(matches.homeTeamId, hId), eq(matches.awayTeamId, aId), sql`${matches.status} != 'FINISHED'`))
          .returning({ id: matches.id });

        totalUpdated += updated.length;
      }
    } catch {
      // Continue silently if rate-limited or transient network error
    }
  }

  return { updated: totalUpdated };
}

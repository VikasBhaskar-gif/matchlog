import { db } from "../db/client.js";
import { matches, teams, players, matchEvents } from "../db/schema/index.js";
import { normalizeTeamName, slugifyTeamName } from "./openfootball-ids.js";
import { eq, and, or, sql, lte } from "drizzle-orm";

export const ESPN_LEAGUE_MAP: Record<string, string> = {
  PL: "eng.1",
  PD: "esp.1",
  SA: "ita.1",
  BL1: "ger.1",
  FL1: "fra.1",
  CL: "uefa.champions",
};

interface EspnAthlete {
  id: string;
  displayName: string;
  shortName?: string;
  fullName?: string;
  position?: string;
  team?: { id: string };
}

interface EspnDetail {
  type?: { id: string; text: string };
  clock?: { value: number; displayValue: string };
  team?: { id: string };
  scoringPlay?: boolean;
  ownGoal?: boolean;
  penaltyKick?: boolean;
  athletesInvolved?: EspnAthlete[];
}

function parseMinute(displayValue?: string): number {
  if (!displayValue) return 45;
  const clean = displayValue.replace(/'/g, "").trim();
  if (clean.includes("+")) {
    const parts = clean.split("+").map((s) => parseInt(s.trim(), 10) || 0);
    return parts[0] + parts[1];
  }
  return parseInt(clean, 10) || 45;
}

function matchDbTeam(espnName: string, allDbTeams: (typeof teams.$inferSelect)[]) {
  const espnSlug = slugifyTeamName(espnName);

  // 1. Direct slug or name match
  let found = allDbTeams.find((t) => {
    const tSlug = slugifyTeamName(t.name);
    const sSlug = t.shortName ? slugifyTeamName(t.shortName) : "";
    return tSlug === espnSlug || sSlug === espnSlug || tSlug.includes(espnSlug) || espnSlug.includes(tSlug);
  });
  if (found) return found;

  // 2. Token overlap (e.g. "bayern" in "bayern-munich" and "fc-bayern-munchen")
  const stopWords = new Set(["fc", "cf", "sc", "afc", "club", "de", "the", "fk", "sk"]);
  const espnTokens = espnSlug.split("-").filter((tok) => !stopWords.has(tok) && tok.length > 2);

  if (espnTokens.length > 0) {
    // Try match where all significant tokens appear
    found = allDbTeams.find((t) => {
      const tSlug = slugifyTeamName(t.name);
      return espnTokens.every((tok) => tSlug.includes(tok));
    });
    if (found) return found;

    // Try match by longest distinctive token (e.g. "atletico", "dortmund", "fenerbahce", "liverpool")
    const primaryToken = espnTokens.sort((a, b) => b.length - a.length)[0];
    if (primaryToken && primaryToken.length >= 4) {
      found = allDbTeams.find((t) => slugifyTeamName(t.name).includes(primaryToken));
    }
  }

  return found;
}

export async function syncEspnGoalsForLeague(
  leagueCode: string,
  options: { maxDays?: number; verbose?: boolean } = {}
): Promise<{ matchesUpdated: number; eventsCreated: number }> {
  const espnSlug = ESPN_LEAGUE_MAP[leagueCode] || leagueCode;
  console.log(`Starting ESPN goal sync for ${leagueCode} (${espnSlug})...`);

  // 1. Fetch scoreboard calendar
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/scoreboard`
  );
  if (!res.ok) {
    console.error(`Failed to fetch ESPN scoreboard for ${espnSlug}: ${res.status}`);
    return { matchesUpdated: 0, eventsCreated: 0 };
  }

  const data = await res.json();
  const rawCalendar: any[] = data.leagues?.[0]?.calendar ?? [];
  console.log(`Found ${rawCalendar.length} calendar items for ${espnSlug}.`);

  const now = new Date();
  let pastDates: string[] = [];

  if (Array.isArray(rawCalendar) && rawCalendar.length > 0 && typeof rawCalendar[0] === "string") {
    pastDates = rawCalendar
      .map((iso) => String(iso).slice(0, 10).replace(/-/g, ""))
      .filter((d) => {
        const year = parseInt(d.slice(0, 4), 10);
        const month = parseInt(d.slice(4, 6), 10) - 1;
        const day = parseInt(d.slice(6, 8), 10);
        const dt = new Date(Date.UTC(year, month, day, 23, 59, 59));
        return dt <= now;
      });
  } else {
    // Fallback or for tournaments (e.g. Champions League)
    const dbDates = await db
      .select({ kickoffAt: matches.kickoffAt })
      .from(matches)
      .where(lte(matches.kickoffAt, now));
    pastDates = dbDates
      .map((m) => m.kickoffAt?.toISOString().slice(0, 10).replace(/-/g, ""))
      .filter((d): d is string => !!d);
  }

  // Unique sorted dates
  const uniqueDates = Array.from(new Set(pastDates)).sort();
  const datesToProcess = options.maxDays ? uniqueDates.slice(-options.maxDays) : uniqueDates;
  console.log(`Processing ${datesToProcess.length} past match dates for ${espnSlug}...`);

  const allDbTeams = await db.query.teams.findMany();
  let matchesUpdated = 0;
  let eventsCreated = 0;

  for (const dateStr of datesToProcess) {
    const dayRes = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/scoreboard?dates=${dateStr}`
    );
    if (!dayRes.ok) continue;

    const dayData = await dayRes.json();
    const events = dayData.events ?? [];

    for (const ev of events) {
      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const statusDesc = comp.status?.type?.name;
      if (statusDesc !== "STATUS_FULL_TIME" && statusDesc !== "STATUS_FINAL_AET" && statusDesc !== "STATUS_FINAL_PEN") {
        continue;
      }

      const homeComp = comp.competitors?.find((c: any) => c.homeAway === "home");
      const awayComp = comp.competitors?.find((c: any) => c.homeAway === "away");
      if (!homeComp || !awayComp) continue;

      const espnHomeName = homeComp.team?.displayName ?? homeComp.team?.name;
      const espnAwayName = awayComp.team?.displayName ?? awayComp.team?.name;
      const homeScore = parseInt(homeComp.score ?? "0", 10);
      const awayScore = parseInt(awayComp.score ?? "0", 10);

      // Match teams in our DB
      const matchedHome = matchDbTeam(espnHomeName, allDbTeams);
      const matchedAway = matchDbTeam(espnAwayName, allDbTeams);

      if (!matchedHome || !matchedAway) {
        if (options.verbose) {
          console.log(`  Could not match teams: "${espnHomeName}" (${matchedHome?.name}) vs "${espnAwayName}" (${matchedAway?.name})`);
        }
        continue;
      }

      // Find match in DB
      // Match within 3 days of ev.date
      const evDate = new Date(ev.date);
      const windowStart = new Date(evDate.getTime() - 2 * 24 * 3600 * 1000);
      const windowEnd = new Date(evDate.getTime() + 2 * 24 * 3600 * 1000);

      const dbMatch = await db.query.matches.findFirst({
        where: (m, { and, eq, gte, lte }) =>
          and(
            eq(m.homeTeamId, matchedHome.id),
            eq(m.awayTeamId, matchedAway.id),
            gte(m.kickoffAt, windowStart),
            lte(m.kickoffAt, windowEnd)
          ),
      });

      if (!dbMatch) {
        continue;
      }

      // Extract goals from details
      const goalDetails: EspnDetail[] = (comp.details ?? []).filter((d: EspnDetail) => d.scoringPlay);
      if (goalDetails.length === 0 && (homeScore > 0 || awayScore > 0)) {
        continue;
      }

      // Prepare events
      const newEvents = [];
      for (let i = 0; i < goalDetails.length; i++) {
        const d = goalDetails[i];
        const athlete = d.athletesInvolved?.[0];
        const athleteName = athlete?.displayName ?? athlete?.fullName ?? "Goalscorer";
        const minute = parseMinute(d.clock?.displayValue);
        const isOwnGoal = !!d.ownGoal || d.type?.text?.toLowerCase().includes("own goal");
        const isPenalty = !!d.penaltyKick || d.type?.text?.toLowerCase().includes("penalty");

        const eventType: "GOAL" | "PENALTY_GOAL" | "OWN_GOAL" = isOwnGoal
          ? "OWN_GOAL"
          : isPenalty
          ? "PENALTY_GOAL"
          : "GOAL";

        const espnTeamId = d.team?.id;
        const isHomeCredit = espnTeamId === homeComp.team?.id;
        const eventTeamId = isHomeCredit ? matchedHome.id : matchedAway.id;

        // Player's actual club
        const athleteTeamEspnId = athlete?.team?.id;
        let playerTeamDbId = eventTeamId;
        if (athleteTeamEspnId) {
          if (athleteTeamEspnId === homeComp.team?.id) playerTeamDbId = matchedHome.id;
          else if (athleteTeamEspnId === awayComp.team?.id) playerTeamDbId = matchedAway.id;
        } else if (isOwnGoal) {
          // If athlete's team was not explicitly provided by ESPN, for an own goal the player belongs to the conceding club
          playerTeamDbId = isHomeCredit ? matchedAway.id : matchedHome.id;
        }

        // Find or create player
        let player = await db.query.players.findFirst({
          where: (p, { ilike }) => ilike(p.name, athleteName),
        });

        if (!player) {
          const normAthlete = athleteName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          player = await db.query.players.findFirst({
            where: (p, { ilike }) => ilike(p.name, normAthlete),
          });
        }

        if (!player) {
          const slug = athleteName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const extId = `espn:player:${athlete?.id ?? slug}`;
          const [inserted] = await db
            .insert(players)
            .values({
              externalId: extId,
              name: athleteName,
              position: athlete?.position ?? (isOwnGoal ? "Defence" : "Attack"),
              currentTeamId: playerTeamDbId,
              source: "FOOTBALL_DATA_ORG",
              updatedAt: new Date(),
            })
            .returning();
          player = inserted;
        }

        newEvents.push({
          matchId: dbMatch.id,
          teamId: eventTeamId,
          playerId: player.id,
          type: eventType,
          minute,
          externalId: `espn:goal:${dbMatch.id}:${minute}:${i}`,
        });
      }

      // Delete existing and insert real events
      await db.delete(matchEvents).where(eq(matchEvents.matchId, dbMatch.id));
      if (newEvents.length > 0) {
        await db.insert(matchEvents).values(newEvents).onConflictDoNothing();
      }

      matchesUpdated++;
      eventsCreated += newEvents.length;
    }
  }

  console.log(`Finished ${leagueCode}: updated ${matchesUpdated} matches, created ${eventsCreated} real events.`);
  return { matchesUpdated, eventsCreated };
}

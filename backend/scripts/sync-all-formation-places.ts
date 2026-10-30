import { db } from "../src/db/client.js";
import { matches, teams, players, matchPlayers } from "../src/db/schema/index.js";
import { ESPN_LEAGUE_MAP, getEspnSlug, matchDbTeam } from "../src/football/espn-lineup-sync.service.js";
import { eq, and, sql } from "drizzle-orm";
import { fetchWikipediaPhoto } from "./sync-top-player-photos.js";

async function syncTacticalPositionsForLeague(leagueCode: string) {
  const espnSlug = ESPN_LEAGUE_MAP[leagueCode] || leagueCode;
  console.log(`\n=== Syncing tactical positions for ${leagueCode} (${espnSlug}) ===`);

  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/scoreboard`);
  if (!res.ok) return;

  const data = await res.json();
  const rawCalendar: any[] = data.leagues?.[0]?.calendar ?? [];
  const now = new Date();
  const pastDates: string[] = [];

  for (const entry of rawCalendar) {
    let d: Date | null = null;
    let dStr = "";
    if (typeof entry === "string") {
      dStr = entry.slice(0, 10).replace(/-/g, "");
      d = new Date(entry);
    } else if (entry && typeof entry.value === "string") {
      dStr = entry.value.slice(0, 10).replace(/-/g, "");
      d = new Date(entry.value);
    }
    if (d && d <= now && dStr) {
      pastDates.push(dStr);
    }
  }

  const allDbTeams = await db.query.teams.findMany();
  let updatedCount = 0;

  for (const dateStr of pastDates) {
    const sbRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/scoreboard?dates=${dateStr}`);
    if (!sbRes.ok) continue;

    const sbData = await sbRes.json();
    for (const ev of sbData.events ?? []) {
      const comp = ev.competitions?.[0];
      if (!comp) continue;

      const homeComp = comp.competitors?.find((c: any) => c.homeAway === "home");
      const awayComp = comp.competitors?.find((c: any) => c.homeAway === "away");
      if (!homeComp || !awayComp) continue;

      const mHome = matchDbTeam(homeComp.team?.displayName ?? homeComp.team?.name, allDbTeams);
      const mAway = matchDbTeam(awayComp.team?.displayName ?? awayComp.team?.name, allDbTeams);
      if (!mHome || !mAway) continue;

      const dbMatch = await db.query.matches.findFirst({
        where: and(eq(matches.homeTeamId, mHome.id), eq(matches.awayTeamId, mAway.id)),
      });
      if (!dbMatch) continue;

      const sumRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/summary?event=${ev.id}`);
      if (!sumRes.ok) continue;

      const sumData = await sumRes.json();
      const rosters = sumData.rosters ?? [];
      if (rosters.length === 0) continue;

      const homeRoster = rosters.find((r: any) => r.homeAway === "home" || r.team?.id === homeComp.team?.id);
      const awayRoster = rosters.find((r: any) => r.homeAway === "away" || r.team?.id === awayComp.team?.id);

      await db
        .update(matches)
        .set({
          homeFormation: homeRoster?.formation ?? null,
          awayFormation: awayRoster?.formation ?? null,
        })
        .where(eq(matches.id, dbMatch.id));

      for (const r of rosters) {
        const isHome = r.homeAway === "home" || r.team?.id === homeComp.team?.id;
        const teamDb = isHome ? mHome : mAway;

        for (const p of r.roster ?? []) {
          if (!p.starter && !p.subbedIn) continue;

          const athleteName = p.athlete?.displayName ?? p.athlete?.fullName ?? "Player";
          let player = await db.query.players.findFirst({
            where: (pl, { and, eq, ilike }) => and(eq(pl.currentTeamId, teamDb.id), ilike(pl.name, athleteName)),
          });
          if (!player) {
            player = await db.query.players.findFirst({
              where: (pl, { ilike }) => ilike(pl.name, athleteName),
            });
          }

          if (player) {
            const tacticalPos = p.position?.displayName ?? p.position?.name ?? p.position?.abbreviation ?? null;
            const place = p.formationPlace ? parseInt(p.formationPlace, 10) : null;

            await db
              .update(matchPlayers)
              .set({
                tacticalPosition: tacticalPos,
                formationPlace: place,
              })
              .where(and(eq(matchPlayers.matchId, dbMatch.id), eq(matchPlayers.playerId, player.id)));

            // If player has headshot in ESPN, store it
            if (!player.photoUrl && p.athlete?.headshot?.href) {
              await db.update(players).set({ photoUrl: p.athlete.headshot.href }).where(eq(players.id, player.id));
            }
          }
        }
      }

      updatedCount++;
    }
  }

  console.log(`Updated ${updatedCount} matches with formations and tactical positions for ${leagueCode}.`);
}

async function main() {
  const leagues = ["PD", "CL", "PL", "SA", "BL1", "FL1"];
  for (const l of leagues) {
    try {
      await syncTacticalPositionsForLeague(l);
    } catch (e) {
      console.error(`Error in league ${l}:`, e);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));

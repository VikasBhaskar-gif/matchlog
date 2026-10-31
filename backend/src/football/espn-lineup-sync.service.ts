import { db } from "../db/client.js";
import { matches, teams, players, matchPlayers, matchEvents, competitions } from "../db/schema/index.js";
import { normalizeTeamName, slugifyTeamName } from "./openfootball-ids.js";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { resolvePlayerHeadshot } from "./player-photo.service.js";

export const ESPN_LEAGUE_MAP: Record<string, string> = {
  PL: "eng.1",
  "en.1": "eng.1",
  PD: "esp.1",
  "es.1": "esp.1",
  SA: "ita.1",
  "it.1": "ita.1",
  BL1: "ger.1",
  "de.1": "ger.1",
  FL1: "fra.1",
  "fr.1": "fra.1",
  CL: "uefa.champions",
  "uefa.champions": "uefa.champions",
};

export function getEspnSlug(compExtId?: string | null): string {
  if (!compExtId) return "eng.1";
  for (const [key, slug] of Object.entries(ESPN_LEAGUE_MAP)) {
    if (compExtId.toLowerCase().includes(key.toLowerCase())) {
      return slug;
    }
  }
  return "eng.1";
}

export function parseMinute(displayValue?: string): number {
  if (!displayValue) return 45;
  const clean = displayValue.replace(/'/g, "").trim();
  if (clean.includes("+")) {
    const parts = clean.split("+").map((s) => parseInt(s.trim(), 10) || 0);
    return parts[0] + parts[1];
  }
  return parseInt(clean, 10) || 45;
}

export function matchDbTeam(espnName: string, allDbTeams: (typeof teams.$inferSelect)[]) {
  const espnSlug = slugifyTeamName(espnName);

  let found = allDbTeams.find((t) => {
    const tSlug = slugifyTeamName(t.name);
    const sSlug = t.shortName ? slugifyTeamName(t.shortName) : "";
    return tSlug === espnSlug || sSlug === espnSlug || tSlug.includes(espnSlug) || espnSlug.includes(tSlug);
  });
  if (found) return found;

  const stopWords = new Set(["fc", "cf", "sc", "afc", "club", "de", "the", "fk", "sk"]);
  const espnTokens = espnSlug.split("-").filter((tok) => !stopWords.has(tok) && tok.length > 2);

  if (espnTokens.length > 0) {
    found = allDbTeams.find((t) => {
      const tSlug = slugifyTeamName(t.name);
      return espnTokens.every((tok) => tSlug.includes(tok));
    });
    if (found) return found;

    const primaryToken = espnTokens.sort((a, b) => b.length - a.length)[0];
    if (primaryToken && primaryToken.length >= 4) {
      found = allDbTeams.find((t) => slugifyTeamName(t.name).includes(primaryToken));
    }
  }

  return found;
}

export function normalizePosition(pos?: string | null): string {
  if (!pos) return "Attack";
  const p = pos.toLowerCase().trim();
  if (p.includes("goal") || p === "g" || p === "gk") return "Goalkeeper";
  if (p.includes("def") || p.includes("back") || p === "d" || p === "df") return "Defence";
  if (p.includes("mid") || p === "m" || p === "mf") return "Midfield";
  if (p.includes("forw") || p.includes("attack") || p.includes("offence") || p.includes("striker") || p === "f" || p === "fw") return "Attack";
  if (p.includes("sub") || p === "substitute") return "Midfield";
  return "Attack";
}

/**
 * Helper to match an ESPN roster athlete against an in-memory list of DB players,
 * or insert a new player safely with ON CONFLICT DO UPDATE.
 */
async function resolveOrInsertRosterPlayer(
  athlete: any,
  athleteName: string,
  posNameOrAbbr: string,
  teamDb: typeof teams.$inferSelect,
  allPlayers: (typeof players.$inferSelect)[]
): Promise<typeof players.$inferSelect> {
  const slug = athleteName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const extId = `espn:player:${athlete?.id ?? slug}`;
  const lowerName = athleteName.toLowerCase().trim();
  const normName = lowerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Exact externalId match
  let player = allPlayers.find((pl) => pl.externalId === extId);

  // 2. Case-insensitive name match on same team
  if (!player) {
    player = allPlayers.find(
      (pl) => pl.currentTeamId === teamDb.id && pl.name.toLowerCase().trim() === lowerName
    );
  }

  // 3. Case-insensitive name match across all players
  if (!player) {
    player = allPlayers.find((pl) => pl.name.toLowerCase().trim() === lowerName);
  }

  // 4. Accent-normalized name match (same team first, then all)
  if (!player) {
    player =
      allPlayers.find(
        (pl) =>
          pl.currentTeamId === teamDb.id &&
          pl.name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normName
      ) ??
      allPlayers.find(
        (pl) =>
          pl.name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normName
      );
  }

  // 5. Token-based matching (catches reversed/alternate names e.g. "Lee Kang-In" vs "Kang-in Lee")
  if (!player) {
    const tokens = normName.split(/[\s-]+/).filter((t: string) => t.length > 1);
    if (tokens.length >= 2) {
      player =
        allPlayers.find((pl) => {
          if (pl.currentTeamId !== teamDb.id) return false;
          const plNorm = pl.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return tokens.every((tok: string) => plNorm.includes(tok));
        }) ??
        allPlayers.find((pl) => {
          const plNorm = pl.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return tokens.every((tok: string) => plNorm.includes(tok));
        });
    }
  }

  const espnHeadshot = athlete?.headshot?.href ?? null;

  if (!player) {
    const normalizedPos = normalizePosition(posNameOrAbbr);
    const [inserted] = await db
      .insert(players)
      .values({
        externalId: extId,
        name: athleteName,
        position: normalizedPos,
        photoUrl: espnHeadshot,
        currentTeamId: teamDb.id,
        source: "FOOTBALL_DATA_ORG",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: players.externalId,
        set: {
          name: athleteName,
          position: normalizedPos,
          currentTeamId: teamDb.id,
          updatedAt: new Date(),
        },
      })
      .returning();

    player = inserted;
    allPlayers.push(inserted);

    // Enrich headshot asynchronously in the background so lineup sync never blocks
    if (!player.photoUrl) {
      const targetPlayerId = player.id;
      resolvePlayerHeadshot(athleteName, teamDb.name)
        .then(async (resolvedUrl) => {
          if (resolvedUrl) {
            await db.update(players).set({ photoUrl: resolvedUrl }).where(eq(players.id, targetPlayerId));
          }
        })
        .catch(() => {});
    }
  } else if (!player.photoUrl) {
    if (espnHeadshot) {
      await db.update(players).set({ photoUrl: espnHeadshot }).where(eq(players.id, player.id));
      player.photoUrl = espnHeadshot;
    } else {
      const targetPlayerId = player.id;
      resolvePlayerHeadshot(athleteName, teamDb.name)
        .then(async (resolvedUrl) => {
          if (resolvedUrl) {
            await db.update(players).set({ photoUrl: resolvedUrl }).where(eq(players.id, targetPlayerId));
          }
        })
        .catch(() => {});
    }
  }

  return player;
}

/**
 * Sync verified starters and substitutes who played from ESPN rosters for a specific match.
 */
export async function syncEspnLineupForMatch(matchId: string): Promise<boolean> {
  const dbMatch = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!dbMatch) return false;

  const [homeTeam, awayTeam, comp, allDbTeams, allPlayers, evGoals] = await Promise.all([
    dbMatch.homeTeamId ? db.query.teams.findFirst({ where: eq(teams.id, dbMatch.homeTeamId) }) : null,
    dbMatch.awayTeamId ? db.query.teams.findFirst({ where: eq(teams.id, dbMatch.awayTeamId) }) : null,
    dbMatch.competitionId ? db.query.competitions.findFirst({ where: eq(competitions.id, dbMatch.competitionId) }) : null,
    db.query.teams.findMany(),
    db.query.players.findMany(),
    db.query.matchEvents.findMany({ where: eq(matchEvents.matchId, matchId) }),
  ]);

  if (!homeTeam || !awayTeam) return false;

  const espnSlug = getEspnSlug(comp?.externalId);
  const kickDate = dbMatch.kickoffAt;
  const dStr = kickDate.toISOString().slice(0, 10).replace(/-/g, "");

  const prevDate = new Date(kickDate.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const nextDate = new Date(kickDate.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const searchDates = [dStr, prevDate, nextDate];

  let foundEvent: any = null;

  for (const dateStr of searchDates) {
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/scoreboard?dates=${dateStr}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;

      const data = await res.json();
      for (const ev of data.events ?? []) {
        const compDetails = ev.competitions?.[0];
        if (!compDetails) continue;

        const homeComp = compDetails.competitors?.find((c: any) => c.homeAway === "home");
        const awayComp = compDetails.competitors?.find((c: any) => c.homeAway === "away");
        if (!homeComp || !awayComp) continue;

        const mHome = matchDbTeam(homeComp.team?.displayName ?? homeComp.team?.name, allDbTeams);
        const mAway = matchDbTeam(awayComp.team?.displayName ?? awayComp.team?.name, allDbTeams);

        if (mHome?.id === homeTeam.id && mAway?.id === awayTeam.id) {
          foundEvent = { ev, compDetails, homeComp, awayComp };
          break;
        }
      }
      if (foundEvent) break;
    } catch {
      continue;
    }
  }

  if (!foundEvent) {
    return false;
  }

  const sumRes = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/summary?event=${foundEvent.ev.id}`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!sumRes.ok) return false;

  const sumData = await sumRes.json();
  const rosters = sumData.rosters ?? [];
  if (rosters.length === 0) return false;

  const homeRoster = rosters.find((r: any) => r.homeAway === "home" || r.team?.id === foundEvent.homeComp.team?.id);
  const awayRoster = rosters.find((r: any) => r.homeAway === "away" || r.team?.id === foundEvent.awayComp.team?.id);
  if (homeRoster?.formation || awayRoster?.formation) {
    await db
      .update(matches)
      .set({
        homeFormation: homeRoster?.formation ?? null,
        awayFormation: awayRoster?.formation ?? null,
      })
      .where(eq(matches.id, dbMatch.id));
  }

  const goalCountByPlayerId = new Map<string, number>();
  for (const eg of evGoals) {
    if (eg.playerId && eg.type !== "OWN_GOAL") {
      goalCountByPlayerId.set(eg.playerId, (goalCountByPlayerId.get(eg.playerId) ?? 0) + 1);
    }
  }

  const matchPlayersToUpsert: (typeof matchPlayers.$inferInsert)[] = [];
  const seenPlayerIds = new Set<string>();

  for (const r of rosters) {
    const isHome = r.homeAway === "home" || r.team?.id === foundEvent.homeComp.team?.id;
    const teamDb = isHome ? homeTeam : awayTeam;

    const rosterList = r.roster ?? [];
    for (const p of rosterList) {
      // ONLY starters and substitutes who actually entered the pitch
      if (!p.starter && !p.subbedIn) continue;

      const athlete = p.athlete;
      const athleteName = athlete?.displayName ?? athlete?.fullName ?? "Player";
      const posName = p.position?.name || p.position?.displayName || "";
      const posAbbr = p.position?.abbreviation || "";

      const player = await resolveOrInsertRosterPlayer(
        athlete,
        athleteName,
        posName || posAbbr,
        teamDb,
        allPlayers
      );

      if (seenPlayerIds.has(player.id)) continue;
      seenPlayerIds.add(player.id);

      let minutesPlayed = 90;
      let subInMinute: number | null = null;
      if (p.starter) {
        if (p.subbedOut) {
          const subPlay = p.plays?.find((pl: any) => pl.substitution);
          minutesPlayed = subPlay?.clock?.displayValue ? parseMinute(subPlay.clock.displayValue) : 65;
        } else {
          minutesPlayed = 90;
        }
      } else if (p.subbedIn) {
        const subPlay = p.plays?.find((pl: any) => pl.substitution);
        const inMinute = subPlay?.clock?.displayValue ? parseMinute(subPlay.clock.displayValue) : 65;
        subInMinute = inMinute;
        minutesPlayed = Math.max(1, 90 - inMinute);
      }

      const tacticalPosition = p.position?.displayName ?? p.position?.name ?? p.position?.abbreviation ?? null;
      const formationPlace = p.formationPlace ? parseInt(p.formationPlace, 10) : null;

      matchPlayersToUpsert.push({
        matchId: dbMatch.id,
        playerId: player.id,
        teamId: teamDb.id,
        isStarter: !!p.starter,
        minutesPlayed,
        subInMinute,
        goals: goalCountByPlayerId.get(player.id) ?? 0,
        tacticalPosition,
        formationPlace,
      });
    }
  }

  if (matchPlayersToUpsert.length === 0) {
    return false;
  }

  await db
    .insert(matchPlayers)
    .values(matchPlayersToUpsert)
    .onConflictDoUpdate({
      target: [matchPlayers.matchId, matchPlayers.playerId],
      set: {
        teamId: sql`excluded.team_id`,
        isStarter: sql`excluded.is_starter`,
        minutesPlayed: sql`excluded.minutes_played`,
        subInMinute: sql`excluded.sub_in_minute`,
        goals: sql`excluded.goals`,
        tacticalPosition: sql`excluded.tactical_position`,
        formationPlace: sql`excluded.formation_place`,
      },
    });

  return true;
}

/**
 * Sync all verified lineups for a given league.
 */
export async function syncEspnLineupsForLeague(
  leagueCode: string,
  options: { maxDays?: number; verbose?: boolean } = {}
): Promise<{ matchesUpdated: number; rowsCreated: number }> {
  const espnSlug = ESPN_LEAGUE_MAP[leagueCode] || leagueCode;
  console.log(`Starting ESPN lineup sync for ${leagueCode} (${espnSlug})...`);

  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/scoreboard`);
  if (!res.ok) {
    console.error(`Failed to fetch scoreboard for ${espnSlug}: ${res.status}`);
    return { matchesUpdated: 0, rowsCreated: 0 };
  }

  const data = await res.json();
  const rawCalendar: any[] = data.leagues?.[0]?.calendar ?? [];

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
    const dbDates = await db
      .select({ kickoffAt: matches.kickoffAt })
      .from(matches)
      .where(lte(matches.kickoffAt, now));
    pastDates = dbDates
      .map((m) => m.kickoffAt?.toISOString().slice(0, 10).replace(/-/g, ""))
      .filter((d): d is string => !!d);
  }

  const uniqueDates = Array.from(new Set(pastDates)).sort();
  const datesToProcess = options.maxDays ? uniqueDates.slice(-options.maxDays) : uniqueDates;
  console.log(`Processing ${datesToProcess.length} past match dates for ${espnSlug} lineups...`);

  const allDbTeams = await db.query.teams.findMany();
  let matchesUpdated = 0;
  let rowsCreated = 0;

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

      const matchedHome = matchDbTeam(espnHomeName, allDbTeams);
      const matchedAway = matchDbTeam(espnAwayName, allDbTeams);

      if (!matchedHome || !matchedAway) continue;

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

      if (!dbMatch) continue;

      // Fetch summary
      const sumRes = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnSlug}/summary?event=${ev.id}`
      );
      if (!sumRes.ok) continue;

      const sumData = await sumRes.json();
      const rosters = sumData.rosters ?? [];
      if (rosters.length === 0) continue;

      const homeRoster = rosters.find((r: any) => r.homeAway === "home" || r.team?.id === homeComp.team?.id);
      const awayRoster = rosters.find((r: any) => r.homeAway === "away" || r.team?.id === awayComp.team?.id);
      if (homeRoster?.formation || awayRoster?.formation) {
        await db
          .update(matches)
          .set({
            homeFormation: homeRoster?.formation ?? null,
            awayFormation: awayRoster?.formation ?? null,
          })
          .where(eq(matches.id, dbMatch.id));
      }

      let matchInserted = 0;

      for (const r of rosters) {
        const isHome = r.homeAway === "home" || r.team?.id === homeComp.team?.id;
        const teamDb = isHome ? matchedHome : matchedAway;

        const rosterList = r.roster ?? [];
        for (const p of rosterList) {
          // ONLY starters or substitutes who entered the pitch
          if (!p.starter && !p.subbedIn) continue;

          const athlete = p.athlete;
          const athleteName = athlete?.displayName ?? athlete?.fullName ?? "Player";

          let player = await db.query.players.findFirst({
            where: (pl, { and, eq, ilike }) => and(eq(pl.currentTeamId, teamDb.id), ilike(pl.name, athleteName)),
          });
          if (!player) {
            player = await db.query.players.findFirst({
              where: (pl, { ilike }) => ilike(pl.name, athleteName),
            });
          }
          if (!player) {
            const norm = athleteName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            player = await db.query.players.findFirst({
              where: (pl, { ilike }) => ilike(pl.name, norm),
            });
          }
          if (!player) {
            // Token-based matching to catch reversed/alternate names (e.g. "Lee Kang-In" vs "Kang-in Lee")
            const tokens = athleteName
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .split(/[\s-]+/)
              .filter((t: string) => t.length > 1);

            if (tokens.length >= 2) {
              const teamPlayers = await db.query.players.findMany({
                where: (pl, { eq }) => eq(pl.currentTeamId, teamDb.id),
              });
              player = teamPlayers.find((pl) => {
                const plNorm = pl.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return tokens.every((tok: string) => plNorm.includes(tok));
              });

              if (!player) {
                const allCandidates = await db.query.players.findMany();
                player = allCandidates.find((pl) => {
                  const plNorm = pl.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                  return tokens.every((tok: string) => plNorm.includes(tok));
                });
              }
            }
          }
          if (!player) {
            const posName = p.position?.name || p.position?.displayName || "";
            const posAbbr = p.position?.abbreviation || "";
            const normalizedPos = normalizePosition(posName || posAbbr);

            const slug = athleteName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const extId = `espn:player:${athlete?.id ?? slug}`;
            const headshot = (await resolvePlayerHeadshot(athleteName, teamDb.name)) ?? athlete?.headshot?.href ?? null;
            const [inserted] = await db
              .insert(players)
              .values({
                externalId: extId,
                name: athleteName,
                position: normalizedPos,
                photoUrl: headshot,
                currentTeamId: teamDb.id,
                source: "FOOTBALL_DATA_ORG",
                updatedAt: new Date(),
              })
              .returning();
            player = inserted;
          } else if (!player.photoUrl) {
            const headshot = (await resolvePlayerHeadshot(athleteName, teamDb.name)) ?? athlete?.headshot?.href ?? null;
            if (headshot) {
              await db.update(players).set({ photoUrl: headshot }).where(eq(players.id, player.id));
              player.photoUrl = headshot;
            }
          }

          let minutesPlayed = 90;
          let subInMinute: number | null = null;
          if (p.starter) {
            if (p.subbedOut) {
              const subPlay = p.plays?.find((pl: any) => pl.substitution);
              minutesPlayed = subPlay?.clock?.displayValue ? parseMinute(subPlay.clock.displayValue) : 65;
            } else {
              minutesPlayed = 90;
            }
          } else if (p.subbedIn) {
            const subPlay = p.plays?.find((pl: any) => pl.substitution);
            const inMinute = subPlay?.clock?.displayValue ? parseMinute(subPlay.clock.displayValue) : 65;
            subInMinute = inMinute;
            minutesPlayed = Math.max(1, 90 - inMinute);
          }

          const tacticalPosition = p.position?.displayName ?? p.position?.name ?? p.position?.abbreviation ?? null;
          const formationPlace = p.formationPlace ? parseInt(p.formationPlace, 10) : null;

          await db
            .insert(matchPlayers)
            .values({
              matchId: dbMatch.id,
              playerId: player.id,
              teamId: teamDb.id,
              isStarter: !!p.starter,
              minutesPlayed,
              subInMinute,
              goals: 0,
              tacticalPosition,
              formationPlace,
            })
            .onConflictDoUpdate({
              target: [matchPlayers.matchId, matchPlayers.playerId],
              set: {
                teamId: teamDb.id,
                isStarter: !!p.starter,
                minutesPlayed,
                subInMinute,
                tacticalPosition,
                formationPlace,
              },
            });

          matchInserted++;
        }
      }

      // Update goals count from matchEvents
      const evGoals = await db.query.matchEvents.findMany({
        where: eq(matchEvents.matchId, dbMatch.id),
      });
      for (const eg of evGoals) {
        if (eg.playerId) {
          await db
            .update(matchPlayers)
            .set({ goals: sql`${matchPlayers.goals} + 1` })
            .where(and(eq(matchPlayers.matchId, dbMatch.id), eq(matchPlayers.playerId, eg.playerId)));
        }
      }

      matchesUpdated++;
      rowsCreated += matchInserted;
      if (options.verbose) {
        console.log(`  ✓ Lineup synced for ${matchedHome.name} vs ${matchedAway.name} (${matchInserted} participants)`);
      }
    }
  }

  console.log(`Finished ${leagueCode} lineup sync: updated ${matchesUpdated} matches, created/updated ${rowsCreated} appearances.`);
  return { matchesUpdated, rowsCreated };
}

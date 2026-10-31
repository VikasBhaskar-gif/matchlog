import { db } from "../db/client.js";
import { matches, teams, matchEvents } from "../db/schema/index.js";
import { and, eq, lt, lte, gte, or, ilike, inArray, sql } from "drizzle-orm";
import { processFinishedMatchPredictions } from "../sync/process-predictions.js";
import { env } from "../lib/env.js";

const DEFAULT_FOOTBALL_DATA_TOKEN = "f9a102dabf644881bbdff8c52f74a3cb";

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(name: string): string {
  return name.replace(/\s*\([A-Z]{2,4}\)\s*$/, "").trim();
}

// In-memory team ID cache to avoid redundant database queries
const teamCache = new Map<string, string>();

async function findTeamId(rawName: string, shortName?: string): Promise<string | null> {
  const normName = normalizeName(rawName);
  const slug = `off:team:${slugify(normName)}`;

  if (teamCache.has(slug)) return teamCache.get(slug)!;

  // 1. Direct match by externalId from full name
  let t = await db.query.teams.findFirst({ where: eq(teams.externalId, slug) });
  if (t) {
    teamCache.set(slug, t.id);
    return t.id;
  }

  // 2. Direct match by externalId from shortName
  if (shortName) {
    const shortSlug = `off:team:${slugify(normalizeName(shortName))}`;
    t = await db.query.teams.findFirst({ where: eq(teams.externalId, shortSlug) });
    if (t) {
      teamCache.set(slug, t.id);
      return t.id;
    }
  }

  // 3. Fallback: ILIKE name / shortName
  t = await db.query.teams.findFirst({
    where: or(
      ilike(teams.name, `%${normName}%`),
      ilike(teams.shortName, `%${shortName || normName}%`)
    ),
  });
  if (t) {
    teamCache.set(slug, t.id);
    return t.id;
  }

  return null;
}

/**
 * Fetch real-time live match scores and statuses from football-data.org v4
 * and update matches currently in play or recently finished.
 */
export async function syncLiveMatchScores() {
  const token = env.FOOTBALL_DATA_API_TOKEN || DEFAULT_FOOTBALL_DATA_TOKEN;
  if (!token) return { ok: false, reason: "No API token" };

  try {
    const res = await fetch("https://api.football-data.org/v4/matches", {
      headers: { "X-Auth-Token": token },
    });

    if (!res.ok) {
      console.warn(`[realtime-worker] football-data.org live matches fetch returned HTTP ${res.status}`);
      return { ok: false, status: res.status };
    }

    const data: any = await res.json();
    const liveMatches = data.matches || [];
    let updatedCount = 0;

    for (const m of liveMatches) {
      if (!m.homeTeam?.name || !m.awayTeam?.name) continue;

      const [homeTeamId, awayTeamId] = await Promise.all([
        findTeamId(m.homeTeam.name, m.homeTeam.shortName),
        findTeamId(m.awayTeam.name, m.awayTeam.shortName),
      ]);

      if (!homeTeamId || !awayTeamId) continue;

      const utcDate = new Date(m.utcDate);
      const dayBefore = new Date(utcDate.getTime() - 24 * 60 * 60 * 1000);
      const dayAfter = new Date(utcDate.getTime() + 24 * 60 * 60 * 1000);

      const dbMatch = await db.query.matches.findFirst({
        where: and(
          eq(matches.homeTeamId, homeTeamId),
          eq(matches.awayTeamId, awayTeamId),
          gte(matches.kickoffAt, dayBefore),
          lte(matches.kickoffAt, dayAfter)
        ),
      });

      if (!dbMatch) continue;

      // Map status
      let newStatus: "SCHEDULED" | "LIVE" | "PAUSED" | "FINISHED" | "POSTPONED" | "CANCELLED" | "SUSPENDED" = dbMatch.status;
      switch (m.status) {
        case "IN_PLAY":
          newStatus = "LIVE";
          break;
        case "PAUSED":
          newStatus = "PAUSED";
          break;
        case "FINISHED":
        case "AWARDED":
          newStatus = "FINISHED";
          break;
        case "POSTPONED":
          newStatus = "POSTPONED";
          break;
        case "CANCELLED":
          newStatus = "CANCELLED";
          break;
        case "SUSPENDED":
          newStatus = "SUSPENDED";
          break;
        case "TIMED":
        case "SCHEDULED":
          if (dbMatch.status !== "LIVE" && dbMatch.status !== "FINISHED") {
            newStatus = "SCHEDULED";
          }
          break;
      }

      const isPastExpectedEndTime = Date.now() - new Date(dbMatch.kickoffAt).getTime() > 115 * 60 * 1000;

      if (m.status === "FINISHED" || m.status === "AWARDED") {
        newStatus = "FINISHED";
      } else if (m.status === "IN_PLAY") {
        // If the match is already marked PAUSED (halftime), don't regress to LIVE until 2nd half begins
        if (dbMatch.status === "PAUSED") {
          newStatus = "PAUSED";
        } else {
          newStatus = isPastExpectedEndTime ? "FINISHED" : "LIVE";
        }
      } else if (m.status === "PAUSED") {
        newStatus = isPastExpectedEndTime ? "FINISHED" : "PAUSED";
      }

      const homeScore = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? dbMatch.homeScore;
      const awayScore = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? dbMatch.awayScore;
      const homeScoreHalfTime = m.score?.halfTime?.home ?? dbMatch.homeScoreHalfTime;
      const awayScoreHalfTime = m.score?.halfTime?.away ?? dbMatch.awayScoreHalfTime;
      const homeScoreExtraTime = m.score?.extraTime?.home ?? dbMatch.homeScoreExtraTime;
      const awayScoreExtraTime = m.score?.extraTime?.away ?? dbMatch.awayScoreExtraTime;
      const wentToPenalties = m.score?.duration === "PENALTY_SHOOTOUT" || dbMatch.wentToPenalties;
      const homePenalties = m.score?.penalties?.home ?? dbMatch.homePenalties;
      const awayPenalties = m.score?.penalties?.away ?? dbMatch.awayPenalties;

      const hasChanged =
        dbMatch.status !== newStatus ||
        dbMatch.homeScore !== homeScore ||
        dbMatch.awayScore !== awayScore ||
        dbMatch.homeScoreHalfTime !== homeScoreHalfTime ||
        dbMatch.awayScoreHalfTime !== awayScoreHalfTime;

      // Track when kickoff was actually detected (starts the live clock accurately without premature ticking)
      const actualKickoffAt =
        dbMatch.actualKickoffAt ??
        (newStatus === "LIVE" ? new Date() : null);

      if (hasChanged || (!dbMatch.actualKickoffAt && newStatus === "LIVE")) {
        await db
          .update(matches)
          .set({
            status: newStatus,
            homeScore,
            awayScore,
            homeScoreHalfTime,
            awayScoreHalfTime,
            homeScoreExtraTime,
            awayScoreExtraTime,
            wentToPenalties,
            homePenalties,
            awayPenalties,
            actualKickoffAt,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(matches.id, dbMatch.id));

        if (newStatus === "LIVE" || newStatus === "PAUSED") {
          await db.delete(matchEvents).where(eq(matchEvents.matchId, dbMatch.id)).catch(() => {});
        } else if (newStatus === "FINISHED") {
          const { syncEspnGoalsForMatch } = await import("./espn-goal-sync.service.js");
          await syncEspnGoalsForMatch(dbMatch.id).catch(() => {});
        }

        updatedCount++;
        console.log(`[realtime-worker] Updated ${m.homeTeam.name} vs ${m.awayTeam.name}: ${newStatus} (${homeScore}-${awayScore})`);
      }
    }

    if (updatedCount > 0) {
      await processFinishedMatchPredictions().catch((err) =>
        console.error("[realtime-worker] Error processing predictions after live update", err)
      );
    }

    return { ok: true, updatedCount };
  } catch (err) {
    console.error("[realtime-worker] Live scores sync error:", err);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Fetch official real-time scores and status from ESPN scoreboard API.
 * Accurately tracks Halftime, live periods, goals, and full-time scores.
 */
export async function syncEspnLiveScores(): Promise<number> {
  const leagues = ["eng.1", "esp.1", "ger.1", "ita.1", "fra.1", "uefa.champions"];
  let updatedCount = 0;

  try {
    const allDbTeams = await db.select().from(teams);
    const { matchDbTeam } = await import("./espn-goal-sync.service.js");

    for (const league of leagues) {
      try {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard`);
        if (!res.ok) continue;
        const data: any = await res.json();
        const events = data.events || [];

        for (const ev of events) {
          const comp = ev.competitions?.[0];
          if (!comp) continue;

          const homeComp = comp.competitors?.find((c: any) => c.homeAway === "home");
          const awayComp = comp.competitors?.find((c: any) => c.homeAway === "away");
          if (!homeComp?.team || !awayComp?.team) continue;

          const homeDbTeam = matchDbTeam(homeComp.team.displayName || homeComp.team.name, allDbTeams);
          const awayDbTeam = matchDbTeam(awayComp.team.displayName || awayComp.team.name, allDbTeams);
          if (!homeDbTeam || !awayDbTeam) continue;

          const evDate = new Date(ev.date || comp.date);
          const dayBefore = new Date(evDate.getTime() - 24 * 60 * 60 * 1000);
          const dayAfter = new Date(evDate.getTime() + 24 * 60 * 60 * 1000);

          const dbMatch = await db.query.matches.findFirst({
            where: and(
              eq(matches.homeTeamId, homeDbTeam.id),
              eq(matches.awayTeamId, awayDbTeam.id),
              gte(matches.kickoffAt, dayBefore),
              lte(matches.kickoffAt, dayAfter)
            ),
          });

          if (!dbMatch) continue;

          const statusType = comp.status?.type?.name || "";
          const statusDesc = (comp.status?.type?.description || "").toLowerCase();
          const isCompleted = comp.status?.type?.completed === true;

          let newStatus: (typeof dbMatch.status) = dbMatch.status;
          if (isCompleted || statusType.includes("FINAL") || statusDesc.includes("full time")) {
            newStatus = "FINISHED";
          } else if (statusDesc.includes("halftime") || statusType.includes("HALFTIME")) {
            newStatus = "PAUSED";
          } else if (
            statusDesc.includes("in progress") ||
            statusDesc.includes("first half") ||
            statusDesc.includes("second half") ||
            statusType.includes("PROGRESS")
          ) {
            newStatus = "LIVE";
          }

          const homeScore = parseInt(homeComp.score ?? "0", 10);
          const awayScore = parseInt(awayComp.score ?? "0", 10);

          const hasChanged =
            dbMatch.status !== newStatus ||
            dbMatch.homeScore !== homeScore ||
            dbMatch.awayScore !== awayScore;

          if (hasChanged || (!dbMatch.actualKickoffAt && (newStatus === "LIVE" || newStatus === "PAUSED"))) {
            const actualKickoffAt =
              dbMatch.actualKickoffAt ??
              new Date(new Date(dbMatch.kickoffAt).getTime() + 75_000);

            await db
              .update(matches)
              .set({
                status: newStatus,
                homeScore,
                awayScore,
                homeScoreHalfTime: newStatus === "PAUSED" ? homeScore : dbMatch.homeScoreHalfTime,
                awayScoreHalfTime: newStatus === "PAUSED" ? awayScore : dbMatch.awayScoreHalfTime,
                actualKickoffAt,
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(matches.id, dbMatch.id));

            if (newStatus === "LIVE" || newStatus === "PAUSED") {
              await db.delete(matchEvents).where(eq(matchEvents.matchId, dbMatch.id)).catch(() => {});
            } else if (newStatus === "FINISHED") {
              const { syncEspnGoalsForMatch } = await import("./espn-goal-sync.service.js");
              await syncEspnGoalsForMatch(dbMatch.id).catch(() => {});
            }

            updatedCount++;
            console.log(`[realtime-worker][ESPN] Updated ${homeDbTeam.name} vs ${awayDbTeam.name}: ${newStatus} (${homeScore}-${awayScore})`);
          }
        }
      } catch (leagueErr) {
        console.error(`[realtime-worker][ESPN] Error syncing league ${league}:`, leagueErr);
      }
    }
  } catch (err) {
    console.error("[realtime-worker][ESPN] Error:", err);
  }

  return updatedCount;
}

export async function checkRealtimeMatchStatuses() {
  const now = new Date();
  const matchDurationAgo = new Date(Date.now() - 150 * 60 * 1000); // 2.5 hours ago
  const matchOldAgo = new Date(Date.now() - 180 * 60 * 1000); // 3 hours ago

  // 1. Live scorecard sync from ESPN (most accurate real-time scoreboard & halftime tracking)
  await syncEspnLiveScores().catch((e) => console.error("[realtime-worker] ESPN live score sync failed", e));

  // 2. Secondary live scorecard sync from football-data.org
  await syncLiveMatchScores().catch((e) => console.error("[realtime-worker] Live scorecard sync failed", e));

  // 2. Fallback: Any LIVE matches older than 180 mins should be marked FINISHED if API missed it
  const newlyFinished = await db
    .update(matches)
    .set({ status: "FINISHED", updatedAt: now })
    .where(and(eq(matches.status, "LIVE"), lt(matches.kickoffAt, matchOldAgo)))
    .returning({ id: matches.id });

  if (newlyFinished.length > 0) {
    console.log(`[realtime-worker] Concluded ${newlyFinished.length} stale matches to FINISHED.`);
    await processFinishedMatchPredictions().catch((err) =>
      console.error("[realtime-worker] prediction processing failed", err)
    );
  }

  // 3. Fallback: Only transition SCHEDULED matches to LIVE if at least 10 minutes past kickoff
  // and the live API failed to report it (prevents premature LIVE status before kickoff actually happens)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const newlyLive = await db
    .update(matches)
    .set({
      status: "LIVE",
      actualKickoffAt: sql`coalesce(${matches.actualKickoffAt}, ${matches.kickoffAt} + interval '90 seconds')`,
      updatedAt: now,
    })
    .where(and(eq(matches.status, "SCHEDULED"), lte(matches.kickoffAt, tenMinutesAgo), gte(matches.kickoffAt, matchDurationAgo)))
    .returning({ id: matches.id });

  if (newlyLive.length > 0) {
    console.log(`[realtime-worker] Transitioned ${newlyLive.length} scheduled matches to LIVE.`);
  }

  // 4. Ensure recently finished matches with scores have official ESPN goal events
  try {
    const recentFinishedWithGoals = await db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.status, "FINISHED"),
          sql`(${matches.homeScore} + ${matches.awayScore}) > 0`,
          gte(matches.kickoffAt, new Date(Date.now() - 72 * 60 * 60 * 1000))
        )
      );

    if (recentFinishedWithGoals.length > 0) {
      const candidateIds = recentFinishedWithGoals.map((m) => m.id);
      const existingEvents = await db
        .select({ matchId: matchEvents.matchId })
        .from(matchEvents)
        .where(
          and(
            inArray(matchEvents.matchId, candidateIds),
            sql`${matchEvents.externalId} NOT LIKE 'gen:goal:%'`
          )
        );
      const covered = new Set(existingEvents.map((e) => e.matchId));
      const missing = candidateIds.filter((id) => !covered.has(id));

      if (missing.length > 0) {
        const { syncEspnGoalsForMatch } = await import("./espn-goal-sync.service.js");
        for (const id of missing.slice(0, 5)) {
          await syncEspnGoalsForMatch(id).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error("[realtime-worker] Error syncing missing events for recent matches:", err);
  }
}

export function startRealtimeStatusWorker() {
  // Purge legacy fake generated goal events from database immediately on startup
  db.delete(matchEvents)
    .where(sql`${matchEvents.externalId} LIKE 'gen:goal:%'`)
    .then((res) => {
      console.log("[realtime-worker] Stale gen:goal events purged from database.");
    })
    .catch((e) => console.error("[realtime-worker] Failed to purge stale gen:goal events:", e));

  // Run once immediately on server startup
  checkRealtimeMatchStatuses().catch((e) => console.error("[realtime-worker] initial run failed", e));

  // Run periodic live sync every 20 seconds (well within the 10 req/min free limit)
  const timer = setInterval(() => {
    checkRealtimeMatchStatuses().catch((e) => console.error("[realtime-worker] periodic check failed", e));
  }, 20_000);

  return () => clearInterval(timer);
}

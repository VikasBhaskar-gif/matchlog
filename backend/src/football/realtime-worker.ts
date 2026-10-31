import { db } from "../db/client.js";
import { matches, teams, matchEvents, matchPlayers } from "../db/schema/index.js";
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
 * Sync live match scores using the authoritative ESPN scoreboard feed.
 * (Replaced football-data.org polling which failed to revert VAR-disallowed goals and caused score ping-ponging.)
 */
export async function syncLiveMatchScores() {
  try {
    const updatedCount = await syncEspnLiveScores();
    return { ok: true, updatedCount };
  } catch (err) {
    console.error("[realtime-worker] Live scores sync error:", err);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Fetch official real-time scores and status from ESPN scoreboard API.
 * Accurately tracks Halftime, live periods, VAR-verified goals, and full-time scores.
 */
export async function syncEspnLiveScores(): Promise<number> {
  const leagues = ["eng.1", "esp.1", "ger.1", "ita.1", "fra.1", "uefa.champions"];
  let updatedCount = 0;
  let anyFinished = false;

  try {
    const now = Date.now();
    const windowStart = new Date(now - 36 * 60 * 60 * 1000);
    const windowEnd = new Date(now + 36 * 60 * 60 * 1000);

    const [allDbTeams, candidateMatches, leagueScoreboards] = await Promise.all([
      db.select().from(teams),
      db
        .select()
        .from(matches)
        .where(and(gte(matches.kickoffAt, windowStart), lte(matches.kickoffAt, windowEnd))),
      Promise.all(
        leagues.map(async (league) => {
          try {
            const res = await fetch(
              `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (!res.ok) return { league, events: [] };
            const data: any = await res.json();
            return { league, events: data.events || [] };
          } catch {
            return { league, events: [] };
          }
        })
      ),
    ]);

    const { matchDbTeam } = await import("./espn-goal-sync.service.js");

    for (const { league, events } of leagueScoreboards) {
      try {
        for (const ev of events) {
          const comp = ev.competitions?.[0];
          if (!comp) continue;

          const homeComp = comp.competitors?.find((c: any) => c.homeAway === "home");
          const awayComp = comp.competitors?.find((c: any) => c.homeAway === "away");
          if (!homeComp?.team || !awayComp?.team) continue;

          const homeDbTeam = matchDbTeam(homeComp.team.displayName || homeComp.team.name, allDbTeams);
          const awayDbTeam = matchDbTeam(awayComp.team.displayName || awayComp.team.name, allDbTeams);
          if (!homeDbTeam || !awayDbTeam) continue;

          const evDateMs = new Date(ev.date || comp.date).getTime();
          const dayWindowMs = 24 * 60 * 60 * 1000;

          const dbMatch = candidateMatches.find(
            (m) =>
              m.homeTeamId === homeDbTeam.id &&
              m.awayTeamId === awayDbTeam.id &&
              Math.abs(new Date(m.kickoffAt).getTime() - evDateMs) <= dayWindowMs
          );

          if (!dbMatch) continue;

          const statusType = comp.status?.type?.name || "";
          const statusDesc = (comp.status?.type?.description || "").toLowerCase();
          const isCompleted = comp.status?.type?.completed === true;
          const period = Number(comp.status?.period ?? 1);

          let newStatus: (typeof dbMatch.status) = dbMatch.status;
          if (isCompleted || statusType.includes("FINAL") || statusDesc.includes("full time")) {
            newStatus = "FINISHED";
          } else if (statusDesc.includes("halftime") || statusType.includes("HALFTIME")) {
            newStatus = "PAUSED";
          } else if (
            statusDesc.includes("in progress") ||
            statusDesc.includes("first half") ||
            statusDesc.includes("second half") ||
            statusType.includes("PROGRESS") ||
            statusType.includes("FIRST_HALF") ||
            statusType.includes("SECOND_HALF")
          ) {
            newStatus = "LIVE";
          } else if (statusType.includes("SCHEDULED")) {
            newStatus = "SCHEDULED";
          }

          if (newStatus === "SCHEDULED" && dbMatch.status === "SCHEDULED") {
            continue;
          }

          const homeScore = parseInt(homeComp.score ?? "0", 10);
          const awayScore = parseInt(awayComp.score ?? "0", 10);

          const homeScoreHalfTime =
            newStatus === "PAUSED"
              ? homeScore
              : newStatus === "LIVE" && period === 1
              ? null
              : dbMatch.homeScoreHalfTime;
          const awayScoreHalfTime =
            newStatus === "PAUSED"
              ? awayScore
              : newStatus === "LIVE" && period === 1
              ? null
              : dbMatch.awayScoreHalfTime;

          const hasChanged =
            dbMatch.status !== newStatus ||
            dbMatch.homeScore !== homeScore ||
            dbMatch.awayScore !== awayScore ||
            dbMatch.homeScoreHalfTime !== homeScoreHalfTime ||
            dbMatch.awayScoreHalfTime !== awayScoreHalfTime;

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
                homeScoreHalfTime,
                awayScoreHalfTime,
                actualKickoffAt,
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(matches.id, dbMatch.id));

            if (newStatus === "LIVE" || newStatus === "PAUSED") {
              await db.delete(matchEvents).where(eq(matchEvents.matchId, dbMatch.id)).catch(() => {});
              if (!dbMatch.homeFormation) {
                import("./espn-lineup-sync.service.js")
                  .then(({ syncEspnLineupForMatch }) => syncEspnLineupForMatch(dbMatch.id))
                  .catch(() => {});
              }
            } else if (newStatus === "FINISHED") {
              anyFinished = true;
              const { syncEspnGoalsForMatch } = await import("./espn-goal-sync.service.js");
              const { syncEspnLineupForMatch } = await import("./espn-lineup-sync.service.js");
              await syncEspnGoalsForMatch(dbMatch.id).catch(() => {});
              await syncEspnLineupForMatch(dbMatch.id).catch(() => {});
            }

            updatedCount++;
            console.log(`[realtime-worker][ESPN] Updated ${homeDbTeam.name} vs ${awayDbTeam.name}: ${newStatus} (${homeScore}-${awayScore})`);
          } else if (
            (newStatus === "FINISHED" || newStatus === "LIVE" || newStatus === "PAUSED") &&
            !dbMatch.homeFormation
          ) {
            import("./espn-lineup-sync.service.js")
              .then(({ syncEspnLineupForMatch }) => syncEspnLineupForMatch(dbMatch.id))
              .catch(() => {});
          }
        }
      } catch (leagueErr) {
        console.error(`[realtime-worker][ESPN] Error syncing league ${league}:`, leagueErr);
      }
    }

    if (anyFinished) {
      await processFinishedMatchPredictions().catch((err) =>
        console.error("[realtime-worker] Error processing predictions after live update", err)
      );
    }
  } catch (err) {
    console.error("[realtime-worker][ESPN] Error:", err);
  }

  return updatedCount;
}

let lastLiveSyncAt = 0;
let activeLiveSyncPromise: Promise<void> | null = null;
let isCheckingRealtime = false;

export async function ensureRecentLiveSync(): Promise<void> {
  if (Date.now() - lastLiveSyncAt < 10_000) return;
  if (activeLiveSyncPromise) return activeLiveSyncPromise;
  activeLiveSyncPromise = (async () => {
    try {
      await syncEspnLiveScores();
      lastLiveSyncAt = Date.now();
    } finally {
      activeLiveSyncPromise = null;
    }
  })();
  return activeLiveSyncPromise;
}

export async function checkRealtimeMatchStatuses() {
  if (isCheckingRealtime) return;
  isCheckingRealtime = true;
  try {
    const now = new Date();
    const matchDurationAgo = new Date(Date.now() - 150 * 60 * 1000); // 2.5 hours ago
    const matchOldAgo = new Date(Date.now() - 180 * 60 * 1000); // 3 hours ago

    // 1. Authoritative live scorecard sync from ESPN (VAR-accurate real-time scoreboard, 2nd half & halftime tracking)
    await syncEspnLiveScores().catch((e) => console.error("[realtime-worker] ESPN live score sync failed", e));
    lastLiveSyncAt = Date.now();

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

  // 5. Ensure recently finished or live matches have official ESPN lineups and substitutes
  try {
    const recentMatches = await db
      .select({ id: matches.id, homeFormation: matches.homeFormation })
      .from(matches)
      .where(
        and(
          inArray(matches.status, ["FINISHED", "LIVE", "PAUSED"]),
          gte(matches.kickoffAt, new Date(Date.now() - 72 * 60 * 60 * 1000))
        )
      );

    if (recentMatches.length > 0) {
      const candidateIds = recentMatches.map((m) => m.id);
      const existingLineups = await db
        .select({
          matchId: matchPlayers.matchId,
          count: sql<number>`count(*)`,
        })
        .from(matchPlayers)
        .where(inArray(matchPlayers.matchId, candidateIds))
        .groupBy(matchPlayers.matchId);

      const countByMatch = new Map(existingLineups.map((r) => [r.matchId, Number(r.count)]));
      const missingLineups = recentMatches
        .filter((m) => (countByMatch.get(m.id) ?? 0) < 22 || !m.homeFormation)
        .map((m) => m.id);

      if (missingLineups.length > 0) {
        const { syncEspnLineupForMatch } = await import("./espn-lineup-sync.service.js");
        for (const id of missingLineups.slice(0, 5)) {
          await syncEspnLineupForMatch(id).catch((e) =>
            console.error(`[realtime-worker] Lineup sync failed for ${id}:`, e)
          );
        }
      }
    }
    } catch (err) {
      console.error("[realtime-worker] Error syncing missing lineups for recent matches:", err);
    }
  } finally {
    isCheckingRealtime = false;
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

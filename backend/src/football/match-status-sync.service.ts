// Fixture sync (openfootball-sync.service.ts) imports the season's schedule
// — who plays whom, when. This file is deliberately separate: it's about
// keeping status/score CURRENT for matches that already exist, at a
// cadence appropriate to how urgently each one needs it. Running this
// does not import new fixtures; running fixture sync does not chase scores.
import { and, eq, gte, lte, lt, ne, notInArray, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { matches, competitions, seasons, syncLogs } from "../db/schema/index.js";
import { env } from "../lib/env.js";
import { syncOneCompetition } from "./openfootball-sync.service.js";
import { processFinishedMatchPredictions } from "../sync/process-predictions.js";
import { syncDomesticResultsFromFdo } from "./sync-results.js";
import type { BulkFootballDataProvider } from "./bulk-provider.js";

const NOT_FINAL_STATUSES = ["FINISHED", "CANCELLED"] as const;

export type MatchStatusSyncReport = {
  bucketsChecked: { live: number; upcoming: number; recentlyFinished: number; stale: number };
  competitionsRefreshed: { source: string; code: string; name: string }[];
  matchesTransitionedToFinished: number;
  predictionsScored: number;
  errors: string[];
  ok: boolean;
};

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}
function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60_000);
}
function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60_000);
}

/**
 * Finds matches whose status/score is due for a refresh, bucketed by
 * urgency, and only if they haven't been checked within that bucket's
 * configured interval (so a scheduler calling this every couple of minutes
 * doesn't actually hit the provider every couple of minutes for every match).
 */
async function findMatchesNeedingRefresh() {
  const now = new Date();

  // LIVE: kicked off recently and not yet in a final state — the most
  // time-sensitive bucket.
  const live = await db.query.matches.findMany({
    where: and(
      notInArray(matches.status, [...NOT_FINAL_STATUSES]),
      lte(matches.kickoffAt, now),
      gte(matches.kickoffAt, hoursAgo(env.MATCH_SYNC_LIVE_WINDOW_HOURS_AFTER_KICKOFF)),
      or(isNull(matches.lastSyncedAt), lt(matches.lastSyncedAt, minutesAgo(env.MATCH_SYNC_LIVE_INTERVAL_MINUTES)))
    ),
  });

  // UPCOMING: hasn't kicked off yet — refreshed rarely, mainly to catch a
  // postponement or a kickoff-time change before it happens.
  const upcoming = await db.query.matches.findMany({
    where: and(
      eq(matches.status, "SCHEDULED"),
      gte(matches.kickoffAt, now),
      or(isNull(matches.lastSyncedAt), lt(matches.lastSyncedAt, minutesAgo(env.MATCH_SYNC_UPCOMING_INTERVAL_MINUTES)))
    ),
  });

  // RECENTLY FINISHED: result is in, but stay on it a little longer in case
  // of a post-match correction (rare, but real providers do amend results).
  const recentlyFinished = await db.query.matches.findMany({
    where: and(
      eq(matches.status, "FINISHED"),
      gte(matches.kickoffAt, hoursAgo(env.MATCH_SYNC_RECENTLY_FINISHED_WINDOW_HOURS)),
      or(isNull(matches.lastSyncedAt), lt(matches.lastSyncedAt, minutesAgo(env.MATCH_SYNC_RECENTLY_FINISHED_INTERVAL_MINUTES)))
    ),
  });

  // STALE: kicked off longer ago than the live window but still isn't
  // FINISHED/CANCELLED — this is exactly the real bug reported ("matches
  // from yesterday haven't updated"). Checked at the same relaxed cadence as
  // "upcoming" rather than the live cadence, since by definition the data
  // source has already been slow once for these.
  const stale = await db.query.matches.findMany({
    where: and(
      notInArray(matches.status, [...NOT_FINAL_STATUSES]),
      lt(matches.kickoffAt, hoursAgo(env.MATCH_SYNC_LIVE_WINDOW_HOURS_AFTER_KICKOFF)),
      or(isNull(matches.lastSyncedAt), lt(matches.lastSyncedAt, minutesAgo(env.MATCH_SYNC_UPCOMING_INTERVAL_MINUTES)))
    ),
  });

  return { live, upcoming, recentlyFinished, stale };
}

export async function runMatchStatusSync(providers: BulkFootballDataProvider[]): Promise<MatchStatusSyncReport> {
  const startedAt = new Date();
  const providerBySource = new Map(providers.map((p) => [p.sourceName, p]));
  const errors: string[] = [];
  const refreshedCompetitions: { source: string; code: string; name: string }[] = [];

  const buckets = await findMatchesNeedingRefresh();
  const allNeedingRefresh = [...buckets.live, ...buckets.upcoming, ...buckets.recentlyFinished, ...buckets.stale];

  if (allNeedingRefresh.length === 0) {
    await db.insert(syncLogs).values({
      jobName: "sync:status",
      status: "SUCCESS",
      itemsProcessed: 0,
      message: "Nothing due for a status refresh.",
      startedAt,
      finishedAt: new Date(),
    });
    return {
      bucketsChecked: { live: 0, upcoming: 0, recentlyFinished: 0, stale: 0 },
      competitionsRefreshed: [],
      matchesTransitionedToFinished: 0,
      predictionsScored: 0,
      errors: [],
      ok: true,
    };
  }

  // Status refresh, per competition (both provider types expose a
  // whole-competition fetch — see BulkFootballDataProvider — so "refresh
  // this match's status" and "re-sync this match's whole competition" cost
  // the same one API call; there's no reason to do N calls for N matches in
  // the same competition when they all come from one response anyway).
  const competitionIds = [...new Set(allNeedingRefresh.map((m) => m.competitionId))];
  const seasonExternalIds = new Map<string, string>(); // competitionId -> season external id, filled below

  for (const competitionId of competitionIds) {
    const competition = await db.query.competitions.findFirst({ where: eq(competitions.id, competitionId) });
    if (!competition) continue;

    const provider = providerBySource.get(competition.source as "OPENFOOTBALL" | "FOOTBALL_DATA_ORG");
    if (!provider) {
      errors.push(`No provider configured for source "${competition.source}" (competition: ${competition.name}) — skipped.`);
      continue;
    }

    const code = competition.externalId.split(":").pop()!;

    try {
      const activeSeason = await getActiveSeasonExternalId();
      const { result } = await syncOneCompetition(provider, { code, name: competition.name, country: competition.country ?? "" }, activeSeason);
      if (result.status === "SUCCESS") {
        refreshedCompetitions.push({ source: provider.sourceName, code, name: competition.name });
      } else if (result.error) {
        errors.push(`${competition.name}: ${result.error}`);
      }
    } catch (err) {
      errors.push(`${competition.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Also catch up any domestic league scores from football-data.org if configured
  try {
    await syncDomesticResultsFromFdo();
  } catch {}

  // Anything that just became FINISHED needs its predictions scored — this
  // is what actually makes "prediction points calculated automatically
  // after the result is in" true, rather than only true after someone
  // happens to run a full fixture sync.
  const { matchesHandled, predictionsScored } = await processFinishedMatchPredictions();

  await db.insert(syncLogs).values({
    jobName: "sync:status",
    status: errors.length > 0 ? "PARTIAL" : "SUCCESS",
    itemsProcessed: allNeedingRefresh.length,
    message: errors.length ? errors.join(" | ") : null,
    startedAt,
    finishedAt: new Date(),
  });

  return {
    bucketsChecked: {
      live: buckets.live.length,
      upcoming: buckets.upcoming.length,
      recentlyFinished: buckets.recentlyFinished.length,
      stale: buckets.stale.length,
    },
    competitionsRefreshed: refreshedCompetitions,
    matchesTransitionedToFinished: matchesHandled,
    predictionsScored,
    errors,
    ok: errors.length < competitionIds.length, // not a total failure as long as at least one competition refreshed
  };
}

async function getActiveSeasonExternalId(): Promise<string> {
  const active = await db.query.seasons.findFirst({ where: eq(seasons.isActive, true) });
  if (!active) throw new Error("No active season — run a full fixture sync first.");
  return active.externalId;
}

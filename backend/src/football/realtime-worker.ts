import { db } from "../db/client.js";
import { matches } from "../db/schema/index.js";
import { and, eq, lt, lte, gte } from "drizzle-orm";
import { processFinishedMatchPredictions } from "../sync/process-predictions.js";

export async function checkRealtimeMatchStatuses() {
  const now = new Date();
  const matchDurationAgo = new Date(Date.now() - 150 * 60 * 1000); // 2.5 hours ago

  // 1. Any LIVE matches older than 150 mins should be FINISHED
  const newlyFinished = await db
    .update(matches)
    .set({ status: "FINISHED", updatedAt: now })
    .where(and(eq(matches.status, "LIVE"), lt(matches.kickoffAt, matchDurationAgo)))
    .returning({ id: matches.id });

  if (newlyFinished.length > 0) {
    console.log(`[realtime-worker] Concluded ${newlyFinished.length} matches to FINISHED.`);
    await processFinishedMatchPredictions().catch((err) =>
      console.error("[realtime-worker] prediction processing failed", err)
    );
  }

  // 2. Any SCHEDULED matches whose kickoff time has arrived (within the last 150 mins) transition to LIVE
  const newlyLive = await db
    .update(matches)
    .set({ status: "LIVE", updatedAt: now })
    .where(and(eq(matches.status, "SCHEDULED"), lte(matches.kickoffAt, now), gte(matches.kickoffAt, matchDurationAgo)))
    .returning({ id: matches.id });

  if (newlyLive.length > 0) {
    console.log(`[realtime-worker] Started ${newlyLive.length} matches to LIVE.`);
  }
}

export function startRealtimeStatusWorker() {
  checkRealtimeMatchStatuses().catch((e) => console.error("[realtime-worker] initial run failed", e));

  const timer = setInterval(() => {
    checkRealtimeMatchStatuses().catch((e) => console.error("[realtime-worker] periodic check failed", e));
  }, 60_000);

  return () => clearInterval(timer);
}

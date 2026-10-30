import cron from "node-cron";
import { ApiFootballProvider } from "../football/api-football-provider.js";
import { syncFixtures, syncLiveAndRecentMatches, syncActiveSeason, syncCompetitionSeasonLinks } from "../football/sync.service.js";
import { processFinishedMatchPredictions } from "./process-predictions.js";

const provider = new ApiFootballProvider();

// Free-tier friendly cadence. Tune based on your actual API-Football plan's
// daily request budget — this worker is deliberately conservative.

// Every 6 hours: pick up newly scheduled/postponed/rescheduled fixtures,
// and newly-known knockout participants.
cron.schedule("0 */6 * * *", async () => {
  console.log("[scheduler] running fixtures sync");
  await syncFixtures(provider).catch((err) => console.error("[scheduler] fixtures sync failed", err));
});

// Every 2 minutes: refresh matches that are live or about to kick off.
cron.schedule("*/2 * * * *", async () => {
  await syncLiveAndRecentMatches(provider).catch((err) => console.error("[scheduler] live sync failed", err));
  await processFinishedMatchPredictions().catch((err) => console.error("[scheduler] prediction processing failed", err));
});

// Once a day: re-check whether a new season has begun.
cron.schedule("0 3 * * *", async () => {
  console.log("[scheduler] checking for new season");
  await syncActiveSeason(provider).catch((err) => console.error("[scheduler] season sync failed", err));
  await syncCompetitionSeasonLinks().catch((err) => console.error("[scheduler] competition-season link failed", err));
});

console.log("Matchlog sync scheduler running.");

import { OpenFootballProvider } from "../football/openfootball-provider.js";
import { FootballDataOrgProvider } from "../football/football-data-org-provider.js";
import { runOpenFootballSync, type OpenFootballSyncReport } from "../football/openfootball-sync.service.js";
import { runMatchStatusSync, type MatchStatusSyncReport } from "../football/match-status-sync.service.js";
import { ApiFootballProvider } from "../football/api-football-provider.js";
import { syncFixtures, syncLiveAndRecentMatches } from "../football/sync.service.js";
import type { BulkFootballDataProvider } from "../football/bulk-provider.js";

const mode = process.argv[2] ?? "fixtures";

// The providers actually used for the default (real, non-legacy) pipeline.
// This is the one place that decides "OpenFootball for the 5 domestic
// leagues, football-data.org for Champions League" — swapping or adding a
// provider later means changing this list, nothing else.
function activeProviders(): BulkFootballDataProvider[] {
  return [new OpenFootballProvider(), new FootballDataOrgProvider()];
}

function printFixtureReport(report: OpenFootballSyncReport) {
  console.log("");
  console.log(report.ok ? (report.errors.length ? "Fixture sync complete (partial)." : "Fixture sync complete.") : "Fixture sync FAILED.");
  console.log("");
  console.log(`Sources: ${report.sources.join(", ")}`);
  console.log(`Season: ${report.seasonDisplay}`);
  console.log("");
  console.log("Competitions:");
  for (const c of report.competitions) {
    if (c.status === "SUCCESS") {
      console.log(
        `  [${c.source}] ${c.name}: ${c.matchesUpserted} matches (${c.finishedMatches} finished, ${c.upcomingMatches} upcoming), ${c.teamsUpserted} teams`
      );
      for (const w of c.warnings.slice(0, 2)) console.log(`    note: ${w}`);
      if (c.warnings.length > 2) console.log(`    ...and ${c.warnings.length - 2} more`);
    } else {
      console.log(`  [${c.source}] ${c.name}: FAILED — ${c.error}`);
    }
  }

  if (report.unsupportedCompetitions.length > 0) {
    console.log("");
    console.log("Not yet supported (no legitimate free data source mapped — not faked):");
    for (const u of report.unsupportedCompetitions) console.log(`  ${u.name}: ${u.reason}`);
  }

  console.log("");
  console.log(`Competitions attempted: ${report.competitionsAttempted}`);
  console.log(`Competitions succeeded: ${report.competitionsSucceeded}`);
  console.log(`Teams upserted: ${report.totalTeamsUpserted}`);
  console.log(`Matches upserted: ${report.totalMatchesUpserted}`);
  console.log(`Errors: ${report.errors.length}`);
  console.log(`Warnings: ${report.warnings.length}`);
  console.log("");
}

function printStatusReport(report: MatchStatusSyncReport) {
  console.log("");
  console.log(report.ok ? "Status sync complete." : "Status sync FAILED.");
  console.log("");
  console.log(
    `Checked — live: ${report.bucketsChecked.live}, upcoming: ${report.bucketsChecked.upcoming}, ` +
      `recently finished: ${report.bucketsChecked.recentlyFinished}, stale (overdue): ${report.bucketsChecked.stale}`
  );
  if (report.competitionsRefreshed.length > 0) {
    console.log("Refreshed:");
    for (const c of report.competitionsRefreshed) console.log(`  [${c.source}] ${c.name}`);
  }
  console.log(`Matches newly confirmed FINISHED: ${report.matchesTransitionedToFinished}`);
  console.log(`Predictions scored: ${report.predictionsScored}`);
  console.log(`Errors: ${report.errors.length}`);
  for (const e of report.errors) console.log(`  ${e}`);
  console.log("");
}

async function main() {
  if (mode === "fixtures" || mode === "openfootball") {
    const report = await runOpenFootballSync(activeProviders());
    printFixtureReport(report);
    if (!report.ok) throw new Error("Fixture sync failed for every competition — see errors above.");
    return;
  }

  if (mode === "players") {
    console.log("Syncing real players from football-data.org...");
    const { syncRealPlayers } = await import("../football/sync-players.js");
    const { teamsMatched, playersUpserted } = await syncRealPlayers();
    console.log(`Players sync complete: ${teamsMatched} teams, ${playersUpserted} players.`);
    return;
  }

  if (mode === "full") {
    const report = await runOpenFootballSync(activeProviders());
    printFixtureReport(report);
    console.log("Syncing real players from football-data.org...");
    const { syncRealPlayers } = await import("../football/sync-players.js");
    const { teamsMatched, playersUpserted } = await syncRealPlayers();
    console.log(`Players sync complete: ${teamsMatched} teams, ${playersUpserted} players.`);
    return;
  }

  if (mode === "status") {
    const report = await runMatchStatusSync(activeProviders());
    printStatusReport(report);
    if (!report.ok) throw new Error("Status sync failed — see errors above.");
    return;
  }

  // Legacy / optional API-Football path — kept behind the provider
  // abstraction for when a paid plan makes it usable again. Not run by default.
  const provider = new ApiFootballProvider();
  console.log(`Running sync mode: ${mode} (API-Football provider)`);
  switch (mode) {
    case "api-football-fixtures":
      await syncFixtures(provider);
      break;
    case "api-football-live":
      await syncLiveAndRecentMatches(provider);
      break;
    default:
      throw new Error(`Unknown sync mode: ${mode}. Use "fixtures" (default), "status", "players", "full", "api-football-fixtures", or "api-football-live".`);
  }
  console.log("Sync complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("");
    console.error("Sync FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });

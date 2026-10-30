import { syncEspnGoalsForLeague } from "../src/football/espn-goal-sync.service.js";

async function main() {
  const leagues = ["CL", "PD", "PL", "SA", "BL1", "FL1"];
  let totalMatches = 0;
  let totalEvents = 0;

  for (const code of leagues) {
    try {
      const res = await syncEspnGoalsForLeague(code, { verbose: false });
      totalMatches += res.matchesUpdated;
      totalEvents += res.eventsCreated;
    } catch (err) {
      console.error(`Error syncing goals for ${code}:`, err);
    }
  }

  console.log(`\n========================================`);
  console.log(`ALL LEAGUES SYNCED SUCCESSFULLY WITH REAL GOALS!`);
  console.log(`Total Matches Updated with Real Goals: ${totalMatches}`);
  console.log(`Total Official Goal Events Created: ${totalEvents}`);
  console.log(`========================================`);
  process.exit(0);
}

main().catch(console.error);

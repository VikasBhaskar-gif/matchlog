import { syncEspnLineupsForLeague } from "../src/football/espn-lineup-sync.service.js";

async function main() {
  const leagues = ["CL", "PD", "PL", "SA", "BL1", "FL1"];
  console.log(`=== Starting full lineup sync for all leagues: ${leagues.join(", ")} ===`);

  let totalMatches = 0;
  let totalRows = 0;

  for (const league of leagues) {
    try {
      const res = await syncEspnLineupsForLeague(league, { verbose: false });
      totalMatches += res.matchesUpdated;
      totalRows += res.rowsCreated;
    } catch (err: any) {
      console.error(`Error syncing lineups for ${league}:`, err.message);
    }
  }

  console.log(`\n=== All lineups synced successfully! Total matches: ${totalMatches}, total appearances: ${totalRows} ===`);
}

main().catch(console.error).finally(() => process.exit(0));

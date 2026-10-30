import { syncEspnLineupForMatch } from "../src/football/espn-lineup-sync.service.js";

async function main() {
  const matchId = "02ac09ac-0820-481b-b472-dba4ef09ffec"; // Barcelona vs Feyenoord
  console.log("Syncing match:", matchId);
  const ok = await syncEspnLineupForMatch(matchId);
  console.log("Sync result:", ok);
}

main().catch(console.error).finally(() => process.exit(0));

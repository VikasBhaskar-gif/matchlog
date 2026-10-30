import { db } from "../src/db/client.js";
import { matches, matchPlayers, teams, players } from "../src/db/schema/index.js";
import { eq, isNotNull } from "drizzle-orm";

interface Starter {
  id: string;
  name: string;
  tacticalPosition: string | null;
  formationPlace: number | null;
  position: string | null;
}

function getDetailedTacticalLine(p: Starter, formation?: string | null): "GK" | "DEF" | "DEF_MID" | "ATT_MID" | "FWD" {
  const text = `${p.tacticalPosition || ""} ${p.position || ""}`.toLowerCase();

  // 1. Goalkeeper
  if (text.includes("goal") || text.includes("keeper") || text === "g" || text === "gk" || p.formationPlace === 1) {
    return "GK";
  }

  // 2. Defenders
  if (
    text.includes("back") ||
    text.includes("defender") ||
    text.includes("defence") ||
    text.includes("cb") ||
    text.includes("cd") ||
    text.includes("lb") ||
    text.includes("rb") ||
    text.includes("lwb") ||
    text.includes("rwb") ||
    text.includes("sweeper") ||
    text === "d" ||
    text === "df"
  ) {
    return "DEF";
  }

  // 3. Attacking Midfielders / Wingers
  if (
    text.includes("attacking midfielder") ||
    text.includes("center left forward") ||
    text.includes("center right forward") ||
    text.includes("am-l") ||
    text.includes("am-r") ||
    text.includes("cam") ||
    text.includes("lam") ||
    text.includes("ram") ||
    text.includes("wing") ||
    text === "lw" ||
    text === "rw"
  ) {
    return "ATT_MID";
  }

  // Check 4-2-3-1 formation place specifics if tacticalPosition missing
  if (formation?.includes("4-2-3-1") && p.formationPlace) {
    if ([7, 10, 11].includes(p.formationPlace)) return "ATT_MID";
    if ([4, 8].includes(p.formationPlace)) return "DEF_MID";
    if ([9].includes(p.formationPlace)) return "FWD";
    if ([2, 3, 5, 6].includes(p.formationPlace)) return "DEF";
  }

  // 4. Strikers / Forwards
  if (
    text.includes("striker") ||
    text.includes("forward") ||
    text.includes("cf") ||
    text.includes("st") ||
    text === "f" ||
    text === "fw" ||
    text.includes("lf") ||
    text.includes("rf")
  ) {
    return "FWD";
  }

  // 5. Central / Defensive / Wide Midfielders
  if (
    text.includes("mid") ||
    text === "m" ||
    text === "mf" ||
    text.includes("cm") ||
    text.includes("dm")
  ) {
    return "DEF_MID";
  }

  return "DEF_MID";
}

function getHorizontalRank(p: Starter): number {
  const tp = (p.tacticalPosition || "").toLowerCase().trim();
  const pos = (p.position || "").toLowerCase().trim();
  const text = `${tp} ${pos}`;

  // 1. Extreme Left flank (LF, LW, LB, LWB, LM, Attacking Midfielder Left)
  if (
    text.includes("left forward") ||
    text.includes("left wing") ||
    text.includes("left back") ||
    text.includes("left midfielder") ||
    text.includes("attacking midfielder left") ||
    text.includes("am-l") ||
    text.includes("cf-l") ||
    /\b(lf|lw|lb|lwb|lm)\b/i.test(tp) ||
    /\b(lf|lw|lb|lwb|lm)\b/i.test(pos)
  ) {
    return 10;
  }

  // 2. Center-Left (CD-L, CB-L, CM-L, DM-L, LCB, Center Left Mid, Center Left Forward)
  if (
    text.includes("center left") ||
    text.includes("centre left") ||
    text.includes("cd-l") ||
    text.includes("cb-l") ||
    text.includes("cm-l") ||
    text.includes("dm-l") ||
    text.includes("lcb") ||
    text.includes("lcm") ||
    text.includes("ldm")
  ) {
    return 30;
  }

  // 3. Center-Right (CD-R, CB-R, CM-R, DM-R, RCB, Center Right Mid, Center Right Forward)
  if (
    text.includes("center right") ||
    text.includes("centre right") ||
    text.includes("cd-r") ||
    text.includes("cb-r") ||
    text.includes("cm-r") ||
    text.includes("dm-r") ||
    text.includes("rcb") ||
    text.includes("rcm") ||
    text.includes("rdm")
  ) {
    return 70;
  }

  // 4. Extreme Right flank (RF, RW, RB, RWB, RM, Attacking Midfielder Right)
  if (
    text.includes("right forward") ||
    text.includes("right wing") ||
    text.includes("right back") ||
    text.includes("right midfielder") ||
    text.includes("attacking midfielder right") ||
    text.includes("am-r") ||
    text.includes("cf-r") ||
    /\b(rf|rw|rb|rwb|rm)\b/i.test(tp) ||
    /\b(rf|rw|rb|rwb|rm)\b/i.test(pos)
  ) {
    return 90;
  }

  // 5. Pure Center (Striker, Central Attacking Midfielder, Central Midfielder, CB, GK)
  if (
    text.includes("striker") ||
    text.includes("center forward") ||
    text.includes("centre forward") ||
    text.includes("center midfielder") ||
    text.includes("centre midfielder") ||
    text.includes("center defender") ||
    text.includes("centre defender") ||
    text.includes("goalkeeper") ||
    text.includes("attacking midfielder") ||
    text.includes("defensive midfielder") ||
    text.includes("forward") ||
    /\b(f|cf|st|cm|dm|am|cam|cd|cb|g|gk)\b/i.test(tp) ||
    /\b(f|cf|st|cm|dm|am|cam|cd|cb|g|gk)\b/i.test(pos)
  ) {
    return 50;
  }

  // Fallback to formationPlace
  if (p.formationPlace) {
    if ([3, 11].includes(p.formationPlace)) return 10;
    if ([4, 6].includes(p.formationPlace)) return 30;
    if ([1, 5, 9, 10].includes(p.formationPlace)) return 50;
    if ([7, 8].includes(p.formationPlace)) return 70;
    if ([2].includes(p.formationPlace)) return 90;
  }

  return 50;
}

async function main() {
  const m = await db.query.matches.findFirst({
    where: eq(matches.id, "1a2ee2e8-d518-41d4-b8a2-e3b246b9eea2"),
  });
  if (!m) return;

  const rows = await db
    .select({
      id: players.id,
      name: players.name,
      tacticalPosition: matchPlayers.tacticalPosition,
      formationPlace: matchPlayers.formationPlace,
      position: players.position,
      teamId: matchPlayers.teamId,
      isStarter: matchPlayers.isStarter,
    })
    .from(matchPlayers)
    .innerJoin(players, eq(matchPlayers.playerId, players.id))
    .where(eq(matchPlayers.matchId, m.id));

  const barcaStarters = rows.filter(r => r.teamId === m.awayTeamId && r.isStarter);

  const lines: Record<string, Starter[]> = {
    FWD: [],
    ATT_MID: [],
    DEF_MID: [],
    DEF: [],
    GK: [],
  };

  for (const s of barcaStarters) {
    if (s.name.includes("Jesus")) {
      console.log("Jesus debug:", {
        tacticalPosition: s.tacticalPosition,
        position: s.position,
        formationPlace: s.formationPlace,
        rank: getHorizontalRank(s)
      });
    }
    const line = getDetailedTacticalLine(s, m.awayFormation);
    lines[line].push(s);
  }

  const sortByFlank = (a: Starter, b: Starter) => getHorizontalRank(a) - getHorizontalRank(b);
  lines.FWD.sort(sortByFlank);
  lines.ATT_MID.sort(sortByFlank);
  lines.DEF_MID.sort(sortByFlank);
  lines.DEF.sort(sortByFlank);
  lines.GK.sort(sortByFlank);

  console.log("BARCELONA TACTICAL ROWS (4-2-3-1):");
  console.log("FWD:", lines.FWD.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
  console.log("ATT_MID:", lines.ATT_MID.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
  console.log("DEF_MID:", lines.DEF_MID.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
  console.log("DEF:", lines.DEF.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
  console.log("GK:", lines.GK.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));

  const betisStarters = rows.filter(r => r.teamId === m.homeTeamId && r.isStarter);
  const betisLines: Record<string, Starter[]> = { FWD: [], ATT_MID: [], DEF_MID: [], DEF: [], GK: [] };
  for (const s of betisStarters) {
    const line = getDetailedTacticalLine(s, m.homeFormation);
    betisLines[line].push(s);
  }
  betisLines.FWD.sort(sortByFlank);
  betisLines.ATT_MID.sort(sortByFlank);
  betisLines.DEF_MID.sort(sortByFlank);
  betisLines.DEF.sort(sortByFlank);
  betisLines.GK.sort(sortByFlank);

  console.log("\nREAL BETIS TACTICAL ROWS (4-2-3-1):");
  console.log("FWD:", betisLines.FWD.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
  console.log("ATT_MID:", betisLines.ATT_MID.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
  console.log("DEF_MID:", betisLines.DEF_MID.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
  console.log("DEF:", betisLines.DEF.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
  // Now test 4-3-3 match
  const m433 = await db.query.matches.findFirst({
    where: eq(matches.homeFormation, "4-3-3"),
  });
  if (m433) {
    const h433 = await db.query.teams.findFirst({ where: eq(teams.id, m433.homeTeamId!) });
    const starters433 = await db
      .select({
        id: players.id,
        name: players.name,
        tacticalPosition: matchPlayers.tacticalPosition,
        formationPlace: matchPlayers.formationPlace,
        position: players.position,
        teamId: matchPlayers.teamId,
        isStarter: matchPlayers.isStarter,
      })
      .from(matchPlayers)
      .innerJoin(players, eq(matchPlayers.playerId, players.id))
      .where(eq(matchPlayers.matchId, m433.id));

    const homeStarters433 = starters433.filter(r => r.teamId === m433.homeTeamId && r.isStarter);
    const lines433: Record<string, Starter[]> = { FWD: [], ATT_MID: [], DEF_MID: [], DEF: [], GK: [] };
    for (const s of homeStarters433) {
      const line = getDetailedTacticalLine(s, m433.homeFormation);
      lines433[line].push(s);
    }
    lines433.FWD.sort(sortByFlank);
    lines433.ATT_MID.sort(sortByFlank);
    lines433.DEF_MID.sort(sortByFlank);
    lines433.DEF.sort(sortByFlank);
    lines433.GK.sort(sortByFlank);

    console.log(`\n${h433?.name} TACTICAL ROWS (4-3-3):`);
    console.log("FWD:", lines433.FWD.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
    console.log("ATT_MID:", lines433.ATT_MID.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
    console.log("DEF_MID:", lines433.DEF_MID.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
    console.log("DEF:", lines433.DEF.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
    console.log("GK:", lines433.GK.map(p => `${p.name} (${getHorizontalRank(p)})`).join(", "));
  }


}

main().catch(console.error).finally(() => process.exit(0));

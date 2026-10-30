import { db } from "../src/db/client.js";
import { matches, matchPlayers, players, teams } from "../src/db/schema/index.js";
import { eq, and } from "drizzle-orm";

// Exact implementation currently in PotmPicker.tsx
function getHorizontalRank(p: any): number {
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

  // Fallback to ESPN formationPlace if present
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
  const mId = "0fa600cb-7f06-4e5c-ad21-59738fa3e86e";
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
    .where(and(eq(matchPlayers.matchId, mId), eq(matchPlayers.isStarter, true)));

  const m = await db.query.matches.findFirst({ where: eq(matches.id, mId) });
  const rmStarters = rows.filter(r => r.teamId === m?.awayTeamId);

  for (const s of rmStarters) {
    console.log(`${s.name} | rank: ${getHorizontalRank(s)} | pos: ${s.tacticalPosition} | place: ${s.formationPlace}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));

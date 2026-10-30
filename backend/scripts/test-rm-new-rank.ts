import { db } from "../src/db/client.js";
import { matches, matchPlayers, players, teams } from "../src/db/schema/index.js";
import { eq, and } from "drizzle-orm";

function getHorizontalRank(p: any): number {
  const tp = (p.tacticalPosition || "").toLowerCase().trim();

  // If a tactical position is known for this specific match, prioritize it completely!
  if (tp) {
    // 1. Center-Left specific (e.g. Center Left Defender, Center Left Midfielder)
    if (
      tp.includes("center left") ||
      tp.includes("centre left") ||
      tp.includes("cd-l") ||
      tp.includes("cb-l") ||
      tp.includes("cm-l") ||
      tp.includes("dm-l") ||
      tp.includes("lcb") ||
      tp.includes("lcm")
    ) {
      return 30;
    }

    // 2. Center-Right specific (e.g. Center Right Defender, Center Right Midfielder)
    if (
      tp.includes("center right") ||
      tp.includes("centre right") ||
      tp.includes("cd-r") ||
      tp.includes("cb-r") ||
      tp.includes("cm-r") ||
      tp.includes("dm-r") ||
      tp.includes("rcb") ||
      tp.includes("rcm")
    ) {
      return 70;
    }

    // 3. Left flank / wing (Attacking Midfielder Left, Left Forward, Left Back, Left Wing, Left Midfielder)
    if (
      tp.includes("left") ||
      tp.includes("am-l") ||
      tp.includes("cf-l") ||
      /\b(lf|lw|lb|lwb|lm)\b/i.test(tp)
    ) {
      return 10;
    }

    // 4. Right flank / wing (Attacking Midfielder Right, Right Forward, Right Back, Right Wing, Right Midfielder)
    if (
      tp.includes("right") ||
      tp.includes("am-r") ||
      tp.includes("cf-r") ||
      /\b(rf|rw|rb|rwb|rm)\b/i.test(tp)
    ) {
      return 90;
    }

    // 5. Pure Center (Attacking Midfielder, Central Midfielder, Forward, Striker, Goalkeeper, Center Defender)
    if (
      tp.includes("center") ||
      tp.includes("centre") ||
      tp.includes("attacking midfielder") ||
      tp.includes("midfielder") ||
      tp.includes("forward") ||
      tp.includes("striker") ||
      tp.includes("defender") ||
      tp.includes("goalkeeper") ||
      /\b(f|cf|st|cm|dm|am|cam|cd|cb|g|gk)\b/i.test(tp)
    ) {
      return 50;
    }
  }

  // Fallback to ESPN formationPlace if present
  if (p.formationPlace) {
    if ([3, 11].includes(p.formationPlace)) return 10;
    if ([4, 6].includes(p.formationPlace)) return 30;
    if ([1, 5, 9, 10].includes(p.formationPlace)) return 50;
    if ([7, 8].includes(p.formationPlace)) return 70;
    if ([2].includes(p.formationPlace)) return 90;
  }

  // Fallback to generic player position
  const pos = (p.position || "").toLowerCase().trim();
  if (pos.includes("left") || /\b(lf|lw|lb|lwb|lm)\b/i.test(pos)) return 10;
  if (pos.includes("right") || /\b(rf|rw|rb|rwb|rm)\b/i.test(pos)) return 90;

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

  const sortByFlank = (a: any, b: any) => {
    const rankDiff = getHorizontalRank(a) - getHorizontalRank(b);
    if (rankDiff !== 0) return rankDiff;
    if (a.formationPlace && b.formationPlace) return a.formationPlace - b.formationPlace;
    return a.name.localeCompare(b.name);
  };

  const attMids = rmStarters.filter(s => [7, 10, 11].includes(s.formationPlace ?? 0));
  attMids.sort(sortByFlank);

  console.log("REAL MADRID ATTACKING MIDFIELD ROW (from left to right):");
  for (const s of attMids) {
    console.log(`  ${s.name} (rank ${getHorizontalRank(s)}, pos: '${s.tacticalPosition}', place: ${s.formationPlace})`);
  }
}

main().catch(console.error).finally(() => process.exit(0));

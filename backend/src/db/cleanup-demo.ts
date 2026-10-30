// Run manually with: npx tsx src/db/cleanup-demo.ts
//
// This is a one-off reconciliation script, not part of the normal sync or
// migration path. It exists because the `source` column was added to
// `matches`/`competitions` after some databases (including ours during
// development) already had demo/seed rows and real synced rows mixed
// together — Postgres's ADD COLUMN ... DEFAULT retroactively applied the
// *new* default ('OPENFOOTBALL') to *all* existing rows, which silently
// mislabeled old demo rows as if they were real. This script re-derives the
// correct source from each row's stable external_id prefix (set by whichever
// script created it) rather than trusting the column as it stands today.
//
// Safe by construction:
//   - never deletes a competition/match that any watched_matches,
//     predictions, or player_of_match_votes row still references — those are
//     re-tagged (source corrected, hidden from the feed) but preserved, so a
//     user's XP/history/predictions are never touched
//   - only deletes rows that are both (a) demo/seed-originated and (b)
//     provably unreferenced by any user data
import { eq, sql, inArray, like } from "drizzle-orm";
import { db } from "./client.js";
import {
  competitions,
  matches,
  teams,
  players,
  watchedMatches,
  predictions,
  playerOfMatchVotes,
  matchPlayers,
  matchEvents,
  competitionSeasons,
  followedTeams,
  followedPlayers,
} from "./schema/index.js";

async function main() {
  console.log("Reconciling competition/match source tags...\n");

  // ---------------------------------------------------------------------
  // 1. Re-derive competitions.source from the external_id prefix each
  //    sync/seed script actually assigns (not from the column's current,
  //    possibly-wrong value).
  // ---------------------------------------------------------------------
  const demoCompUpdate = await db
    .update(competitions)
    .set({ source: "DEMO", isSupported: false, updatedAt: new Date() })
    .where(like(competitions.externalId, "seed-%"))
    .returning({ id: competitions.id, name: competitions.name });
  console.log(`Marked ${demoCompUpdate.length} competition(s) as DEMO:`, demoCompUpdate.map((c) => c.name));

  const openFootballCompUpdate = await db
    .update(competitions)
    .set({ source: "OPENFOOTBALL", isSupported: true, updatedAt: new Date() })
    .where(like(competitions.externalId, "off:comp:%"))
    .returning({ id: competitions.id, name: competitions.name });
  console.log(`Confirmed ${openFootballCompUpdate.length} competition(s) as OPENFOOTBALL (supported).`);

  // ---------------------------------------------------------------------
  // 2. Re-derive matches.source from which competition they actually
  //    belong to — this is the fix for the ADD COLUMN mislabeling bug.
  // ---------------------------------------------------------------------
  const demoCompetitionIds = await db
    .select({ id: competitions.id })
    .from(competitions)
    .where(eq(competitions.source, "DEMO"));

  let matchesFixed = 0;
  if (demoCompetitionIds.length > 0) {
    const ids = demoCompetitionIds.map((c) => c.id);
    const fixed = await db
      .update(matches)
      .set({ source: "DEMO", updatedAt: new Date() })
      .where(inArray(matches.competitionId, ids))
      .returning({ id: matches.id });
    matchesFixed = fixed.length;
  }
  console.log(`Corrected source on ${matchesFixed} match(es) belonging to a demo competition.\n`);

  // ---------------------------------------------------------------------
  // 3. Delete demo matches that no user data references at all — this is
  //    what actually removes clutter, rather than just hiding it.
  // ---------------------------------------------------------------------
  const demoMatches = await db.select({ id: matches.id, externalId: matches.externalId }).from(matches).where(eq(matches.source, "DEMO"));

  let deleted = 0;
  let preserved = 0;
  for (const m of demoMatches) {
    const [watchRef, predRef, potmRef] = await Promise.all([
      db.query.watchedMatches.findFirst({ where: eq(watchedMatches.matchId, m.id) }),
      db.query.predictions.findFirst({ where: eq(predictions.matchId, m.id) }),
      db.query.playerOfMatchVotes.findFirst({ where: eq(playerOfMatchVotes.matchId, m.id) }),
    ]);

    if (watchRef || predRef || potmRef) {
      preserved++;
      continue; // a real user has activity against this match — keep it, just hidden (source=DEMO already set)
    }

    await db.delete(matchPlayers).where(eq(matchPlayers.matchId, m.id));
    await db.delete(matchEvents).where(eq(matchEvents.matchId, m.id));
    await db.delete(matches).where(eq(matches.id, m.id));
    deleted++;
  }
  console.log(`Deleted ${deleted} unreferenced demo match(es). Preserved ${preserved} demo match(es) with real user activity.\n`);

  // ---------------------------------------------------------------------
  // 4. Delete demo competitions that no longer have any matches at all.
  // ---------------------------------------------------------------------
  const stillDemoComps = await db.select().from(competitions).where(eq(competitions.source, "DEMO"));
  let compsDeleted = 0;
  for (const c of stillDemoComps) {
    const anyMatch = await db.query.matches.findFirst({ where: eq(matches.competitionId, c.id) });
    if (anyMatch) continue;
    await db.delete(competitionSeasons).where(eq(competitionSeasons.competitionId, c.id));
    await db.delete(competitions).where(eq(competitions.id, c.id));
    compsDeleted++;
  }
  console.log(`Deleted ${compsDeleted} now-empty demo competition(s).\n`);

  console.log("Done. Remaining competitions:");
  const remaining = await db.select().from(competitions).orderBy(competitions.name);
  for (const c of remaining) {
    console.log(`  ${c.source.padEnd(12)} ${c.isSupported ? "supported  " : "unsupported"} ${c.name}`);
  }

  // ---------------------------------------------------------------------
  // 5. Same reconciliation for teams and players — this is what caused a
  //    real bug: a team search for "Arsenal" matched the demo "Arsenal"
  //    row (alphabetically before real "Arsenal FC") instead of the real
  //    team, so a user following "Arsenal" was actually following a demo
  //    row with no real fixtures.
  // ---------------------------------------------------------------------
  console.log("\nReconciling team/player source tags...\n");

  await db.update(teams).set({ source: "DEMO", updatedAt: new Date() }).where(like(teams.externalId, "seed-team-%"));
  await db.update(teams).set({ source: "OPENFOOTBALL", updatedAt: new Date() }).where(like(teams.externalId, "off:team:%"));
  await db.update(players).set({ source: "DEMO", updatedAt: new Date() }).where(like(players.externalId, "seed-player-%"));

  const demoTeams = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.source, "DEMO"));
  let teamsDeleted = 0;
  let teamsPreserved = 0;
  for (const t of demoTeams) {
    const [matchRef, followRef] = await Promise.all([
      db.query.matches.findFirst({ where: (m, { or, eq }) => or(eq(m.homeTeamId, t.id), eq(m.awayTeamId, t.id)) }),
      db.query.followedTeams.findFirst({ where: eq(followedTeams.teamId, t.id) }),
    ]);
    if (matchRef || followRef) {
      teamsPreserved++;
      continue;
    }
    await db.delete(teams).where(eq(teams.id, t.id));
    teamsDeleted++;
  }
  console.log(`Deleted ${teamsDeleted} unreferenced demo team(s). Preserved ${teamsPreserved} (still referenced by a match or a follow).`);

  const demoPlayers = await db.select({ id: players.id }).from(players).where(eq(players.source, "DEMO"));
  let playersDeleted = 0;
  let playersPreserved = 0;
  for (const p of demoPlayers) {
    const [matchRef, followRef, potmRef] = await Promise.all([
      db.query.matchPlayers.findFirst({ where: eq(matchPlayers.playerId, p.id) }),
      db.query.followedPlayers.findFirst({ where: eq(followedPlayers.playerId, p.id) }),
      db.query.playerOfMatchVotes.findFirst({ where: eq(playerOfMatchVotes.playerId, p.id) }),
    ]);
    if (matchRef || followRef || potmRef) {
      playersPreserved++;
      continue;
    }
    await db.delete(players).where(eq(players.id, p.id));
    playersDeleted++;
  }
  console.log(`Deleted ${playersDeleted} unreferenced demo player(s). Preserved ${playersPreserved}.`);

  console.log("\nIf any users were following a demo team/player that got preserved (still referenced), unfollow and re-follow the real one via search.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

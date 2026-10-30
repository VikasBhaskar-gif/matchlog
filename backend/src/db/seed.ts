import { db } from "./client.js";
import {
  seasons,
  competitions,
  teams,
  players,
  matches,
  matchPlayers,
  users,
  followedTeams,
  followedCompetitions,
  achievements,
} from "./schema/index.js";
import { hashPassword } from "../services/auth.service.js";
import { recordWatch } from "../services/watch.service.js";
import { upsertPrediction, processMatchPredictions } from "../services/prediction.service.js";
import { ACHIEVEMENT_DEFINITIONS } from "../lib/gamification.js";
import { SUPPORTED_COMPETITIONS } from "../football/competitions-config.js";

// ---------------------------------------------------------------------------
// DEMO DATA — NOT the real football feed.
// ---------------------------------------------------------------------------
// This script is for local development/manual testing convenience only. It
// is never run automatically (not part of `npm run dev`, `db:migrate`, or
// app startup) and must be invoked explicitly via `npm run db:seed`.
//
// Everything it creates is clearly tagged so it can never be mistaken for
// real synced fixtures:
//   - competitions are named "[Demo] Premier League" etc. (not "Premier
//     League"), so they never collide with the real OpenFootball-synced
//     competition row of the same real name in dropdowns/filters
//   - external IDs are prefixed "seed-"
//   - matches are written with source: "DEMO"
//
// The normal /api/matches feed filters out source="DEMO" by default (see
// matches.routes.ts), so this data never appears to real users even if
// someone runs `npm run db:seed` against a database that also has real
// synced fixtures in it.
async function main() {
  console.log("Seeding Matchlog DEMO data (source: DEMO — will not appear in the normal match feed)...");

  // --- Achievements -------------------------------------------------------
  for (const def of ACHIEVEMENT_DEFINITIONS) {
    await db.insert(achievements).values(def).onConflictDoNothing();
  }

  // --- Season ---------------------------------------------------------------
  // Never force this to be the active season — if a real OpenFootball sync
  // has already run, forcibly activating a demo season would break the real
  // feed. Only activate it as a bootstrap fallback when nothing else is.
  const anyActiveSeason = await db.query.seasons.findFirst({ where: (s, { eq }) => eq(s.isActive, true) });

  const [season] = await db
    .insert(seasons)
    .values({
      externalId: "seed-2026",
      name: "[Demo] 2026/27",
      startDate: "2026-08-01",
      endDate: "2027-05-31",
      isActive: !anyActiveSeason,
    })
    .onConflictDoUpdate({ target: seasons.externalId, set: { name: "[Demo] 2026/27" } })
    .returning();

  // A past season too, to prove multi-season + "history survives season change"
  await db
    .insert(seasons)
    .values({
      externalId: "seed-2025",
      name: "[Demo] 2025/26",
      startDate: "2025-08-01",
      endDate: "2026-05-31",
      isActive: false,
    })
    .onConflictDoNothing();

  // --- Competitions -----------------------------------------------------
  const compRows = [];
  for (const c of SUPPORTED_COMPETITIONS) {
    const demoName = `[Demo] ${c.name}`;
    const [row] = await db
      .insert(competitions)
      .values({ externalId: `seed-${c.externalId}`, name: demoName, country: c.country, type: c.type, isKnockout: c.type === "cup" })
      .onConflictDoUpdate({ target: competitions.externalId, set: { name: demoName } })
      .returning();
    compRows.push(row);
  }
  const premierLeague = compRows.find((c) => c.name === "[Demo] Premier League")!;
  const laLiga = compRows.find((c) => c.name === "[Demo] La Liga")!;
  const faCup = compRows.find((c) => c.name === "[Demo] FA Cup")!;

  // --- Teams --------------------------------------------------------------
  const teamNames = [
    "Arsenal", "Chelsea", "Manchester City", "Manchester United", "Liverpool",
    "Tottenham Hotspur", "Newcastle United", "Aston Villa",
  ];
  const teamRows = [];
  for (const name of teamNames) {
    const [row] = await db
      .insert(teams)
      .values({ externalId: `seed-team-${name.replace(/\s+/g, "-").toLowerCase()}`, name, country: "England" })
      .onConflictDoUpdate({ target: teams.externalId, set: { name } })
      .returning();
    teamRows.push(row);
  }
  const [arsenal, chelsea, manCity, manUtd, liverpool, spurs, newcastle, villa] = teamRows;

  const laLigaTeamNames = ["Real Madrid", "Barcelona"];
  const laLigaTeams = [];
  for (const name of laLigaTeamNames) {
    const [row] = await db
      .insert(teams)
      .values({ externalId: `seed-team-${name.replace(/\s+/g, "-").toLowerCase()}`, name, country: "Spain" })
      .onConflictDoUpdate({ target: teams.externalId, set: { name } })
      .returning();
    laLigaTeams.push(row);
  }
  const [realMadrid, barcelona] = laLigaTeams;

  // --- Players --------------------------------------------------------------
  const playerDefs = [
    { name: "Bukayo Saka", team: arsenal, position: "Forward" },
    { name: "Martin Ødegaard", team: arsenal, position: "Midfielder" },
    { name: "Cole Palmer", team: chelsea, position: "Forward" },
    { name: "Erling Haaland", team: manCity, position: "Forward" },
    { name: "Kevin De Bruyne", team: manCity, position: "Midfielder" },
    { name: "Mohamed Salah", team: liverpool, position: "Forward" },
    { name: "Bruno Fernandes", team: manUtd, position: "Midfielder" },
    { name: "Jude Bellingham", team: realMadrid, position: "Midfielder" },
  ];
  const playerRows = [];
  for (const p of playerDefs) {
    const [row] = await db
      .insert(players)
      .values({
        externalId: `seed-player-${p.name.replace(/\s+/g, "-").toLowerCase()}`,
        name: p.name,
        position: p.position,
        currentTeamId: p.team.id,
      })
      .onConflictDoUpdate({ target: players.externalId, set: { name: p.name } })
      .returning();
    playerRows.push({ ...row, teamId: p.team.id });
  }
  const [saka, odegaard, palmer, haaland, deBruyne, salah, bruno, bellingham] = playerRows;

  // --- Matches (a mix of past/finished and upcoming/scheduled) --------------
  const now = new Date();
  function daysFromNow(days: number, hour = 15) {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  }

  const matchDefs = [
    {
      key: "arsenal-chelsea-finished",
      home: arsenal, away: chelsea, competition: premierLeague,
      kickoff: daysFromNow(-7), status: "FINISHED" as const, homeScore: 2, awayScore: 1,
      isKnockout: false, round: "Regular Season - 5",
      scorers: [{ player: saka, goals: 1 }, { player: odegaard, goals: 1 }, { player: palmer, goals: 1 }],
    },
    {
      key: "mancity-liverpool-finished",
      home: manCity, away: liverpool, competition: premierLeague,
      kickoff: daysFromNow(-3), status: "FINISHED" as const, homeScore: 3, awayScore: 3,
      isKnockout: false, round: "Regular Season - 6",
      scorers: [{ player: haaland, goals: 2 }, { player: deBruyne, goals: 1 }, { player: salah, goals: 3 }],
    },
    {
      key: "manutd-spurs-upcoming",
      home: manUtd, away: spurs, competition: premierLeague,
      kickoff: daysFromNow(2), status: "SCHEDULED" as const, homeScore: null, awayScore: null,
      isKnockout: false, round: "Regular Season - 7",
      scorers: [],
    },
    {
      key: "newcastle-villa-upcoming",
      home: newcastle, away: villa, competition: premierLeague,
      kickoff: daysFromNow(3), status: "SCHEDULED" as const, homeScore: null, awayScore: null,
      isKnockout: false, round: "Regular Season - 7",
      scorers: [],
    },
    {
      key: "realmadrid-barcelona-upcoming",
      home: realMadrid, away: barcelona, competition: laLiga,
      kickoff: daysFromNow(5, 20), status: "SCHEDULED" as const, homeScore: null, awayScore: null,
      isKnockout: false, round: "Regular Season - 8",
      scorers: [],
    },
    {
      key: "arsenal-mancity-facup-finished",
      home: arsenal, away: manCity, competition: faCup,
      kickoff: daysFromNow(-14), status: "FINISHED" as const, homeScore: 1, awayScore: 1,
      isKnockout: true, round: "Quarter-final", wentToExtraTime: true, wentToPenalties: true,
      homePenalties: 4, awayPenalties: 3,
      scorers: [{ player: saka, goals: 1 }, { player: haaland, goals: 1 }],
    },
  ];

  const matchRows: Record<string, typeof matches.$inferSelect> = {};
  for (const m of matchDefs) {
    const [row] = await db
      .insert(matches)
      .values({
        externalId: `seed-match-${m.key}`,
        seasonId: season.id,
        competitionId: m.competition.id,
        homeTeamId: m.home.id,
        awayTeamId: m.away.id,
        kickoffAt: m.kickoff,
        status: m.status,
        source: "DEMO",
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        isKnockout: m.isKnockout,
        round: m.round,
        wentToExtraTime: "wentToExtraTime" in m ? !!m.wentToExtraTime : false,
        wentToPenalties: "wentToPenalties" in m ? !!m.wentToPenalties : false,
        homePenalties: "homePenalties" in m ? m.homePenalties : null,
        awayPenalties: "awayPenalties" in m ? m.awayPenalties : null,
        maxWatchMinutes: m.isKnockout ? 120 : 90,
      })
      .onConflictDoUpdate({
        target: matches.externalId,
        set: { status: m.status, homeScore: m.homeScore, awayScore: m.awayScore },
      })
      .returning();
    matchRows[m.key] = row;

    for (const s of m.scorers) {
      await db
        .insert(matchPlayers)
        .values({
          matchId: row.id,
          playerId: s.player.id,
          teamId: s.player.teamId,
          isStarter: true,
          minutesPlayed: 90,
          goals: s.goals,
        })
        .onConflictDoUpdate({ target: [matchPlayers.matchId, matchPlayers.playerId], set: { goals: s.goals } });
    }
  }

  // --- Demo users -----------------------------------------------------------
  async function ensureUser(username: string, email: string) {
    const existing = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, email) });
    if (existing) return existing;
    const passwordHash = await hashPassword("password123");
    const [user] = await db.insert(users).values({ username, email, passwordHash }).returning();
    return user;
  }

  const alice = await ensureUser("alice", "alice@example.com");
  const bob = await ensureUser("bob", "bob@example.com");

  await db.insert(followedTeams).values({ userId: alice.id, teamId: arsenal.id }).onConflictDoNothing();
  await db.insert(followedTeams).values({ userId: alice.id, teamId: manCity.id }).onConflictDoNothing();
  await db.insert(followedCompetitions).values({ userId: alice.id, competitionId: premierLeague.id }).onConflictDoNothing();
  await db.insert(followedTeams).values({ userId: bob.id, teamId: liverpool.id }).onConflictDoNothing();
  await db.insert(followedCompetitions).values({ userId: bob.id, competitionId: laLiga.id }).onConflictDoNothing();

  // Alice watched both finished PL matches (through the real service, so XP/
  // streaks/achievements all get computed exactly as they would in production)
  try {
    await recordWatch(alice.id, matchRows["arsenal-chelsea-finished"].id, { startMinute: 0, endMinute: 90 });
  } catch {}
  try {
    await recordWatch(alice.id, matchRows["mancity-liverpool-finished"].id, { startMinute: 23, endMinute: 90 });
  } catch {}
  try {
    await recordWatch(alice.id, matchRows["arsenal-mancity-facup-finished"].id, { startMinute: 0, endMinute: 120 });
  } catch {}

  try {
    await recordWatch(bob.id, matchRows["mancity-liverpool-finished"].id, { startMinute: 0, endMinute: 45 });
  } catch {}

  // Predictions on upcoming matches
  try {
    await upsertPrediction(alice.id, matchRows["manutd-spurs-upcoming"].id, {
      predictedOutcome: "HOME",
      predictedHomeScore: 2,
      predictedAwayScore: 1,
    });
  } catch {}
  try {
    await upsertPrediction(bob.id, matchRows["realmadrid-barcelona-upcoming"].id, {
      predictedOutcome: "DRAW",
      predictedHomeScore: 1,
      predictedAwayScore: 1,
    });
  } catch {}

  // Score predictions on the already-finished matches to demo the pipeline
  await processMatchPredictions(matchRows["arsenal-chelsea-finished"].id).catch(() => {});
  await processMatchPredictions(matchRows["mancity-liverpool-finished"].id).catch(() => {});

  console.log("Seed complete.");
  console.log("Demo users: alice@example.com / bob@example.com, password: password123");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

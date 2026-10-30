import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { buildApp } from "../app.js";
import { resetDb } from "./db-helper.js";
import { db } from "../db/client.js";
import { seasons, competitions, teams, matches, matchPlayers, players, followedTeams } from "../db/schema/index.js";
import { processMatchPredictions } from "../services/prediction.service.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetDb(); });

function cookieFrom(res: any) {
  return `${res.cookies[0].name}=${res.cookies[0].value}`;
}

async function registerAndLogin(email: string, username: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { username, email, password: "password123" },
  });
  return cookieFrom(res);
}

async function seedSeasonAndTeams() {
  const [season] = await db.insert(seasons).values({
    externalId: "p-2026", name: "2026/27", startDate: "2026-08-01", endDate: "2027-05-31", isActive: true,
  }).returning();
  const [competition] = await db.insert(competitions).values({ externalId: "p-comp", name: "Test League", type: "league" }).returning();
  const [home] = await db.insert(teams).values({ externalId: "p-home", name: "Home FC" }).returning();
  const [away] = await db.insert(teams).values({ externalId: "p-away", name: "Away FC" }).returning();
  return { season, competition, home, away };
}

describe("predictions", () => {
  it("allows creating and editing a prediction before kickoff", async () => {
    const cookie = await registerAndLogin("pred@example.com", "predictor");
    const { season, competition, home, away } = await seedSeasonAndTeams();
    const [match] = await db.insert(matches).values({
      externalId: "p-match-future", seasonId: season.id, competitionId: competition.id,
      homeTeamId: home.id, awayTeamId: away.id,
      kickoffAt: new Date(Date.now() + 1000 * 60 * 60 * 24), status: "SCHEDULED",
    }).returning();

    const create = await app.inject({
      method: "POST", url: `/api/matches/${match.id}/prediction`, headers: { cookie },
      payload: { predictedOutcome: "HOME", predictedHomeScore: 2, predictedAwayScore: 0 },
    });
    expect(create.statusCode).toBe(201);

    const edit = await app.inject({
      method: "PATCH", url: `/api/matches/${match.id}/prediction`, headers: { cookie },
      payload: { predictedOutcome: "DRAW", predictedHomeScore: 1, predictedAwayScore: 1 },
    });
    expect(edit.statusCode).toBe(201);
    expect(edit.json().prediction.predictedOutcome).toBe("DRAW");

    const list = await app.inject({ method: "GET", url: "/api/predictions", headers: { cookie } });
    expect(list.json().predictions).toHaveLength(1); // upsert, not a second row
  });

  it("locks predictions once the match has kicked off", async () => {
    const cookie = await registerAndLogin("late@example.com", "latepredictor");
    const { season, competition, home, away } = await seedSeasonAndTeams();
    const [match] = await db.insert(matches).values({
      externalId: "p-match-started", seasonId: season.id, competitionId: competition.id,
      homeTeamId: home.id, awayTeamId: away.id,
      kickoffAt: new Date(Date.now() - 1000 * 60 * 5), status: "LIVE",
    }).returning();

    const res = await app.inject({
      method: "POST", url: `/api/matches/${match.id}/prediction`, headers: { cookie },
      payload: { predictedOutcome: "HOME", predictedHomeScore: 1, predictedAwayScore: 0 },
    });
    expect(res.statusCode).toBe(409);
  });

  it("scores predictions idempotently when a match finishes", async () => {
    const cookie = await registerAndLogin("score@example.com", "scorepredictor");
    const { season, competition, home, away } = await seedSeasonAndTeams();
    const [match] = await db.insert(matches).values({
      externalId: "p-match-scoring", seasonId: season.id, competitionId: competition.id,
      homeTeamId: home.id, awayTeamId: away.id,
      kickoffAt: new Date(Date.now() + 1000 * 60), status: "SCHEDULED",
    }).returning();

    await app.inject({
      method: "POST", url: `/api/matches/${match.id}/prediction`, headers: { cookie },
      payload: { predictedOutcome: "HOME", predictedHomeScore: 2, predictedAwayScore: 1 },
    });

    await db.update(matches).set({ status: "FINISHED", homeScore: 2, awayScore: 1 }).where(eq(matches.id, match.id));

    const first = await processMatchPredictions(match.id);
    expect(first.processed).toBe(1);

    // Re-running must not double-score (idempotent)
    const second = await processMatchPredictions(match.id);
    expect(second.processed).toBe(0);

    const list = await app.inject({ method: "GET", url: "/api/predictions", headers: { cookie } });
    expect(list.json().predictions[0].pointsAwarded).toBe(8); // exact score: 3 + 5
  });
});

describe("player of the match", () => {
  it("requires the user to have watched the match before voting", async () => {
    const cookie = await registerAndLogin("potm@example.com", "potmvoter");
    const { season, competition, home, away } = await seedSeasonAndTeams();
    const [match] = await db.insert(matches).values({
      externalId: "potm-match", seasonId: season.id, competitionId: competition.id,
      homeTeamId: home.id, awayTeamId: away.id,
      kickoffAt: new Date(Date.now() - 1000 * 60 * 60 * 2), status: "FINISHED", homeScore: 1, awayScore: 0,
    }).returning();
    const [player] = await db.insert(players).values({ externalId: "potm-player", name: "Star Player" }).returning();
    await db.insert(matchPlayers).values({ matchId: match.id, playerId: player.id, teamId: home.id, isStarter: true });

    const withoutWatch = await app.inject({
      method: "POST", url: `/api/matches/${match.id}/potm`, headers: { cookie }, payload: { playerId: player.id },
    });
    expect(withoutWatch.statusCode).toBe(403);

    await app.inject({
      method: "POST", url: `/api/matches/${match.id}/watch`, headers: { cookie },
      payload: { startMinute: 0, endMinute: 90 },
    });

    const withWatch = await app.inject({
      method: "POST", url: `/api/matches/${match.id}/potm`, headers: { cookie }, payload: { playerId: player.id },
    });
    expect(withWatch.statusCode).toBe(201);
  });
});

describe("database constraints", () => {
  it("prevents following the same team twice for one user", async () => {
    const cookie = await registerAndLogin("follow@example.com", "follower");
    const { home } = await seedSeasonAndTeams();

    const first = await app.inject({ method: "POST", url: `/api/teams/${home.id}/follow`, headers: { cookie } });
    const second = await app.inject({ method: "POST", url: `/api/teams/${home.id}/follow`, headers: { cookie } });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201); // onConflictDoNothing — idempotent, not an error

    const rows = await db.select().from(followedTeams);
    expect(rows).toHaveLength(1); // unique constraint enforced, no duplicate row
  });
});

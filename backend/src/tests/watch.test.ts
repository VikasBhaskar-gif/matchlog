import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb } from "./db-helper.js";
import { db } from "../db/client.js";
import { seasons, competitions, teams, matches } from "../db/schema/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDb();
});

function cookieFrom(res: any) {
  return `${res.cookies[0].name}=${res.cookies[0].value}`;
}

async function seedMatch(overrides: Partial<typeof matches.$inferInsert> = {}) {
  const [season] = await db.insert(seasons).values({
    externalId: "t-2026",
    name: "2026/27",
    startDate: "2026-08-01",
    endDate: "2027-05-31",
    isActive: true,
  }).returning();
  const [competition] = await db.insert(competitions).values({
    externalId: "t-comp-1",
    name: "Test League",
    type: "league",
  }).returning();
  const [home] = await db.insert(teams).values({ externalId: "t-team-home", name: "Home FC" }).returning();
  const [away] = await db.insert(teams).values({ externalId: "t-team-away", name: "Away FC" }).returning();

  const [match] = await db
    .insert(matches)
    .values({
      externalId: "t-match-1",
      seasonId: season.id,
      competitionId: competition.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoffAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      status: "FINISHED",
      homeScore: 2,
      awayScore: 1,
      maxWatchMinutes: 90,
      ...overrides,
    })
    .returning();
  return match;
}

async function registerAndLogin(email: string, username: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { username, email, password: "password123" },
  });
  return cookieFrom(res);
}

describe("watch tracking", () => {
  it("records a full match watch and awards 100 xp", async () => {
    const cookie = await registerAndLogin("watcher@example.com", "watcher");
    const match = await seedMatch();

    const res = await app.inject({
      method: "POST",
      url: `/api/matches/${match.id}/watch`,
      headers: { cookie },
      payload: { startMinute: 0, endMinute: 90 },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.record.watchType).toBe("FULL_MATCH");
    expect(body.xpEarned).toBe(100);

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.json().user.totalXp).toBe(100);
  });

  it("rejects a second watch record for the same match (no duplicates)", async () => {
    const cookie = await registerAndLogin("dup@example.com", "dupwatcher");
    const match = await seedMatch();

    await app.inject({
      method: "POST",
      url: `/api/matches/${match.id}/watch`,
      headers: { cookie },
      payload: { startMinute: 0, endMinute: 90 },
    });

    const second = await app.inject({
      method: "POST",
      url: `/api/matches/${match.id}/watch`,
      headers: { cookie },
      payload: { startMinute: 0, endMinute: 45 },
    });

    expect(second.statusCode).toBe(409);
  });

  it("rejects a watch range beyond the match's max minutes", async () => {
    const cookie = await registerAndLogin("range@example.com", "rangewatcher");
    const match = await seedMatch(); // 90-minute cap

    const res = await app.inject({
      method: "POST",
      url: `/api/matches/${match.id}/watch`,
      headers: { cookie },
      payload: { startMinute: 0, endMinute: 120 },
    });

    expect(res.statusCode).toBe(400);
  });

  it("allows up to 120 minutes for a knockout match that went to extra time", async () => {
    const cookie = await registerAndLogin("et@example.com", "etwatcher");
    const match = await seedMatch({ maxWatchMinutes: 120, isKnockout: true, wentToExtraTime: true });

    const res = await app.inject({
      method: "POST",
      url: `/api/matches/${match.id}/watch`,
      headers: { cookie },
      payload: { startMinute: 0, endMinute: 120 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().xpEarned).toBe(133);
  });

  it("adjusts XP correctly when a watch record is edited (no double-reward)", async () => {
    const cookie = await registerAndLogin("edit@example.com", "editwatcher");
    const match = await seedMatch();

    const created = await app.inject({
      method: "POST",
      url: `/api/matches/${match.id}/watch`,
      headers: { cookie },
      payload: { startMinute: 0, endMinute: 45 }, // 50 xp
    });
    const watchId = created.json().record.id;

    const edited = await app.inject({
      method: "PATCH",
      url: `/api/watches/${watchId}`,
      headers: { cookie },
      payload: { startMinute: 0, endMinute: 90 }, // 100 xp -> +50 delta
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().xpDelta).toBe(50);

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.json().user.totalXp).toBe(100); // not 150 — no double reward
  });

  it("keeps each user's watch records fully isolated", async () => {
    const cookieA = await registerAndLogin("usera@example.com", "usera");
    const cookieB = await registerAndLogin("userb@example.com", "userb");
    const match = await seedMatch();

    await app.inject({
      method: "POST",
      url: `/api/matches/${match.id}/watch`,
      headers: { cookie: cookieA },
      payload: { startMinute: 0, endMinute: 90 },
    });

    const bWatches = await app.inject({ method: "GET", url: "/api/watches", headers: { cookie: cookieB } });
    expect(bWatches.json().watches).toHaveLength(0);

    const aWatches = await app.inject({ method: "GET", url: "/api/watches", headers: { cookie: cookieA } });
    expect(aWatches.json().watches).toHaveLength(1);
  });

  it("requires authentication to record a watch", async () => {
    const match = await seedMatch();
    const res = await app.inject({
      method: "POST",
      url: `/api/matches/${match.id}/watch`,
      payload: { startMinute: 0, endMinute: 90 },
    });
    expect(res.statusCode).toBe(401);
  });
});

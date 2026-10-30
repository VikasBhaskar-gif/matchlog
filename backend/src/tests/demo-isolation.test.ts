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

async function seedOneRealAndOneDemoMatch() {
  const [season] = await db
    .insert(seasons)
    .values({ externalId: "2026-27", name: "2026/27", startDate: "2026-08-01", endDate: "2027-05-31", isActive: true })
    .returning();
  const [competition] = await db
    .insert(competitions)
    .values({ externalId: "off:comp:en.1", name: "Premier League", type: "league" })
    .returning();
  const [demoCompetition] = await db
    .insert(competitions)
    .values({ externalId: "seed-39", name: "[Demo] Premier League", type: "league" })
    .returning();
  const [home] = await db.insert(teams).values({ externalId: "off:team:a", name: "Team A FC" }).returning();
  const [away] = await db.insert(teams).values({ externalId: "off:team:b", name: "Team B FC" }).returning();

  const [realMatch] = await db
    .insert(matches)
    .values({
      externalId: "off:match:real",
      seasonId: season.id,
      competitionId: competition.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoffAt: new Date(),
      status: "SCHEDULED",
      source: "OPENFOOTBALL",
    })
    .returning();

  const [demoMatch] = await db
    .insert(matches)
    .values({
      externalId: "seed-match-demo",
      seasonId: season.id,
      competitionId: demoCompetition.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoffAt: new Date(),
      status: "SCHEDULED",
      source: "DEMO",
    })
    .returning();

  return { realMatch, demoMatch };
}

describe("demo data isolation", () => {
  it("excludes DEMO-source matches from the default /api/matches feed", async () => {
    const { realMatch, demoMatch } = await seedOneRealAndOneDemoMatch();

    const res = await app.inject({ method: "GET", url: "/api/matches" });
    const ids = res.json().matches.map((m: { id: string }) => m.id);

    expect(ids).toContain(realMatch.id);
    expect(ids).not.toContain(demoMatch.id);
  });

  it("only includes demo matches when explicitly asked for via includeDemo=true", async () => {
    const { demoMatch } = await seedOneRealAndOneDemoMatch();

    const res = await app.inject({ method: "GET", url: "/api/matches?includeDemo=true" });
    const ids = res.json().matches.map((m: { id: string }) => m.id);

    expect(ids).toContain(demoMatch.id);
  });

  it("keeps demo and real competitions of the same real-world league distinguishable by name", async () => {
    await seedOneRealAndOneDemoMatch();
    const res = await app.inject({ method: "GET", url: "/api/competitions" });
    const names = res.json().competitions.map((c: { name: string }) => c.name);

    expect(names).toContain("Premier League");
    expect(names).toContain("[Demo] Premier League");
  });
});

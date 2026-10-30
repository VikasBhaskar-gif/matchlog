import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import { resetDb } from "./db-helper.js";
import { db } from "../db/client.js";
import { competitions, teams, players } from "../db/schema/index.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetDb(); });

describe("entity identity: teams/competitions/players never expose demo rows", () => {
  it("competitions list excludes DEMO/unsupported, even when a same-named real+demo pair exists", async () => {
    await db.insert(competitions).values([
      { externalId: "off:comp:en.1", name: "Premier League", type: "league", source: "OPENFOOTBALL", isSupported: true },
      { externalId: "seed-39", name: "[Demo] Premier League", type: "league", source: "DEMO", isSupported: false },
    ]);

    const res = await app.inject({ method: "GET", url: "/api/competitions" });
    const names = res.json().competitions.map((c: { name: string }) => c.name);

    expect(names).toContain("Premier League");
    expect(names).not.toContain("[Demo] Premier League");
  });

  it(
    "team search never returns the demo row ahead of (or instead of) the real one — " +
      "this is the exact bug that broke a live follow: search('Arsenal') alphabetically matched demo 'Arsenal' " +
      "before real 'Arsenal FC'",
    async () => {
      await db.insert(teams).values([
        { externalId: "off:team:arsenal-fc", name: "Arsenal FC", source: "OPENFOOTBALL" },
        { externalId: "seed-team-arsenal", name: "Arsenal", source: "DEMO" },
      ]);

      const res = await app.inject({ method: "GET", url: "/api/teams?q=Arsenal" });
      const names = res.json().teams.map((t: { name: string }) => t.name);

      expect(names).toEqual(["Arsenal FC"]);
    }
  );

  it("player search excludes demo players", async () => {
    await db.insert(players).values([
      { externalId: "off:player:x", name: "Real Player", source: "OPENFOOTBALL" },
      { externalId: "seed-player-x", name: "Demo Player", source: "DEMO" },
    ]);

    const res = await app.inject({ method: "GET", url: "/api/players" });
    const names = res.json().players.map((p: { name: string }) => p.name);

    expect(names).toContain("Real Player");
    expect(names).not.toContain("Demo Player");
  });

  it("unsupported competitions (e.g. cups with no provider) are hidden from the default list", async () => {
    await db.insert(competitions).values({
      externalId: "manual:facup",
      name: "FA Cup",
      type: "cup",
      source: "OPENFOOTBALL",
      isSupported: false,
    });

    const res = await app.inject({ method: "GET", url: "/api/competitions" });
    const names = res.json().competitions.map((c: { name: string }) => c.name);
    expect(names).not.toContain("FA Cup");

    const withUnsupported = await app.inject({ method: "GET", url: "/api/competitions?includeUnsupported=true" });
    expect(withUnsupported.json().competitions.map((c: { name: string }) => c.name)).toContain("FA Cup");
  });
});

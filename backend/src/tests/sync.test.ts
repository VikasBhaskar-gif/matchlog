import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "./db-helper.js";
import { db } from "../db/client.js";
import { teams, matches, seasons, competitions } from "../db/schema/index.js";
import { syncCompetitions, syncActiveSeason, syncCompetitionSeasonLinks, syncTeams, syncFixtures } from "../football/sync.service.js";
import type {
  FootballDataProvider,
  ProviderCompetition,
  ProviderFixture,
  ProviderLineupEntry,
  ProviderMatchEvent,
  ProviderPlayer,
  ProviderSeason,
  ProviderTeam,
} from "../football/provider.js";

class FakeProvider implements FootballDataProvider {
  fixtures: ProviderFixture[] = [
    {
      externalId: "fake-fixture-1",
      competitionExternalId: "39",
      seasonExternalId: "2026",
      homeTeamExternalId: "fake-team-1",
      awayTeamExternalId: "fake-team-2",
      kickoffAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
      isKnockout: false,
    },
  ];

  async getCurrentSeason(): Promise<ProviderSeason> {
    return { externalId: "2026", name: "2026/27", startDate: "2026-08-01", endDate: "2027-05-31" };
  }
  async getSupportedCompetitions(): Promise<ProviderCompetition[]> {
    return [{ externalId: "39", name: "Premier League", country: "England", type: "league" }];
  }
  async getTeamsForCompetitionSeason(): Promise<ProviderTeam[]> {
    return [
      { externalId: "fake-team-1", name: "Fake United" },
      { externalId: "fake-team-2", name: "Fake City" },
    ];
  }
  async getFixturesForCompetitionSeason(): Promise<ProviderFixture[]> {
    return this.fixtures;
  }
  async getFixture(fixtureExternalId: string): Promise<ProviderFixture | null> {
    return this.fixtures.find((f) => f.externalId === fixtureExternalId) ?? null;
  }
  async getLineup(): Promise<ProviderLineupEntry[]> {
    return [];
  }
  async getEvents(): Promise<ProviderMatchEvent[]> {
    return [];
  }
  async getPlayer(): Promise<ProviderPlayer | null> {
    return null;
  }
}

beforeEach(async () => {
  await resetDb();
});

describe("football sync", () => {
  it("creates a season, competition, teams and a fixture on first run", async () => {
    const provider = new FakeProvider();
    await syncCompetitions(provider);
    await syncActiveSeason(provider);
    await syncCompetitionSeasonLinks();
    await syncTeams(provider);
    await syncFixtures(provider);

    const seasonRows = await db.select().from(seasons);
    const teamRows = await db.select().from(teams);
    const matchRows = await db.select().from(matches);

    expect(seasonRows).toHaveLength(1);
    expect(seasonRows[0].isActive).toBe(true);
    expect(teamRows).toHaveLength(2);
    expect(matchRows).toHaveLength(1);
    expect(matchRows[0].status).toBe("SCHEDULED");
  });

  it("is idempotent: running the full sync twice does not create duplicates", async () => {
    const provider = new FakeProvider();

    for (let i = 0; i < 2; i++) {
      await syncCompetitions(provider);
      await syncActiveSeason(provider);
      await syncCompetitionSeasonLinks();
      await syncTeams(provider);
      await syncFixtures(provider);
    }

    const seasonRows = await db.select().from(seasons);
    const competitionRows = await db.select().from(competitions);
    const teamRows = await db.select().from(teams);
    const matchRows = await db.select().from(matches);

    expect(seasonRows).toHaveLength(1);
    expect(competitionRows).toHaveLength(1);
    expect(teamRows).toHaveLength(2);
    expect(matchRows).toHaveLength(1);
  });

  it("upserts a fixture's status/score when it changes, without creating a new row", async () => {
    const provider = new FakeProvider();
    await syncCompetitions(provider);
    await syncActiveSeason(provider);
    await syncCompetitionSeasonLinks();
    await syncTeams(provider);
    await syncFixtures(provider);

    // Simulate the match finishing on a later sync pass
    provider.fixtures[0] = { ...provider.fixtures[0], status: "FINISHED", homeScore: 3, awayScore: 1 };
    await syncFixtures(provider);

    const matchRows = await db.select().from(matches);
    expect(matchRows).toHaveLength(1);
    expect(matchRows[0].status).toBe("FINISHED");
    expect(matchRows[0].homeScore).toBe(3);
  });
});

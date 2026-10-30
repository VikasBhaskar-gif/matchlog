import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "./db-helper.js";
import { db } from "../db/client.js";
import { seasons, competitions, teams, matches } from "../db/schema/index.js";
import { runOpenFootballSync } from "../football/openfootball-sync.service.js";
import { computeCurrentFootballSeason } from "../football/openfootball-config.js";
import type { BulkFootballDataProvider, NormalizedCompetitionDataset, BulkCompetitionSummary } from "../football/bulk-provider.js";

const season = computeCurrentFootballSeason();

function fixture(overrides: Partial<NormalizedCompetitionDataset["fixtures"][number]> = {}) {
  return {
    externalId: "off:match:fake-1",
    round: "Matchday 1",
    kickoffAt: new Date("2026-08-15T15:00:00Z"),
    homeTeamName: "Fake United FC",
    awayTeamName: "Fake City FC",
    finished: false,
    homeScore: null,
    awayScore: null,
    wentToExtraTime: false,
    wentToPenalties: false,
    homePenalties: null,
    awayPenalties: null,
    isKnockout: false,
    kickoffTimeConfirmed: true,
    ...overrides,
  };
}

class FakeGoodProvider implements BulkFootballDataProvider {
  readonly sourceName = "OPENFOOTBALL" as const;
  fixtures = [fixture()];

  listCompetitions(): BulkCompetitionSummary[] {
    return [{ code: "fk.1", name: "Fakeland Premier", country: "Fakeland" }];
  }
  async fetchCompetitionSeason(code: string, seasonExternalId: string): Promise<NormalizedCompetitionDataset> {
    return {
      competitionCode: code,
      competitionName: "Fakeland Premier",
      country: "Fakeland",
      seasonExternalId,
      fixtures: this.fixtures,
      warnings: [],
    };
  }
}

class FakeFailingProvider implements BulkFootballDataProvider {
  readonly sourceName = "OPENFOOTBALL" as const;
  listCompetitions(): BulkCompetitionSummary[] {
    return [{ code: "fk.cup", name: "Fakeland Cup", country: "Fakeland" }];
  }
  async fetchCompetitionSeason(): Promise<NormalizedCompetitionDataset> {
    throw new Error("simulated upstream 404 — no dataset published yet");
  }
}

beforeEach(async () => {
  await resetDb();
});

describe("runOpenFootballSync", () => {
  it("imports teams and matches from a working provider", async () => {
    const report = await runOpenFootballSync([new FakeGoodProvider()]);

    expect(report.ok).toBe(true);
    expect(report.totalMatchesUpserted).toBe(1);
    expect(report.totalTeamsUpserted).toBe(2);

    const matchRows = await db.select().from(matches);
    expect(matchRows).toHaveLength(1);
    expect(matchRows[0].status).toBe("SCHEDULED");
    expect(matchRows[0].source).toBe("OPENFOOTBALL");

    const teamRows = await db.select().from(teams);
    expect(teamRows.map((t) => t.name).sort()).toEqual(["Fake City FC", "Fake United FC"]);
  });

  it("is idempotent: running twice does not duplicate matches or teams", async () => {
    const provider = new FakeGoodProvider();
    await runOpenFootballSync([provider]);
    await runOpenFootballSync([provider]);

    expect(await db.select().from(matches)).toHaveLength(1);
    expect(await db.select().from(teams)).toHaveLength(2);
  });

  it("updates status and score in place when a match transitions from scheduled to finished", async () => {
    const provider = new FakeGoodProvider();
    await runOpenFootballSync([provider]);

    provider.fixtures = [fixture({ finished: true, homeScore: 3, awayScore: 1 })];
    const report = await runOpenFootballSync([provider]);

    expect(report.totalMatchesUpserted).toBe(1);
    const matchRows = await db.select().from(matches);
    expect(matchRows).toHaveLength(1); // still one row, not a duplicate
    expect(matchRows[0].status).toBe("FINISHED");
    expect(matchRows[0].homeScore).toBe(3);
  });

  it("stays idempotent even when a fixture's date is corrected upstream (the real bug found during manual testing)", async () => {
    const provider = new FakeGoodProvider();
    await runOpenFootballSync([provider]);

    // Same round, same teams, different kickoff date — this is exactly what
    // OpenFootball's daily-refreshed data did to several real Dec/Jan
    // Premier League fixtures between two live sync runs.
    provider.fixtures = [fixture({ kickoffAt: new Date("2026-08-16T15:00:00Z") })];
    await runOpenFootballSync([provider]);

    const matchRows = await db.select().from(matches);
    expect(matchRows).toHaveLength(1);
    expect(matchRows[0].kickoffAt.toISOString()).toBe("2026-08-16T15:00:00.000Z");
  });

  it("reports a failing competition accurately instead of claiming overall success", async () => {
    const report = await runOpenFootballSync([new FakeGoodProvider(), new FakeFailingProvider()]);

    expect(report.competitionsAttempted).toBe(2);
    expect(report.competitionsSucceeded).toBe(1);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain("Fakeland Cup");
    expect(report.ok).toBe(true); // partial success — the good competition still imported
  });

  it("reports total failure (ok: false) when every competition fails, rather than saying 'Sync complete'", async () => {
    const report = await runOpenFootballSync([new FakeFailingProvider()]);

    expect(report.ok).toBe(false);
    expect(report.competitionsSucceeded).toBe(0);
    expect(report.totalMatchesUpserted).toBe(0);
    // No season should be activated off the back of zero real data.
    const activeSeasons = await db.select().from(seasons).where(eq(seasons.isActive, true));
    expect(activeSeasons).toHaveLength(0);
  });

  it("activates the synced season and links the competition to it", async () => {
    await runOpenFootballSync([new FakeGoodProvider()]);

    const seasonRow = await db.query.seasons.findFirst({ where: eq(seasons.externalId, season.external) });
    expect(seasonRow?.isActive).toBe(true);

    const competitionRow = await db.query.competitions.findFirst({ where: eq(competitions.externalId, "off:comp:fk.1") });
    expect(competitionRow).toBeDefined();
  });
});

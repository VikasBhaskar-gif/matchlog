import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "./db-helper.js";
import { db } from "../db/client.js";
import { seasons, competitions, teams, matches, predictions, users } from "../db/schema/index.js";
import { runMatchStatusSync } from "../football/match-status-sync.service.js";
import { hashPassword } from "../services/auth.service.js";
import type { BulkFootballDataProvider, NormalizedCompetitionDataset, BulkCompetitionSummary } from "../football/bulk-provider.js";

class FakeStatusProvider implements BulkFootballDataProvider {
  readonly sourceName = "FOOTBALL_DATA_ORG" as const;
  nextStatus: "SCHEDULED" | "FINISHED" = "FINISHED";
  nextScore = { home: 2, away: 1 };
  fetchCount = 0;

  listCompetitions(): BulkCompetitionSummary[] {
    return [{ code: "TESTCUP", name: "Test Cup", country: "Testland" }];
  }
  async fetchCompetitionSeason(code: string, seasonExternalId: string): Promise<NormalizedCompetitionDataset> {
    this.fetchCount++;
    return {
      competitionCode: code,
      competitionName: "Test Cup",
      country: "Testland",
      seasonExternalId,
      fixtures: [
        {
          externalId: "fdo:match:status-test-1",
          round: "Final",
          kickoffAt: new Date(Date.now() - 1000 * 60 * 60), // kicked off 1h ago
          homeTeamName: "Home FC",
          awayTeamName: "Away FC",
          finished: this.nextStatus === "FINISHED",
          homeScore: this.nextStatus === "FINISHED" ? this.nextScore.home : null,
          awayScore: this.nextStatus === "FINISHED" ? this.nextScore.away : null,
          wentToExtraTime: false,
          wentToPenalties: false,
          homePenalties: null,
          awayPenalties: null,
          isKnockout: true,
          kickoffTimeConfirmed: true,
          matchlogStatus: this.nextStatus,
        },
      ],
      warnings: [],
    };
  }
}

beforeEach(async () => {
  await resetDb();
});

async function seedInitialMatch(provider: FakeStatusProvider, status: "SCHEDULED" | "LIVE" | "FINISHED", kickoffAt: Date) {
  const [season] = await db
    .insert(seasons)
    .values({ externalId: "status-2026", name: "2026/27", startDate: "2026-08-01", endDate: "2027-05-31", isActive: true })
    .returning();
  const [competition] = await db
    .insert(competitions)
    .values({ externalId: "fdo:comp:TESTCUP", name: "Test Cup", type: "cup", source: "FOOTBALL_DATA_ORG", isSupported: true })
    .returning();
  const [home] = await db.insert(teams).values({ externalId: "off:team:home-fc", name: "Home FC", source: "FOOTBALL_DATA_ORG" }).returning();
  const [away] = await db.insert(teams).values({ externalId: "off:team:away-fc", name: "Away FC", source: "FOOTBALL_DATA_ORG" }).returning();

  const [match] = await db
    .insert(matches)
    .values({
      externalId: "fdo:match:status-test-1",
      seasonId: season.id,
      competitionId: competition.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoffAt,
      status,
      source: "FOOTBALL_DATA_ORG",
      // lastSyncedAt far in the past so it's always "due" for a refresh in these tests
      lastSyncedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    })
    .returning();
  return match;
}

describe("runMatchStatusSync", () => {
  it("refreshes a live-window match and picks up its transition to FINISHED", async () => {
    const provider = new FakeStatusProvider();
    provider.nextStatus = "SCHEDULED"; // first sync: still not finished
    const kickoffAt = new Date(Date.now() - 1000 * 60 * 60); // 1h ago — inside the live window
    await seedInitialMatch(provider, "LIVE", kickoffAt);

    const report1 = await runMatchStatusSync([provider]);
    expect(report1.bucketsChecked.live).toBe(1);
    expect(provider.fetchCount).toBe(1);

    // Simulate the configured live-refresh interval actually elapsing —
    // without this, the second call correctly declines to re-poll yet
    // (that gating is the point of the configurable interval).
    await db.update(matches).set({ lastSyncedAt: new Date(Date.now() - 1000 * 60 * 60 * 24) }).where(eq(matches.externalId, "fdo:match:status-test-1"));

    // Now the provider says it's finished — the next sync run should catch it.
    provider.nextStatus = "FINISHED";
    provider.nextScore = { home: 3, away: 0 };
    const report2 = await runMatchStatusSync([provider]);
    expect(report2.matchesTransitionedToFinished).toBe(1);

    const updated = await db.query.matches.findFirst({ where: eq(matches.externalId, "fdo:match:status-test-1") });
    expect(updated?.status).toBe("FINISHED");
    expect(updated?.homeScore).toBe(3);
    expect(updated?.awayScore).toBe(0);
  });

  it("scores a prediction automatically once its match transitions to FINISHED via status sync", async () => {
    const provider = new FakeStatusProvider();
    provider.nextStatus = "FINISHED";
    provider.nextScore = { home: 2, away: 1 };
    const kickoffAt = new Date(Date.now() - 1000 * 60 * 60);
    const match = await seedInitialMatch(provider, "LIVE", kickoffAt);

    const passwordHash = await hashPassword("password123");
    const [user] = await db.insert(users).values({ username: "statususer", email: "status@example.com", passwordHash }).returning();
    await db.insert(predictions).values({
      userId: user.id,
      matchId: match.id,
      predictedOutcome: "HOME",
      predictedHomeScore: 2,
      predictedAwayScore: 1,
    });

    await runMatchStatusSync([provider]);

    const prediction = await db.query.predictions.findFirst({ where: eq(predictions.userId, user.id) });
    expect(prediction?.pointsAwarded).toBe(8); // exact score: 3 (result) + 5 (exact)
  });

  it("does not re-poll an old finished match (outside the recently-finished window)", async () => {
    const provider = new FakeStatusProvider();
    provider.nextStatus = "FINISHED";
    const oldKickoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30); // 30 days ago
    await seedInitialMatch(provider, "FINISHED", oldKickoff);

    const report = await runMatchStatusSync([provider]);
    expect(report.bucketsChecked.live).toBe(0);
    expect(report.bucketsChecked.recentlyFinished).toBe(0);
    expect(report.bucketsChecked.stale).toBe(0);
    expect(provider.fetchCount).toBe(0);
  });

  it("reports an error for a competition with no configured provider, without crashing the whole run", async () => {
    const [season] = await db
      .insert(seasons)
      .values({ externalId: "status-orphan-2026", name: "2026/27", startDate: "2026-08-01", endDate: "2027-05-31", isActive: true })
      .returning();
    const [competition] = await db
      .insert(competitions)
      .values({ externalId: "off:comp:orphan", name: "Orphan League", type: "league", source: "API_FOOTBALL", isSupported: true })
      .returning();
    const [home] = await db.insert(teams).values({ externalId: "off:team:orphan-home", name: "Orphan Home" }).returning();
    const [away] = await db.insert(teams).values({ externalId: "off:team:orphan-away", name: "Orphan Away" }).returning();
    await db.insert(matches).values({
      externalId: "off:match:orphan-1",
      seasonId: season.id,
      competitionId: competition.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoffAt: new Date(Date.now() - 1000 * 60 * 30),
      status: "LIVE",
      source: "API_FOOTBALL",
      lastSyncedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    });

    const report = await runMatchStatusSync([]); // no providers at all configured
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0]).toContain("No provider configured");
  });

  it("reports nothing-to-do cleanly when no match needs a refresh", async () => {
    const report = await runMatchStatusSync([new FakeStatusProvider()]);
    expect(report.ok).toBe(true);
    expect(report.bucketsChecked).toEqual({ live: 0, upcoming: 0, recentlyFinished: 0, stale: 0 });
  });
});

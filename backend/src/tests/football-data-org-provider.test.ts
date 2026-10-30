import { describe, it, expect } from "vitest";
import { normalizeMatch } from "../football/football-data-org-provider.js";

// Shapes verified against https://docs.football-data.org/general/v4/match.html
// and .../overtime.html rather than guessed.

function baseMatch(overrides: Partial<Parameters<typeof normalizeMatch>[0]> = {}): Parameters<typeof normalizeMatch>[0] {
  return {
    id: 12345,
    utcDate: "2026-09-16T18:45:00Z",
    status: "FINISHED",
    matchday: 1,
    stage: "LEAGUE_STAGE",
    homeTeam: { id: 1, name: "Arsenal FC" },
    awayTeam: { id: 2, name: "Athletic Club" },
    score: {
      winner: "HOME_TEAM",
      duration: "REGULAR",
      fullTime: { home: 2, away: 0 },
      halfTime: { home: 0, away: 0 },
    },
    ...overrides,
  };
}

describe("football-data.org normalizeMatch", () => {
  it("normalizes a regular finished match", () => {
    const result = normalizeMatch(baseMatch());
    expect(result).toMatchObject({
      externalId: "fdo:match:12345",
      homeTeamName: "Arsenal FC",
      awayTeamName: "Athletic Club",
      finished: true,
      homeScore: 2,
      awayScore: 0,
      wentToExtraTime: false,
      wentToPenalties: false,
      matchlogStatus: "FINISHED",
    });
  });

  it("normalizes an extra-time match without a shootout", () => {
    const result = normalizeMatch(
      baseMatch({
        score: {
          winner: "AWAY_TEAM",
          duration: "EXTRA_TIME",
          fullTime: { home: 1, away: 2 },
          halfTime: { home: 0, away: 0 },
          extraTime: { home: 1, away: 2 },
        },
      })
    );
    expect(result).toMatchObject({ finished: true, homeScore: 1, awayScore: 2, wentToExtraTime: true, wentToPenalties: false });
  });

  it("normalizes a penalty-shootout match — full-time score is the AET score, not the shootout tally", () => {
    const result = normalizeMatch(
      baseMatch({
        score: {
          winner: "HOME_TEAM",
          duration: "PENALTY_SHOOTOUT",
          fullTime: { home: 1, away: 1 },
          halfTime: { home: 0, away: 1 },
          extraTime: { home: 1, away: 1 },
          penalties: { home: 4, away: 3 },
        },
      })
    );
    expect(result).toMatchObject({
      finished: true,
      homeScore: 1,
      awayScore: 1,
      wentToExtraTime: true,
      wentToPenalties: true,
      homePenalties: 4,
      awayPenalties: 3,
    });
  });

  it("maps every provider status to Matchlog's internal status enum", () => {
    const cases: [string, string][] = [
      ["SCHEDULED", "SCHEDULED"],
      ["TIMED", "SCHEDULED"],
      ["IN_PLAY", "LIVE"],
      ["PAUSED", "PAUSED"],
      ["FINISHED", "FINISHED"],
      ["AWARDED", "FINISHED"],
      ["SUSPENDED", "SUSPENDED"],
      ["POSTPONED", "POSTPONED"],
      ["CANCELLED", "CANCELLED"],
    ];
    for (const [providerStatus, expected] of cases) {
      const result = normalizeMatch(
        baseMatch({ status: providerStatus as any, score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null }, halfTime: { home: null, away: null } } })
      );
      expect(result?.matchlogStatus, `status ${providerStatus}`).toBe(expected);
    }
  });

  it("flags an unconfirmed kickoff time for SCHEDULED (not yet TIMED) matches", () => {
    const scheduled = normalizeMatch(baseMatch({ status: "SCHEDULED" }));
    expect(scheduled?.kickoffTimeConfirmed).toBe(false);

    const timed = normalizeMatch(baseMatch({ status: "TIMED" }));
    expect(timed?.kickoffTimeConfirmed).toBe(true);
  });

  it("skips a fixture with an undecided participant instead of guessing", () => {
    const result = normalizeMatch(baseMatch({ homeTeam: { id: null, name: null } }));
    expect(result).toBeNull();
  });

  it("marks knockout stages correctly but not the league phase", () => {
    const league = normalizeMatch(baseMatch({ stage: "LEAGUE_STAGE" }));
    const knockout = normalizeMatch(baseMatch({ stage: "ROUND_OF_16" }));
    expect(league?.isKnockout).toBe(false);
    expect(knockout?.isKnockout).toBe(true);
  });
});

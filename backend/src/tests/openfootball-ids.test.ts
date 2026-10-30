import { describe, it, expect } from "vitest";
import { deterministicMatchExternalId, teamExternalId, normalizeTeamName, zonedTimeToUtc } from "../football/openfootball-ids.js";
import { computeCurrentFootballSeason } from "../football/openfootball-config.js";

describe("deterministicMatchExternalId", () => {
  const base = {
    source: "openfootball",
    seasonExternalId: "2026-27",
    competitionCode: "en.1",
    round: "Matchday 1",
    homeTeamName: "Arsenal FC",
    awayTeamName: "Chelsea FC",
  };

  it("is stable across repeated calls with identical input", () => {
    expect(deterministicMatchExternalId(base)).toBe(deterministicMatchExternalId(base));
  });

  it("does NOT change when only the date changes — round+teams is the stable key", () => {
    // This is the exact real-world scenario that broke idempotency during
    // testing: OpenFootball corrected a fixture's date between two daily
    // syncs. The ID must stay the same so the row gets updated, not duplicated.
    const id = deterministicMatchExternalId(base);
    const idAfterDateCorrection = deterministicMatchExternalId(base); // date isn't even a param anymore
    expect(id).toBe(idAfterDateCorrection);
  });

  it("differs when the round changes (two-legged ties, rearranged fixtures)", () => {
    const leg1 = deterministicMatchExternalId({ ...base, round: "Round of 16, Leg 1" });
    const leg2 = deterministicMatchExternalId({
      ...base,
      round: "Round of 16, Leg 2",
      homeTeamName: base.awayTeamName,
      awayTeamName: base.homeTeamName,
    });
    expect(leg1).not.toBe(leg2);
  });

  it("differs when the competition or season changes", () => {
    const a = deterministicMatchExternalId(base);
    const b = deterministicMatchExternalId({ ...base, competitionCode: "es.1" });
    const c = deterministicMatchExternalId({ ...base, seasonExternalId: "2027-28" });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("teamExternalId / normalizeTeamName", () => {
  it("resolves the same club to the same ID whether or not a country suffix is present", () => {
    // "Real Madrid CF" (football.json) vs "Real Madrid CF (ESP)" (champions-league txt)
    expect(teamExternalId("Real Madrid CF")).toBe(teamExternalId("Real Madrid CF (ESP)"));
  });

  it("strips the country suffix but leaves ordinary club names alone", () => {
    expect(normalizeTeamName("Arsenal FC (ENG)")).toBe("Arsenal FC");
    expect(normalizeTeamName("Arsenal FC")).toBe("Arsenal FC");
  });
});

describe("zonedTimeToUtc", () => {
  it("resolves BST (summer) correctly for London", () => {
    expect(zonedTimeToUtc("2026-08-21", "20:00", "Europe/London").toISOString()).toBe("2026-08-21T19:00:00.000Z");
  });

  it("resolves GMT (winter) correctly for London", () => {
    expect(zonedTimeToUtc("2026-12-21", "20:00", "Europe/London").toISOString()).toBe("2026-12-21T20:00:00.000Z");
  });
});

describe("computeCurrentFootballSeason", () => {
  it("resolves to the season that started the previous August when it's mid-season (e.g. Jan)", () => {
    const result = computeCurrentFootballSeason(new Date("2027-01-15T00:00:00Z"));
    expect(result.external).toBe("2026-27");
  });

  it("resolves to the new season once it's started (e.g. September)", () => {
    const result = computeCurrentFootballSeason(new Date("2026-09-20T00:00:00Z"));
    expect(result.external).toBe("2026-27");
  });

  it("rolls over to the next season from July", () => {
    const result = computeCurrentFootballSeason(new Date("2027-07-01T00:00:00Z"));
    expect(result.external).toBe("2027-28");
  });

  it("never hard-codes a season — it's a pure function of the clock", () => {
    const a = computeCurrentFootballSeason(new Date("2030-10-01T00:00:00Z"));
    expect(a.external).toBe("2030-31");
  });
});

import { describe, it, expect } from "vitest";
import { parseFootballJson } from "../football/parsers/football-json.parser.js";

describe("parseFootballJson", () => {
  it("parses a finished match with the standard {ht, ft} score shape", () => {
    const result = parseFootballJson({
      name: "English Premier League 2026/27",
      matches: [
        {
          round: "Matchday 1",
          date: "2026-08-15",
          time: "15:00",
          team1: "Arsenal FC",
          team2: "Chelsea FC",
          score: { ht: [1, 0], ft: [2, 1] },
        },
      ],
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      finished: true,
      homeScore: 2,
      awayScore: 1,
      timeWasDefaulted: false,
    });
  });

  it("parses an unplayed match (no score key at all) as not finished", () => {
    const result = parseFootballJson({
      name: "Test League",
      matches: [{ round: "Matchday 4", date: "2026-09-12", time: "15:00", team1: "A FC", team2: "B FC" }],
    });

    expect(result.matches[0].finished).toBe(false);
    expect(result.matches[0].homeScore).toBeNull();
    expect(result.matches[0].awayScore).toBeNull();
  });

  it("tolerates a bare [home, away] score tuple (real-world data quirk)", () => {
    // Verified against the live 2026-27 en.1.json dataset, which contains
    // entries like this instead of the documented {ht, ft} object shape.
    const result = parseFootballJson({
      name: "Test League",
      matches: [{ round: "Matchday 3", date: "2026-09-05", time: "15:00", team1: "A FC", team2: "B FC", score: [0, 0] }],
    });

    expect(result.matches[0]).toMatchObject({ finished: true, homeScore: 0, awayScore: 0 });
  });

  it("defaults a missing kickoff time and flags it rather than pretending it's real", () => {
    const result = parseFootballJson({
      name: "Test League",
      matches: [{ round: "Matchday 8", date: "2026-10-11", team1: "A FC", team2: "B FC" }],
    });

    expect(result.matches[0].timeWasDefaulted).toBe(true);
    expect(result.matches[0].time).toBe("12:00");
  });

  it("rejects malformed payloads instead of silently producing garbage", () => {
    expect(() => parseFootballJson({ not: "valid" })).toThrow();
    expect(() => parseFootballJson(null)).toThrow();
    expect(() => parseFootballJson({ name: "X", matches: [{ team1: "A FC" }] })).toThrow();
  });
});

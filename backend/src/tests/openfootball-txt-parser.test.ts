import { describe, it, expect } from "vitest";
import { parseFootballTxt } from "../football/parsers/football-txt.parser.js";

// Modeled directly on the real structure at
// https://raw.githubusercontent.com/openfootball/champions-league/master/2025-26/cl.txt
const SAMPLE = `= UEFA Champions League 2025/26

# Some comment line that should be ignored
# Matches 5

▪ League, Matchday 1
  Tue Sep 16 2025
    18:45  Athletic Club (ESP)     v Arsenal FC (ENG)         0-2 (0-0)
           PSV (NED)               v Royale Union Saint-Gilloise (BEL)  1-3 (0-2)
  Wed Sep 17
    21:00  AFC Ajax (NED)          v FC Internazionale Milano (ITA)  0-2 (0-1)

▪ League, Matchday 2
  Tue Sep 30
    21:00  Real Madrid CF (ESP)    v Olympique de Marseille (FRA)

▪ Finals, Final
  Sat May 30 2026
    21:00  Paris Saint-Germain FC (FRA)  v Arsenal FC (ENG)  4-3 pen. 1-1 a.e.t. (1-1, 0-1)
`;

describe("parseFootballTxt", () => {
  const result = parseFootballTxt(SAMPLE);

  it("extracts the competition name from the title line", () => {
    expect(result.name).toBe("UEFA Champions League 2025/26");
  });

  it("parses every match line, including a continuation line with no repeated time", () => {
    expect(result.matches).toHaveLength(5);
    const psv = result.matches.find((m) => m.team1.startsWith("PSV"));
    expect(psv).toMatchObject({ time: "18:45", date: "2025-09-16" });
  });

  it("carries the year forward across date lines that omit it", () => {
    const ajax = result.matches.find((m) => m.team1.includes("Ajax"));
    expect(ajax?.date).toBe("2025-09-17");
    const marseille = result.matches.find((m) => m.team2.includes("Marseille"));
    expect(marseille?.date).toBe("2025-09-30");
  });

  it("attaches the correct stage/round label to each match", () => {
    const md1 = result.matches.find((m) => m.team1.startsWith("Athletic"));
    expect(md1?.round).toBe("League, Matchday 1");
    const final = result.matches.find((m) => m.round === "Finals, Final");
    expect(final).toBeDefined();
  });

  it("treats a match with no score text as not finished", () => {
    const unplayed = result.matches.find((m) => m.team1.includes("Real Madrid"));
    expect(unplayed).toMatchObject({ finished: false, homeScore: null, awayScore: null });
  });

  it("parses a plain finished score with a half-time parenthetical", () => {
    const m = result.matches.find((m) => m.team1.startsWith("Athletic"));
    expect(m).toMatchObject({ finished: true, homeScore: 0, awayScore: 2, wentToExtraTime: false, wentToPenalties: false });
  });

  it("parses a penalty-shootout final correctly (score, not the shootout tally, is the recorded result)", () => {
    const final = result.matches.find((m) => m.round === "Finals, Final");
    expect(final).toMatchObject({
      finished: true,
      homeScore: 1,
      awayScore: 1,
      wentToExtraTime: true,
      wentToPenalties: true,
      homePenalties: 4,
      awayPenalties: 3,
    });
  });
});

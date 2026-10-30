import { describe, it, expect } from "vitest";
import {
  calculateWatchXp,
  getLevelForXp,
  scorePrediction,
  scoreKnockoutPrediction,
} from "../lib/gamification.js";

describe("calculateWatchXp", () => {
  it("awards 100 xp for a full 90 minute match", () => {
    expect(calculateWatchXp(90)).toBe(100);
  });
  it("awards proportional xp for partial durations", () => {
    expect(calculateWatchXp(60)).toBe(67);
    expect(calculateWatchXp(45)).toBe(50);
    expect(calculateWatchXp(30)).toBe(33);
    expect(calculateWatchXp(15)).toBe(17);
  });
  it("continues proportionally past 90 minutes for extra time", () => {
    expect(calculateWatchXp(120)).toBe(133);
  });
});

describe("getLevelForXp", () => {
  it("starts at level 1 with 0 xp", () => {
    expect(getLevelForXp(0).level).toBe(1);
  });
  it("reaches level 2 at 250 xp", () => {
    expect(getLevelForXp(250).level).toBe(2);
    expect(getLevelForXp(249).level).toBe(1);
  });
  it("computes progress within the current level", () => {
    const result = getLevelForXp(300);
    expect(result.level).toBe(2);
    expect(result.xpIntoLevel).toBe(50);
    expect(result.xpForNextLevel).toBe(350); // 600 - 250
  });
  it("keeps leveling up beyond the configured table", () => {
    const result = getLevelForXp(100000);
    expect(result.level).toBeGreaterThan(20);
  });
});

describe("scorePrediction", () => {
  it("scores user example: predicted 3-2, actual 4-2 gives 10 points", () => {
    // Result (+3) + Home min(4,3)=3 + Away min(2,2)=2 + Away exact (+2) = 10
    const points = scorePrediction({
      predictedOutcome: "HOME",
      predictedHomeScore: 3,
      predictedAwayScore: 2,
      actualHomeScore: 4,
      actualAwayScore: 2,
    });
    expect(points).toBe(10);
  });

  it("awards 15 points for exact score 3-2 vs 3-2", () => {
    // Result (3) + Home min(3,3)=3 + Home exact(2) + Away min(2,2)=2 + Away exact(2) + Diff(3) = 15
    const points = scorePrediction({
      predictedOutcome: "HOME",
      predictedHomeScore: 3,
      predictedAwayScore: 2,
      actualHomeScore: 3,
      actualAwayScore: 2,
    });
    expect(points).toBe(15);
  });

  it("awards 10 points for 0-0 exact prediction", () => {
    // Result (3) + Home exact(2) + Away exact(2) + Diff(3) = 10
    const points = scorePrediction({
      predictedOutcome: "DRAW",
      predictedHomeScore: 0,
      predictedAwayScore: 0,
      actualHomeScore: 0,
      actualAwayScore: 0,
    });
    expect(points).toBe(10);
  });

  it("awards 0 points when nothing matches", () => {
    const points = scorePrediction({
      predictedOutcome: "HOME",
      predictedHomeScore: 3,
      predictedAwayScore: 0,
      actualHomeScore: 0,
      actualAwayScore: 1,
    });
    expect(points).toBe(0);
  });
});

describe("scoreKnockoutPrediction", () => {
  it("awards points for correct advancing side, extra time, and penalties", () => {
    const points = scoreKnockoutPrediction({
      predictedAdvancingSide: "HOME",
      predictedGoesToExtraTime: true,
      predictedGoesToPenalties: true,
      actualWentToExtraTime: true,
      actualWentToPenalties: true,
      actualAdvancingSide: "HOME",
    });
    expect(points).toBe(5); // 3 + 1 + 1
  });

  it("awards nothing when everything is wrong", () => {
    const points = scoreKnockoutPrediction({
      predictedAdvancingSide: "AWAY",
      predictedGoesToExtraTime: false,
      predictedGoesToPenalties: false,
      actualWentToExtraTime: true,
      actualWentToPenalties: true,
      actualAdvancingSide: "HOME",
    });
    expect(points).toBe(0);
  });
});

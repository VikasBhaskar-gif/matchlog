// ---------------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------------
// 100 XP = 90 minutes watched, proportional, continues past 90 for extra time.
export function calculateWatchXp(minutesWatched: number): number {
  return Math.round((minutesWatched / 90) * 100);
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------
// Configurable progression table. Index = level - 1.
export const LEVEL_THRESHOLDS: { level: number; xpRequired: number }[] = [
  { level: 1, xpRequired: 0 },
  { level: 2, xpRequired: 250 },
  { level: 3, xpRequired: 600 },
  { level: 4, xpRequired: 1000 },
  { level: 5, xpRequired: 1500 },
  { level: 6, xpRequired: 2100 },
  { level: 7, xpRequired: 2800 },
  { level: 8, xpRequired: 3600 },
  { level: 9, xpRequired: 4500 },
  { level: 10, xpRequired: 5500 },
  { level: 11, xpRequired: 6700 },
  { level: 12, xpRequired: 8100 },
  { level: 13, xpRequired: 9700 },
  { level: 14, xpRequired: 11500 },
  { level: 15, xpRequired: 13500 },
  { level: 16, xpRequired: 15700 },
  { level: 17, xpRequired: 18100 },
  { level: 18, xpRequired: 20700 },
  { level: 19, xpRequired: 23500 },
  { level: 20, xpRequired: 26500 },
];

// Beyond the table, levels continue at a flat step so progression never caps.
const OVERFLOW_STEP = 3500;

export function getLevelForXp(totalXp: number): {
  level: number;
  currentLevelXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1
} {
  let level = 1;
  let currentThreshold = 0;
  let nextThreshold = LEVEL_THRESHOLDS[1]?.xpRequired ?? OVERFLOW_STEP;

  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalXp >= LEVEL_THRESHOLDS[i].xpRequired) {
      level = LEVEL_THRESHOLDS[i].level;
      currentThreshold = LEVEL_THRESHOLDS[i].xpRequired;
      nextThreshold = LEVEL_THRESHOLDS[i + 1]?.xpRequired ?? currentThreshold + OVERFLOW_STEP;
    }
  }

  // Beyond the configured table, keep leveling up at a flat XP step.
  const lastConfigured = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  if (totalXp >= lastConfigured.xpRequired) {
    let extraLevels = 0;
    let threshold = lastConfigured.xpRequired;
    while (totalXp >= threshold + OVERFLOW_STEP) {
      threshold += OVERFLOW_STEP;
      extraLevels += 1;
    }
    level = lastConfigured.level + extraLevels;
    currentThreshold = threshold;
    nextThreshold = threshold + OVERFLOW_STEP;
  }

  const xpIntoLevel = totalXp - currentThreshold;
  const xpForNextLevel = nextThreshold - currentThreshold;

  return {
    level,
    currentLevelXp: currentThreshold,
    xpIntoLevel,
    xpForNextLevel,
    progress: xpForNextLevel > 0 ? xpIntoLevel / xpForNextLevel : 1,
  };
}

// ---------------------------------------------------------------------------
// Prediction scoring
// ---------------------------------------------------------------------------
export function scorePrediction(input: {
  predictedOutcome?: "HOME" | "DRAW" | "AWAY";
  predictedHomeScore: number;
  predictedAwayScore: number;
  actualHomeScore: number;
  actualAwayScore: number;
}): number {
  let points = 0;

  const actualOutcome: "HOME" | "DRAW" | "AWAY" =
    input.actualHomeScore > input.actualAwayScore
      ? "HOME"
      : input.actualHomeScore < input.actualAwayScore
      ? "AWAY"
      : "DRAW";

  const predictedOutcome: "HOME" | "DRAW" | "AWAY" =
    input.predictedOutcome ??
    (input.predictedHomeScore > input.predictedAwayScore
      ? "HOME"
      : input.predictedHomeScore < input.predictedAwayScore
      ? "AWAY"
      : "DRAW");

  // 1. Correct Result: +3 points
  // Correctly picking the winner or a draw (at the end of 90 or 120 minutes)
  if (predictedOutcome === actualOutcome) {
    points += 3;
  }

  // 2. Goal scoring progression:
  // +1 point for every goal scored until they reach prediction goal limit
  points += Math.min(input.actualHomeScore, input.predictedHomeScore);
  points += Math.min(input.actualAwayScore, input.predictedAwayScore);

  // 3. Correct Home Team Goals: +2 points
  // Guessing the exact number of goals scored by the home team
  if (input.predictedHomeScore === input.actualHomeScore) {
    points += 2;
  }

  // 4. Correct Away Team Goals: +2 points
  // Guessing the exact number of goals scored by the away team
  if (input.predictedAwayScore === input.actualAwayScore) {
    points += 2;
  }

  // 5. Correct Goal Difference: +3 points
  // Getting the exact margin of victory or a tie correct
  const predDiff = input.predictedHomeScore - input.predictedAwayScore;
  const actualDiff = input.actualHomeScore - input.actualAwayScore;
  if (predDiff === actualDiff) {
    points += 3;
  }

  return points;
}

export function scoreKnockoutPrediction(input: {
  predictedGoesToExtraTime?: boolean | null;
  predictedGoesToPenalties?: boolean | null;
  predictedAdvancingSide?: "HOME" | "AWAY" | null;
  actualWentToExtraTime: boolean;
  actualWentToPenalties: boolean;
  actualAdvancingSide: "HOME" | "AWAY" | null;
}): number {
  let points = 0;
  if (
    input.predictedAdvancingSide &&
    input.actualAdvancingSide &&
    input.predictedAdvancingSide === input.actualAdvancingSide
  ) {
    points += 3;
  }
  if (
    typeof input.predictedGoesToExtraTime === "boolean" &&
    input.predictedGoesToExtraTime === input.actualWentToExtraTime
  ) {
    points += 1;
  }
  if (
    typeof input.predictedGoesToPenalties === "boolean" &&
    input.predictedGoesToPenalties === input.actualWentToPenalties
  ) {
    points += 1;
  }
  return points;
}

export const GOALSCORER_POINTS = 2;

// ---------------------------------------------------------------------------
// Achievement definitions (code must match seeded `achievements.code`)
// ---------------------------------------------------------------------------
export const ACHIEVEMENT_DEFINITIONS = [
  { code: "FIRST_WATCH", name: "First Watch", description: "Watch your first live match." },
  { code: "10_MATCHES", name: "10 Matches", description: "Watch 10 matches." },
  { code: "50_MATCHES", name: "50 Matches", description: "Watch 50 matches." },
  { code: "100_MATCHES", name: "100 Matches", description: "Watch 100 matches." },
  { code: "FULL_TIME_FAN", name: "Full-Time Fan", description: "Watch 10 full matches." },
  { code: "MARATHON", name: "Marathon", description: "Accumulate 1,000 minutes watched." },
  {
    code: "PREDICTION_MASTER",
    name: "Prediction Master",
    description: "Reach 100 prediction points.",
  },
  { code: "HOT_STREAK", name: "Hot Streak", description: "Watch 10 consecutive matches." },
] as const;

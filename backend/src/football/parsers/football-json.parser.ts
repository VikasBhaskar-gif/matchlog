import { z } from "zod";

// Matches the real shape documented at
// https://github.com/openfootball/football.json (verified against the live
// 2026-27 datasets, e.g. https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json)
// Score is normally { ht?: [h,a], ft?: [h,a] }, but some entries in the wild
// data use a bare [h,a] tuple directly (no ht/ft wrapper) — tolerate both
// rather than rejecting otherwise-valid matches.
const scoreSchema = z.union([
  z.object({
    ht: z.tuple([z.number(), z.number()]).optional(),
    ft: z.tuple([z.number(), z.number()]).optional(),
  }),
  z.tuple([z.number(), z.number()]),
]);

const matchSchema = z.object({
  round: z.string(),
  date: z.string(), // YYYY-MM-DD
  time: z.string().optional(), // HH:MM, local to the competition's country
  team1: z.string(),
  team2: z.string(),
  score: scoreSchema.optional(), // absent entirely => not yet played
});

const footballJsonSchema = z.object({
  name: z.string(),
  matches: z.array(matchSchema),
});

export type ParsedOpenFootballMatch = {
  round: string;
  date: string;
  time: string; // defaulted if the source omitted it
  timeWasDefaulted: boolean;
  team1: string;
  team2: string;
  finished: boolean;
  homeScore: number | null;
  awayScore: number | null;
};

export type ParsedOpenFootballDataset = {
  name: string;
  matches: ParsedOpenFootballMatch[];
};

/**
 * Parses and validates a football.json payload. Throws with a clear message
 * on malformed input rather than silently producing partial/wrong data.
 */
export function parseFootballJson(raw: unknown): ParsedOpenFootballDataset {
  const result = footballJsonSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid football.json payload: ${result.error.message}`);
  }

  const matches = result.data.matches.map((m) => {
    const score = m.score;
    const ft = score ? (Array.isArray(score) ? score : score.ft) : undefined;
    const finished = !!ft;
    return {
      round: m.round,
      date: m.date,
      time: m.time ?? "12:00",
      timeWasDefaulted: !m.time,
      team1: m.team1,
      team2: m.team2,
      finished,
      homeScore: ft?.[0] ?? null,
      awayScore: ft?.[1] ?? null,
    };
  });

  return { name: result.data.name, matches };
}

import { env } from "../lib/env.js";
import { RateLimiter } from "./rate-limiter.js";
import { normalizeTeamName } from "./openfootball-ids.js";
import type { BulkFootballDataProvider, NormalizedCompetitionDataset, NormalizedFixture, BulkCompetitionSummary } from "./bulk-provider.js";

// Verified against the live football-data.org v4 docs
// (https://docs.football-data.org/general/v4/match.html and
// .../overtime.html) rather than guessed. Free tier: 10 req/min, 12
// competitions (Champions League included), scores/schedules delayed — not
// real-time. We never claim otherwise; see README.
//
// Attribution: match/competition data in this file is sourced from
// football-data.org (https://www.football-data.org), used under their free
// API terms. Attribution is also shown in-app (see AppLayout.tsx) and in
// the project README.
const COMPETITION_CODE = "CL";
const COMPETITION_NAME = "UEFA Champions League";

// Shared across instances so the limiter actually reflects total call
// volume against the token, not just calls from one provider instance.
const rateLimiter = new RateLimiter(8, 60_000);

type FdoStatus = "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "FINISHED" | "SUSPENDED" | "POSTPONED" | "CANCELLED" | "AWARDED";

function normalizeStatus(status: FdoStatus): { finished: boolean; matchlogStatus: "SCHEDULED" | "LIVE" | "PAUSED" | "FINISHED" | "POSTPONED" | "CANCELLED" | "SUSPENDED" } {
  switch (status) {
    case "SCHEDULED":
    case "TIMED":
      return { finished: false, matchlogStatus: "SCHEDULED" };
    case "IN_PLAY":
      return { finished: false, matchlogStatus: "LIVE" };
    case "PAUSED":
      return { finished: false, matchlogStatus: "PAUSED" };
    case "FINISHED":
    case "AWARDED": // walkover/administrative result — treat as a final result
      return { finished: true, matchlogStatus: "FINISHED" };
    case "SUSPENDED":
      return { finished: false, matchlogStatus: "SUSPENDED" };
    case "POSTPONED":
      return { finished: false, matchlogStatus: "POSTPONED" };
    case "CANCELLED":
      return { finished: false, matchlogStatus: "CANCELLED" };
    default:
      return { finished: false, matchlogStatus: "SCHEDULED" };
  }
}

type FdoScore = {
  winner: string | null;
  duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
  fullTime: { home: number | null; away: number | null };
  halfTime: { home: number | null; away: number | null };
  extraTime?: { home: number | null; away: number | null };
  penalties?: { home: number | null; away: number | null };
};

type FdoMatch = {
  id: number;
  utcDate: string;
  status: FdoStatus;
  matchday: number | null;
  stage: string;
  homeTeam: { id: number | null; name: string | null };
  awayTeam: { id: number | null; name: string | null };
  score: FdoScore;
};

export function normalizeMatch(m: FdoMatch): NormalizedFixture | null {
  // A fixture with a team not yet decided (e.g. a knockout tie pending the
  // other leg) has homeTeam/awayTeam null — skip it rather than guessing.
  if (!m.homeTeam?.name || !m.awayTeam?.name) return null;

  const { finished, matchlogStatus } = normalizeStatus(m.status);
  const isKnockout = m.stage !== "LEAGUE_STAGE" && m.stage !== "GROUP_STAGE";
  const wentToExtraTime = m.score.duration === "EXTRA_TIME" || m.score.duration === "PENALTY_SHOOTOUT";
  const wentToPenalties = m.score.duration === "PENALTY_SHOOTOUT";

  return {
    externalId: `fdo:match:${m.id}`,
    round: m.stage + (m.matchday ? ` — Matchday ${m.matchday}` : ""),
    kickoffAt: new Date(m.utcDate),
    homeTeamName: normalizeTeamName(m.homeTeam.name),
    awayTeamName: normalizeTeamName(m.awayTeam.name),
    finished,
    homeScore: m.score.fullTime.home,
    awayScore: m.score.fullTime.away,
    wentToExtraTime,
    wentToPenalties,
    homePenalties: m.score.penalties?.home ?? null,
    awayPenalties: m.score.penalties?.away ?? null,
    isKnockout,
    kickoffTimeConfirmed: m.status !== "SCHEDULED", // "SCHEDULED" (vs "TIMED") means the exact kickoff isn't nailed down yet
    matchlogStatus,
  };
}

async function fdoFetch<T>(path: string): Promise<T> {
  if (!env.FOOTBALL_DATA_API_TOKEN) {
    throw new Error(
      "FOOTBALL_DATA_API_TOKEN is not set. Champions League sync uses football-data.org, which requires a free API token from https://www.football-data.org/client/register."
    );
  }

  await rateLimiter.acquire();

  const res = await fetch(`${env.FOOTBALL_DATA_BASE_URL}${path}`, {
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_API_TOKEN,
      "X-Unfold-Lineups": "true",
      "X-Unfold-Subs": "true",
    },
  });

  if (res.status === 429) {
    throw new Error("football-data.org rate limit exceeded (free tier: 10 requests/minute). Back off and retry later.");
  }
  if (res.status === 403) {
    throw new Error(
      "football-data.org returned 403 Forbidden — the token may be invalid, or this competition/resource isn't included in the current plan."
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`football-data.org request failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

export class FootballDataOrgProvider implements BulkFootballDataProvider {
  readonly sourceName = "FOOTBALL_DATA_ORG" as const;

  listCompetitions(): BulkCompetitionSummary[] {
    return [{ code: COMPETITION_CODE, name: COMPETITION_NAME, country: "Europe" }];
  }

  async fetchCompetitionSeason(code: string, seasonExternalId: string): Promise<NormalizedCompetitionDataset> {
    if (code !== COMPETITION_CODE) {
      throw new Error(`Unknown competition code for FootballDataOrgProvider: ${code}`);
    }

    const response = await fdoFetch<{ matches: FdoMatch[] }>(`/competitions/${COMPETITION_CODE}/matches`);

    const fixtures: NormalizedFixture[] = [];
    const warnings: string[] = [];
    for (const m of response.matches) {
      const normalized = normalizeMatch(m);
      if (normalized) {
        fixtures.push(normalized);
      } else {
        warnings.push(`Match ${m.id} (${m.stage}) has an undecided participant — skipped until both teams are known.`);
      }
    }

    return {
      competitionCode: COMPETITION_CODE,
      competitionName: COMPETITION_NAME,
      country: "Europe",
      seasonExternalId,
      fixtures,
      warnings,
    };
  }

  async refreshMatch(externalId: string): Promise<NormalizedFixture | null> {
    const idPart = externalId.replace("fdo:match:", "");
    if (!/^\d+$/.test(idPart)) return null; // not one of ours (e.g. an OpenFootball-sourced match id)

    const m = await fdoFetch<FdoMatch>(`/matches/${idPart}`);
    return normalizeMatch(m);
  }
}

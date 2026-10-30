import { env } from "../lib/env.js";
import { SUPPORTED_COMPETITIONS } from "./competitions-config.js";
import type {
  FootballDataProvider,
  ProviderCompetition,
  ProviderFixture,
  ProviderLineupEntry,
  ProviderMatchEvent,
  ProviderPlayer,
  ProviderSeason,
  ProviderTeam,
} from "./provider.js";

const KNOCKOUT_COMPETITION_IDS = new Set(["2", "45", "48", "143", "556"]);

async function apiFootballFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error(
      "API_FOOTBALL_KEY is not set. This provider is optional/legacy — the default sync uses OpenFootball, " +
        "which needs no API key. Set API_FOOTBALL_KEY in .env only if you intend to use this provider."
    );
  }
  const url = new URL(`${env.API_FOOTBALL_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url, {
    headers: { "x-apisports-key": env.API_FOOTBALL_KEY },
  });

  if (res.status === 429) {
    throw new Error("API-Football rate limit exceeded. Back off and retry later.");
  }
  if (!res.ok) {
    throw new Error(`API-Football request failed: ${res.status} ${res.statusText} (${url.pathname})`);
  }

  const json = (await res.json()) as { response: T; errors: unknown };
  return json.response;
}

function mapFixtureStatus(shortStatus: string): ProviderFixture["status"] {
  if (["1H", "2H", "HT", "ET", "P", "LIVE", "BT"].includes(shortStatus)) return "LIVE";
  if (["FT", "AET", "PEN"].includes(shortStatus)) return "FINISHED";
  if (["PST"].includes(shortStatus)) return "POSTPONED";
  if (["CANC", "ABD", "AWD", "WO"].includes(shortStatus)) return "CANCELLED";
  return "SCHEDULED";
}

export class ApiFootballProvider implements FootballDataProvider {
  async getCurrentSeason(competitionExternalId: string): Promise<ProviderSeason> {
    const leagues = await apiFootballFetch<
      { seasons: { year: number; start: string; end: string; current: boolean }[] }[]
    >("/leagues", { id: competitionExternalId });

    const seasons = leagues[0]?.seasons ?? [];
    const current = seasons.find((s) => s.current) ?? seasons[seasons.length - 1];
    if (!current) throw new Error(`No season data returned for competition ${competitionExternalId}`);

    return {
      externalId: String(current.year),
      name: `${current.year}/${String(current.year + 1).slice(2)}`,
      startDate: current.start,
      endDate: current.end,
    };
  }

  async getSupportedCompetitions(): Promise<ProviderCompetition[]> {
    return SUPPORTED_COMPETITIONS.map((c) => ({
      externalId: c.externalId,
      name: c.name,
      country: c.country,
      type: c.type,
    }));
  }

  async getTeamsForCompetitionSeason(
    competitionExternalId: string,
    seasonExternalId: string
  ): Promise<ProviderTeam[]> {
    const teams = await apiFootballFetch<{ team: { id: number; name: string; logo: string; country: string } }[]>(
      "/teams",
      { league: competitionExternalId, season: seasonExternalId }
    );

    return teams.map((t) => ({
      externalId: String(t.team.id),
      name: t.team.name,
      logoUrl: t.team.logo,
      country: t.team.country,
    }));
  }

  async getFixturesForCompetitionSeason(
    competitionExternalId: string,
    seasonExternalId: string
  ): Promise<ProviderFixture[]> {
    const fixtures = await apiFootballFetch<any[]>("/fixtures", {
      league: competitionExternalId,
      season: seasonExternalId,
    });

    const isKnockout = KNOCKOUT_COMPETITION_IDS.has(competitionExternalId);

    return fixtures.map((f) => this.mapFixture(f, competitionExternalId, seasonExternalId, isKnockout));
  }

  async getFixture(fixtureExternalId: string): Promise<ProviderFixture | null> {
    const fixtures = await apiFootballFetch<any[]>("/fixtures", { id: fixtureExternalId });
    if (!fixtures[0]) return null;
    const f = fixtures[0];
    const competitionExternalId = String(f.league.id);
    const seasonExternalId = String(f.league.season);
    return this.mapFixture(f, competitionExternalId, seasonExternalId, KNOCKOUT_COMPETITION_IDS.has(competitionExternalId));
  }

  private mapFixture(f: any, competitionExternalId: string, seasonExternalId: string, isKnockout: boolean): ProviderFixture {
    return {
      externalId: String(f.fixture.id),
      competitionExternalId,
      seasonExternalId,
      homeTeamExternalId: f.teams.home?.id ? String(f.teams.home.id) : null,
      awayTeamExternalId: f.teams.away?.id ? String(f.teams.away.id) : null,
      homeTeamPlaceholder: f.teams.home?.id ? undefined : f.teams.home?.name,
      awayTeamPlaceholder: f.teams.away?.id ? undefined : f.teams.away?.name,
      kickoffAt: f.fixture.date,
      status: mapFixtureStatus(f.fixture.status.short),
      homeScore: f.goals.home,
      awayScore: f.goals.away,
      homeScoreExtraTime: f.score.extratime?.home ?? null,
      awayScoreExtraTime: f.score.extratime?.away ?? null,
      wentToExtraTime: f.score.extratime?.home !== null && f.score.extratime?.home !== undefined,
      wentToPenalties: f.score.penalty?.home !== null && f.score.penalty?.home !== undefined,
      homePenalties: f.score.penalty?.home ?? null,
      awayPenalties: f.score.penalty?.away ?? null,
      venue: f.fixture.venue?.name,
      round: f.league.round,
      isKnockout,
    };
  }

  async getLineup(fixtureExternalId: string): Promise<ProviderLineupEntry[]> {
    const lineups = await apiFootballFetch<any[]>("/fixtures/lineups", { fixture: fixtureExternalId });
    const entries: ProviderLineupEntry[] = [];
    for (const teamLineup of lineups) {
      const teamExternalId = String(teamLineup.team.id);
      for (const p of teamLineup.startXI ?? []) {
        entries.push({ playerExternalId: String(p.player.id), teamExternalId, isStarter: true });
      }
      for (const p of teamLineup.substitutes ?? []) {
        entries.push({ playerExternalId: String(p.player.id), teamExternalId, isStarter: false });
      }
    }
    return entries;
  }

  async getEvents(fixtureExternalId: string): Promise<ProviderMatchEvent[]> {
    const events = await apiFootballFetch<any[]>("/fixtures/events", { fixture: fixtureExternalId });
    return events
      .filter((e) => ["Goal", "Card", "subst"].includes(e.type))
      .map((e, idx) => ({
        externalId: `${fixtureExternalId}-${idx}`,
        teamExternalId: e.team?.id ? String(e.team.id) : undefined,
        playerExternalId: e.player?.id ? String(e.player.id) : undefined,
        type: mapEventType(e.type, e.detail),
        minute: e.time.elapsed,
      }));
  }

  async getPlayer(playerExternalId: string): Promise<ProviderPlayer | null> {
    const players = await apiFootballFetch<any[]>("/players", {
      id: playerExternalId,
      season: String(new Date().getFullYear()),
    });
    const p = players[0]?.player;
    if (!p) return null;
    return {
      externalId: String(p.id),
      name: p.name,
      photoUrl: p.photo,
      position: players[0]?.statistics?.[0]?.games?.position,
      nationality: p.nationality,
    };
  }
}

function mapEventType(type: string, detail: string): ProviderMatchEvent["type"] {
  if (type === "subst") return "SUBSTITUTION";
  if (type === "Card") return detail === "Red Card" ? "RED_CARD" : "YELLOW_CARD";
  if (detail === "Penalty") return "PENALTY_GOAL";
  if (detail === "Own Goal") return "OWN_GOAL";
  return "GOAL";
}

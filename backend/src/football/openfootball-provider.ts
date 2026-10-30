import { DOMESTIC_LEAGUES, FOOTBALL_JSON_BASE_URL } from "./openfootball-config.js";
import { parseFootballJson } from "./parsers/football-json.parser.js";
import { deterministicMatchExternalId, zonedTimeToUtc, COMPETITION_TIMEZONE } from "./openfootball-ids.js";
import type { BulkFootballDataProvider, NormalizedCompetitionDataset, BulkCompetitionSummary } from "./bulk-provider.js";

export class OpenFootballProvider implements BulkFootballDataProvider {
  readonly sourceName = "OPENFOOTBALL" as const;

  listCompetitions(): BulkCompetitionSummary[] {
    return DOMESTIC_LEAGUES.map((l) => ({ code: l.code, name: l.name, country: l.country }));
  }

  async fetchCompetitionSeason(code: string, seasonExternalId: string): Promise<NormalizedCompetitionDataset> {
    const league = DOMESTIC_LEAGUES.find((l) => l.code === code);
    if (!league) throw new Error(`Unknown OpenFootball domestic league code: ${code}`);

    const url = `${FOOTBALL_JSON_BASE_URL}/${seasonExternalId}/${league.fileName}`;
    const res = await fetch(url);
    if (res.status === 404) {
      throw new Error(
        `No ${league.name} dataset published yet for season ${seasonExternalId} at ${url} (football.json publishes the current season once fixtures are announced).`
      );
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch ${league.name} (${url}): HTTP ${res.status}`);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      throw new Error(`${league.name} dataset at ${url} was not valid JSON: ${(err as Error).message}`);
    }

    const parsed = parseFootballJson(json);
    const timeZone = COMPETITION_TIMEZONE[code] ?? "Europe/London";
    const warnings: string[] = [];

    const fixtures = parsed.matches.map((m) => {
      if (m.timeWasDefaulted) {
        warnings.push(`${m.team1} v ${m.team2} on ${m.date}: kickoff time not yet confirmed by the source — date only.`);
      }
      return {
        externalId: deterministicMatchExternalId({
          source: "openfootball",
          seasonExternalId,
          competitionCode: code,
          round: m.round,
          homeTeamName: m.team1,
          awayTeamName: m.team2,
        }),
        round: m.round,
        kickoffAt: zonedTimeToUtc(m.date, m.time, timeZone),
        homeTeamName: m.team1,
        awayTeamName: m.team2,
        finished: m.finished,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        wentToExtraTime: false,
        wentToPenalties: false,
        homePenalties: null,
        awayPenalties: null,
        isKnockout: false, // domestic league phase — no extra time/penalties
        kickoffTimeConfirmed: !m.timeWasDefaulted,
      };
    });

    return {
      competitionCode: code,
      competitionName: league.name,
      country: league.country,
      seasonExternalId,
      fixtures,
      warnings,
    };
  }
}

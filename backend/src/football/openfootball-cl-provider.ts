import { CHAMPIONS_LEAGUE_CONFIG, CHAMPIONS_LEAGUE_BASE_URL } from "./openfootball-config.js";
import { parseFootballTxt } from "./parsers/football-txt.parser.js";
import { deterministicMatchExternalId, zonedTimeToUtc, normalizeTeamName, COMPETITION_TIMEZONE } from "./openfootball-ids.js";
import type { BulkFootballDataProvider, NormalizedCompetitionDataset, BulkCompetitionSummary } from "./bulk-provider.js";

// Only the knockout-style stages can go to extra time / penalties in the
// current UEFA Champions League format; the league phase cannot.
function isKnockoutRound(round: string): boolean {
  return !round.toLowerCase().startsWith("league,");
}

export class OpenFootballChampionsLeagueProvider implements BulkFootballDataProvider {
  readonly sourceName = "OPENFOOTBALL" as const;

  listCompetitions(): BulkCompetitionSummary[] {
    return [{ code: CHAMPIONS_LEAGUE_CONFIG.code, name: CHAMPIONS_LEAGUE_CONFIG.name, country: CHAMPIONS_LEAGUE_CONFIG.country }];
  }

  async fetchCompetitionSeason(code: string, seasonExternalId: string): Promise<NormalizedCompetitionDataset> {
    if (code !== CHAMPIONS_LEAGUE_CONFIG.code) {
      throw new Error(`Unknown competition code for OpenFootballChampionsLeagueProvider: ${code}`);
    }

    const url = `${CHAMPIONS_LEAGUE_BASE_URL}/${seasonExternalId}/${CHAMPIONS_LEAGUE_CONFIG.fileName}`;
    const res = await fetch(url);
    if (res.status === 404) {
      throw new Error(
        `No Champions League dataset published yet for season ${seasonExternalId} at ${url}. ` +
          `The openfootball/champions-league repo only carries a season's fixture list once the group/league-phase draw is known.`
      );
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch Champions League (${url}): HTTP ${res.status}`);
    }

    const raw = await res.text();
    const parsed = parseFootballTxt(raw);
    if (parsed.matches.length === 0) {
      throw new Error(`Champions League dataset at ${url} parsed to zero matches — the source format may have changed.`);
    }

    const timeZone = COMPETITION_TIMEZONE[code] ?? "Europe/Paris";

    const fixtures = parsed.matches.map((m) => {
      const homeTeamName = normalizeTeamName(m.team1);
      const awayTeamName = normalizeTeamName(m.team2);
      return {
        externalId: deterministicMatchExternalId({
          source: "openfootball",
          seasonExternalId,
          competitionCode: code,
          round: m.round,
          homeTeamName,
          awayTeamName,
        }),
        round: m.round,
        kickoffAt: zonedTimeToUtc(m.date, m.time, timeZone),
        homeTeamName,
        awayTeamName,
        finished: m.finished,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        wentToExtraTime: m.wentToExtraTime,
        wentToPenalties: m.wentToPenalties,
        homePenalties: m.homePenalties,
        awayPenalties: m.awayPenalties,
        isKnockout: isKnockoutRound(m.round),
        kickoffTimeConfirmed: true,
      };
    });

    return {
      competitionCode: code,
      competitionName: CHAMPIONS_LEAGUE_CONFIG.name,
      country: CHAMPIONS_LEAGUE_CONFIG.country,
      seasonExternalId,
      fixtures,
      warnings: [],
    };
  }
}

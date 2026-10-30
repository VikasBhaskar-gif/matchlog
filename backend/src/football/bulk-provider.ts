// API-Football's shape (see provider.ts) is request-oriented: one call per
// competition/fixture. OpenFootball's shape is the opposite — each dataset
// file is the *whole* competition-season in one fetch. Forcing OpenFootball
// through the single-fixture-at-a-time interface would mean re-downloading
// and re-parsing the same file over and over for no benefit, so bulk
// sources get their own small interface instead. Both are still "football
// data providers" the sync layer can plug in; the sync orchestration for
// each is what actually differs, matching how differently shaped their
// upstream data is.

export type NormalizedFixture = {
  externalId: string; // deterministic, derived — see openfootball-ids.ts
  round: string;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
  finished: boolean;
  homeScore: number | null;
  awayScore: number | null;
  wentToExtraTime: boolean;
  wentToPenalties: boolean;
  homePenalties: number | null;
  awayPenalties: number | null;
  isKnockout: boolean;
  kickoffTimeConfirmed: boolean;
  /**
   * Optional: the richer Matchlog status (LIVE/PAUSED/POSTPONED/etc), for
   * providers that can distinguish these (football-data.org). Bulk/file
   * sources that only ever know "played" vs "not played" (OpenFootball)
   * omit this; the sync layer falls back to deriving SCHEDULED/FINISHED
   * from `finished` when it's absent.
   */
  matchlogStatus?: "SCHEDULED" | "LIVE" | "PAUSED" | "FINISHED" | "POSTPONED" | "CANCELLED" | "SUSPENDED";
};

export type NormalizedCompetitionDataset = {
  competitionCode: string;
  competitionName: string;
  country: string;
  seasonExternalId: string;
  fixtures: NormalizedFixture[];
  warnings: string[];
};

export type BulkCompetitionSummary = { code: string; name: string; country: string };

export interface BulkFootballDataProvider {
  readonly sourceName: "OPENFOOTBALL" | "FOOTBALL_DATA_ORG";
  listCompetitions(): BulkCompetitionSummary[];
  /**
   * Fetches and normalizes one competition's full season dataset. Must
   * throw (not return an empty/partial result silently) when the upstream
   * data can't be retrieved or parsed, so the sync layer can report it
   * accurately instead of claiming success.
   */
  fetchCompetitionSeason(code: string, seasonExternalId: string): Promise<NormalizedCompetitionDataset>;
  /**
   * Optional: refresh a single match by its external id, for providers that
   * expose a cheap single-resource endpoint (e.g. football-data.org's
   * GET /matches/{id}). Bulk/file-based sources like OpenFootball don't
   * implement this — for them, a "status refresh" just means re-fetching
   * the whole competition dataset again, which the sync layer falls back to.
   */
  refreshMatch?(externalId: string): Promise<NormalizedFixture | null>;
}

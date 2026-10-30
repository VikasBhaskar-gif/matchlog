// The rest of Matchlog depends on this interface, never on API-Football
// specifics directly. Swapping providers later means writing one new class.

export interface ProviderSeason {
  externalId: string; // e.g. "2026"
  name: string; // e.g. "2026/27"
  startDate: string; // ISO date
  endDate: string; // ISO date
}

export interface ProviderCompetition {
  externalId: string;
  name: string;
  shortName?: string;
  country?: string;
  logoUrl?: string;
  type: "league" | "cup";
}

export interface ProviderTeam {
  externalId: string;
  name: string;
  shortName?: string;
  logoUrl?: string;
  country?: string;
}

export interface ProviderPlayer {
  externalId: string;
  name: string;
  photoUrl?: string;
  position?: string;
  nationality?: string;
  teamExternalId?: string;
}

export interface ProviderFixture {
  externalId: string;
  competitionExternalId: string;
  seasonExternalId: string;
  homeTeamExternalId: string | null;
  awayTeamExternalId: string | null;
  homeTeamPlaceholder?: string;
  awayTeamPlaceholder?: string;
  kickoffAt: string; // ISO datetime
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";
  homeScore: number | null;
  awayScore: number | null;
  homeScoreExtraTime?: number | null;
  awayScoreExtraTime?: number | null;
  wentToExtraTime?: boolean;
  wentToPenalties?: boolean;
  homePenalties?: number | null;
  awayPenalties?: number | null;
  venue?: string;
  round?: string;
  isKnockout: boolean;
}

export interface ProviderLineupEntry {
  playerExternalId: string;
  teamExternalId: string;
  isStarter: boolean;
  minutesPlayed?: number;
  goals?: number;
}

export interface ProviderMatchEvent {
  externalId: string;
  teamExternalId?: string;
  playerExternalId?: string;
  type: "GOAL" | "OWN_GOAL" | "PENALTY_GOAL" | "RED_CARD" | "YELLOW_CARD" | "SUBSTITUTION";
  minute: number;
}

export interface FootballDataProvider {
  /** Discover the currently active season for a given competition. */
  getCurrentSeason(competitionExternalId: string): Promise<ProviderSeason>;

  /** List the competitions Matchlog supports, as the provider represents them. */
  getSupportedCompetitions(): Promise<ProviderCompetition[]>;

  getTeamsForCompetitionSeason(
    competitionExternalId: string,
    seasonExternalId: string
  ): Promise<ProviderTeam[]>;

  getFixturesForCompetitionSeason(
    competitionExternalId: string,
    seasonExternalId: string
  ): Promise<ProviderFixture[]>;

  /** Fetch a single fixture (used for near-kickoff / live status refresh). */
  getFixture(fixtureExternalId: string): Promise<ProviderFixture | null>;

  getLineup(fixtureExternalId: string): Promise<ProviderLineupEntry[]>;

  getEvents(fixtureExternalId: string): Promise<ProviderMatchEvent[]>;

  getPlayer(playerExternalId: string): Promise<ProviderPlayer | null>;
}

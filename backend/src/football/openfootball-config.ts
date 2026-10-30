// Explicit mapping between OpenFootball's stable dataset identifiers and
// Matchlog competitions. We key off OpenFootball's own file-naming
// convention (e.g. "en.1" for English top flight) rather than display
// names, since names can vary in casing/punctuation between files.

export type DomesticLeagueConfig = {
  code: string; // OpenFootball file code, e.g. "en.1"
  name: string;
  country: string;
  // path within the football.json repo for the given season, e.g. "en.1.json"
  fileName: string;
};

export const DOMESTIC_LEAGUES: DomesticLeagueConfig[] = [
  { code: "en.1", name: "Premier League", country: "England", fileName: "en.1.json" },
  { code: "es.1", name: "La Liga", country: "Spain", fileName: "es.1.json" },
  { code: "it.1", name: "Serie A", country: "Italy", fileName: "it.1.json" },
  { code: "de.1", name: "Bundesliga", country: "Germany", fileName: "de.1.json" },
  { code: "fr.1", name: "Ligue 1", country: "France", fileName: "fr.1.json" },
];

export const CHAMPIONS_LEAGUE_CONFIG = {
  code: "cl",
  name: "UEFA Champions League",
  country: "Europe",
  fileName: "cl.txt",
};

// Competitions from the original spec that have no legitimate free data
// source wired up yet. Intentionally NOT synced or faked — surfaced here
// only so the sync report can explicitly call out that they're unsupported,
// per the brief ("do NOT create fake data for those four").
export const UNSUPPORTED_COMPETITIONS = [
  { name: "FA Cup", reason: "No free OpenFootball dataset currently mapped." },
  { name: "Carabao Cup", reason: "No free OpenFootball dataset currently mapped." },
  { name: "Copa del Rey", reason: "No free OpenFootball dataset currently mapped." },
  { name: "Supercopa de España", reason: "No free OpenFootball dataset currently mapped." },
];

export const FOOTBALL_JSON_BASE_URL = "https://raw.githubusercontent.com/openfootball/football.json/master";
export const CHAMPIONS_LEAGUE_BASE_URL = "https://raw.githubusercontent.com/openfootball/champions-league/master";

/**
 * The football calendar runs August -> May. Compute which season folder
 * ("2026-27") should be active *right now*, from the real clock, rather
 * than ever hard-coding a season string. From July onward we're in the
 * season that started that August; before July we're finishing the season
 * that started the previous August.
 */
export function computeCurrentFootballSeason(now: Date = new Date()): { external: string; display: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed; 6 = July
  const startYear = month >= 6 ? year : year - 1;
  const endYear = startYear + 1;
  return {
    external: `${startYear}-${String(endYear).slice(2)}`,
    display: `${startYear}/${String(endYear).slice(2)}`,
  };
}

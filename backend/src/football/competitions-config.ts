// API-Football league IDs for the initial supported competitions. These are
// API-Football's well-known, stable IDs for these competitions.
export const SUPPORTED_COMPETITIONS = [
  { externalId: "39", name: "Premier League", country: "England", type: "league" as const },
  { externalId: "140", name: "La Liga", country: "Spain", type: "league" as const },
  { externalId: "135", name: "Serie A", country: "Italy", type: "league" as const },
  { externalId: "61", name: "Ligue 1", country: "France", type: "league" as const },
  { externalId: "78", name: "Bundesliga", country: "Germany", type: "league" as const },
  { externalId: "2", name: "UEFA Champions League", country: "Europe", type: "cup" as const },
  { externalId: "45", name: "FA Cup", country: "England", type: "cup" as const },
  { externalId: "48", name: "Carabao Cup", country: "England", type: "cup" as const },
  { externalId: "143", name: "Copa del Rey", country: "Spain", type: "cup" as const },
  { externalId: "556", name: "Supercopa de España", country: "Spain", type: "cup" as const },
] as const;

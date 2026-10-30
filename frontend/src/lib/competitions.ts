import type { Competition, Team } from "../api/types";

export const LEAGUE_LOGOS: Record<string, string> = {
  "Premier League": "/logos/premier-league.svg",
  "UEFA Champions League": "/logos/ucl.svg",
  "La Liga": "/logos/laliga.svg",
  "Bundesliga": "https://crests.football-data.org/BL1.png",
  "Serie A": "https://crests.football-data.org/SA.png",
  "Ligue 1": "https://crests.football-data.org/FL1.png",
};

/**
 * Universal competition ordering logic:
 * 1. Followed leagues come FIRST.
 * 2. Within followed leagues:
 *    - UEFA Champions League is ALWAYS first.
 *    - Then ordered by number of followed teams in that league (descending).
 *    - Then alphabetical by name.
 * 3. Non-followed leagues come after:
 *    - UEFA Champions League first (if not followed).
 *    - Then by number of followed teams in that league (descending).
 *    - Then alphabetical by name.
 */
export function sortCompetitions(
  competitions: Competition[],
  followedCompIds: Set<string>,
  followedTeams: Team[] = []
): Competition[] {
  const teamCountByCompId: Record<string, number> = {};

  for (const comp of competitions) {
    teamCountByCompId[comp.id] = 0;
  }

  for (const team of followedTeams) {
    if (!team.country) continue;
    const comp = competitions.find(
      (c) => c.country && c.country.toLowerCase() === team.country?.toLowerCase()
    );
    if (comp) {
      teamCountByCompId[comp.id] = (teamCountByCompId[comp.id] || 0) + 1;
    }
  }

  return [...competitions].sort((a, b) => {
    const aFollowed = followedCompIds.has(a.id);
    const bFollowed = followedCompIds.has(b.id);

    // 1. Followed leagues come first
    if (aFollowed && !bFollowed) return -1;
    if (!aFollowed && bFollowed) return 1;

    // Both followed or both not followed:
    // 2. UEFA Champions League is universally first within its group
    const aIsUcl = a.name.toLowerCase().includes("champions league");
    const bIsUcl = b.name.toLowerCase().includes("champions league");
    if (aIsUcl && !bIsUcl) return -1;
    if (!aIsUcl && bIsUcl) return 1;

    // 3. Most followed teams from that league (descending)
    const aTeams = teamCountByCompId[a.id] || 0;
    const bTeams = teamCountByCompId[b.id] || 0;
    if (bTeams !== aTeams) return bTeams - aTeams;

    // 4. Alphabetical tiebreak
    return a.name.localeCompare(b.name);
  });
}

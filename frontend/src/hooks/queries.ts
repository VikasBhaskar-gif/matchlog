import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type {
  Match, Season, Competition, Team, Player, PersonalStats, LeaderboardEntry, Achievement, WatchRecord, Prediction,
  Friend, FriendRequestEntry, FriendActivityEntry, FriendUser, DetailedPlayer, MatchReview, ReviewStats, PotmReport,
  PotmVoteHistoryItem, UserProfile, MatchPredictionItem,
} from "../api/types";

export function useCurrentSeason() {
  return useQuery({
    queryKey: ["season", "current"],
    queryFn: () => api.get<{ season: Season }>("/seasons/current"),
  });
}

export function useMatches(params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]);
  return useQuery({
    queryKey: ["matches", params],
    queryFn: () => api.get<{ matches: Match[]; total?: number }>(`/matches?${search.toString()}`),
    refetchInterval: () => (params.status === "LIVE" ? 20_000 : false),
  });
}

export function useMatch(id: string | undefined) {
  return useQuery({
    queryKey: ["match", id],
    queryFn: () => api.get<{ match: Match; lineup: any[]; communityPotm: any[] }>(`/matches/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const match = query.state.data?.match;
      return match?.status === "LIVE" || match?.status === "PAUSED" ? 15_000 : false;
    },
  });
}

export function useMatchReviews(matchId: string | undefined) {
  return useQuery({
    queryKey: ["match-reviews", matchId],
    queryFn: () => api.get<{ reviews: MatchReview[]; stats: ReviewStats }>(`/matches/${matchId}/reviews`),
    enabled: !!matchId,
  });
}

export function useMatchPotm(matchId: string | undefined) {
  return useQuery({
    queryKey: ["match-potm", matchId],
    queryFn: () => api.get<PotmReport>(`/matches/${matchId}/potm`),
    enabled: !!matchId,
  });
}

export function useCompetitions() {
  return useQuery({ queryKey: ["competitions"], queryFn: () => api.get<{ competitions: Competition[] }>("/competitions") });
}

export type StandingRow = {
  rank: number;
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export function useCompetitionStandings(competitionId?: string) {
  return useQuery({
    queryKey: ["competition-standings", competitionId],
    queryFn: () =>
      api.get<{ competition: Competition; standings: StandingRow[] }>(
        `/competitions/${competitionId}/standings`
      ),
    enabled: !!competitionId,
  });
}

export function useRounds(competitionId?: string) {
  return useQuery({
    queryKey: ["rounds", competitionId],
    queryFn: () => api.get<{ rounds: string[] }>(`/matches/rounds${competitionId ? `?competition=${competitionId}` : ""}`),
  });
}

export function useTeams(params?: { q?: string; competitionId?: string } | string) {
  const query = typeof params === "string" ? { q: params } : (params ?? {});
  const search = new URLSearchParams();
  if (query.q) search.set("q", query.q);
  if (query.competitionId) search.set("competitionId", query.competitionId);
  const searchStr = search.toString();
  return useQuery({
    queryKey: ["teams", query],
    queryFn: () => api.get<{ teams: Team[] }>(`/teams${searchStr ? `?${searchStr}` : ""}`),
  });
}

export function useTeam(id: string | undefined) {
  return useQuery({
    queryKey: ["team", id],
    queryFn: () => api.get<{ team: Team }>(`/teams/${id}`),
    enabled: !!id,
  });
}

export function usePlayers(q?: string) {
  return useQuery({
    queryKey: ["players", q],
    queryFn: () => api.get<{ players: (Player & { teamName?: string; teamBadgeUrl?: string })[] }>(`/players${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
}

export function usePlayer(id: string | undefined) {
  return useQuery({
    queryKey: ["player", id],
    queryFn: () => api.get<{ player: DetailedPlayer }>(`/players/${id}`),
    enabled: !!id,
  });
}

export function useWatchHistory(userId?: string) {
  return useQuery({
    queryKey: userId ? ["watches", userId] : ["watches"],
    queryFn: () =>
      userId
        ? api.get<{ watches: (WatchRecord & { match: Match })[] }>(`/users/${userId}/watches`)
        : api.get<{ watches: (WatchRecord & { match: Match })[] }>("/watches"),
  });
}

export function usePredictionsList(userId?: string) {
  return useQuery({
    queryKey: userId ? ["predictions", userId] : ["predictions"],
    queryFn: () =>
      userId
        ? api.get<{ predictions: (Prediction & { match: Match })[] }>(`/users/${userId}/predictions`)
        : api.get<{ predictions: (Prediction & { match: Match })[] }>("/predictions"),
  });
}

export function useMyPotmVotes(userId?: string) {
  return useQuery({
    queryKey: userId ? ["my-potm-votes", userId] : ["my-potm-votes"],
    queryFn: () =>
      userId
        ? api.get<{ votes: PotmVoteHistoryItem[] }>(`/users/${userId}/potm-votes`)
        : api.get<{ votes: PotmVoteHistoryItem[] }>("/me/potm-votes"),
  });
}

export function useStats(scope: "current" | "all-time", userId?: string) {
  return useQuery({
    queryKey: userId ? ["stats", scope, userId] : ["stats", scope],
    queryFn: () =>
      userId
        ? api.get<PersonalStats>(`/users/${userId}/stats?scope=${scope}`)
        : api.get<PersonalStats>(`/stats?scope=${scope}`),
  });
}

export function useLeaderboard(type: string, scope: string) {
  return useQuery({
    queryKey: ["leaderboard", type, scope],
    queryFn: () => api.get<{ entries: LeaderboardEntry[] }>(`/leaderboards?type=${type}&scope=${scope}`),
  });
}

export function useMyAchievements() {
  return useQuery({ queryKey: ["achievements", "me"], queryFn: () => api.get<{ achievements: Achievement[] }>("/achievements/me") });
}

export function useMyFollows() {
  return useQuery({
    queryKey: ["me", "follows"],
    queryFn: () => api.get<{ teams: Team[]; competitions: Competition[]; players: Player[] }>("/me/follows"),
  });
}

// --- Friends ---
export function useFriends() {
  return useQuery({ queryKey: ["friends"], queryFn: () => api.get<{ friends: Friend[] }>("/friends") });
}
export function useIncomingRequests() {
  return useQuery({
    queryKey: ["friends", "requests", "incoming"],
    queryFn: () => api.get<{ requests: FriendRequestEntry[] }>("/friends/requests/incoming"),
  });
}
export function useOutgoingRequests() {
  return useQuery({
    queryKey: ["friends", "requests", "outgoing"],
    queryFn: () => api.get<{ requests: FriendRequestEntry[] }>("/friends/requests/outgoing"),
  });
}
export function useFriendActivity() {
  return useQuery({
    queryKey: ["friends", "activity"],
    queryFn: () => api.get<{ activity: FriendActivityEntry[] }>("/friends/activity"),
  });
}
export function useFriendsLeaderboard(type: "minutes" | "predictions" = "minutes", competitionId?: string) {
  return useQuery({
    queryKey: ["friends", "leaderboard", type, competitionId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (competitionId && competitionId !== "all") params.set("competitionId", competitionId);
      const qs = params.toString();
      return api.get<{ entries: LeaderboardEntry[] }>(`/friends/leaderboard${qs ? `?${qs}` : ""}`);
    },
  });
}

export function useMatchPredictions(matchId: string | undefined) {
  return useQuery({
    queryKey: ["match-predictions", matchId],
    queryFn: () => api.get<{ predictions: MatchPredictionItem[] }>(`/matches/${matchId}/predictions`),
    enabled: !!matchId,
  });
}
export function useUserSearch(q: string) {
  return useQuery({
    queryKey: ["users", "search", q],
    queryFn: () => api.get<{ users: FriendUser[] }>(`/users/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
}
export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-profile", userId],
    queryFn: () => api.get<{ profile: UserProfile }>(`/users/${userId}/profile`),
    enabled: !!userId,
  });
}

export function useFriendProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-profile", userId],
    queryFn: () => api.get<{ profile: UserProfile }>(`/users/${userId}/profile`),
    enabled: !!userId,
  });
}

export function useFollowTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, follow }: { teamId: string; follow: boolean }) =>
      follow ? api.post(`/teams/${teamId}/follow`) : api.delete(`/teams/${teamId}/follow`),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useFollowCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ competitionId, follow }: { competitionId: string; follow: boolean }) =>
      follow ? api.post(`/competitions/${competitionId}/follow`) : api.delete(`/competitions/${competitionId}/follow`),
    onSuccess: () => qc.invalidateQueries(),
  });
}

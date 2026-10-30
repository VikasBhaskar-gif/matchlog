export type User = {
  id: string;
  username: string;
  email?: string | null;
  avatar: string | null;
  supportedTeamId?: string | null;
  supportedTeam?: {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
  } | null;
  onboardingCompleted: boolean;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  createdAt: string;
};

export type Season = {
  id: string;
  externalId: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type Competition = {
  id: string;
  externalId: string;
  name: string;
  shortName: string | null;
  country: string | null;
  logoUrl: string | null;
  type: string;
  isKnockout: boolean;
};

export type Team = {
  id: string;
  externalId: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  country: string | null;
  isFollowing?: boolean;
  squad?: Array<{
    id: string;
    name: string;
    photoUrl: string | null;
    position: string | null;
    nationality: string | null;
    isFollowing?: boolean;
  }>;
};

export type Player = {
  id: string;
  externalId: string;
  name: string;
  photoUrl: string | null;
  position: string | null;
  nationality: string | null;
  teamName?: string | null;
  teamBadgeUrl?: string | null;
  isFollowing?: boolean;
};

export type MatchStatus = "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";

export type WatchRecord = {
  id: string;
  userId: string;
  matchId: string;
  watchType: "FULL_MATCH" | "FIRST_HALF" | "SECOND_HALF" | "CUSTOM";
  startMinute: number;
  endMinute: number;
  watchDurationMinutes: number;
  xpEarned: number;
  createdAt: string;
  updatedAt: string;
};

export type Prediction = {
  id: string;
  userId: string;
  matchId: string;
  predictedOutcome: "HOME" | "DRAW" | "AWAY";
  predictedHomeScore: number;
  predictedAwayScore: number;
  predictedGoesToExtraTime: boolean | null;
  predictedGoesToPenalties: boolean | null;
  predictedAdvancingSide: "HOME" | "AWAY" | null;
  pointsAwarded: number | null;
};

export type MatchEvent = {
  id: string;
  matchId: string;
  teamId: string | null;
  playerId: string | null;
  playerName: string;
  type: "GOAL" | "OWN_GOAL" | "PENALTY_GOAL";
  minute: number;
};

export type Match = {
  id: string;
  externalId: string;
  seasonId: string;
  competitionId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoffAt: string;
  kickoffTimeConfirmed: boolean;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  round: string | null;
  isKnockout: boolean;
  maxWatchMinutes: number;
  homeTeamPlaceholder?: string | null;
  awayTeamPlaceholder?: string | null;
  wentToExtraTime?: boolean;
  wentToPenalties?: boolean;
  homePenalties?: number | null;
  awayPenalties?: number | null;
  homeTeam: Team | null;
  awayTeam: Team | null;
  competition: Competition | null;
  season: Season | null;
  myWatch: WatchRecord | null;
  myPrediction: Prediction | null;
  myPotm: { playerId: string } | null;
  events?: MatchEvent[];
};

export type Achievement = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string | null;
  unlockedAt?: string;
};

export type FriendUser = {
  id: string;
  username: string;
  avatar: string | null;
  level: number;
  currentLevelXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
};

export type FriendRequestEntry = {
  id: string;
  createdAt: string;
  sender?: FriendUser;
  receiver?: FriendUser;
};

export type Friend = {
  friendshipId: string;
  since: string;
  user: FriendUser;
};

export type FriendActivityEntry = {
  id: string;
  type: "WATCHED_MATCH" | "MADE_PREDICTION" | "UNLOCKED_ACHIEVEMENT" | "REACHED_LEVEL";
  summary: string;
  referenceId: string | null;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null };
};

export type UserProfile = {
  id: string;
  username: string;
  avatar: string | null;
  supportedTeam?: { id: string; name: string; shortName?: string | null; logoUrl?: string | null } | null;
  totalMinutes: number;
  totalMatches: number;
  currentStreak: number;
  longestStreak: number;
  memberSince: string;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isFriend: boolean;
  followersCount: number;
  followingCount: number;
};

export type LeaderboardEntry = {
  userId: string;
  username: string;
  avatar: string | null;
  value: number;
};

export type PersonalStats = {
  scope: "current" | "all-time";
  seasonId: string | null;
  xp: {
    total: number;
    level: number;
    xpIntoLevel: number;
    xpForNextLevel: number;
    progress: number;
  };
  watching: {
    totalMatches: number;
    totalMinutes: number;
    fullMatches: number;
    partialMatches: number;
    averageMinutesPerMatch: number;
    currentStreak: number;
    longestStreak: number;
    mostWatchedTeam: { id: string; name: string; logoUrl?: string | null; matches: number } | null;
    mostWatchedCompetition: { id: string; name: string; logoUrl?: string | null; matches: number } | null;
  };
  predictions: {
    totalPredictions: number;
    predictionPoints: number;
    correctResults: number;
    exactScores: number;
    accuracy: number;
  };
  potm: {
    totalSelections: number;
    mostSelectedPlayerId: string | null;
  };
};

export type MatchReview = {
  id: string;
  userId: string;
  username: string;
  userAvatar: string | null;
  content: string | null;
  matchQualityRating: number | null;
  refereeRating: number | null;
  likesCount: number;
  hasLiked: boolean;
  isMyReview: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReviewStats = {
  totalReviews: number;
  qualityRatingCount: number;
  refereeRatingCount: number;
  averageMatchQuality: number | null;
  averageRefereeRating: number | null;
};

export type PotmCandidate = {
  id: string;
  name: string;
  photoUrl?: string | null;
  shirtNumber?: number | null;
  position: string | null;
  tacticalPosition?: string | null;
  formationPlace?: number | null;
  currentTeamId: string | null;
  teamId: string | null;
  isStarter: boolean | null;
  minutesPlayed: number | null;
  subInMinute?: number | null;
};

export type PotmVoteHistoryItem = {
  id: string;
  votedAt: string;
  match: Match | null;
  myVote: {
    player: {
      id: string;
      name: string;
      photoUrl: string | null;
      position: string | null;
      currentTeamId: string | null;
      team: Team | null;
    } | null;
  };
  overallVote: {
    player: {
      id: string;
      name: string;
      photoUrl: string | null;
      position: string | null;
      currentTeamId: string | null;
      team: Team | null;
    } | null;
    votes: number;
    totalVotes: number;
    percentage: number;
    isSameAsMyVote: boolean;
  } | null;
};


export type PotmLeaderboardItem = {
  rank: number;
  playerId: string;
  name: string;
  position: string | null;
  votes: number;
  percentage: number;
};

export type PotmReport = {
  communityPotm: {
    playerId: string;
    name: string;
    position: string | null;
    votes: number;
    percentage: number;
  }[];
  topThree: PotmLeaderboardItem[];
  peoplesMotm: PotmLeaderboardItem | null;
  totalVotes: number;
  myVote: string | null;
  hasLineupData: boolean;
  homeFormation?: string | null;
  awayFormation?: string | null;
  candidates: {
    home: PotmCandidate[];
    away: PotmCandidate[];
  };
};

export type DetailedPlayer = Player & {
  currentTeamId: string | null;
  team: Team | null;
  peoplesMotmAwards: number;
  isFollowing?: boolean;
};


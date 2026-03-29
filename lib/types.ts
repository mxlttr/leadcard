export type ThruValue = number | "F";
export type TournamentStatus =
  | "live"
  | "today"
  | "tomorrow"
  | "upcoming"
  | "recent"
  | "mock";

export type PlayerStanding = {
  playerId: string;
  name: string;
  division: string;
  rank: number;
  scoreToPar: number;
  thru: ThruValue;
};

export type PlayerSnapshot = PlayerStanding & {
  lastFive: number[];
};

export type PlayerDelta = {
  rankDelta: number;
  scoreDelta: number;
  thruDelta: number;
};

export type UpdateImportance = "high" | "medium" | "low";

export type RecentUpdate = {
  id: string;
  playerId: string;
  playerName: string;
  division: string;
  text: string;
  importance: UpdateImportance;
  tone: "positive" | "negative" | "neutral";
  rank?: number;
  previousRank?: number;
  scoreToPar?: number;
  thru?: ThruValue;
  createdAt: string;
};

export type LeaderboardPlayer = PlayerSnapshot & {
  delta: PlayerDelta;
  latestUpdate: RecentUpdate | null;
};

export type DivisionLeader = {
  division: string;
  leader: LeaderboardPlayer;
};

export type TournamentSummary = {
  id: string;
  name: string;
  course: string;
  roundLabel: string;
  status: TournamentStatus;
};

export type LiveResponse = {
  tournament: TournamentSummary;
  tournaments: TournamentSummary[];
  hasLiveData: boolean;
  divisions: string[];
  leaders: LeaderboardPlayer[];
  divisionLeaders: DivisionLeader[];
  generatedAt: string;
  updateIntervalMs: number;
};

export type LeaderboardResponse = {
  tournamentId: string;
  division: string;
  players: LeaderboardPlayer[];
  generatedAt: string;
};

export type UpdatesResponse = {
  tournamentId: string;
  updates: RecentUpdate[];
  generatedAt: string;
};

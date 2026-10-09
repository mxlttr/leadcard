export type ThruValue = number | "F";
export type TournamentStatus =
  | "finished"
  | "live"
  | "today"
  | "tomorrow"
  | "upcoming"
  | "recent"
  | "mock";

export type PlayerStanding = {
  playerId: string;
  name: string;
  club?: string;
  division: string;
  rank: number;
  scoreToPar: number;
  thru: ThruValue;
};

export type PlayerHoleScore = {
  hole: number;
  par: number | null;
  score: number | null;
  relativeToPar: number | null;
};

export type PlayerRound = {
  id: string;
  order: number;
  label: string;
  thru: number | "F" | 0;
  scoreToPar: number | null;
  holes: PlayerHoleScore[];
};

export type PlayerSnapshot = PlayerStanding & {
  lastFive: number[];
  rounds?: PlayerRound[];
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
  currentRound?: number;
  totalRounds?: number;
  daysUntilStart?: number;
  daysSinceEnd?: number;
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
  nextUpdateAt: string;
  updateIntervalMs: number;
  mockReplay?: { index: number; count: number; paused: boolean };
};

export type LeaderboardResponse = {
  tournamentId: string;
  division: string;
  players: LeaderboardPlayer[];
  generatedAt: string;
};

export type ClubTournamentEntry = {
  tournament: TournamentSummary;
  players: LeaderboardPlayer[];
  generatedAt: string;
};

export type ClubOverview = {
  name: string;
  tournaments: ClubTournamentEntry[];
};

export type ClubTournamentResponse = {
  tournament: TournamentSummary;
  players: LeaderboardPlayer[];
  generatedAt: string;
};

export type ClubsResponse = {
  clubs: ClubOverview[];
  generatedAt: string;
};

export type UpdatesResponse = {
  tournamentId: string;
  updates: RecentUpdate[];
  generatedAt: string;
};

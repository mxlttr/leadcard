export type ThruValue = number | "F";

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

export type RecentUpdate = {
  playerId: string;
  text: string;
  tone: "positive" | "negative" | "neutral";
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
};

export type LiveResponse = {
  tournament: TournamentSummary;
  tournaments: TournamentSummary[];
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

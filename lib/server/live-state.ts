import type {
  LeaderboardPlayer,
  RecentUpdate,
  TournamentSummary,
} from "@/lib/types";

export type LiveState = {
  revision?: number;
  tournament: TournamentSummary;
  hasLiveData: boolean;
  autoRefresh: boolean;
  fixtureIndex: number;
  replayPaused: boolean;
  lastAdvancedAt: number;
  generatedAt: string;
  players: LeaderboardPlayer[];
  updates: RecentUpdate[];
};

import { createPlayerDelta, createRecentUpdate } from "@/lib/server/diff";
import { scrapeSnapshot } from "@/lib/server/scraper";
import {
  getDefaultTournamentId,
  getTournamentCatalog,
  loadTournamentSnapshotSource,
} from "@/lib/server/tournament-source";
import type {
  DivisionLeader,
  LeaderboardPlayer,
  LeaderboardResponse,
  LiveResponse,
  PlayerSnapshot,
  RecentUpdate,
  TournamentSummary,
  UpdatesResponse,
} from "@/lib/types";

const UPDATE_INTERVAL_MS = 25_000;
const LEAD_CARD_SIZE = 4;

type LiveState = {
  tournament: TournamentSummary;
  hasLiveData: boolean;
  fixtureIndex: number;
  lastAdvancedAt: number;
  generatedAt: string;
  players: LeaderboardPlayer[];
  updates: RecentUpdate[];
};

declare global {
  var leadcardStore: Map<string, LiveState> | undefined;
  var leadcardStoreInitialization: Map<string, Promise<LiveState>> | undefined;
  var leadcardStoreRefreshes: Map<string, Promise<LiveState>> | undefined;
}

function sortPlayers(players: LeaderboardPlayer[]) {
  return [...players].sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }

    return a.name.localeCompare(b.name);
  });
}

function comparePlayersByStanding(a: LeaderboardPlayer, b: LeaderboardPlayer) {
  if (a.scoreToPar !== b.scoreToPar) {
    return a.scoreToPar - b.scoreToPar;
  }

  if (a.thru === "F" && b.thru !== "F") {
    return -1;
  }

  if (a.thru !== "F" && b.thru === "F") {
    return 1;
  }

  if (a.rank !== b.rank) {
    return a.rank - b.rank;
  }

  return a.name.localeCompare(b.name);
}

function getDivisions(players: LeaderboardPlayer[]) {
  return players.reduce<string[]>((divisions, player) => {
    if (!divisions.includes(player.division)) {
      divisions.push(player.division);
    }

    return divisions;
  }, []);
}

function toLeaderboardPlayers(
  previousPlayers: PlayerSnapshot[],
  currentPlayers: PlayerSnapshot[],
  createdAt: string,
) {
  const previousById = new Map(
    previousPlayers.map((player) => [player.playerId, player]),
  );
  const updates: RecentUpdate[] = [];

  const players = sortPlayers(
    currentPlayers.map((player) => {
      const previous = previousById.get(player.playerId);
      const latestUpdate = createRecentUpdate(previous, player, createdAt);

      if (latestUpdate) {
        updates.push(latestUpdate);
      }

      return {
        ...player,
        delta: createPlayerDelta(previous, player),
        latestUpdate,
      };
    }),
  );

  return { players, updates };
}

async function createInitialState(tournamentId: string): Promise<LiveState> {
  const source = await loadTournamentSnapshotSource(tournamentId, 0);
  const snapshot = source.html ? scrapeSnapshot(source.html) : null;
  const players =
    snapshot?.players.map<LeaderboardPlayer>((player) => ({
      ...player,
      delta: {
        rankDelta: 0,
        scoreDelta: 0,
        thruDelta: 0,
      },
      latestUpdate: null,
    })) ?? [];

  return {
    tournament: source.tournament,
    hasLiveData: Boolean(source.html),
    fixtureIndex: source.nextFixtureIndex,
    lastAdvancedAt: Date.now(),
    generatedAt: snapshot?.generatedAt ?? new Date().toISOString(),
    players: sortPlayers(players),
    updates: [],
  };
}

async function ensureStore(tournamentId: string) {
  if (!globalThis.leadcardStore) {
    globalThis.leadcardStore = new Map();
  }

  if (!globalThis.leadcardStoreInitialization) {
    globalThis.leadcardStoreInitialization = new Map();
  }

  const existingStore = globalThis.leadcardStore.get(tournamentId);

  if (existingStore) {
    return existingStore;
  }

  const inFlightInitialization =
    globalThis.leadcardStoreInitialization.get(tournamentId);

  if (inFlightInitialization) {
    return inFlightInitialization;
  }

  const initialization = createInitialState(tournamentId)
    .then((store) => {
      globalThis.leadcardStore?.set(tournamentId, store);
      return store;
    })
    .finally(() => {
      globalThis.leadcardStoreInitialization?.delete(tournamentId);
    });

  globalThis.leadcardStoreInitialization.set(tournamentId, initialization);

  return initialization;
}

async function refreshStore(store: LiveState) {
  if (!globalThis.leadcardStoreRefreshes) {
    globalThis.leadcardStoreRefreshes = new Map();
  }

  const inFlightRefresh = globalThis.leadcardStoreRefreshes.get(
    store.tournament.id,
  );

  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  const refresh = advanceStore(store)
    .then(() => store)
    .finally(() => {
      globalThis.leadcardStoreRefreshes?.delete(store.tournament.id);
    });

  globalThis.leadcardStoreRefreshes.set(store.tournament.id, refresh);

  return refresh;
}

async function advanceStore(store: LiveState) {
  const source = await loadTournamentSnapshotSource(
    store.tournament.id,
    store.fixtureIndex,
  );
  store.tournament = source.tournament;
  store.hasLiveData = Boolean(source.html);
  store.fixtureIndex = source.nextFixtureIndex;
  store.lastAdvancedAt = Date.now();

  if (!source.html) {
    store.generatedAt = new Date().toISOString();
    store.players = [];
    store.updates = [];
    return;
  }

  const nextSnapshot = scrapeSnapshot(source.html);
  const previousSnapshot = store.players.map<PlayerSnapshot>(
    ({ delta: _delta, latestUpdate: _latestUpdate, ...player }) => player,
  );
  const nextState = toLeaderboardPlayers(
    previousSnapshot,
    nextSnapshot.players,
    nextSnapshot.generatedAt,
  );

  store.generatedAt = nextSnapshot.generatedAt;
  store.players = nextState.players;
  store.updates = [...nextState.updates.reverse(), ...store.updates].slice(
    0,
    20,
  );
}

async function refreshIfNeeded(tournamentId: string) {
  const store = await ensureStore(tournamentId);

  if (Date.now() - store.lastAdvancedAt >= UPDATE_INTERVAL_MS) {
    return refreshStore(store);
  }

  return store;
}

function divisionLeaders(players: LeaderboardPlayer[]): DivisionLeader[] {
  return getDivisions(players)
    .reduce<DivisionLeader[]>((leaders, division) => {
      const leader = players.find((player) => player.division === division);

      if (leader) {
        leaders.push({ division, leader });
      }

      return leaders;
    }, [])
    .sort((a, b) => comparePlayersByStanding(a.leader, b.leader));
}

function overallLeaders(players: LeaderboardPlayer[]) {
  return [...players].sort(comparePlayersByStanding).slice(0, LEAD_CARD_SIZE);
}

export async function getLiveResponse(
  tournamentId: string,
): Promise<LiveResponse> {
  const store = await refreshIfNeeded(tournamentId);
  const tournaments = await getTournamentCatalog();
  const divisions = getDivisions(store.players);

  return {
    tournament: store.tournament,
    tournaments,
    hasLiveData: store.hasLiveData,
    divisions,
    leaders: overallLeaders(store.players),
    divisionLeaders: divisionLeaders(store.players),
    generatedAt: store.generatedAt,
    updateIntervalMs: UPDATE_INTERVAL_MS,
  };
}

export async function getResolvedTournamentId(tournamentId?: string | null) {
  return tournamentId ?? (await getDefaultTournamentId());
}

export async function getLeaderboardResponse(
  tournamentId: string,
  division: string,
): Promise<LeaderboardResponse> {
  const store = await refreshIfNeeded(tournamentId);
  const resolvedDivision = division || getDivisions(store.players)[0] || "";
  const players =
    division === "__all"
      ? store.players
      : store.players.filter((player) => player.division === resolvedDivision);

  return {
    tournamentId: store.tournament.id,
    division: resolvedDivision,
    players,
    generatedAt: store.generatedAt,
  };
}

export async function getUpdatesResponse(
  tournamentId: string,
): Promise<UpdatesResponse> {
  const store = await refreshIfNeeded(tournamentId);

  return {
    tournamentId: store.tournament.id,
    updates: store.updates,
    generatedAt: store.generatedAt,
  };
}

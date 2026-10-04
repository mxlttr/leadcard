import { load } from "cheerio";
import { sortDivisionLabels } from "@/lib/i18n/divisions";
import { playerClubKey } from "@/lib/player-club";
import { createPlayerDelta, createRecentUpdates } from "@/lib/server/diff";
import { scrapeSnapshot } from "@/lib/server/scraper";
import {
  getDefaultTournamentId,
  getMockReplaySnapshotCount,
  getTournamentCatalog,
  loadTournamentSnapshotSource,
} from "@/lib/server/tournament-source";
import type {
  ClubOverview,
  ClubsResponse,
  ClubTournamentResponse,
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
  autoRefresh: boolean;
  fixtureIndex: number;
  replayPaused: boolean;
  lastAdvancedAt: number;
  generatedAt: string;
  players: LeaderboardPlayer[];
  updates: RecentUpdate[];
};

declare global {
  var leadcardStore: Map<string, LiveState> | undefined;
  var leadcardStoreInitialization: Map<string, Promise<LiveState>> | undefined;
  var leadcardStoreRefreshes: Map<string, Promise<LiveState>> | undefined;
  var leadcardStoreListeners: Map<string, Set<() => void>> | undefined;
  var leadcardStorePollers:
    | Map<string, ReturnType<typeof setTimeout>>
    | undefined;
}

function notifyStoreListeners(tournamentId: string) {
  globalThis.leadcardStoreListeners?.get(tournamentId)?.forEach((listener) => {
    listener();
  });
}

function ensureStorePoller(store: LiveState) {
  if (!globalThis.leadcardStorePollers) {
    globalThis.leadcardStorePollers = new Map();
  }
  if (globalThis.leadcardStorePollers.has(store.tournament.id)) return;

  const schedule = () => {
    const timer = setTimeout(async () => {
      globalThis.leadcardStorePollers?.delete(store.tournament.id);
      try {
        if (store.autoRefresh && !store.replayPaused) {
          await refreshStore(store);
        }
      } catch (error) {
        console.error("Live store background refresh failed", error);
      } finally {
        if (store.autoRefresh && !store.replayPaused) schedule();
      }
    }, UPDATE_INTERVAL_MS);
    timer.unref?.();
    globalThis.leadcardStorePollers?.set(store.tournament.id, timer);
  };
  schedule();
}

export async function subscribeToLiveUpdates(
  tournamentId: string,
  listener: () => void,
) {
  const store = await ensureStore(tournamentId);
  ensureStorePoller(store);
  if (!globalThis.leadcardStoreListeners) {
    globalThis.leadcardStoreListeners = new Map();
  }
  const listeners =
    globalThis.leadcardStoreListeners.get(tournamentId) ?? new Set();
  listeners.add(listener);
  globalThis.leadcardStoreListeners.set(tournamentId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0)
      globalThis.leadcardStoreListeners?.delete(tournamentId);
  };
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
  return sortDivisionLabels(
    players.reduce<string[]>((divisions, player) => {
      if (!divisions.includes(player.division)) {
        divisions.push(player.division);
      }

      return divisions;
    }, []),
  );
}

function divisionsWithMoreThanThreePlayers(
  players: Array<Pick<PlayerSnapshot, "division">>,
) {
  const counts = new Map<string, number>();

  for (const player of players) {
    counts.set(player.division, (counts.get(player.division) ?? 0) + 1);
  }

  return new Set(
    [...counts].filter(([, count]) => count > 3).map(([division]) => division),
  );
}

function nextUpdateAt(store: LiveState) {
  if (!store.autoRefresh) {
    return new Date(store.lastAdvancedAt).toISOString();
  }

  return new Date(store.lastAdvancedAt + UPDATE_INTERVAL_MS).toISOString();
}

function shouldAutoRefresh(
  tournament: Pick<TournamentSummary, "status">,
  players: Array<Pick<PlayerSnapshot, "thru" | "rounds">>,
  html: string | null,
) {
  if (players.length > 0 && players.some((player) => player.thru !== "F")) {
    return true;
  }

  const totalRounds = inferTotalRounds(html);
  const observedRounds = Math.max(
    0,
    ...players.map((player) => player.rounds?.length ?? 0),
  );
  const hasRoundInProgress = players.some((player) =>
    player.rounds?.some((round) => round.thru !== 0 && round.thru !== "F"),
  );
  const hasUnplayedRound = players.some((player) =>
    player.rounds?.some((round) => round.thru === 0),
  );

  if (
    totalRounds !== undefined &&
    observedRounds >= totalRounds &&
    !hasRoundInProgress &&
    !hasUnplayedRound
  ) {
    return false;
  }

  return tournament.status === "live" || tournament.status === "today";
}

function roundLabelFor(currentRound: number, totalRounds?: number) {
  return totalRounds && totalRounds > currentRound
    ? `Round ${currentRound} of ${totalRounds}`
    : `Round ${currentRound}`;
}

function inferTotalRounds(html: string | null) {
  if (!html) {
    return undefined;
  }

  const $ = load(html);
  const roundValues = $(".lso_btn_navigation[data-target-element='round']")
    .toArray()
    .map((link) => Number($(link).attr("data-target-value")))
    .filter((value) => Number.isInteger(value) && value > 0 && value !== 99);

  if (roundValues.length === 0) {
    return undefined;
  }

  return Math.max(...roundValues);
}

function inferLiveRound(
  tournament: TournamentSummary,
  html: string | null,
  players: Array<Pick<PlayerSnapshot, "rounds">>,
) {
  if (tournament.status !== "live" && tournament.status !== "finished") {
    return {
      roundLabel: tournament.roundLabel,
      currentRound: tournament.currentRound,
      totalRounds: tournament.totalRounds,
    };
  }

  const totalRounds = inferTotalRounds(html);
  const inProgressRounds = players
    .flatMap((player) => player.rounds ?? [])
    .filter((round) => round.thru !== 0 && round.thru !== "F");

  if (inProgressRounds.length > 0) {
    const currentRound = inProgressRounds.reduce((latest, round) =>
      round.order > latest.order ? round : latest,
    );
    return {
      roundLabel: roundLabelFor(currentRound.order, totalRounds),
      currentRound: currentRound.order,
      totalRounds,
    };
  }

  const startedRounds = players
    .flatMap((player) => player.rounds ?? [])
    .filter((round) => round.thru !== 0);

  if (startedRounds.length > 0) {
    const latestRound = startedRounds.reduce((latest, round) =>
      round.order > latest.order ? round : latest,
    );
    return {
      roundLabel: roundLabelFor(latestRound.order, totalRounds),
      currentRound: latestRound.order,
      totalRounds,
    };
  }

  return {
    roundLabel: tournament.roundLabel,
    currentRound: tournament.currentRound,
    totalRounds,
  };
}

function withInferredRound(
  tournament: TournamentSummary,
  html: string | null,
  players: Array<Pick<PlayerSnapshot, "rounds">>,
): TournamentSummary {
  return {
    ...tournament,
    ...inferLiveRound(tournament, html, players),
  };
}

function toLeaderboardPlayers(
  previousPlayers: PlayerSnapshot[],
  currentPlayers: PlayerSnapshot[],
  createdAt: string,
) {
  const eligibleDivisions = divisionsWithMoreThanThreePlayers(currentPlayers);
  const previousById = new Map(
    previousPlayers.map((player) => [player.playerId, player]),
  );
  const updates: RecentUpdate[] = [];

  const players = sortPlayers(
    currentPlayers.map((player) => {
      const previous = previousById.get(player.playerId);
      const playerUpdates = eligibleDivisions.has(player.division)
        ? createRecentUpdates(previous, player, createdAt)
        : [];

      updates.push(...playerUpdates);

      return {
        ...player,
        delta: createPlayerDelta(previous, player),
        latestUpdate: playerUpdates[0] ?? null,
      };
    }),
  );

  return { players, updates };
}

async function createInitialState(tournamentId: string): Promise<LiveState> {
  const source = await loadTournamentSnapshotSource(tournamentId, 0);
  const snapshot = source.html ? scrapeSnapshot(source.html) : null;
  const enrichedPlayers = (
    snapshot?.players ??
    source.registeredPlayers ??
    []
  ).map((player) => ({
    ...player,
    club:
      player.club ??
      source.playerClubs?.[playerClubKey(player.division, player.name)],
  }));
  const players = enrichedPlayers.map<LeaderboardPlayer>((player) => ({
    ...player,
    delta: {
      rankDelta: 0,
      scoreDelta: 0,
      thruDelta: 0,
    },
    latestUpdate: null,
  }));

  return {
    tournament: withInferredRound(
      source.tournament,
      source.html,
      enrichedPlayers,
    ),
    hasLiveData: Boolean(source.html),
    autoRefresh: shouldAutoRefresh(
      source.tournament,
      enrichedPlayers,
      source.html,
    ),
    fixtureIndex: source.nextFixtureIndex,
    replayPaused: false,
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
  store.hasLiveData = Boolean(source.html);
  store.fixtureIndex = source.nextFixtureIndex;
  store.lastAdvancedAt = Date.now();

  if (!source.html) {
    store.tournament = source.tournament;
    store.generatedAt = new Date().toISOString();
    store.players = (source.registeredPlayers ?? []).map<LeaderboardPlayer>(
      (player) => ({
        ...player,
        delta: { rankDelta: 0, scoreDelta: 0, thruDelta: 0 },
        latestUpdate: null,
      }),
    );
    store.updates = [];
    store.autoRefresh = shouldAutoRefresh(
      source.tournament,
      source.registeredPlayers ?? [],
      source.html,
    );
    notifyStoreListeners(store.tournament.id);
    return;
  }

  const nextSnapshot = scrapeSnapshot(source.html);
  const enrichedPlayers = nextSnapshot.players.map((player) => ({
    ...player,
    club:
      player.club ??
      source.playerClubs?.[playerClubKey(player.division, player.name)],
  }));
  const previousSnapshot = store.players.map<PlayerSnapshot>(
    ({ delta: _delta, latestUpdate: _latestUpdate, ...player }) => player,
  );
  const nextState = toLeaderboardPlayers(
    previousSnapshot,
    enrichedPlayers,
    nextSnapshot.generatedAt,
  );

  store.tournament = {
    ...withInferredRound(source.tournament, source.html, enrichedPlayers),
  };
  store.generatedAt = nextSnapshot.generatedAt;
  store.players = nextState.players;
  store.autoRefresh = shouldAutoRefresh(
    store.tournament,
    enrichedPlayers,
    source.html,
  );
  store.updates = [...nextState.updates.reverse(), ...store.updates].slice(
    0,
    20,
  );
  notifyStoreListeners(store.tournament.id);
}

async function refreshIfNeeded(tournamentId: string) {
  const store = await ensureStore(tournamentId);
  ensureStorePoller(store);

  if (
    store.autoRefresh &&
    !store.replayPaused &&
    Date.now() - store.lastAdvancedAt >= UPDATE_INTERVAL_MS
  ) {
    return refreshStore(store);
  }

  return store;
}

function divisionLeaders(players: LeaderboardPlayer[]): DivisionLeader[] {
  const eligibleDivisions = divisionsWithMoreThanThreePlayers(players);

  return getDivisions(players)
    .filter((division) => eligibleDivisions.has(division))
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
  const mockReplayCount =
    store.tournament.id === "lakers-open-2026"
      ? getMockReplaySnapshotCount(store.tournament.id)
      : 0;

  return {
    tournament: store.tournament,
    tournaments,
    hasLiveData: store.hasLiveData,
    divisions,
    leaders: overallLeaders(store.players),
    divisionLeaders: divisionLeaders(store.players),
    generatedAt: store.generatedAt,
    nextUpdateAt: nextUpdateAt(store),
    updateIntervalMs:
      store.autoRefresh && !store.replayPaused ? UPDATE_INTERVAL_MS : 0,
    ...(mockReplayCount > 0
      ? {
          mockReplay: {
            index: (store.fixtureIndex + mockReplayCount - 1) % mockReplayCount,
            count: mockReplayCount,
            paused: store.replayPaused,
          },
        }
      : {}),
  };
}

export async function controlMockReplay(
  tournamentId: string,
  action: "play" | "pause" | "step",
  index?: number,
) {
  if (tournamentId !== "lakers-open-2026") {
    throw new Error("Mock replay controls are unavailable for this tournament");
  }

  const store = await ensureStore(tournamentId);
  const snapshotCount = getMockReplaySnapshotCount(tournamentId);

  if (action === "pause") {
    store.replayPaused = true;
  } else if (action === "play") {
    store.replayPaused = false;
    store.lastAdvancedAt = Date.now();
  } else {
    if (
      !Number.isInteger(index) ||
      index === undefined ||
      index < 0 ||
      index >= snapshotCount
    ) {
      throw new Error("Invalid mock replay snapshot index");
    }
    store.fixtureIndex = index;
    await advanceStore(store);
  }

  return getLiveResponse(tournamentId);
}

export async function getResolvedTournamentId(tournamentId?: string | null) {
  if (!tournamentId) {
    return getDefaultTournamentId();
  }

  const tournaments = await getTournamentCatalog();
  const hasTournament = tournaments.some(
    (tournament) => tournament.id === tournamentId,
  );

  return hasTournament ? tournamentId : getDefaultTournamentId();
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

const clubTournamentStatusOrder: Record<TournamentSummary["status"], number> = {
  live: 0,
  today: 1,
  tomorrow: 2,
  upcoming: 3,
  recent: 4,
  finished: 4,
  mock: 5,
};

export async function getClubsResponse(): Promise<ClubsResponse> {
  const tournaments = await getTournamentCatalog();
  const results = await Promise.all(
    tournaments.map(async (tournament) => {
      try {
        const leaderboard = await getLeaderboardResponse(
          tournament.id,
          "__all",
        );
        const playersByClub = new Map<string, LeaderboardPlayer[]>();

        for (const player of leaderboard.players) {
          if (!player.club) continue;
          const players = playersByClub.get(player.club) ?? [];
          players.push(player);
          playersByClub.set(player.club, players);
        }

        return { tournament, leaderboard, playersByClub };
      } catch {
        return { tournament, leaderboard: null, playersByClub: new Map() };
      }
    }),
  );
  const clubs = new Map<string, ClubOverview>();

  for (const result of results) {
    for (const [name, players] of result.playersByClub) {
      const club: ClubOverview = clubs.get(name) ?? { name, tournaments: [] };
      club.tournaments.push({
        tournament: result.tournament,
        players,
        generatedAt:
          result.leaderboard?.generatedAt ?? new Date().toISOString(),
      });
      clubs.set(name, club);
    }
  }

  return {
    clubs: [...clubs.values()]
      .map((club) => ({
        ...club,
        tournaments: club.tournaments.sort(
          (a, b) =>
            clubTournamentStatusOrder[a.tournament.status] -
              clubTournamentStatusOrder[b.tournament.status] ||
            a.tournament.name.localeCompare(b.tournament.name),
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    generatedAt: new Date().toISOString(),
  };
}

export async function getClubTournamentResponse(
  tournamentId: string,
): Promise<ClubTournamentResponse> {
  const tournament = (await getTournamentCatalog()).find(
    (item) => item.id === tournamentId,
  );

  if (!tournament) {
    throw new Error("Unknown tournament");
  }

  const leaderboard = await getLeaderboardResponse(tournamentId, "__all");

  return {
    tournament,
    players: leaderboard.players.filter((player) => Boolean(player.club)),
    generatedAt: leaderboard.generatedAt,
  };
}

export async function getUpdatesResponse(
  tournamentId: string,
): Promise<UpdatesResponse> {
  const store = await refreshIfNeeded(tournamentId);
  const eligibleDivisions = divisionsWithMoreThanThreePlayers(store.players);

  return {
    tournamentId: store.tournament.id,
    updates: store.updates.filter((update) =>
      eligibleDivisions.has(update.division),
    ),
    generatedAt: store.generatedAt,
  };
}

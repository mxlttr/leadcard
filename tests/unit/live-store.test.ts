import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, TournamentSummary } from "@/lib/types";

const tournament: TournamentSummary = {
  id: "test-event",
  name: "Test Event",
  course: "Test Course",
  roundLabel: "Round 2",
  status: "live",
};

const upcomingTournament: TournamentSummary = {
  id: "upcoming-event",
  name: "Upcoming Event",
  course: "Future Course",
  roundLabel: "29.03.2026",
  status: "upcoming",
};

function serializeSnapshot(generatedAt: string, players: PlayerSnapshot[]) {
  const rows = players
    .map(
      (player) => `
        <li
          data-player-id="${player.playerId}"
          data-name="${player.name}"
          data-division="${player.division}"
          data-rank="${player.rank}"
          data-score="${player.scoreToPar}"
          data-thru="${player.thru}"
          data-last-five="${player.lastFive.join(",")}"
        ></li>
      `,
    )
    .join("");

  return `<section data-generated-at="${generatedAt}"><ul>${rows}</ul></section>`;
}

const firstSnapshotHtml = serializeSnapshot("2026-03-24T12:00:00.000Z", [
  {
    playerId: "open-a",
    name: "Alice Ace",
    division: "Open",
    rank: 1,
    scoreToPar: -3,
    thru: 5,
    lastFive: [0, 0, -1, 0, 0],
  },
  {
    playerId: "open-b",
    name: "Bob Birdie",
    division: "Open",
    rank: 2,
    scoreToPar: -2,
    thru: 5,
    lastFive: [0, 0, 0, -1, 0],
  },
  {
    playerId: "women-a",
    name: "Cara Chain",
    division: "Women",
    rank: 1,
    scoreToPar: 1,
    thru: 5,
    lastFive: [0, 1, 0, 0, 0],
  },
]);

const secondSnapshotHtml = serializeSnapshot("2026-03-24T12:00:25.000Z", [
  {
    playerId: "open-b",
    name: "Bob Birdie",
    division: "Open",
    rank: 1,
    scoreToPar: -4,
    thru: 6,
    lastFive: [0, 0, -1, 0, -1],
  },
  {
    playerId: "open-a",
    name: "Alice Ace",
    division: "Open",
    rank: 2,
    scoreToPar: -3,
    thru: 6,
    lastFive: [0, -1, 0, 0, 1],
  },
  {
    playerId: "women-a",
    name: "Cara Chain",
    division: "Women",
    rank: 1,
    scoreToPar: 0,
    thru: 6,
    lastFive: [1, 0, 0, 0, -1],
  },
]);

const unsortedDivisionLeadersHtml = serializeSnapshot(
  "2026-03-24T12:01:00.000Z",
  [
    {
      playerId: "women-a",
      name: "Cara Chain",
      division: "Women",
      rank: 1,
      scoreToPar: 2,
      thru: "F",
      lastFive: [0, 0, 1, 0, 1],
    },
    {
      playerId: "masters-a",
      name: "Milo Mando",
      division: "Masters",
      rank: 1,
      scoreToPar: -1,
      thru: "F",
      lastFive: [0, 0, 0, -1, 0],
    },
    {
      playerId: "open-a",
      name: "Alice Ace",
      division: "Open",
      rank: 1,
      scoreToPar: -5,
      thru: "F",
      lastFive: [-1, 0, -1, 0, 0],
    },
  ],
);

const unorderedDivisionsHtml = serializeSnapshot("2026-03-24T12:00:00.000Z", [
  {
    playerId: "wm50-a",
    name: "Wendy Masters",
    division: "Damen Master 50",
    rank: 1,
    scoreToPar: 1,
    thru: 3,
    lastFive: [0, 0, 1],
  },
  {
    playerId: "junior-a",
    name: "Jonny Junior",
    division: "Junioren 18",
    rank: 1,
    scoreToPar: 0,
    thru: 3,
    lastFive: [0, 0, 0],
  },
  {
    playerId: "masters50-a",
    name: "Milo Fifty",
    division: "Master 50",
    rank: 1,
    scoreToPar: -1,
    thru: 3,
    lastFive: [0, -1, 0],
  },
  {
    playerId: "women-a",
    name: "Cara Chain",
    division: "Damen",
    rank: 1,
    scoreToPar: -2,
    thru: 3,
    lastFive: [0, -1, -1],
  },
  {
    playerId: "open-a",
    name: "Alice Ace",
    division: "Open",
    rank: 1,
    scoreToPar: -3,
    thru: 3,
    lastFive: [-1, -1, -1],
  },
  {
    playerId: "masters40-a",
    name: "Marta Forty",
    division: "Master 40",
    rank: 1,
    scoreToPar: -1,
    thru: 3,
    lastFive: [0, -1, 0],
  },
  {
    playerId: "wm40-a",
    name: "Willa Forty",
    division: "Damen Master 40",
    rank: 1,
    scoreToPar: 0,
    thru: 3,
    lastFive: [0, 0, 0],
  },
]);

const loadTournamentSnapshotSource = vi.fn();
const getTournamentCatalog = vi.fn();
const getDefaultTournamentId = vi.fn();

vi.mock("@/lib/server/tournament-source", () => ({
  loadTournamentSnapshotSource,
  getTournamentCatalog,
  getDefaultTournamentId,
}));

describe("live-store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T12:00:00.000Z"));
    vi.resetModules();
    globalThis.leadcardStore = undefined;
    globalThis.leadcardStoreInitialization = undefined;
    globalThis.leadcardStoreRefreshes = undefined;

    getTournamentCatalog.mockResolvedValue([tournament]);
    getDefaultTournamentId.mockResolvedValue(tournament.id);
    loadTournamentSnapshotSource.mockImplementation(
      async (_tournamentId: string, fixtureIndex: number) => ({
        tournament,
        html: fixtureIndex === 0 ? firstSnapshotHtml : secondSnapshotHtml,
        nextFixtureIndex: fixtureIndex === 0 ? 1 : 1,
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.leadcardStore = undefined;
    globalThis.leadcardStoreInitialization = undefined;
    globalThis.leadcardStoreRefreshes = undefined;
    loadTournamentSnapshotSource.mockReset();
    getTournamentCatalog.mockReset();
    getDefaultTournamentId.mockReset();
  });

  it("derives divisions on first load and emits updates after the polling interval", async () => {
    const liveStore = await import("@/lib/server/live-store");

    const firstLiveResponse = await liveStore.getLiveResponse(tournament.id);

    expect(firstLiveResponse.divisions).toEqual(["Open", "Women"]);
    expect(firstLiveResponse.leaders[0]?.name).toBe("Alice Ace");
    expect(firstLiveResponse.nextUpdateAt).toBe("2026-03-24T12:00:25.000Z");

    vi.setSystemTime(new Date("2026-03-24T12:00:26.000Z"));

    const leaderboard = await liveStore.getLeaderboardResponse(
      tournament.id,
      "Open",
    );
    const updates = await liveStore.getUpdatesResponse(tournament.id);

    expect(leaderboard.players.map((player) => player.name)).toEqual([
      "Bob Birdie",
      "Alice Ace",
    ]);
    expect(leaderboard.players[0]).toMatchObject({
      rank: 1,
      scoreToPar: -4,
      delta: {
        rankDelta: 1,
        scoreDelta: 2,
        thruDelta: 1,
      },
    });
    expect(updates.updates.map((update) => update.text)).toEqual(
      expect.arrayContaining([
        "Bob Birdie takes the lead at -4",
        "Alice Ace drops to #2 at -3 through 6",
        "Cara Chain holds the lead at E through 6",
      ]),
    );
  });

  it("does not fall back to mock standings for upcoming tournaments without live scoring", async () => {
    loadTournamentSnapshotSource.mockResolvedValue({
      tournament: upcomingTournament,
      html: null,
      nextFixtureIndex: 0,
    });
    getTournamentCatalog.mockResolvedValue([upcomingTournament, tournament]);
    getDefaultTournamentId.mockResolvedValue(upcomingTournament.id);

    const liveStore = await import("@/lib/server/live-store");

    const liveResponse = await liveStore.getLiveResponse(upcomingTournament.id);
    const leaderboard = await liveStore.getLeaderboardResponse(
      upcomingTournament.id,
      "",
    );
    const updates = await liveStore.getUpdatesResponse(upcomingTournament.id);

    expect(liveResponse.tournament.status).toBe("upcoming");
    expect(liveResponse.hasLiveData).toBe(false);
    expect(liveResponse.divisions).toEqual([]);
    expect(liveResponse.leaders).toEqual([]);
    expect(leaderboard.players).toEqual([]);
    expect(updates.updates).toEqual([]);
  });

  it("resolves unknown tournament ids back to the default tournament", async () => {
    const liveStore = await import("@/lib/server/live-store");

    await expect(liveStore.getResolvedTournamentId("missing-event")).resolves.toBe(
      tournament.id,
    );
  });

  it("sorts division leaders by leaderboard score instead of source order", async () => {
    loadTournamentSnapshotSource.mockResolvedValue({
      tournament,
      html: unsortedDivisionLeadersHtml,
      nextFixtureIndex: 0,
    });

    const liveStore = await import("@/lib/server/live-store");
    const liveResponse = await liveStore.getLiveResponse(tournament.id);

    expect(liveResponse.divisionLeaders.map(({ division }) => division)).toEqual(
      ["Open", "Masters", "Women"],
    );
    expect(
      liveResponse.divisionLeaders.map(({ leader }) => leader.name),
    ).toEqual(["Alice Ace", "Milo Mando", "Cara Chain"]);
  });

  it("sorts divisions in a stable domain order", async () => {
    loadTournamentSnapshotSource.mockResolvedValue({
      tournament,
      html: unorderedDivisionsHtml,
      nextFixtureIndex: 0,
    });

    const liveStore = await import("@/lib/server/live-store");
    const liveResponse = await liveStore.getLiveResponse(tournament.id);

    expect(liveResponse.divisions).toEqual([
      "Open",
      "Damen",
      "Master 40",
      "Master 50",
      "Damen Master 40",
      "Damen Master 50",
      "Junioren 18",
    ]);
  });

  it("shares store initialization across concurrent API requests", async () => {
    const liveStore = await import("@/lib/server/live-store");

    await Promise.all([
      liveStore.getLiveResponse(tournament.id),
      liveStore.getLeaderboardResponse(tournament.id, ""),
      liveStore.getUpdatesResponse(tournament.id),
    ]);

    expect(loadTournamentSnapshotSource).toHaveBeenCalledTimes(1);
  });

  it("shares a single refresh across concurrent API requests after the polling interval", async () => {
    const liveStore = await import("@/lib/server/live-store");

    await liveStore.getLiveResponse(tournament.id);
    expect(loadTournamentSnapshotSource).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-03-24T12:00:26.000Z"));

    await Promise.all([
      liveStore.getLiveResponse(tournament.id),
      liveStore.getLeaderboardResponse(tournament.id, "Open"),
      liveStore.getUpdatesResponse(tournament.id),
    ]);

    expect(loadTournamentSnapshotSource).toHaveBeenCalledTimes(2);
  });
});

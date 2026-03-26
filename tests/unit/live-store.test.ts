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
    loadTournamentSnapshotSource.mockReset();
    getTournamentCatalog.mockReset();
    getDefaultTournamentId.mockReset();
  });

  it("derives divisions on first load and emits updates after the polling interval", async () => {
    const liveStore = await import("@/lib/server/live-store");

    const firstLiveResponse = await liveStore.getLiveResponse(tournament.id);

    expect(firstLiveResponse.divisions).toEqual(["Open", "Women"]);
    expect(firstLiveResponse.leaders[0]?.name).toBe("Alice Ace");

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
        "moves to -4 through 6",
        "drops to 2nd",
        "moves to E through 6",
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
});

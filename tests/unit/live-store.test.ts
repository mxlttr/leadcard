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

const finishedSnapshotHtml = serializeSnapshot("2026-03-24T12:00:25.000Z", [
  {
    playerId: "open-a",
    name: "Alice Ace",
    division: "Open",
    rank: 1,
    scoreToPar: -5,
    thru: "F",
    lastFive: [0, -1, 0, 0, -1],
  },
  {
    playerId: "open-b",
    name: "Bob Birdie",
    division: "Open",
    rank: 2,
    scoreToPar: -3,
    thru: "F",
    lastFive: [0, 0, 0, -1, 0],
  },
]);

const multiRoundLiveHtml = `
  <div class="nav">
    <a class="nav-link lso_btn_navigation" data-target-element="round" data-target-value="99">Gesamtübersicht</a>
    <a class="nav-link lso_btn_navigation" data-target-element="round" data-target-value="1">Runde 1</a>
    <a class="nav-link lso_btn_navigation" data-target-element="round" data-target-value="2">Runde 2</a>
    <a class="nav-link lso_btn_navigation" data-target-element="round" data-target-value="3">Runde 3</a>
  </div>
  <table id="livescoring_">
    <thead>
      <tr class="w-100">
        <th colspan="2" class="text-end">Par</th>
        <th class="text-center th_hole">3</th>
        <th class="text-center th_hole">3</th>
        <th class="text-center th_hole">3</th>
        <th colspan="2"></th>
        <th class="text-end">9</th>
        <th colspan="2"></th>
      </tr>
      <tr class="w-100">
        <th>No</th>
        <th class="th_name">Open</th>
        <th class="text-center th_hole">1</th>
        <th class="text-center th_hole">2</th>
        <th class="text-center th_hole">3</th>
        <th class="text-end">&pm;</th>
        <th class="text-end" style="width:20px;">Kor</th>
        <th class="text-end">&sum;</th>
        <th class="text-end" colspan="2">total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>Alice Ace</td>
        <td>3</td>
        <td>3</td>
        <td>2</td>
        <td class="text-end">-1</td>
        <td class="text-end"></td>
        <td class="text-end">8</td>
        <td class="text-end">-1</td>
        <td class="text-end">8</td>
      </tr>
      <tr>
        <td></td>
        <td></td>
        <td>2</td>
        <td></td>
        <td></td>
        <td class="text-end">-1</td>
        <td class="text-end"></td>
        <td class="text-end">2</td>
        <td class="text-end">-2</td>
        <td class="text-end">10</td>
      </tr>
    </tbody>
  </table>
`;

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

  it("relabels live tournaments with the inferred current round", async () => {
    loadTournamentSnapshotSource.mockResolvedValue({
      tournament: {
        ...tournament,
        roundLabel: "24.03.2026 - 26.03.2026",
      },
      html: multiRoundLiveHtml,
      nextFixtureIndex: 0,
    });

    const liveStore = await import("@/lib/server/live-store");
    const liveResponse = await liveStore.getLiveResponse(tournament.id);

    expect(liveResponse.tournament.currentRound).toBe(2);
    expect(liveResponse.tournament.totalRounds).toBe(3);
    expect(liveResponse.tournament.roundLabel).toBe("Round 2 of 3");
  });

  it("resolves unknown tournament ids back to the default tournament", async () => {
    const liveStore = await import("@/lib/server/live-store");

    await expect(
      liveStore.getResolvedTournamentId("missing-event"),
    ).resolves.toBe(tournament.id);
  });

  it("sorts division leaders by leaderboard score instead of source order", async () => {
    loadTournamentSnapshotSource.mockResolvedValue({
      tournament,
      html: unsortedDivisionLeadersHtml,
      nextFixtureIndex: 0,
    });

    const liveStore = await import("@/lib/server/live-store");
    const liveResponse = await liveStore.getLiveResponse(tournament.id);

    expect(
      liveResponse.divisionLeaders.map(({ division }) => division),
    ).toEqual(["Open", "Masters", "Women"]);
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

  it("stops auto-refreshing once every player has finished", async () => {
    loadTournamentSnapshotSource.mockResolvedValue({
      tournament,
      html: finishedSnapshotHtml,
      nextFixtureIndex: 0,
    });

    const liveStore = await import("@/lib/server/live-store");
    const firstLiveResponse = await liveStore.getLiveResponse(tournament.id);

    expect(firstLiveResponse.updateIntervalMs).toBe(0);
    expect(firstLiveResponse.nextUpdateAt).toBe("2026-03-24T12:00:00.000Z");

    vi.setSystemTime(new Date("2026-03-24T12:00:26.000Z"));

    const secondLiveResponse = await liveStore.getLiveResponse(tournament.id);

    expect(secondLiveResponse.updateIntervalMs).toBe(0);
    expect(loadTournamentSnapshotSource).toHaveBeenCalledTimes(1);
  });
});

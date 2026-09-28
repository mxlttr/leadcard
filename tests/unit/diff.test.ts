import { describe, expect, it } from "vitest";

import {
  createPlayerDelta,
  createRecentUpdate,
  formatScore,
} from "@/lib/server/diff";
import type { PlayerRound, PlayerSnapshot } from "@/lib/types";

function round(totalHoles: number, thru: PlayerRound["thru"]): PlayerRound {
  return {
    id: `round-${totalHoles}`,
    order: 1,
    label: "Round 1",
    thru,
    scoreToPar: 0,
    holes: Array.from({ length: totalHoles }, (_, index) => ({
      hole: index + 1,
      par: 3,
      score: index < (thru === "F" ? totalHoles : thru) ? 3 : null,
      relativeToPar: index < (thru === "F" ? totalHoles : thru) ? 0 : null,
    })),
  };
}

function player(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    playerId: "player-1",
    name: "Test Player",
    division: "Open",
    rank: 1,
    scoreToPar: 0,
    thru: 1,
    lastFive: [0, 0, 0, 0, 0],
    ...overrides,
  };
}

describe("createPlayerDelta", () => {
  it("computes score, rank, and thru deltas", () => {
    const delta = createPlayerDelta(
      player({ rank: 3, scoreToPar: -2, thru: 17 }),
      player({ rank: 1, scoreToPar: -4, thru: "F" }),
    );

    expect(delta).toEqual({
      rankDelta: 2,
      scoreDelta: 2,
      thruDelta: 1,
    });
  });

  it("returns zero deltas without a previous snapshot", () => {
    expect(createPlayerDelta(undefined, player())).toEqual({
      rankDelta: 0,
      scoreDelta: 0,
      thruDelta: 0,
    });
  });

  it("uses the actual round length for finished players when round data is available", () => {
    const delta = createPlayerDelta(
      player({ thru: 13, rounds: [round(14, 13)] }),
      player({ thru: "F", rounds: [round(14, "F")] }),
    );

    expect(delta.thruDelta).toBe(1);
  });
});

describe("createRecentUpdate", () => {
  const createdAt = "2026-03-24T12:00:25.000Z";

  it("reports a finishing update", () => {
    const update = createRecentUpdate(
      player({ scoreToPar: -3, thru: 17 }),
      player({ scoreToPar: -5, thru: "F" }),
      createdAt,
    );

    expect(update).toEqual({
      id: "player-1:2026-03-24T12:00:25.000Z:1:-5:F",
      playerId: "player-1",
      playerName: "Test Player",
      division: "Open",
      text: "Test Player finishes at -5",
      importance: "high",
      tone: "neutral",
      rank: 1,
      previousRank: 1,
      scoreToPar: -5,
      thru: "F",
      createdAt,
    });
  });

  it("reports a positive rank move", () => {
    const update = createRecentUpdate(
      player({ rank: 3, scoreToPar: -2, thru: 10 }),
      player({ rank: 1, scoreToPar: -4, thru: 12 }),
      createdAt,
    );

    expect(update).toEqual({
      id: "player-1:2026-03-24T12:00:25.000Z:1:-4:12",
      playerId: "player-1",
      playerName: "Test Player",
      division: "Open",
      text: "Test Player takes the lead at -4",
      importance: "high",
      tone: "positive",
      rank: 1,
      previousRank: 3,
      scoreToPar: -4,
      thru: 12,
      createdAt,
    });
  });

  it("returns null when nothing meaningful changed", () => {
    expect(createRecentUpdate(player(), player(), createdAt)).toBeNull();
  });

  it("omits low-importance one-position movements", () => {
    expect(
      createRecentUpdate(player({ rank: 20 }), player({ rank: 19 }), createdAt),
    ).toBeNull();
  });

  it("reports an eagle when a new hole is two under par", () => {
    expect(
      createRecentUpdate(
        player({ rounds: [round(1, 1)] }),
        player({
          scoreToPar: -2,
          thru: 2,
          rounds: [
            {
              ...round(2, 2),
              holes: [
                ...round(1, 1).holes,
                { hole: 2, par: 4, score: 2, relativeToPar: -2 },
              ],
            },
          ],
        }),
        createdAt,
      ),
    ).toMatchObject({
      text: "Test Player scores an eagle on hole 2",
      importance: "high",
    });
  });

  it("reports an ace when a new hole is a hole in one", () => {
    expect(
      createRecentUpdate(
        player({ rounds: [round(1, 1)] }),
        player({
          thru: 2,
          rounds: [
            {
              ...round(2, 2),
              holes: [
                ...round(1, 1).holes,
                { hole: 2, par: 3, score: 1, relativeToPar: -2 },
              ],
            },
          ],
        }),
        createdAt,
      ),
    ).toMatchObject({
      text: "Test Player hits an ace on hole 2",
      importance: "high",
    });
  });
});

describe("formatScore", () => {
  it("formats under par, even, and over par values", () => {
    expect(formatScore(-3)).toBe("-3");
    expect(formatScore(0)).toBe("E");
    expect(formatScore(4)).toBe("+4");
  });
});

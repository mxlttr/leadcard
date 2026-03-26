import { describe, expect, it } from "vitest";

import { buildRecentUpdatesFeed } from "@/lib/recent-updates";
import type { RecentUpdate } from "@/lib/types";

function update(overrides: Partial<RecentUpdate> & { id: string }): RecentUpdate {
  const { id, ...rest } = overrides;

  return {
    id,
    playerId: "player-1",
    playerName: "Player One",
    division: "Open",
    text: "Player One takes the lead at -6",
    importance: "high",
    tone: "positive",
    rank: 1,
    previousRank: 2,
    scoreToPar: -6,
    thru: 12,
    createdAt: "2026-03-26T10:00:00.000Z",
    ...rest,
  };
}

describe("buildRecentUpdatesFeed", () => {
  it("merges high-importance top-3 moments into a single event block", () => {
    const updates = [
      update({
        id: "lead-1",
        playerId: "jonas",
        playerName: "Jonas Weber",
        text: "Jonas Weber takes the lead at -6",
      }),
      update({
        id: "lead-2",
        playerId: "lukas",
        playerName: "Lukas Hartmann",
        rank: 2,
        previousRank: 1,
        scoreToPar: -5,
        text: "Lukas Hartmann drops to #2 at -5 through 12",
        tone: "negative",
      }),
      update({
        id: "lead-3",
        playerId: "mika",
        playerName: "Mika Braun",
        rank: 3,
        previousRank: 2,
        scoreToPar: -4,
        text: "Mika Braun drops to #3 at -4 through 11",
        tone: "negative",
        createdAt: "2026-03-26T09:58:30.000Z",
      }),
      update({
        id: "latest-1",
        playerId: "felix",
        playerName: "Felix Neumann",
        rank: 8,
        previousRank: 9,
        scoreToPar: 2,
        text: "Felix Neumann climbs to #8 at +2 through 10",
        importance: "medium",
        createdAt: "2026-03-26T09:57:00.000Z",
      }),
    ];

    const feed = buildRecentUpdatesFeed(updates);

    expect(feed.keyMoments).toHaveLength(1);
    expect(feed.keyMoments[0]?.type).toBe("lead_change");
    expect(feed.keyMoments[0]?.updates.map((entry) => entry.playerName)).toEqual([
      "Jonas Weber",
      "Lukas Hartmann",
      "Mika Braun",
    ]);
    expect(feed.latestUpdates.map((entry) => entry.id)).toEqual(["latest-1"]);
  });

  it("deduplicates repeated identical updates from the same player", () => {
    const updates = [
      update({
        id: "repeat-new",
        text: "Player One holds the lead at -6 through 12",
        previousRank: 1,
      }),
      update({
        id: "repeat-old",
        text: "Player One holds the lead at -6 through 12",
        previousRank: 1,
        createdAt: "2026-03-26T09:56:00.000Z",
      }),
    ];

    const feed = buildRecentUpdatesFeed(updates);

    expect(feed.keyMoments[0]?.updates).toHaveLength(1);
    expect(feed.keyMoments[0]?.updates[0]?.id).toBe("repeat-new");
  });
});

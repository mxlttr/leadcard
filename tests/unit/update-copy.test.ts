import { describe, expect, it } from "vitest";

import { createTranslator, getDictionary } from "@/lib/i18n";
import type { RecentUpdate } from "@/lib/types";
import { formatUpdateText } from "@/lib/update-copy";

function holeRankMove(holeRelativeToPar: number): RecentUpdate {
  return {
    id: "player-1:2026-10-11T12:00:00.000Z:5:-1:4",
    playerId: "player-1",
    playerName: "Andreas Riessenberger",
    division: "Open",
    text: "Andreas Riessenberger drops after hole 4",
    kind: "hole_rank_move",
    importance: "high",
    tone: "negative",
    rank: 5,
    previousRank: 3,
    hole: 4,
    holeRelativeToPar,
    createdAt: "2026-10-11T12:00:00.000Z",
  };
}

describe("formatUpdateText hole rank moves", () => {
  it("names the exact bogey score that caused a drop", () => {
    const t = createTranslator(getDictionary("en"));
    expect(formatUpdateText(holeRankMove(1), t)).toBe(
      "Bogey on hole 4 drops Andreas Riessenberger to #5",
    );
  });

  it("names a double bogey instead of grouping it with bogeys", () => {
    const t = createTranslator(getDictionary("en"));
    expect(formatUpdateText(holeRankMove(2), t)).toBe(
      "Double bogey on hole 4 drops Andreas Riessenberger to #5",
    );
  });

  it("names an under-par score that caused a move up", () => {
    const t = createTranslator(getDictionary("en"));
    const update = {
      ...holeRankMove(-3),
      rank: 2,
      previousRank: 5,
      tone: "positive" as const,
    };
    expect(formatUpdateText(update, t)).toBe(
      "Albatross on hole 4 moves Andreas Riessenberger up to #2",
    );
  });

  it("formats exact score descriptions in German too", () => {
    const t = createTranslator(getDictionary("de"));
    expect(formatUpdateText(holeRankMove(3), t)).toBe(
      "Triplebogey auf Bahn 4 setzt Andreas Riessenberger auf #5 zurück",
    );
  });
});

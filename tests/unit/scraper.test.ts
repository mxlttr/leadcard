import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { scrapeSnapshot } from "@/lib/server/scraper";

function readFixture(name: string) {
  return readFileSync(path.resolve(process.cwd(), "tests/fixtures/live", name), "utf8");
}

function requirePlayer(snapshot: ReturnType<typeof scrapeSnapshot>, name: string) {
  const player = snapshot.players.find((entry) => entry.name === name);
  expect(player).toBeDefined();
  return player!;
}

describe("scrapeSnapshot", () => {
  it("parses all division sections from the 2425 live page", () => {
    const snapshot = scrapeSnapshot(readFixture("2425.html"));
    const divisions = [...new Set(snapshot.players.map((player) => player.division))];

    expect(divisions).toEqual([
      "Master 40",
      "Master 50",
      "Master 60",
      "Master 70",
      "Damen Master 40",
      "Damen Master 50",
      "Damen Master 60",
    ]);

    const andreasKaivers = requirePlayer(snapshot, "Andreas Kaivers");

    expect(andreasKaivers).toMatchObject({
      division: "Master 40",
      rank: 1,
      scoreToPar: -7,
      thru: "F",
    });
    expect(andreasKaivers.lastFive).toHaveLength(5);
  });
});

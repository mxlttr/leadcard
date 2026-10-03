import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { scrapeSnapshot } from "@/lib/server/scraper";

function readFixture(name: string) {
  return readFileSync(
    path.resolve(process.cwd(), "tests/fixtures/live", name),
    "utf8",
  );
}

function requirePlayer(
  snapshot: ReturnType<typeof scrapeSnapshot>,
  name: string,
) {
  const player = snapshot.players.find((entry) => entry.name === name);
  expect(player).toBeDefined();

  if (!player) {
    throw new Error(`Expected player ${name} to exist in snapshot.`);
  }

  return player;
}

describe("scrapeSnapshot", () => {
  it("matches recent scores to their actual holes for a shotgun start", () => {
    const html = `
      <table id="livescoring_">
        <thead>
          <tr><th colspan="2">Par</th><th class="th_hole">4</th><th class="th_hole">3</th><th class="th_hole">3</th></tr>
          <tr><th>No</th><th class="th_name">Open</th><th class="th_hole">1</th><th class="th_hole">2</th><th class="th_hole">3</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>Player</td><td></td><td>3</td><td>3</td><td>0</td><td>6</td></tr>
        </tbody>
      </table>
    `;

    const player = scrapeSnapshot(html).players[0];

    expect(player?.lastFive).toEqual([0, 0]);
  });

  it("does not treat empty hole cells as finished holes", () => {
    const html = `
      <table id="livescoring_">
        <thead>
          <tr class="w-100">
            <th colspan="2" class="text-end">Par</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">4</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">3</th>
            <th colspan="2"></th>
            <th class="text-end">55</th>
            <th colspan="2"></th>
          </tr>
          <tr class="w-100">
            <th>No</th>
            <th class="th_name">Open</th>
            <th class="text-center th_hole">1</th>
            <th class="text-center th_hole">2</th>
            <th class="text-center th_hole">3</th>
            <th class="text-center th_hole">4</th>
            <th class="text-center th_hole">5</th>
            <th class="text-center th_hole">6</th>
            <th class="text-center th_hole">7</th>
            <th class="text-center th_hole">8</th>
            <th class="text-center th_hole">9</th>
            <th class="text-center th_hole">10</th>
            <th class="text-center th_hole">11</th>
            <th class="text-center th_hole">12</th>
            <th class="text-center th_hole">13</th>
            <th class="text-center th_hole">14</th>
            <th class="text-center th_hole">15</th>
            <th class="text-center th_hole">16</th>
            <th class="text-center th_hole">17</th>
            <th class="text-center th_hole">18</th>
            <th class="text-end">&pm;</th>
            <th class="text-end" style="width:20px;">Kor</th>
            <th class="text-end">&sum;</th>
            <th class="text-end" colspan="2">total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>Michael Hermenau</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td>3</td>
            <td></td>
            <td></td>
            <td></td>
            <td class="text-end">-1</td>
            <td class="text-end"></td>
            <td class="text-end">3</td>
            <td class="text-end">-1</td>
            <td class="text-end">3</td>
          </tr>
        </tbody>
      </table>
    `;

    const snapshot = scrapeSnapshot(html);

    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.players[0]).toMatchObject({
      name: "Michael Hermenau",
      division: "Open",
      rank: 1,
      scoreToPar: -1,
      thru: 1,
    });
    expect(snapshot.players[0]?.rounds?.[0]).toMatchObject({
      label: "Round 1",
      thru: 1,
      scoreToPar: -1,
    });
    expect(snapshot.players[0]?.rounds?.[0]?.holes[14]).toMatchObject({
      hole: 15,
      par: 4,
      score: 3,
      relativeToPar: -1,
    });
  });

  it("parses all division sections from the 2425 live page", () => {
    const snapshot = scrapeSnapshot(readFixture("2425.html"));
    const divisions = [
      ...new Set(snapshot.players.map((player) => player.division)),
    ];

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
    expect(andreasKaivers.rounds?.length).toBeGreaterThan(0);
    expect(andreasKaivers.rounds?.at(-1)?.thru).toBe("F");
    expect(
      snapshot.players.find((player) => player.name === "Dennis Werchau"),
    ).toBeUndefined();
    expect(
      snapshot.players.find((player) => player.name === "Marcel Söffker"),
    ).toBeUndefined();
  });

  it("parses multi-round grouped rows without confusing total strokes for score to par", () => {
    const snapshot = scrapeSnapshot(readFixture("2612.html"));
    const divisions = [
      ...new Set(snapshot.players.map((player) => player.division)),
    ];

    expect(divisions).toContain("Junioren 18");
    expect(divisions).toContain("Open");

    const jonathanKreis = requirePlayer(snapshot, "Jonathan Kreis");
    const maxWiegand = requirePlayer(snapshot, "Max Wiegand");

    expect(jonathanKreis).toMatchObject({
      division: "Junioren 18",
      rank: 1,
      scoreToPar: 6,
      thru: "F",
    });
    expect(maxWiegand).toMatchObject({
      division: "Open",
      rank: 1,
      scoreToPar: -15,
      thru: "F",
    });
    expect(jonathanKreis.rounds).toHaveLength(3);
    expect(jonathanKreis.rounds?.[2]).toMatchObject({
      label: "Round 3",
      thru: "F",
    });
    expect(jonathanKreis.rounds?.[0]?.holes[0]?.par).toBe(3);
    expect(
      jonathanKreis.rounds?.[2]?.holes.some((hole) => hole.score !== null),
    ).toBe(true);
    expect(
      Math.max(
        ...snapshot.players.map((player) => Math.abs(player.scoreToPar)),
      ),
    ).toBeLessThan(50);
  });
});

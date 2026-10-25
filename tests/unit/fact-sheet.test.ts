import { describe, expect, it } from "vitest";
import {
  buildFactSheet,
  type ReportSnapshot,
} from "@/lib/server/reporting/fact-sheet";
import hubertus from "@/tests/fixtures/reports/2506.json";
import nagelfluh from "@/tests/fixtures/reports/2698.json";

const source = (data: unknown) => structuredClone(data) as ReportSnapshot[];

describe("archived tournament facts", () => {
  it("reproduces Hubertus, including women, with deterministic provenance", () => {
    const input = source(hubertus);
    const facts = buildFactSheet(input);
    expect(facts.fieldSize).toBe(55);
    expect(facts.completion.readyForReview).toBe(true);
    const timo = facts.players.find((p) => p.name === "Timo Hartmann");
    expect(timo).toMatchObject({
      scoreToPar: -23,
      birdies: 24,
      holesPlayed: 36,
    });
    expect(timo?.rounds[1]).toMatchObject({ birdies: 13, holeCount: 18 });
    expect(facts.divisions.find((d) => d.division === "Open")).toMatchObject({
      winningMargin: 14,
    });
    const women = facts.divisions.find((d) => d.division === "Damen");
    expect(women).toMatchObject({
      fieldSize: 2,
      winner: "damen-johanna-jordan",
      winningMargin: 46,
    });
    input.reverse();
    for (const s of input) s.players.reverse();
    expect(buildFactSheet(input)).toEqual(facts);
  });

  it("reconstructs Nagelfluh's comeback and holds the missing scorecard", () => {
    const facts = buildFactSheet(source(nagelfluh));
    expect(facts.completion.readyForReview).toBe(false);
    expect(facts.completion.readyForAutomaticReport).toBe(false);
    expect(
      facts.completion.gaps.some((g) =>
        g.includes("incomplete-or-inconsistent-scorecard"),
      ),
    ).toBe(true);
    expect(facts.divisions.find((d) => d.division === "Open")).toMatchObject({
      winningMargin: 3,
    });
    const winner = facts.players.find((p) => p.name === "Valentin Reitemann");
    expect(winner).toMatchObject({
      scoreToPar: -12,
      birdies: 19,
      holesPlayed: 36,
    });
    expect(winner?.rounds[1]).toMatchObject({ birdies: 8, holeCount: 12 });
    const masters = facts.divisions.find((d) => d.division === "Master 40");
    expect(masters?.comebacks).toContainEqual({
      playerId: masters?.winner,
      afterRound: 1,
      deficit: 3,
    });
    expect(
      facts.players
        .find((p) => p.name === "Birgit Lingenhel")
        ?.rounds.map((r) => r.scoreToPar),
    ).toEqual([7, 5, 5]);
    expect(
      facts.divisions.find((d) => d.division === "Damen Master 40"),
    ).toMatchObject({ fieldSize: 1, winningMargin: null });
    expect(
      facts.divisions.find((d) => d.division === "Master 60")?.standings,
    ).toEqual([]);
  });

  it("does not fall back to older results after a correction or infer withdrawals", () => {
    const input = source(hubertus);
    const corrected = structuredClone(input[1]);
    corrected.id++;
    const round = corrected.players[0].rounds?.[1];
    if (!round) throw new Error("Fixture is missing round two");
    round.holes[0].score = null;
    input.push(corrected);
    expect(buildFactSheet(input).completion.readyForReview).toBe(false);
    corrected.players.shift();
    expect(buildFactSheet(input).completion.gaps).toContain(
      "players-missing-from-latest-snapshot",
    );
  });

  it("preserves ties without manufacturing a playoff winner", () => {
    const snapshot = source(hubertus)[1];
    const player = snapshot.players.find((p) => p.division === "Damen");
    if (!player) throw new Error("Fixture is missing women");
    const tied = {
      ...structuredClone(player),
      playerId: "tied",
      name: "Tied Player",
    };
    snapshot.players = [player, tied];
    const facts = buildFactSheet([snapshot]);
    expect(facts.divisions[0]).toMatchObject({
      winner: null,
      tiedFirst: true,
      winningMargin: null,
    });
    expect(facts.divisions[0].standings.map((p) => p.rank)).toEqual([1, 1]);
    expect(facts.completion.readyForReview).toBe(true);
    expect(facts.completion.readyForAutomaticReport).toBe(true);
  });

  it("requires expected rounds and rejects inconsistent arithmetic", () => {
    const snapshot = source(hubertus)[1];
    delete snapshot.tournament.totalRounds;
    expect(buildFactSheet([snapshot]).completion.gaps).toContain(
      "unknown-round-count",
    );
    snapshot.tournament.totalRounds = 2;
    snapshot.players[0].scoreToPar++;
    expect(buildFactSheet([snapshot]).players[0].complete).toBe(false);
    expect(() => buildFactSheet([])).toThrow("No archived snapshots");
  });
});

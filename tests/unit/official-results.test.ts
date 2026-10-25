import { describe, expect, it } from "vitest";
import { parseOfficialResults } from "@/lib/server/reporting/official-results";

describe("official result availability", () => {
  it("treats the tournament director's wait page as not finalized", () => {
    const results = parseOfficialResults(
      "<html><body><p>Ergebnisse. Bitte warten sie bis das Turnier abgeschlossen ist.</p></body></html>",
      "2712",
      "https://turniere.discgolf.de/results/2712",
      "2026-10-25T20:00:00.000Z",
    );

    expect(results).toMatchObject({
      tournamentId: "2712",
      finalized: false,
      results: [],
    });
  });
});

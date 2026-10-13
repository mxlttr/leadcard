import { describe, expect, it } from "vitest";
import {
  matchRatings,
  type RatingContext,
} from "@/lib/server/reporting/ratings";

const context: RatingContext = {
  sourceUrl: "https://api.syndikat.golf/ratings",
  retrievedAt: "2026-10-12T12:00:00Z",
  ratingDate: null,
  usage: "historical-backfill",
  eventStart: "2026-10-11T00:00:00Z",
  rawResponse: { items: [] },
  items: [
    {
      firstName: "Valentin",
      lastName: "Reitemann",
      gtNumber: 123,
      rating: 999,
      rank: 1,
      divisionRank: 1,
      division: "Junioren 18",
      club: null,
    },
  ],
  historicalValues: [
    { gtNumber: 123, date: "2026-10-01", rating: 947 },
    { gtNumber: 123, date: "2026-10-12", rating: 999 },
  ],
};
const player = {
  playerId: "open-valentin-reitemann",
  name: "  VALENTIN   Reitemann ",
};

describe("saved rating context", () => {
  it("uses dated historical values without borrowing today's ranking", () => {
    expect(matchRatings([player], context)[0]).toMatchObject({
      match: "exact-name",
      deutschlandRating: 947,
      overallRank: null,
      divisionRank: null,
      identity: { ratingDivision: "Junioren 18" },
    });
  });
  it("omits unavailable historical ratings", () => {
    expect(
      matchRatings([player], { ...context, historicalValues: [] })[0],
    ).toMatchObject({ deutschlandRating: null, overallRank: null });
  });
  it("leaves ambiguous or approximate names unresolved", () => {
    expect(
      matchRatings([player], {
        ...context,
        items: [...context.items, { ...context.items[0], gtNumber: 456 }],
      })[0].match,
    ).toBe("unresolved");
    expect(
      matchRatings([{ ...player, name: "Valentin Reitmann" }], context)[0]
        .match,
    ).toBe("unresolved");
    expect(
      matchRatings([player, { ...player, playerId: "other" }], context).every(
        (m) => m.match === "unresolved",
      ),
    ).toBe(true);
  });
  it("prefers GT numbers and reuses explicitly confirmed mappings", () => {
    expect(
      matchRatings(
        [{ ...player, name: "Changed Name", gtNumber: 123 }],
        context,
      )[0].match,
    ).toBe("gt-number");
    expect(
      matchRatings([{ ...player, name: "Changed Name" }], {
        ...context,
        confirmedMappings: [{ playerId: player.playerId, gtNumber: 123 }],
      })[0].match,
    ).toBe("confirmed-mapping");
    expect(matchRatings([{ ...player, gtNumber: 456 }], context)[0].match).toBe(
      "unresolved",
    );
  });
});

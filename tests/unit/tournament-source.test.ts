import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function buildListingRow({
  id,
  name,
  course,
  startDate,
  endDate,
}: {
  id: string;
  name: string;
  course: string;
  startDate: Date;
  endDate: Date;
}) {
  const startTimestamp = Math.floor(startDate.getTime() / 1000);
  const endTimestamp = Math.floor(endDate.getTime() / 1000);

  return `
    <tr>
      <td><a href="index.php?p=events&sp=view&id=${id}">${name}</a></td>
      <td>${course}</td>
      <td data-sort="${startTimestamp}" data-search="${startDate.toISOString().slice(0, 10)}">${startDate.toISOString().slice(0, 10)}</td>
      <td data-sort="${endTimestamp}" data-search="${endDate.toISOString().slice(0, 10)}">${endDate.toISOString().slice(0, 10)}</td>
    </tr>
  `;
}

function buildListingHtml(rows: string[]) {
  return `
    <table id="list_tournaments">
      <tbody>
        ${rows.join("")}
      </tbody>
    </table>
  `;
}

describe("tournament-source", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T10:00:00.000Z"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns active tournaments sorted live, recent, then upcoming", async () => {
    const listingHtml = buildListingHtml([
      buildListingRow({
        id: "future-far",
        name: "Far Future Open",
        course: "Hill Park",
        startDate: new Date("2026-04-05T08:00:00.000Z"),
        endDate: new Date("2026-04-06T17:00:00.000Z"),
      }),
      buildListingRow({
        id: "recent-event",
        name: "Recent Classic",
        course: "Lakeside",
        startDate: new Date("2026-03-21T08:00:00.000Z"),
        endDate: new Date("2026-03-25T17:00:00.000Z"),
      }),
      buildListingRow({
        id: "live-event",
        name: "Live Open",
        course: "City Course",
        startDate: new Date("2026-03-25T08:00:00.000Z"),
        endDate: new Date("2026-03-27T17:00:00.000Z"),
      }),
      buildListingRow({
        id: "upcoming-event",
        name: "Upcoming Invitational",
        course: "Forest Ridge",
        startDate: new Date("2026-03-30T08:00:00.000Z"),
        endDate: new Date("2026-03-31T17:00:00.000Z"),
      }),
      buildListingRow({
        id: "old-event",
        name: "Old Event",
        course: "Old Grounds",
        startDate: new Date("2026-03-10T08:00:00.000Z"),
        endDate: new Date("2026-03-11T17:00:00.000Z"),
      }),
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async () =>
          new Response(listingHtml, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );

    const tournamentSource = await import("@/lib/server/tournament-source");
    const catalog = await tournamentSource.getTournamentCatalog();

    expect(catalog.map((tournament) => tournament.id)).toEqual([
      "live-event",
      "recent-event",
      "upcoming-event",
    ]);
    expect(catalog.map((tournament) => tournament.status)).toEqual([
      "live",
      "recent",
      "upcoming",
    ]);
    await expect(tournamentSource.getDefaultTournamentId()).resolves.toBe(
      "live-event",
    );
  });
});

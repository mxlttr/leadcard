import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parsePlayerClubs,
  playerClubKey,
} from "@/lib/server/tournament-source";

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
  it("parses starter-list clubs and matches live-score name ordering", () => {
    const clubs = parsePlayerClubs(`
      <table id="starterlist">
        <thead><tr><th>Division</th><th>Spieler</th><th>Verein</th></tr></thead>
        <tbody>
          <tr><td>MPO</td><td>Weber, Jonas</td><td>Berlin Disc Golf Club</td></tr>
          <tr><td>MPO</td><td>Müller, Anna</td><td>Disc Golf Club Potsdam</td></tr>
          <tr><td>FPO</td><td>Weber, Jonas</td><td>Women Disc Golf</td></tr>
        </tbody>
      </table>
    `);

    expect(clubs[playerClubKey("MPO", "Jonas Weber")]).toBe(
      "Berlin Disc Golf Club",
    );
    expect(clubs[playerClubKey("MPO", "Anna Müller")]).toBe(
      "Disc Golf Club Potsdam",
    );
    expect(clubs[playerClubKey("FPO", "Jonas Weber")]).toBe("Women Disc Golf");
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T10:00:00.000Z"));
    vi.resetModules();
    globalThis.leadcardTournamentCatalogCache = undefined;
    globalThis.leadcardTournamentCatalogPromise = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    globalThis.leadcardTournamentCatalogCache = undefined;
    globalThis.leadcardTournamentCatalogPromise = undefined;
  });

  it("returns active tournaments sorted as live, today, recent, tomorrow, then upcoming", async () => {
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
        startDate: new Date("2026-03-26T08:00:00.000Z"),
        endDate: new Date("2026-03-26T17:00:00.000Z"),
      }),
      buildListingRow({
        id: "today-event",
        name: "Today Cup",
        course: "South Park",
        startDate: new Date("2026-03-26T08:00:00.000Z"),
        endDate: new Date("2026-03-26T17:00:00.000Z"),
      }),
      buildListingRow({
        id: "tomorrow-event",
        name: "Tomorrow Invitational",
        course: "Forest Ridge",
        startDate: new Date("2026-03-27T08:00:00.000Z"),
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

    const activeLiveHtml = `
      <table id="livescoring_">
        <thead>
          <tr><th colspan="2" class="text-end">Par</th><th class="th_hole">3</th><th class="th_hole">3</th></tr>
          <tr><th>No</th><th class="th_name">Open</th><th>1</th><th>2</th><th colspan="2">sum</th><th colspan="2">total</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>Alex Ace</td><td>2</td><td></td><td>2</td><td>-1</td><td>2</td></tr>
        </tbody>
      </table>
    `;

    const emptyTodayHtml = `
      <table id="livescoring_">
        <thead>
          <tr><th colspan="2" class="text-end">Par</th></tr>
          <tr><th>No</th><th class="th_name">Open</th></tr>
        </thead>
        <tbody>
          <tr><td colspan="25"></td></tr>
        </tbody>
      </table>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("sp=live&id=live-event")) {
          return new Response(activeLiveHtml, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }

        if (url.includes("sp=live&id=today-event")) {
          return new Response(emptyTodayHtml, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }

        return new Response(listingHtml, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }),
    );

    const tournamentSource = await import("@/lib/server/tournament-source");
    const catalog = await tournamentSource.getTournamentCatalog();

    expect(catalog.map((tournament) => tournament.id)).toEqual([
      "live-event",
      "today-event",
      "recent-event",
      "tomorrow-event",
      "upcoming-event",
    ]);
    expect(catalog.map((tournament) => tournament.status)).toEqual([
      "live",
      "today",
      "recent",
      "tomorrow",
      "upcoming",
    ]);
    await expect(tournamentSource.getDefaultTournamentId()).resolves.toBe(
      "live-event",
    );
  });

  it("treats staggered tee-time starts as live once scoring has started", async () => {
    const listingHtml = buildListingHtml([
      buildListingRow({
        id: "2478",
        name: "Rolling Start Open",
        course: "North Park",
        startDate: new Date("2026-03-26T08:00:00.000Z"),
        endDate: new Date("2026-03-26T17:00:00.000Z"),
      }),
    ]);

    const staggeredLiveHtml = `
      <table id="livescoring_">
        <thead>
          <tr><th colspan="2" class="text-end">Par</th><th class="th_hole">3</th><th class="th_hole">3</th></tr>
          <tr><th>No</th><th class="th_name">Open</th><th>1</th><th>2</th><th colspan="2">sum</th><th colspan="2">total</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>Finished First Card</td><td>3</td><td>2</td><td>5</td><td>-1</td><td>5</td></tr>
          <tr><td>2</td><td>Still Waiting</td><td></td><td></td><td></td><td>0</td><td>0</td></tr>
        </tbody>
      </table>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("sp=live&id=2478")) {
          return new Response(staggeredLiveHtml, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }

        return new Response(listingHtml, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }),
    );

    const tournamentSource = await import("@/lib/server/tournament-source");
    const catalog = await tournamentSource.getTournamentCatalog();

    expect(catalog[0]).toMatchObject({
      id: "2478",
      status: "live",
    });
  });

  it("treats empty live-score shells as no live data", async () => {
    const listingHtml = buildListingHtml([
      buildListingRow({
        id: "2492",
        name: "Shell Event",
        course: "Forest Ridge",
        startDate: new Date("2026-03-29T08:00:00.000Z"),
        endDate: new Date("2026-03-29T17:00:00.000Z"),
      }),
    ]);

    const emptyLiveHtml = `
      <table id="livescoring_">
        <thead>
          <tr><th colspan="2">Par</th></tr>
          <tr><th>No</th><th class="th_name">Open</th></tr>
        </thead>
        <tbody>
          <tr style="height:20px;"><td colspan="25"></td></tr>
          <tr style="height:20px;"><td colspan="25"></td></tr>
        </tbody>
      </table>
    `;

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(listingHtml, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(emptyLiveHtml, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const tournamentSource = await import("@/lib/server/tournament-source");
    const snapshotSource = await tournamentSource.loadTournamentSnapshotSource(
      "2492",
      0,
    );

    expect(snapshotSource.tournament.id).toBe("2492");
    expect(snapshotSource.html).toBeNull();
  });

  it("reuses a fresh tournament catalog cache instead of refetching on every call", async () => {
    const listingHtml = buildListingHtml([
      buildListingRow({
        id: "recent-event",
        name: "Recent Classic",
        course: "Lakeside",
        startDate: new Date("2026-03-21T08:00:00.000Z"),
        endDate: new Date("2026-03-25T17:00:00.000Z"),
      }),
      buildListingRow({
        id: "upcoming-event",
        name: "Upcoming Invitational",
        course: "Forest Ridge",
        startDate: new Date("2026-03-30T08:00:00.000Z"),
        endDate: new Date("2026-03-31T17:00:00.000Z"),
      }),
    ]);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(listingHtml, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const tournamentSource = await import("@/lib/server/tournament-source");

    await tournamentSource.getTournamentCatalog();
    await tournamentSource.getTournamentCatalog();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares the in-flight tournament catalog request across concurrent callers", async () => {
    const listingHtml = buildListingHtml([
      buildListingRow({
        id: "recent-event",
        name: "Recent Classic",
        course: "Lakeside",
        startDate: new Date("2026-03-21T08:00:00.000Z"),
        endDate: new Date("2026-03-25T17:00:00.000Z"),
      }),
    ]);

    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const tournamentSource = await import("@/lib/server/tournament-source");
    const firstRequest = tournamentSource.getTournamentCatalog();
    const secondRequest = tournamentSource.getTournamentCatalog();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse?.(
      new Response(listingHtml, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const [firstCatalog, secondCatalog] = await Promise.all([
      firstRequest,
      secondRequest,
    ]);

    expect(firstCatalog).toEqual(secondCatalog);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

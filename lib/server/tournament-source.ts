import { load } from "cheerio";

import type { TournamentSummary } from "@/lib/types";
import { defaultMockTournamentId, mockTournamentFeeds } from "@/lib/server/mock-source";

type TournamentSourceResult = {
  tournament: TournamentSummary;
  html: string;
  nextFixtureIndex: number;
};

type TournamentSourceConfig = {
  tournament: TournamentSummary;
};

function toSummary(tournamentId: string): TournamentSummary {
  const feed = mockTournamentFeeds[tournamentId] ?? mockTournamentFeeds[defaultMockTournamentId];

  return {
    id: feed.id,
    name: feed.name,
    course: feed.course,
    roundLabel: feed.roundLabel,
  };
}

const tournamentSourceConfig: Record<string, TournamentSourceConfig> = {
  "berlin-open": {
    tournament: toSummary("berlin-open"),
  },
  "munich-masters": {
    tournament: toSummary("munich-masters"),
  },
};

function getMockTournamentCatalog() {
  return Object.values(tournamentSourceConfig).map((config) => config.tournament);
}

const LISTING_URL = "https://turniere.discgolf.de/index.php?p=events";
const LIVE_URL = "https://turniere.discgolf.de/index.php?p=events&sp=live&id=";
const ACTIVE_WINDOW_DAYS = 7;

function buildHeaders() {
  return {
    "user-agent": "leadcard-mvp/0.1",
  };
}

function dateRangeLabel(startDate: string, endDate: string) {
  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
}

async function loadDynamicTournamentCatalog(): Promise<TournamentSummary[]> {
  const response = await fetch(LISTING_URL, {
    cache: "no-store",
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch tournament listing: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  const $ = load(html);
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - ACTIVE_WINDOW_DAYS);
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + ACTIVE_WINDOW_DAYS);

  const tournaments = $("#list_tournaments tbody tr")
    .map((_, row) => {
      const cells = $(row).find("td");
      const eventLink = cells.eq(0).find("a[href*='sp=view'][href*='id=']").first();
      const href = eventLink.attr("href");

      if (!href) {
        return null;
      }

      const url = new URL(href, "https://turniere.discgolf.de/");
      const id = url.searchParams.get("id");
      const startDateSort = Number(cells.eq(2).attr("data-sort"));
      const endDateSort = Number(cells.eq(3).attr("data-sort"));

      if (!id || !startDateSort || !endDateSort) {
        return null;
      }

      const startDate = new Date(startDateSort * 1000);
      const endDate = new Date(endDateSort * 1000);

      if (endDate < windowStart || startDate > windowEnd) {
        return null;
      }

      const name = eventLink.text().replace(/\s+/g, " ").trim();
      const course = cells.eq(1).text().replace(/\s+/g, " ").trim();
      const startDateLabel =
        cells.eq(2).attr("data-search")?.trim() ?? cells.eq(2).text().trim();
      const endDateText = cells.eq(3).attr("data-search")?.trim() ?? cells.eq(3).text().trim();

      return {
        id,
        name,
        course,
        roundLabel: dateRangeLabel(startDateLabel, endDateText),
      } satisfies TournamentSummary;
    })
    .get()
    .filter((tournament): tournament is TournamentSummary => Boolean(tournament))
    .sort((a, b) => a.roundLabel.localeCompare(b.roundLabel));

  return tournaments;
}

async function loadDynamicTournamentSnapshotHtml(tournamentId: string): Promise<string | null> {
  const response = await fetch(`${LIVE_URL}${encodeURIComponent(tournamentId)}`, {
    cache: "no-store",
    headers: buildHeaders(),
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();

  return html.includes('table id="livescoring_') ? html : null;
}

export async function getTournamentCatalog() {
  try {
    const dynamicCatalog = await loadDynamicTournamentCatalog();
    return dynamicCatalog.length > 0 ? dynamicCatalog : getMockTournamentCatalog();
  } catch {
    return getMockTournamentCatalog();
  }
}

export async function getDefaultTournamentId() {
  const catalog = await getTournamentCatalog();
  return catalog[0]?.id ?? defaultMockTournamentId;
}

async function getTournamentSummary(tournamentId: string) {
  const catalog = await getTournamentCatalog();
  return (
    catalog.find((tournament) => tournament.id === tournamentId) ??
    tournamentSourceConfig[defaultMockTournamentId].tournament
  );
}

export async function loadTournamentSnapshotSource(
  tournamentId: string,
  fixtureIndex: number,
): Promise<TournamentSourceResult> {
  const dynamicHtml = await loadDynamicTournamentSnapshotHtml(tournamentId);

  if (dynamicHtml) {
    return {
      tournament: await getTournamentSummary(tournamentId),
      html: dynamicHtml,
      nextFixtureIndex: fixtureIndex,
    };
  }

  const config =
    tournamentSourceConfig[tournamentId] ?? tournamentSourceConfig[defaultMockTournamentId];
  const feed = mockTournamentFeeds[config.tournament.id];
  const safeIndex = fixtureIndex % feed.fixtures.length;

  return {
    tournament: config.tournament,
    html: feed.fixtures[safeIndex],
    nextFixtureIndex: (safeIndex + 1) % feed.fixtures.length,
  };
}

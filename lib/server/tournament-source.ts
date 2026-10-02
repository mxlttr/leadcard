import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "cheerio";
import { playerClubKey } from "@/lib/player-club";
import {
  defaultMockTournamentId,
  mockTournamentFeeds,
} from "@/lib/server/mock-source";
import type {
  PlayerSnapshot,
  TournamentStatus,
  TournamentSummary,
} from "@/lib/types";

export { normalizePlayerName, playerClubKey } from "@/lib/player-club";

type TournamentSourceResult = {
  tournament: TournamentSummary;
  html: string | null;
  playerClubs: Record<string, string>;
  registeredPlayers?: PlayerSnapshot[];
  nextFixtureIndex: number;
};

type TournamentSourceConfig = {
  tournament: TournamentSummary;
  fixtureFiles?: string[];
};

type TournamentCatalogCache = {
  tournaments: TournamentSummary[];
  cachedAt: number;
};

declare global {
  var leadcardTournamentCatalogCache: TournamentCatalogCache | undefined;
  var leadcardTournamentCatalogPromise:
    | Promise<TournamentSummary[]>
    | undefined;
  var leadcardPlayerClubsCache:
    | Map<string, { clubs: Record<string, string>; cachedAt: number }>
    | undefined;
}

function toSummary(tournamentId: string): TournamentSummary {
  const feed =
    mockTournamentFeeds[tournamentId] ??
    mockTournamentFeeds[defaultMockTournamentId];

  return {
    id: feed.id,
    name: feed.name,
    course: feed.course,
    roundLabel: feed.roundLabel,
    status: "mock",
  };
}

const tournamentSourceConfig: Record<string, TournamentSourceConfig> = {
  "berlin-open": {
    tournament: toSummary("berlin-open"),
  },
  "munich-masters": {
    tournament: toSummary("munich-masters"),
  },
  "lakers-open-2026": {
    tournament: {
      id: "lakers-open-2026",
      name: "15 Years Anniversary Lakers Open presented by Latitude 64",
      course: "Lakers Disc Golf Course",
      roundLabel: "Round 3 of 3",
      status: "mock",
    },
    fixtureFiles: [
      "snapshot-2026-09-27T09-06-39-130Z.html",
      "snapshot-2026-09-27T09-16-36-183Z.html",
      "snapshot-2026-09-27T09-37-33-575Z.html",
      "snapshot-2026-09-27T09-48-34-475Z.html",
      "snapshot-2026-09-27T09-59-35-327Z.html",
      "snapshot-2026-09-27T10-20-35-011Z.html",
      "snapshot-2026-09-27T10-30-34-762Z.html",
      "snapshot-2026-09-27T10-40-35-339Z.html",
      "snapshot-2026-09-27T10-50-35-790Z.html",
      "snapshot-2026-09-27T11-03-14-307Z.html",
    ],
  },
};

function getMockTournamentCatalog() {
  return Object.values(tournamentSourceConfig).map(
    (config) => config.tournament,
  );
}

const LISTING_URL = "https://turniere.discgolf.de/index.php?p=events";
const LIVE_URL = "https://turniere.discgolf.de/index.php?p=events&sp=live&id=";
const PLAYER_LIST_URL =
  "https://turniere.discgolf.de/index.php?p=events&sp=list-players&id=";
const ACTIVE_WINDOW_DAYS = 7;
const TOURNAMENT_CATALOG_CACHE_TTL_MS = 60_000;
const FORCE_MOCK_DATA = process.env.LEADCARD_FORCE_MOCK_DATA === "true";

function buildHeaders() {
  return {
    "user-agent": "leadcard-mvp/0.1",
  };
}

function sanitizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function parsePlayerClubs(html: string) {
  const $ = load(html);
  const clubs: Record<string, string> = {};
  const table = $("#starterlist");

  if (table.length === 0) {
    return clubs;
  }

  const headers = table
    .find("thead tr")
    .first()
    .find("th")
    .map((_, cell) => sanitizeText($(cell).text()).toLocaleLowerCase("de-DE"))
    .get();
  const divisionIndex = headers.indexOf("division");
  const playerIndex = headers.indexOf("spieler");
  const clubIndex = headers.indexOf("verein");

  if (divisionIndex < 0 || playerIndex < 0 || clubIndex < 0) {
    return clubs;
  }

  table.find("tbody tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((__, cell) => sanitizeText($(cell).text()))
      .get();
    const division = cells[divisionIndex];
    const name = cells[playerIndex];
    const club = cells[clubIndex];

    if (division && name && club) {
      clubs[playerClubKey(division, name)] = club;
    }
  });

  return clubs;
}

export function parseRegisteredPlayers(html: string, tournamentId = "") {
  const $ = load(html);
  const table = $("#starterlist");
  const headers = table
    .find("thead tr")
    .first()
    .find("th")
    .map((_, cell) => sanitizeText($(cell).text()).toLocaleLowerCase("de-DE"))
    .get();
  const divisionIndex = headers.indexOf("division");
  const playerIndex = headers.indexOf("spieler");
  const clubIndex = headers.indexOf("verein");

  if (divisionIndex < 0 || playerIndex < 0) {
    return [] as PlayerSnapshot[];
  }

  return table
    .find("tbody tr")
    .map((index, row) => {
      const cells = $(row)
        .find("td")
        .map((__, cell) => sanitizeText($(cell).text()))
        .get();
      const division = cells[divisionIndex] ?? "";
      const name = cells[playerIndex] ?? "";
      const club = clubIndex >= 0 ? cells[clubIndex] : "";

      if (!division || !name) {
        return null;
      }

      return {
        playerId: `${tournamentId}:${playerClubKey(division, name)}`,
        name,
        club: club || undefined,
        division,
        rank: index + 1,
        scoreToPar: 0,
        thru: 0,
        lastFive: [],
      } satisfies PlayerSnapshot;
    })
    .get()
    .filter(Boolean) as PlayerSnapshot[];
}

async function loadPlayerClubs(tournamentId: string) {
  if (!globalThis.leadcardPlayerClubsCache) {
    globalThis.leadcardPlayerClubsCache = new Map();
  }

  const cached = globalThis.leadcardPlayerClubsCache.get(tournamentId);
  if (
    cached &&
    Date.now() - cached.cachedAt < TOURNAMENT_CATALOG_CACHE_TTL_MS
  ) {
    return cached.clubs;
  }

  try {
    const response = await fetch(
      `${PLAYER_LIST_URL}${encodeURIComponent(tournamentId)}`,
      {
        cache: "no-store",
        headers: buildHeaders(),
      },
    );
    if (!response.ok) return cached?.clubs ?? {};
    const clubs = parsePlayerClubs(await response.text());
    globalThis.leadcardPlayerClubsCache.set(tournamentId, {
      clubs,
      cachedAt: Date.now(),
    });
    return clubs;
  } catch {
    return cached?.clubs ?? {};
  }
}

async function loadRegisteredPlayers(tournamentId: string) {
  try {
    const response = await fetch(
      `${PLAYER_LIST_URL}${encodeURIComponent(tournamentId)}`,
      { cache: "no-store", headers: buildHeaders() },
    );
    return response.ok
      ? parseRegisteredPlayers(await response.text(), tournamentId)
      : [];
  } catch {
    return [];
  }
}

function dateRangeLabel(startDate: string, endDate: string) {
  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
}

function todayKeyInBerlin(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return `${next.getUTCFullYear()}-${padDatePart(next.getUTCMonth() + 1)}-${padDatePart(next.getUTCDate())}`;
}

function parseDateKey(value: string) {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month}-${day}`;
  }

  const germanMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})/);

  if (germanMatch) {
    const [, day, month, year] = germanMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function tournamentStatusFor(
  now: Date,
  startDateKey: string,
  endDateKey: string,
): TournamentStatus {
  const todayKey = todayKeyInBerlin(now);
  const tomorrowKey = shiftDateKey(todayKey, 1);
  const dayAfterTomorrowKey = shiftDateKey(todayKey, 2);

  if (endDateKey < todayKey) {
    return "recent";
  }

  if (startDateKey >= tomorrowKey && startDateKey < dayAfterTomorrowKey) {
    return "tomorrow";
  }

  if (startDateKey >= dayAfterTomorrowKey) {
    return "upcoming";
  }

  return "today";
}

async function resolveLiveTournamentStatus(
  tournament: TournamentSummary & {
    sortStart: number;
    sortEnd: number;
  },
): Promise<
  TournamentSummary & {
    sortStart: number;
    sortEnd: number;
  }
> {
  if (tournament.status !== "today") {
    return tournament;
  }

  try {
    const html = await loadDynamicTournamentSnapshotHtml(tournament.id);

    if (!html) {
      return tournament;
    }

    const hasActiveRound = hasActiveRoundInLivePage(html);

    return {
      ...tournament,
      status: hasActiveRound ? ("live" as const) : ("today" as const),
    };
  } catch {
    return tournament;
  }
}

function hasActiveRoundInLivePage(html: string) {
  const $ = load(html);
  const tableNode = $("#livescoring_");

  if (tableNode.length === 0) {
    return false;
  }

  const sections = tableNode.children().toArray();
  const playedHolesPerPlayer: number[] = [];
  let lastHoleCount = 0;

  for (let index = 0; index < sections.length; index += 2) {
    const thead = sections[index];
    const tbody = sections[index + 1];

    if (
      !thead ||
      !tbody ||
      thead.tagName !== "thead" ||
      tbody.tagName !== "tbody"
    ) {
      continue;
    }

    const holeCount = $(thead).find("tr").first().find("th.th_hole").length;
    lastHoleCount = holeCount;

    if (holeCount === 0) {
      continue;
    }

    const rows = $(tbody).find("> tr").toArray();

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const firstCells = $(rows[rowIndex])
        .find("td")
        .toArray()
        .map((cell) => sanitizeText($(cell).text()));
      const rankCell = firstCells[0] ?? "";
      const nameCell = firstCells[1] ?? "";

      if (!rankCell || !nameCell) {
        continue;
      }

      const groupedRows: string[][] = [firstCells];
      let nextIndex = rowIndex + 1;

      while (nextIndex < rows.length) {
        const candidateCells = $(rows[nextIndex])
          .find("td")
          .toArray()
          .map((cell) => sanitizeText($(cell).text()));
        const candidateRank = candidateCells[0] ?? "";
        const candidateName = candidateCells[1] ?? "";

        if (candidateRank || candidateName) {
          break;
        }

        if (candidateCells.some((cell) => cell !== "")) {
          groupedRows.push(candidateCells);
        }

        nextIndex += 1;
      }

      const activeRow = groupedRows[groupedRows.length - 1];
      const playedHoles = activeRow
        .slice(2, 2 + holeCount)
        .filter((value) => value !== "").length;

      if (playedHoles > 0 && playedHoles < holeCount) {
        return true;
      }

      playedHolesPerPlayer.push(playedHoles);

      rowIndex = nextIndex - 1;
    }
  }

  if (playedHolesPerPlayer.length === 0 || lastHoleCount === 0) {
    return false;
  }

  const minimumPlayedHoles = Math.min(...playedHolesPerPlayer);
  const maximumPlayedHoles = Math.max(...playedHolesPerPlayer);

  return maximumPlayedHoles > 0 && minimumPlayedHoles < lastHoleCount;
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

  const baseTournaments = $("#list_tournaments tbody tr")
    .map((_, row) => {
      const cells = $(row).find("td");
      const eventLink = cells
        .eq(0)
        .find("a[href*='sp=view'][href*='id=']")
        .first();
      const href = eventLink.attr("href");

      if (!href) {
        return null;
      }

      const url = new URL(href, "https://turniere.discgolf.de/");
      const id = url.searchParams.get("id");
      const startDateSort = Number(cells.eq(2).attr("data-sort"));
      const endDateSort = Number(cells.eq(3).attr("data-sort"));
      const startDateLabel =
        cells.eq(2).attr("data-search")?.trim() ?? cells.eq(2).text().trim();
      const endDateText =
        cells.eq(3).attr("data-search")?.trim() ?? cells.eq(3).text().trim();
      const startDateKey = parseDateKey(startDateLabel);
      const endDateKey = parseDateKey(endDateText);

      if (
        !id ||
        !startDateSort ||
        !endDateSort ||
        !startDateKey ||
        !endDateKey
      ) {
        return null;
      }

      const windowStartKey = shiftDateKey(
        todayKeyInBerlin(now),
        -ACTIVE_WINDOW_DAYS,
      );
      const windowEndKey = shiftDateKey(
        todayKeyInBerlin(now),
        ACTIVE_WINDOW_DAYS,
      );

      if (endDateKey < windowStartKey || startDateKey > windowEndKey) {
        return null;
      }

      const name = eventLink.text().replace(/\s+/g, " ").trim();
      const course = cells.eq(1).text().replace(/\s+/g, " ").trim();

      return {
        id,
        name,
        course,
        roundLabel: dateRangeLabel(startDateLabel, endDateText),
        status: tournamentStatusFor(now, startDateKey, endDateKey),
        sortStart: Number(startDateKey.replaceAll("-", "")),
        sortEnd: Number(endDateKey.replaceAll("-", "")),
      };
    })
    .get()
    .filter(
      (
        tournament,
      ): tournament is TournamentSummary & {
        sortStart: number;
        sortEnd: number;
      } => Boolean(tournament),
    );

  const tournaments = await Promise.all(
    baseTournaments.map(resolveLiveTournamentStatus),
  );

  return tournaments
    .sort((a, b) => {
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Berlin",
        weekday: "short",
      }).format(now);
      const upcomingBeforePast = ["Thu", "Fri", "Sat"].includes(weekday);
      const statusOrder: Record<TournamentStatus, number> = {
        live: 0,
        today: 0,
        ...(upcomingBeforePast
          ? { tomorrow: 1, upcoming: 1, recent: 2 }
          : { recent: 1, tomorrow: 2, upcoming: 2 }),
        mock: 3,
      };

      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }

      if (a.status === "recent") {
        return b.sortEnd - a.sortEnd;
      }

      return a.sortStart - b.sortStart;
    })
    .map(
      ({ sortStart: _sortStart, sortEnd: _sortEnd, ...tournament }) =>
        tournament,
    );
}

async function loadDynamicTournamentSnapshotHtml(
  tournamentId: string,
): Promise<string | null> {
  const response = await fetch(
    `${LIVE_URL}${encodeURIComponent(tournamentId)}`,
    {
      cache: "no-store",
      headers: buildHeaders(),
    },
  );

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const $ = load(html);
  const liveTable = $("#livescoring_");

  if (liveTable.length === 0) {
    return null;
  }

  const hasPlayerRows = liveTable
    .find("tbody > tr")
    .toArray()
    .some((row) => {
      const cells = $(row).find("td");

      if (cells.length < 2) {
        return false;
      }

      const rankCell = sanitizeText(cells.eq(0).text());
      const nameCell = sanitizeText(cells.eq(1).text());

      return rankCell !== "" && nameCell !== "";
    });

  return hasPlayerRows ? html : null;
}

export async function getTournamentCatalog() {
  if (FORCE_MOCK_DATA) {
    return getMockTournamentCatalog();
  }

  const cachedCatalog = globalThis.leadcardTournamentCatalogCache;

  if (
    cachedCatalog &&
    Date.now() - cachedCatalog.cachedAt < TOURNAMENT_CATALOG_CACHE_TTL_MS
  ) {
    return cachedCatalog.tournaments;
  }

  if (globalThis.leadcardTournamentCatalogPromise) {
    return globalThis.leadcardTournamentCatalogPromise;
  }

  globalThis.leadcardTournamentCatalogPromise = (async () => {
    try {
      const dynamicCatalog = await loadDynamicTournamentCatalog();
      const tournaments =
        dynamicCatalog.length > 0 ? dynamicCatalog : getMockTournamentCatalog();
      globalThis.leadcardTournamentCatalogCache = {
        tournaments,
        cachedAt: Date.now(),
      };
      return tournaments;
    } catch {
      if (cachedCatalog) {
        return cachedCatalog.tournaments;
      }
      return getMockTournamentCatalog();
    } finally {
      globalThis.leadcardTournamentCatalogPromise = undefined;
    }
  })();

  return globalThis.leadcardTournamentCatalogPromise;
}

export async function getDefaultTournamentId() {
  const catalog = await getTournamentCatalog();
  const liveTournament = catalog.find(
    (tournament) => tournament.status === "live",
  );
  return liveTournament?.id ?? catalog[0]?.id ?? defaultMockTournamentId;
}

async function getTournamentSummary(tournamentId: string) {
  const catalog = await getTournamentCatalog();
  return (
    catalog.find((tournament) => tournament.id === tournamentId) ??
    tournamentSourceConfig[tournamentId]?.tournament ?? {
      id: tournamentId,
      name: `Tournament ${tournamentId}`,
      course: "Unknown course",
      roundLabel: "Schedule unavailable",
      status: "upcoming",
    }
  );
}

export async function loadTournamentSnapshotSource(
  tournamentId: string,
  fixtureIndex: number,
): Promise<TournamentSourceResult> {
  const dynamicHtml = FORCE_MOCK_DATA
    ? null
    : await loadDynamicTournamentSnapshotHtml(tournamentId);

  if (dynamicHtml) {
    return {
      tournament: await getTournamentSummary(tournamentId),
      html: dynamicHtml,
      playerClubs: await loadPlayerClubs(tournamentId),
      registeredPlayers: [],
      nextFixtureIndex: fixtureIndex,
    };
  }

  const config = tournamentSourceConfig[tournamentId];

  if (!config) {
    const registeredPlayers = await loadRegisteredPlayers(tournamentId);
    return {
      tournament: await getTournamentSummary(tournamentId),
      html: null,
      playerClubs: Object.fromEntries(
        registeredPlayers.flatMap((player) =>
          player.club
            ? [[playerClubKey(player.division, player.name), player.club]]
            : [],
        ),
      ),
      registeredPlayers,
      nextFixtureIndex: fixtureIndex,
    };
  }

  if (config.fixtureFiles) {
    const safeIndex = fixtureIndex % config.fixtureFiles.length;
    return {
      tournament: config.tournament,
      html: readFileSync(
        join(
          process.cwd(),
          "lib/server/fixtures/lakers-open",
          config.fixtureFiles[safeIndex],
        ),
        "utf8",
      ),
      playerClubs: {},
      registeredPlayers: [],
      nextFixtureIndex: (safeIndex + 1) % config.fixtureFiles.length,
    };
  }

  const feed = mockTournamentFeeds[config.tournament.id];
  const safeIndex = fixtureIndex % feed.fixtures.length;

  return {
    tournament: config.tournament,
    html: feed.fixtures[safeIndex],
    playerClubs: {},
    registeredPlayers: [],
    nextFixtureIndex: (safeIndex + 1) % feed.fixtures.length,
  };
}

export function getMockReplaySnapshotCount(tournamentId: string) {
  const config = tournamentSourceConfig[tournamentId];

  if (!config) {
    return 0;
  }

  if (config.fixtureFiles) {
    return config.fixtureFiles.length;
  }

  return mockTournamentFeeds[config.tournament.id]?.fixtures.length ?? 0;
}

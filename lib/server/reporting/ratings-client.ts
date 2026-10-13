import type { PlayerSnapshot } from "@/lib/types";
import { matchRatings, type RatingContext, type RatingPlayer } from "./ratings";

const API = "https://api.syndikat.golf";
const PAGE_SIZE = 100;
const timeoutMs = 10_000;

type RatingPage = {
  items: unknown[];
  total: number;
  page: number;
  pageSize: number;
};
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const numberOrNull = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const stringOrNull = (value: unknown) =>
  typeof value === "string" ? value : null;
const normalize = (value: string) =>
  value
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("de-DE");

async function fetchJson(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      `Ratings API ${response.status} for ${new URL(url).pathname}`,
    );
  return response.json() as Promise<unknown>;
}

function parseRating(value: unknown): RatingPlayer | null {
  const row = record(value);
  if (
    !row ||
    typeof row.firstName !== "string" ||
    typeof row.lastName !== "string" ||
    !Number.isSafeInteger(row.gtNumber) ||
    typeof row.division !== "string"
  )
    return null;
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    gtNumber: row.gtNumber as number,
    rating: numberOrNull(row.rating),
    rank: numberOrNull(row.rank),
    divisionRank: numberOrNull(row.divisionRank),
    division: row.division,
    club: stringOrNull(row.club),
  };
}

async function fetchAllRatings() {
  const pages: unknown[] = [];
  const items: RatingPlayer[] = [];
  let total: number | null = null;
  for (let page = 1; total === null || items.length < total; page += 1) {
    if (page > 1000)
      throw new Error("Ratings API pagination exceeded 1000 pages");
    const url = new URL("/ratings", API);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    const raw = await fetchJson(url.toString());
    const parsed = record(raw) as RatingPage | null;
    if (
      !parsed ||
      !Array.isArray(parsed.items) ||
      !Number.isSafeInteger(parsed.total) ||
      !Number.isSafeInteger(parsed.page) ||
      !Number.isSafeInteger(parsed.pageSize)
    )
      throw new Error("Unexpected ratings API response");
    if (
      parsed.page !== page ||
      parsed.pageSize < 1 ||
      (total !== null && parsed.total !== total)
    )
      throw new Error("Inconsistent ratings API pagination");
    total = parsed.total;
    pages.push(raw);
    const rows = parsed.items
      .map(parseRating)
      .filter((item): item is RatingPlayer => item !== null);
    if (rows.length !== parsed.items.length)
      throw new Error("Ratings API returned an invalid player record");
    if (
      new Set(rows.map((item) => item.gtNumber)).size !== rows.length ||
      rows.some((item) =>
        items.some((existing) => existing.gtNumber === item.gtNumber),
      )
    )
      throw new Error("Ratings API returned duplicate GT numbers");
    items.push(...rows);
    if (!rows.length && items.length < total)
      throw new Error("Ratings API returned an incomplete page");
  }
  return { items, rawResponse: { pages } };
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
) {
  const result = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        result[index] = await fn(items[index]);
      }
    }),
  );
  return result;
}

/** Fetch the currently available ratings and dated rating history for uniquely matched archived players. */
export async function fetchRatingContext(
  players: PlayerSnapshot[],
  options: {
    eventStart?: string | null;
    confirmedMappings?: RatingContext["confirmedMappings"];
  } = {},
): Promise<RatingContext> {
  const retrievedAt = new Date().toISOString();
  const { items, rawResponse: pages } = await fetchAllRatings();
  const base: RatingContext = {
    sourceUrl: `${API}/ratings`,
    retrievedAt,
    ratingDate: null,
    usage: options.eventStart ? "historical-backfill" : "event-time",
    eventStart: options.eventStart ?? null,
    items,
    historicalValues: [],
    confirmedMappings: options.confirmedMappings,
    rawResponse: pages,
  };
  const matches = matchRatings(players, base);
  const ids = [
    ...new Set(
      matches.flatMap((match) =>
        "gtNumber" in match && typeof match.gtNumber === "number"
          ? [match.gtNumber]
          : [],
      ),
    ),
  ].sort((a, b) => a - b);
  const detailResponses = await mapConcurrent(ids, 4, async (gtNumber) => {
    try {
      const raw = await fetchJson(
        new URL(`/players/${gtNumber}`, API).toString(),
      );
      return { gtNumber, raw, error: null as string | null };
    } catch (error) {
      return {
        gtNumber,
        raw: null,
        error:
          error instanceof Error ? error.message : "Unknown ratings API error",
      };
    }
  });
  const historicalValues: NonNullable<RatingContext["historicalValues"]> = [];
  for (const response of detailResponses) {
    const row = record(response.raw);
    const history =
      row && Array.isArray(row.historicRatings) ? row.historicRatings : [];
    for (const entry of history) {
      const point = record(entry);
      if (
        point &&
        typeof point.date === "string" &&
        Number.isFinite(Date.parse(point.date)) &&
        typeof point.rating === "number" &&
        Number.isFinite(point.rating)
      ) {
        historicalValues.push({
          gtNumber: response.gtNumber,
          date: point.date,
          rating: point.rating,
        });
      }
    }
  }
  historicalValues.sort(
    (a, b) =>
      a.gtNumber - b.gtNumber ||
      a.date.localeCompare(b.date) ||
      a.rating - b.rating,
  );
  return {
    ...base,
    retrievedAt: new Date().toISOString(),
    historicalValues,
    rawResponse: { ratings: pages, playerDetails: detailResponses },
  };
}

export function ratingContextStatus(context: RatingContext) {
  const details = record(context.rawResponse);
  const playerDetails =
    details && Array.isArray(details.playerDetails)
      ? details.playerDetails
      : [];
  return {
    ratingItems: context.items.length,
    ratingDate: context.ratingDate,
    playerProfilesFetched: playerDetails.filter(
      (item) => record(item)?.raw !== null,
    ).length,
    playerProfileErrors: playerDetails.flatMap((item) => {
      const row = record(item);
      return typeof row?.error === "string"
        ? [{ gtNumber: row.gtNumber, error: row.error }]
        : [];
    }),
  };
}

export function exactNameCandidateCount(
  players: PlayerSnapshot[],
  items: RatingPlayer[],
) {
  return players.reduce(
    (count, player) =>
      count +
      Number(
        items.filter(
          (item) =>
            normalize(`${item.firstName} ${item.lastName}`) ===
            normalize(player.name),
        ).length === 1,
      ),
    0,
  );
}

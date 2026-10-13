import type { PlayerSnapshot } from "@/lib/types";

export type RatingPlayer = {
  firstName: string;
  lastName: string;
  gtNumber: number;
  rating: number | null;
  rank: number | null;
  divisionRank: number | null;
  division: string;
  club: string | null;
};

/** A saved response, including its actual dates, travels with every fact sheet. */
export type RatingContext = {
  sourceUrl: string;
  retrievedAt: string;
  ratingDate: string | null;
  usage: "event-time" | "historical-backfill";
  eventStart: string | null;
  items: RatingPlayer[];
  historicalValues?: { gtNumber: number; date: string; rating: number }[];
  confirmedMappings?: { playerId: string; gtNumber: number }[];
  rawResponse: unknown;
};

const normalize = (value: string) =>
  value
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("de-DE");

export function matchRatings(
  players: (Pick<PlayerSnapshot, "playerId" | "name" | "club"> & {
    gtNumber?: number;
  })[],
  context: RatingContext,
) {
  if (
    !Number.isFinite(Date.parse(context.retrievedAt)) ||
    (context.eventStart !== null &&
      !Number.isFinite(Date.parse(context.eventStart))) ||
    (context.ratingDate !== null &&
      !Number.isFinite(Date.parse(context.ratingDate)))
  )
    throw new Error("Invalid rating context dates");
  const names = players.map((p) => normalize(p.name));
  return [...players]
    .sort((a, b) =>
      a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0,
    )
    .map((player) => {
      const mappings =
        context.confirmedMappings?.filter(
          (m) => m.playerId === player.playerId,
        ) ?? [];
      const gtNumber =
        player.gtNumber ??
        (mappings.length === 1 ? mappings[0].gtNumber : undefined);
      const name = normalize(player.name);
      const candidates =
        gtNumber !== undefined
          ? context.items.filter((r) => r.gtNumber === gtNumber)
          : names.filter((n) => n === name).length === 1 &&
              mappings.length === 0
            ? context.items.filter(
                (r) => normalize(`${r.firstName} ${r.lastName}`) === name,
              )
            : [];
      const matched = candidates.length === 1 ? candidates[0] : null;
      if (!matched)
        return { playerId: player.playerId, match: "unresolved" as const };
      const historical = context.historicalValues
        ?.filter(
          (v) =>
            v.gtNumber === matched.gtNumber &&
            Number.isFinite(v.rating) &&
            Number.isFinite(Date.parse(v.date)) &&
            context.eventStart !== null &&
            Date.parse(v.date) < Date.parse(context.eventStart),
        )
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      const savedPreEvent =
        context.ratingDate !== null &&
        context.eventStart !== null &&
        Date.parse(context.ratingDate) < Date.parse(context.eventStart);
      const useHistorical =
        context.usage === "historical-backfill" && !savedPreEvent;
      const value = useHistorical ? historical?.[0] : null;
      return {
        playerId: player.playerId,
        match:
          player.gtNumber !== undefined
            ? "gt-number"
            : gtNumber !== undefined
              ? "confirmed-mapping"
              : "exact-name",
        gtNumber: matched.gtNumber,
        clubAgrees:
          player.club && matched.club
            ? normalize(player.club) === normalize(matched.club)
            : null,
        // Identity metadata reflects the saved response, not necessarily historical membership.
        identity: {
          ratingDivision: matched.division,
          club: matched.club,
          retrievedAt: context.retrievedAt,
        },
        deutschlandRating: useHistorical
          ? (value?.rating ?? null)
          : matched.rating,
        ratingDate: useHistorical ? (value?.date ?? null) : context.ratingDate,
        overallRank: useHistorical ? null : matched.rank,
        divisionRank: useHistorical ? null : matched.divisionRank,
        temporalContext: useHistorical
          ? "dated-historical-value-no-historical-rank"
          : savedPreEvent
            ? "dated-pre-event-ranking"
            : "ranking-available-at-retrieval-date-unknown-or-post-event",
      };
    });
}

export function buildRatingComparisons(
  facts: {
    divisions: {
      division: string;
      complete: boolean;
      winner: string | null;
      standings: {
        playerId: string;
        rank: number;
        scoreToPar: number | null;
      }[];
    }[];
  },
  matches: ReturnType<typeof matchRatings>,
) {
  const byPlayer = new Map(matches.map((match) => [match.playerId, match]));
  return facts.divisions.map((division) => {
    const standings = division.complete ? division.standings : [];
    const attached = standings.flatMap((standing) => {
      const rating = byPlayer.get(standing.playerId);
      return rating &&
        "deutschlandRating" in rating &&
        typeof rating.deutschlandRating === "number" &&
        rating.ratingDate
        ? [
            {
              ...standing,
              rating: rating.deutschlandRating,
              ratingDate: rating.ratingDate,
              overallRank: rating.overallRank,
              divisionRank: rating.divisionRank,
            },
          ]
        : [];
    });
    const dates = new Set(attached.map((entry) => entry.ratingDate));
    const comparable = attached.length > 0 && dates.size === 1;
    const completeCoverage =
      division.complete && attached.length === standings.length && comparable;
    const winner = division.winner
      ? attached.find((entry) => entry.playerId === division.winner)
      : undefined;
    return {
      division: division.division,
      ratingCoverage: {
        matchedWithDatedRating: attached.length,
        fieldSize: standings.length,
        complete: completeCoverage,
        ratingDate: comparable ? attached[0].ratingDate : null,
      },
      topRankedWinner:
        winner?.overallRank === 1
          ? {
              playerId: winner.playerId,
              overallRank: winner.overallRank,
              divisionRank: winner.divisionRank,
              ratingDate: winner.ratingDate,
            }
          : null,
      winnerBeatHigherRatedOpponents: winner
        ? attached
            .filter(
              (opponent) =>
                opponent.playerId !== winner.playerId &&
                opponent.ratingDate === winner.ratingDate &&
                opponent.rating > winner.rating,
            )
            .map((opponent) => ({
              playerId: opponent.playerId,
              rating: opponent.rating,
              ratingDate: opponent.ratingDate,
              ratingDifference: opponent.rating - winner.rating,
            }))
            .sort(
              (a, b) =>
                b.ratingDifference - a.ratingDifference ||
                (a.playerId < b.playerId ? -1 : 1),
            )
        : [],
      highestRatedInFullyMatchedField: completeCoverage
        ? [...attached]
            .sort(
              (a, b) =>
                b.rating - a.rating || (a.playerId < b.playerId ? -1 : 1),
            )
            .slice(0, 1)
            .map((entry) => ({
              playerId: entry.playerId,
              rating: entry.rating,
              ratingDate: entry.ratingDate,
            }))
        : null,
    };
  });
}

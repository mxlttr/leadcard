import { createHash } from "node:crypto";
import type {
  PlayerRound,
  PlayerSnapshot,
  TournamentSummary,
} from "@/lib/types";

export const RATINGS_FACT_SHEET_VERSION = "3";

type RatingsRow = {
  firstName: string;
  lastName: string;
  gtNumber: number;
  rating: number | null;
  rank: number | null;
  divisionRank: number | null;
  division: string;
  club: string | null;
};

export type RatingsListSnapshot = {
  id: number;
  capturedAt: string;
  contentHash: string;
  payload: string;
};

type WeekendEvent = {
  tournament: TournamentSummary;
  players: Pick<
    PlayerSnapshot,
    "playerId" | "name" | "division" | "club" | "rounds"
  >[];
};

const normalize = (value: string) =>
  value
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("de-DE");

function parseRows(snapshot: RatingsListSnapshot): RatingsRow[] {
  const payload = JSON.parse(snapshot.payload) as { items?: unknown };
  if (!Array.isArray(payload.items))
    throw new Error("Ratings snapshot has no player list");
  return payload.items.filter((item): item is RatingsRow => {
    if (!item || typeof item !== "object") return false;
    const row = item as Partial<RatingsRow>;
    return (
      typeof row.firstName === "string" &&
      typeof row.lastName === "string" &&
      Number.isSafeInteger(row.gtNumber) &&
      typeof row.division === "string"
    );
  });
}

function scorecardEvidence(rounds: PlayerRound[] | undefined) {
  return (rounds ?? []).map((round) => ({
    roundNumber: round.order,
    label: round.label,
    scoreToPar: round.scoreToPar,
    holesPlayed: round.holes.filter((hole) => hole.score !== null).length,
  }));
}

/** Build verifiable rating-change facts for players recorded in weekend events. */
export function buildRatingsFactSheet(
  previousSnapshot: RatingsListSnapshot,
  currentSnapshot: RatingsListSnapshot,
  events: WeekendEvent[],
) {
  if (previousSnapshot.id >= currentSnapshot.id)
    throw new Error("Ratings snapshots must be in chronological order");
  if (!events.length)
    throw new Error("No archived tournaments found for the weekend");
  const previousRows = parseRows(previousSnapshot);
  const currentRows = parseRows(currentSnapshot);
  const previousById = new Map(previousRows.map((row) => [row.gtNumber, row]));
  const currentById = new Map(currentRows.map((row) => [row.gtNumber, row]));
  const previousNames = new Map<string, RatingsRow[]>();
  for (const row of currentRows) {
    const key = normalize(`${row.firstName} ${row.lastName}`);
    previousNames.set(key, [...(previousNames.get(key) ?? []), row]);
  }
  const eventPlayers = new Map<
    number,
    {
      events: {
        tournament: TournamentSummary;
        tournamentDivision: string;
        scorecards: ReturnType<typeof scorecardEvidence>;
      }[];
    }
  >();
  const unmatchedPlayers: {
    tournamentId: string;
    playerId: string;
    name: string;
  }[] = [];
  for (const event of events) {
    for (const player of event.players) {
      const candidates = previousNames.get(normalize(player.name)) ?? [];
      if (candidates.length !== 1) {
        unmatchedPlayers.push({
          tournamentId: event.tournament.id,
          playerId: player.playerId,
          name: player.name,
        });
        continue;
      }
      const row = candidates[0];
      const existing = eventPlayers.get(row.gtNumber) ?? { events: [] };
      existing.events.push({
        tournament: event.tournament,
        tournamentDivision: player.division,
        scorecards: scorecardEvidence(player.rounds),
      });
      eventPlayers.set(row.gtNumber, existing);
    }
  }
  const players = [...eventPlayers.entries()]
    .flatMap(([gtNumber, entry]) => {
      const before = previousById.get(gtNumber);
      const after = currentById.get(gtNumber);
      if (!before || !after || before.rating === null || after.rating === null)
        return [];
      const sameDivision = before.division === after.division;
      const snapshotRatingChange = after.rating - before.rating;
      const ratingBefore = before.rating;
      const ratingAfter = after.rating;
      const ratingChange = ratingAfter - ratingBefore;
      return [
        {
          gtNumber,
          name: `${after.firstName} ${after.lastName}`,
          club: after.club,
          playedEvents: entry.events.map(
            ({ tournament, tournamentDivision, scorecards }) => ({
              tournamentId: tournament.id,
              name: tournament.name,
              tournamentDivision,
              startDate: tournament.startDate ?? null,
              endDate: tournament.endDate ?? null,
              scorecardEvidence: scorecards,
            }),
          ),
          ratingDivisionBefore: before.division,
          ratingDivisionAfter: after.division,
          ratingBefore,
          ratingAfter,
          ratingChange,
          ratingChangeSource: "ratings-list-snapshots",
          snapshotRatingBefore: before.rating,
          snapshotRatingAfter: after.rating,
          snapshotRatingChange,
          divisionRankBefore: sameDivision ? before.divisionRank : null,
          divisionRankAfter: sameDivision ? after.divisionRank : null,
          divisionRankChange:
            sameDivision &&
            before.divisionRank !== null &&
            after.divisionRank !== null
              ? before.divisionRank - after.divisionRank
              : null,
          rankDivisionChanged: !sameDivision,
        },
      ];
    })
    .sort((a, b) => b.ratingChange - a.ratingChange || a.gtNumber - b.gtNumber);
  const divisions = [
    ...new Set(players.map((player) => player.ratingDivisionAfter)),
  ].sort();
  const byDivision = divisions.map((division) => {
    const field = players.filter(
      (player) => player.ratingDivisionAfter === division,
    );
    const bestGain = Math.max(...field.map((player) => player.ratingChange));
    const largestLoss = Math.min(...field.map((player) => player.ratingChange));
    return {
      division,
      playerCount: field.length,
      largestRatingGains:
        bestGain > 0
          ? field
              .filter((player) => player.ratingChange === bestGain)
              .map(
                ({
                  gtNumber,
                  name,
                  ratingChange,
                  ratingBefore,
                  ratingAfter,
                }) => ({
                  gtNumber,
                  name,
                  ratingChange,
                  ratingBefore,
                  ratingAfter,
                }),
              )
          : [],
      largestRatingLosses:
        largestLoss < 0
          ? field
              .filter((player) => player.ratingChange === largestLoss)
              .map(
                ({
                  gtNumber,
                  name,
                  ratingChange,
                  ratingBefore,
                  ratingAfter,
                }) => ({
                  gtNumber,
                  name,
                  ratingChange,
                  ratingBefore,
                  ratingAfter,
                }),
              )
          : [],
      top20Entries: field
        .filter(
          (player) =>
            player.divisionRankBefore !== null &&
            player.divisionRankAfter !== null &&
            player.divisionRankBefore > 20 &&
            player.divisionRankAfter <= 20,
        )
        .map(
          ({
            gtNumber,
            name,
            divisionRankBefore,
            divisionRankAfter,
            ratingChange,
          }) => ({
            gtNumber,
            name,
            divisionRankBefore,
            divisionRankAfter,
            ratingChange,
          }),
        ),
      top10Entries: field
        .filter(
          (player) =>
            player.divisionRankBefore !== null &&
            player.divisionRankAfter !== null &&
            player.divisionRankBefore > 10 &&
            player.divisionRankAfter <= 10,
        )
        .map(
          ({
            gtNumber,
            name,
            divisionRankBefore,
            divisionRankAfter,
            ratingChange,
          }) => ({
            gtNumber,
            name,
            divisionRankBefore,
            divisionRankAfter,
            ratingChange,
          }),
        ),
    };
  });
  const facts = {
    schemaVersion: RATINGS_FACT_SHEET_VERSION,
    provenance: {
      previousSnapshot: {
        id: previousSnapshot.id,
        capturedAt: previousSnapshot.capturedAt,
        contentHash: previousSnapshot.contentHash,
      },
      currentSnapshot: {
        id: currentSnapshot.id,
        capturedAt: currentSnapshot.capturedAt,
        contentHash: currentSnapshot.contentHash,
      },
      events: events.map(({ tournament }) => ({
        id: tournament.id,
        name: tournament.name,
        startDate: tournament.startDate ?? null,
        endDate: tournament.endDate ?? null,
      })),
      archivedScorecardRoundsUsed: events.reduce(
        (count, event) =>
          count +
          event.players.reduce(
            (sum, player) => sum + (player.rounds?.length ?? 0),
            0,
          ),
        0,
      ),
    },
    coverage: {
      weekendPlayerCount: events.reduce(
        (count, event) => count + event.players.length,
        0,
      ),
      uniquelyMatchedCount: eventPlayers.size,
      withComparableRatings: players.length,
      unmatchedPlayers: unmatchedPlayers.sort(
        (a, b) =>
          a.tournamentId.localeCompare(b.tournamentId) ||
          a.playerId.localeCompare(b.playerId),
      ),
      excludedUnmatchedCount: unmatchedPlayers.length,
      note: "Rating change is the observed difference between these snapshots. It can include older rounds leaving the rolling rating window. Rank changes can also reflect rating changes by other players.",
    },
    completion: {
      readyForReview: players.length > 0,
      gaps: [
        ...(players.length ? [] : ["no-weekend-player-rating-comparisons"]),
      ],
    },
    players,
    divisions: byDivision,
  };
  return {
    ...facts,
    contentHash: createHash("sha256")
      .update(JSON.stringify(facts))
      .digest("hex"),
  };
}

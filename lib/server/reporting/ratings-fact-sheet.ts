import { createHash } from "node:crypto";
import type { PlayerSnapshot, TournamentSummary } from "@/lib/types";
import { fetchPlayerRatingProfiles } from "./ratings-client";

export const RATINGS_FACT_SHEET_VERSION = "1";

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
  players: Pick<PlayerSnapshot, "playerId" | "name" | "division" | "club">[];
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

function profileEvent(profile: unknown, tournament: TournamentSummary) {
  if (!profile || typeof profile !== "object") return null;
  const record = profile as { tournaments?: unknown };
  if (!Array.isArray(record.tournaments)) return null;
  const matches = record.tournaments.filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const event = entry as Record<string, unknown>;
    const sameId = String(event.tournamentId ?? "") === tournament.id;
    const sameDates =
      event.startDate === tournament.startDate &&
      event.endDate === tournament.endDate;
    const sameName =
      typeof event.name === "string" &&
      normalize(event.name) === normalize(tournament.name);
    return sameId || (sameDates && sameName);
  });
  if (matches.length !== 1) return null;
  const event = matches[0] as Record<string, unknown>;
  const rounds = Array.isArray(event.rounds)
    ? event.rounds.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const round = value as Record<string, unknown>;
        if (typeof round.rating !== "number" || !Number.isFinite(round.rating))
          return [];
        return [
          {
            roundNumber:
              typeof round.roundNumber === "number" ? round.roundNumber : null,
            rating: round.rating,
            division:
              typeof round.division === "string" ? round.division : null,
            holes: typeof round.holes === "number" ? round.holes : null,
            includedInRating:
              typeof round.inRating === "boolean" ? round.inRating : null,
          },
        ];
      })
    : [];
  return {
    tournamentId: String(event.tournamentId ?? tournament.id),
    tournamentName:
      typeof event.name === "string" ? event.name : tournament.name,
    rounds: rounds.sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0)),
  };
}

function profileRatingHistory(profile: unknown, capturedAt: string) {
  if (!profile || typeof profile !== "object") return null;
  const history = (profile as { historicRatings?: unknown }).historicRatings;
  if (!Array.isArray(history)) return null;
  const cutoff = capturedAt.slice(0, 10);
  const points = history
    .flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const point = value as Record<string, unknown>;
      if (
        typeof point.date !== "string" ||
        point.date > cutoff ||
        !Number.isFinite(Date.parse(point.date)) ||
        typeof point.rating !== "number" ||
        !Number.isFinite(point.rating)
      )
        return [];
      return [{ date: point.date, rating: point.rating }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const current = points.at(-1);
  const previous = points.at(-2);
  if (!current) return null;
  return {
    previous,
    current,
    change: previous ? current.rating - previous.rating : null,
  };
}

/** Build verifiable rating-change facts for players recorded in weekend events. */
export async function buildRatingsFactSheet(
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
      });
      eventPlayers.set(row.gtNumber, existing);
    }
  }
  const profiles = await fetchPlayerRatingProfiles([...eventPlayers.keys()]);
  const profilesById = new Map(profiles.map((item) => [item.gtNumber, item]));
  const players = [...eventPlayers.entries()]
    .flatMap(([gtNumber, entry]) => {
      const before = previousById.get(gtNumber);
      const after = currentById.get(gtNumber);
      if (!before || !after || before.rating === null || after.rating === null)
        return [];
      const sameDivision = before.division === after.division;
      const profile = profilesById.get(gtNumber);
      const datedRatingHistory = profileRatingHistory(
        profile?.profile,
        currentSnapshot.capturedAt,
      );
      const snapshotRatingChange = after.rating - before.rating;
      const hasDatedComparison = datedRatingHistory?.previous !== undefined;
      const ratingBefore = hasDatedComparison
        ? (datedRatingHistory?.previous?.rating ?? before.rating)
        : before.rating;
      const ratingAfter = hasDatedComparison
        ? (datedRatingHistory?.current.rating ?? after.rating)
        : after.rating;
      const ratingChange = ratingAfter - ratingBefore;
      return [
        {
          gtNumber,
          name: `${after.firstName} ${after.lastName}`,
          club: after.club,
          playedEvents: entry.events.map(
            ({ tournament, tournamentDivision }) => ({
              tournamentId: tournament.id,
              name: tournament.name,
              tournamentDivision,
              startDate: tournament.startDate ?? null,
              endDate: tournament.endDate ?? null,
              profileEvidence: profileEvent(profile?.profile, tournament),
            }),
          ),
          ratingDivisionBefore: before.division,
          ratingDivisionAfter: after.division,
          ratingBefore,
          ratingAfter,
          ratingChange,
          ratingChangeSource: hasDatedComparison
            ? "dated-player-history"
            : "rounded-rating-list-snapshots",
          snapshotRatingBefore: before.rating,
          snapshotRatingAfter: after.rating,
          snapshotRatingChange,
          datedRatingHistory,
          divisionRankBefore: sameDivision ? before.divisionRank : null,
          divisionRankAfter: sameDivision ? after.divisionRank : null,
          divisionRankChange:
            sameDivision &&
            before.divisionRank !== null &&
            after.divisionRank !== null
              ? before.divisionRank - after.divisionRank
              : null,
          rankDivisionChanged: !sameDivision,
          profileError: profile ? profile.error : "Player profile unavailable",
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
      playerProfilesFetched: profiles.length,
      playerProfileErrors: profiles
        .filter((profile) => profile.error)
        .map(({ gtNumber, error }) => ({ gtNumber, error })),
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
      note: "Rating change is the observed difference between these snapshots. It can include older rounds leaving the rolling rating window. Rank changes can also reflect rating changes by other players.",
    },
    completion: {
      readyForReview: players.length > 0 && unmatchedPlayers.length === 0,
      gaps: [
        ...(players.length ? [] : ["no-weekend-player-rating-comparisons"]),
        ...(unmatchedPlayers.length
          ? ["weekend-players-unmatched-by-name"]
          : []),
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

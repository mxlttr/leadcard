import { createPlayerDelta, createRecentUpdates } from "@/lib/server/diff";
import type {
  LeaderboardPlayer,
  PlayerSnapshot,
  RecentUpdate,
} from "@/lib/types";

export const UPDATE_LOGIC_VERSION = "v1";

export function sortPlayers(players: LeaderboardPlayer[]) {
  return [...players].sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }

    return a.name.localeCompare(b.name);
  });
}

export function divisionsWithMoreThanThreePlayers(
  players: Array<Pick<PlayerSnapshot, "division">>,
) {
  const counts = new Map<string, number>();

  for (const player of players) {
    counts.set(player.division, (counts.get(player.division) ?? 0) + 1);
  }

  return new Set(
    [...counts].filter(([, count]) => count > 3).map(([division]) => division),
  );
}

export function toLeaderboardPlayers(
  previousPlayers: PlayerSnapshot[],
  currentPlayers: PlayerSnapshot[],
  createdAt: string,
) {
  const eligibleDivisions = divisionsWithMoreThanThreePlayers(currentPlayers);
  const previousById = new Map(
    previousPlayers.map((player) => [player.playerId, player]),
  );
  const biggestMoverByDivision = new Map<string, PlayerSnapshot>();
  for (const player of currentPlayers) {
    const previous = previousById.get(player.playerId);
    const gain = previous ? previous.rank - player.rank : 0;
    if (gain < 3 || !previous || player.scoreToPar >= previous.scoreToPar) {
      continue;
    }

    const currentBiggest = biggestMoverByDivision.get(player.division);
    const currentBiggestPrevious = currentBiggest
      ? previousById.get(currentBiggest.playerId)
      : undefined;
    const currentBiggestGain =
      currentBiggest && currentBiggestPrevious
        ? currentBiggestPrevious.rank - currentBiggest.rank
        : 0;
    if (
      gain > currentBiggestGain ||
      (gain === currentBiggestGain &&
        (player.rank < (currentBiggest?.rank ?? Number.POSITIVE_INFINITY) ||
          (currentBiggest &&
            player.rank === currentBiggest.rank &&
            player.name.localeCompare(currentBiggest.name) < 0)))
    ) {
      biggestMoverByDivision.set(player.division, player);
    }
  }
  const updates: RecentUpdate[] = [];

  const players = sortPlayers(
    currentPlayers.map((player) => {
      const previous = previousById.get(player.playerId);
      const tiedForLead = currentPlayers.some(
        (candidate) =>
          candidate.playerId !== player.playerId &&
          candidate.division === player.division &&
          candidate.rank === 1 &&
          candidate.scoreToPar === player.scoreToPar,
      );
      const divisionPrevious = previousPlayers.filter(
        (candidate) => candidate.division === player.division,
      );
      const divisionCurrent = currentPlayers.filter(
        (candidate) => candidate.division === player.division,
      );
      const previousLeadScore = Math.min(
        ...divisionPrevious.map((candidate) => candidate.scoreToPar),
      );
      const currentLeadScore = Math.min(
        ...divisionCurrent.map((candidate) => candidate.scoreToPar),
      );
      const strokesCloserToLead =
        previous && previousLeadScore !== Infinity
          ? player.scoreToPar - currentLeadScore <
            previous.scoreToPar - previousLeadScore
            ? previous.scoreToPar -
              previousLeadScore -
              (player.scoreToPar - currentLeadScore)
            : 0
          : 0;
      const playerUpdates = eligibleDivisions.has(player.division)
        ? createRecentUpdates(previous, player, createdAt, {
            tiedForLead,
            biggestMover:
              biggestMoverByDivision.get(player.division)?.playerId ===
              player.playerId,
            strokesCloserToLead,
          })
        : [];

      updates.push(...playerUpdates);

      return {
        ...player,
        delta: createPlayerDelta(previous, player),
        latestUpdate: playerUpdates[0] ?? null,
      };
    }),
  );

  return { players, updates };
}

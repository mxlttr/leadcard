import {
  createPlayerDelta,
  createRecentUpdates,
  createTournamentMilestoneUpdate,
} from "@/lib/server/diff";
import type {
  LeaderboardPlayer,
  PlayerSnapshot,
  RecentUpdate,
  TournamentSummary,
} from "@/lib/types";

export const UPDATE_LOGIC_VERSION = "v2";

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
  tournament?: TournamentSummary,
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
      const divisionRoundComplete = divisionCurrent.every(
        (candidate) => candidate.thru === "F",
      );
      const secondPlaceScore = Math.min(
        ...divisionCurrent
          .filter((candidate) => candidate.playerId !== player.playerId)
          .map((candidate) => candidate.scoreToPar),
      );
      const leadMargin =
        player.rank === 1 && secondPlaceScore !== Infinity
          ? secondPlaceScore - player.scoreToPar
          : undefined;
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
            finalRound:
              tournament?.totalRounds !== undefined &&
              player.rounds?.at(-1)?.order === tournament.totalRounds,
            divisionRoundComplete,
            leadMargin,
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

  if (tournament) {
    updates.push(
      ...createTournamentMilestoneUpdate(
        previousPlayers,
        currentPlayers,
        createdAt,
        tournament,
      ),
    );
  }
  updates.push(
    ...createRoundStatUpdates(previousPlayers, currentPlayers, createdAt),
  );

  return { players, updates };
}

export function createRoundStatUpdates(
  previousPlayers: PlayerSnapshot[],
  currentPlayers: PlayerSnapshot[],
  createdAt: string,
) {
  const updates: RecentUpdate[] = [];
  const roundOrders = new Set(
    currentPlayers.flatMap((player) =>
      (player.rounds ?? []).map((round) => round.order),
    ),
  );

  for (const roundOrder of roundOrders) {
    const stats = currentPlayers.flatMap((player) => {
      const round = player.rounds?.find((item) => item.order === roundOrder);
      if (!round) return [];
      return [roundStats(player, round.holes)];
    });

    if (
      stats.length !== currentPlayers.length ||
      stats.some((stat) => {
        const round = stat.player.rounds?.find(
          (item) => item.order === roundOrder,
        );
        return round?.thru !== "F" && stat.player.thru !== "F";
      })
    ) {
      continue;
    }

    const previousStats = previousPlayers.flatMap((player) => {
      const round = player.rounds?.find((item) => item.order === roundOrder);
      return round ? [roundStats(player, round.holes)] : [];
    });
    const previousRoundComplete =
      previousStats.length === previousPlayers.length &&
      previousStats.every((stat) => {
        const round = stat.player.rounds?.find(
          (item) => item.order === roundOrder,
        );
        return round?.thru === "F" || stat.player.thru === "F";
      });

    const mostBirdies = Math.max(...stats.map((stat) => stat.birdies));
    const birdieLeaders = stats.filter((stat) => stat.birdies === mostBirdies);
    const previousMostBirdies = Math.max(
      0,
      ...previousStats.map((stat) => stat.birdies),
    );
    const previousBirdieLeaders = previousStats.filter(
      (stat) => stat.birdies === previousMostBirdies,
    );
    const fewestBogeys = Math.min(...stats.map((stat) => stat.bogeys));
    const bogeyLeaders = stats.filter((stat) => stat.bogeys === fewestBogeys);
    const bogeyLeader = bogeyLeaders.length === 1 ? bogeyLeaders[0] : null;
    const previousFewestBogeys = previousStats.length
      ? Math.min(...previousStats.map((stat) => stat.bogeys))
      : null;
    const previousBogeyLeaders = previousStats.filter(
      (stat) => stat.bogeys === previousFewestBogeys,
    );

    const birdieSignature =
      mostBirdies > 0
        ? `${mostBirdies}:${birdieLeaders
            .map((stat) => stat.player.playerId)
            .sort()
            .join(",")}`
        : "none";
    const previousBirdieSignature =
      previousMostBirdies > 0
        ? `${previousMostBirdies}:${previousBirdieLeaders
            .map((stat) => stat.player.playerId)
            .sort()
            .join(",")}`
        : "none";
    const bogeySignature = bogeyLeader
      ? `${fewestBogeys}:${bogeyLeader.player.playerId}`
      : "none";
    const previousBogeySignature =
      previousBogeyLeaders.length === 1 && previousFewestBogeys !== null
        ? `${previousFewestBogeys}:${previousBogeyLeaders[0].player.playerId}`
        : "none";

    if (
      previousRoundComplete &&
      birdieSignature === previousBirdieSignature &&
      bogeySignature === previousBogeySignature
    ) {
      continue;
    }
    if (mostBirdies === 0 && !bogeyLeader) continue;

    const representative = birdieLeaders[0] ?? bogeyLeader;
    if (!representative) continue;
    updates.push({
      id: `round-summary:${roundOrder}:${birdieSignature}:${bogeySignature}:${createdAt}`,
      playerId: representative.player.playerId,
      playerName: representative.player.name,
      division: "",
      text: "",
      kind: "round_stats_summary",
      importance: "medium",
      tone: "positive",
      round: roundOrder,
      ...(mostBirdies > 0
        ? {
            statCount: mostBirdies,
            statLeaders: birdieLeaders.map((stat) => stat.player.name),
          }
        : {}),
      ...(bogeyLeader
        ? {
            bogeyLeaderName: bogeyLeader.player.name,
            bogeyCount: fewestBogeys,
          }
        : {}),
      holesPlayed: representative.holesPlayed,
      createdAt,
    });
  }

  return updates;
}

function roundStats(
  player: PlayerSnapshot,
  holes: NonNullable<PlayerSnapshot["rounds"]>[number]["holes"],
) {
  return {
    player,
    birdies: holes.filter((hole) => hole.relativeToPar === -1).length,
    bogeys: holes.filter((hole) => hole.relativeToPar === 1).length,
    holesPlayed: holes.filter((hole) => hole.relativeToPar !== null).length,
  };
}

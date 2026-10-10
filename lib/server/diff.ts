import type {
  PlayerDelta,
  PlayerRound,
  PlayerSnapshot,
  RecentUpdate,
  UpdateImportance,
} from "@/lib/types";

function finishedHoleCount(rounds: PlayerRound[] | undefined) {
  const latestRound = rounds?.at(-1);
  return latestRound?.holes.length;
}

function thruToNumber(
  player: Pick<PlayerSnapshot, "thru" | "rounds">,
  previous: PlayerSnapshot | undefined,
) {
  if (player.thru !== "F") {
    return player.thru;
  }

  return (
    finishedHoleCount(player.rounds) ??
    finishedHoleCount(previous?.rounds) ??
    18
  );
}

export function createPlayerDelta(
  previous: PlayerSnapshot | undefined,
  current: PlayerSnapshot,
): PlayerDelta {
  if (!previous) {
    return {
      rankDelta: 0,
      scoreDelta: 0,
      thruDelta: 0,
    };
  }

  return {
    rankDelta: previous.rank - current.rank,
    scoreDelta: previous.scoreToPar - current.scoreToPar,
    thruDelta:
      thruToNumber(current, previous) - thruToNumber(previous, current),
  };
}

export function createRecentUpdate(
  previous: PlayerSnapshot | undefined,
  current: PlayerSnapshot,
  createdAt: string,
  tiedForLead = false,
): RecentUpdate | null {
  if (!previous) {
    return null;
  }

  const score = formatScore(current.scoreToPar);
  const specialHole = newlyRecordedSpecialHole(previous, current);

  if (specialHole) {
    const { hole, type } = specialHole;
    return {
      id: updateId(current, createdAt),
      playerId: current.playerId,
      playerName: current.name,
      division: current.division,
      text: `${current.name} ${type === "ace" ? "hits an ace" : "scores an eagle"} on hole ${hole}`,
      importance: "high",
      tone: "positive",
      rank: current.rank,
      previousRank: previous.rank,
      scoreToPar: current.scoreToPar,
      thru: current.thru,
      createdAt,
    };
  }

  if (previous.thru !== "F" && current.thru === "F") {
    const scoreSwing = Math.abs(previous.scoreToPar - current.scoreToPar);

    if (current.rank > 3 && scoreSwing < 3) {
      return null;
    }

    return {
      id: updateId(current, createdAt),
      playerId: current.playerId,
      playerName: current.name,
      division: current.division,
      text: `${current.name} finishes at ${score}`,
      importance: updateImportance(previous, current, "finish"),
      tone: "neutral",
      rank: current.rank,
      previousRank: previous.rank,
      scoreToPar: current.scoreToPar,
      thru: current.thru,
      createdAt,
    };
  }

  if (current.rank === 1 && previous.rank !== 1) {
    if (tiedForLead) {
      return null;
    }

    return {
      id: updateId(current, createdAt),
      playerId: current.playerId,
      playerName: current.name,
      division: current.division,
      text: `${current.name} takes the lead at ${score}`,
      importance: "high",
      tone: "positive",
      rank: current.rank,
      previousRank: previous.rank,
      scoreToPar: current.scoreToPar,
      thru: current.thru,
      createdAt,
    };
  }

  if (current.rank < previous.rank) {
    if (!isNewsworthyRankMovement(previous, current)) {
      return null;
    }

    const importance = updateImportance(previous, current, "rank-up");
    if (importance === "low") {
      return null;
    }

    return {
      id: updateId(current, createdAt),
      playerId: current.playerId,
      playerName: current.name,
      division: current.division,
      text: `${current.name} climbs ${previous.rank - current.rank} ${previous.rank - current.rank === 1 ? "spot" : "spots"} to #${current.rank} at ${score}${throughSuffix(current.thru)}`,
      importance,
      tone: "positive",
      rank: current.rank,
      previousRank: previous.rank,
      scoreToPar: current.scoreToPar,
      thru: current.thru,
      createdAt,
    };
  }

  if (current.rank > previous.rank) {
    if (!isNewsworthyRankMovement(previous, current)) {
      return null;
    }

    const importance = updateImportance(previous, current, "rank-down");
    if (importance === "low") {
      return null;
    }

    return {
      id: updateId(current, createdAt),
      playerId: current.playerId,
      playerName: current.name,
      division: current.division,
      text: `${current.name} drops ${current.rank - previous.rank} ${current.rank - previous.rank === 1 ? "spot" : "spots"} to #${current.rank} at ${score}${throughSuffix(current.thru)}`,
      importance,
      tone: "negative",
      rank: current.rank,
      previousRank: previous.rank,
      scoreToPar: current.scoreToPar,
      thru: current.thru,
      createdAt,
    };
  }

  return null;
}

export function createRecentUpdates(
  previous: PlayerSnapshot | undefined,
  current: PlayerSnapshot,
  createdAt: string,
  tiedForLead = false,
): RecentUpdate[] {
  if (!previous) {
    return [];
  }

  const update = createRecentUpdate(previous, current, createdAt, tiedForLead);
  const turkeys = newlyRecordedTurkey(previous, current);
  const updates = update ? [update] : [];

  for (const turkey of turkeys) {
    updates.push({
      id: `${updateId(current, createdAt)}:turkey:${turkey.holes.join("-")}`,
      playerId: current.playerId,
      playerName: current.name,
      division: current.division,
      text: `${current.name} scores a turkey on holes ${turkey.holes.join(", ")}`,
      importance: "high",
      tone: "positive",
      rank: current.rank,
      previousRank: previous.rank,
      scoreToPar: current.scoreToPar,
      thru: current.thru,
      createdAt,
    });
  }

  return updates;
}

function isNewsworthyRankMovement(
  previous: PlayerSnapshot,
  current: PlayerSnapshot,
) {
  return previous.rank <= 3 || current.rank <= 3;
}

function newlyRecordedTurkey(
  previous: PlayerSnapshot,
  current: PlayerSnapshot,
): Array<{ holes: number[] }> {
  const currentRound = current.rounds?.at(-1);
  if (!currentRound) {
    return [];
  }

  const previousRound = previous.rounds?.find(
    (round) => round.order === currentRound.order,
  );
  const startHole =
    findRoundStartHole(currentRound) ??
    (previousRound ? findRoundStartHole(previousRound) : null);
  if (startHole === null) {
    return [];
  }

  const playedInOrder = [
    ...currentRound.holes.filter((hole) => hole.hole >= startHole),
    ...currentRound.holes.filter((hole) => hole.hole < startHole),
  ];
  // Rotate once for the player's shotgun start. This order does not wrap again
  // from the final played hole back to the start hole.
  const previousHoles = new Map(
    (previousRound?.holes ?? []).map((hole) => [hole.hole, hole]),
  );
  const changedBirdieHoles = new Set(
    playedInOrder
      .filter((hole) => {
        const previousHole = previousHoles.get(hole.hole);
        return (
          hole.relativeToPar !== null &&
          hole.relativeToPar <= -1 &&
          (previousHole?.relativeToPar === null ||
            previousHole?.relativeToPar === undefined ||
            previousHole.relativeToPar > -1)
        );
      })
      .map((hole) => hole.hole),
  );

  if (changedBirdieHoles.size === 0) {
    return [];
  }

  const turkeyMilestones: number[][] = [];
  for (let endIndex = 0; endIndex < playedInOrder.length; endIndex += 1) {
    const endingHole = playedInOrder[endIndex];
    if (
      !changedBirdieHoles.has(endingHole.hole) ||
      endingHole.relativeToPar === null ||
      endingHole.relativeToPar > -1
    ) {
      continue;
    }

    let streakStart = endIndex;
    while (streakStart > 0) {
      const previousHole = playedInOrder[streakStart - 1];
      if (
        previousHole.relativeToPar === null ||
        previousHole.relativeToPar > -1
      ) {
        break;
      }
      streakStart -= 1;
    }

    const streakLength = endIndex - streakStart + 1;
    if (streakLength >= 3 && streakLength % 3 === 0) {
      turkeyMilestones.push(
        playedInOrder
          .slice(endIndex - 2, endIndex + 1)
          .map((hole) => hole.hole),
      );
    }
  }

  if (turkeyMilestones.length === 0) {
    return [];
  }

  return turkeyMilestones.map((holes) => ({ holes }));
}

function findRoundStartHole(round: PlayerRound) {
  const holeCount = round.holes.length;
  const playedHoles = new Set(
    round.holes
      .filter((hole) => hole.relativeToPar !== null)
      .map((hole) => hole.hole),
  );

  if (playedHoles.size === 0 || playedHoles.size === holeCount) {
    return null;
  }

  const startHoles = round.holes
    .filter((hole) => {
      const previousHole = hole.hole === 1 ? holeCount : hole.hole - 1;
      return playedHoles.has(hole.hole) && !playedHoles.has(previousHole);
    })
    .map((hole) => hole.hole);

  return startHoles.length === 1 ? startHoles[0] : null;
}

function newlyRecordedSpecialHole(
  previous: PlayerSnapshot,
  current: PlayerSnapshot,
) {
  const previousHoles = new Map(
    (previous.rounds?.at(-1)?.holes ?? []).map((hole) => [hole.hole, hole]),
  );
  const currentHoles = current.rounds?.at(-1)?.holes ?? [];

  for (const hole of currentHoles) {
    const previousHole = previousHoles.get(hole.hole);

    if (
      hole.relativeToPar === null ||
      (previousHole?.relativeToPar !== null &&
        previousHole?.relativeToPar !== undefined)
    ) {
      continue;
    }

    if (hole.score === 1) {
      return { hole: hole.hole, type: "ace" as const };
    }

    if (hole.relativeToPar <= -2) {
      return { hole: hole.hole, type: "eagle" as const };
    }
  }

  return null;
}

export function formatScore(scoreToPar: number) {
  if (scoreToPar === 0) {
    return "E";
  }

  return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
}

function updateId(current: PlayerSnapshot, createdAt: string) {
  return `${current.playerId}:${createdAt}:${current.rank}:${current.scoreToPar}:${current.thru}`;
}

function throughSuffix(thru: number | "F") {
  if (thru === "F") {
    return "";
  }

  return ` through ${thru}`;
}

function updateImportance(
  previous: PlayerSnapshot,
  current: PlayerSnapshot,
  kind: "finish" | "rank-up" | "rank-down",
): UpdateImportance {
  const scoreSwing = Math.abs(previous.scoreToPar - current.scoreToPar);
  const rankSwing = Math.abs(previous.rank - current.rank);
  const topThreeShift =
    (previous.rank > 3 && current.rank <= 3) ||
    (previous.rank <= 3 && current.rank > 3);

  if (kind === "rank-up" && current.rank === 1) {
    return "high";
  }

  if (kind === "finish" && current.rank <= 3) {
    return "high";
  }

  if (topThreeShift || current.rank <= 3 || scoreSwing >= 3) {
    return "high";
  }

  if (
    current.rank <= 10 ||
    previous.rank <= 10 ||
    rankSwing >= 2 ||
    scoreSwing >= 2 ||
    kind === "finish"
  ) {
    return "medium";
  }

  return "low";
}

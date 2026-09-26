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
    return {
      id: updateId(current, createdAt),
      playerId: current.playerId,
      playerName: current.name,
      division: current.division,
      text: `${current.name} finishes at ${score}`,
      importance: updateImportance(previous, current, "finish"),
      tone: toneForMovement(previous, current, "finish"),
      rank: current.rank,
      previousRank: previous.rank,
      scoreToPar: current.scoreToPar,
      thru: current.thru,
      createdAt,
    };
  }

  if (current.rank === 1 && previous.rank !== 1) {
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
    const importance = updateImportance(previous, current, "rank-up");
    if (importance === "low") {
      return null;
    }

    return {
      id: updateId(current, createdAt),
      playerId: current.playerId,
      playerName: current.name,
      division: current.division,
      text: `${current.name} climbs to #${current.rank} at ${score}${throughSuffix(current.thru)}`,
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
    const importance = updateImportance(previous, current, "rank-down");
    if (importance === "low") {
      return null;
    }

    return {
      id: updateId(current, createdAt),
      playerId: current.playerId,
      playerName: current.name,
      division: current.division,
      text: `${current.name} drops to #${current.rank} at ${score}${throughSuffix(current.thru)}`,
      importance,
      tone: "negative",
      rank: current.rank,
      previousRank: previous.rank,
      scoreToPar: current.scoreToPar,
      thru: current.thru,
      createdAt,
    };
  }

  if (
    current.scoreToPar !== previous.scoreToPar ||
    current.thru !== previous.thru
  ) {
    const importance = updateImportance(previous, current, "score");
    if (importance === "low") {
      return null;
    }

    return {
      id: updateId(current, createdAt),
      playerId: current.playerId,
      playerName: current.name,
      division: current.division,
      text:
        current.rank === 1
          ? `${current.name} holds the lead at ${score}${throughSuffix(current.thru)}`
          : `${current.name} moves to #${current.rank} at ${score}${throughSuffix(current.thru)}`,
      importance,
      tone: toneForMovement(previous, current, "score"),
      rank: current.rank,
      previousRank: previous.rank,
      scoreToPar: current.scoreToPar,
      thru: current.thru,
      createdAt,
    };
  }

  return null;
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

function toneForMovement(
  previous: PlayerSnapshot,
  current: PlayerSnapshot,
  kind: "finish" | "rank-up" | "rank-down" | "score",
): RecentUpdate["tone"] {
  if (kind === "rank-up") {
    return "positive";
  }

  if (kind === "rank-down") {
    return "negative";
  }

  if (current.scoreToPar < previous.scoreToPar) {
    return "positive";
  }

  if (current.scoreToPar > previous.scoreToPar) {
    return "negative";
  }

  return "neutral";
}

function updateImportance(
  previous: PlayerSnapshot,
  current: PlayerSnapshot,
  kind: "finish" | "rank-up" | "rank-down" | "score",
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

  if (
    topThreeShift ||
    (current.rank <= 3 && kind !== "score") ||
    scoreSwing >= 3
  ) {
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

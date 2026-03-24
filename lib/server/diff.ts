import type { PlayerDelta, PlayerSnapshot, RecentUpdate } from "@/lib/types";

function thruToNumber(thru: number | "F") {
  return thru === "F" ? 18 : thru;
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
    thruDelta: thruToNumber(current.thru) - thruToNumber(previous.thru),
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

  if (previous.thru !== "F" && current.thru === "F") {
    return {
      playerId: current.playerId,
      text: `finishes at ${formatScore(current.scoreToPar)}`,
      tone: current.scoreToPar < previous.scoreToPar ? "positive" : "neutral",
      createdAt,
    };
  }

  if (current.rank < previous.rank) {
    return {
      playerId: current.playerId,
      text: `moves to ${formatScore(current.scoreToPar)} through ${current.thru}`,
      tone: "positive",
      createdAt,
    };
  }

  if (current.rank > previous.rank) {
    return {
      playerId: current.playerId,
      text: `drops to ${ordinal(current.rank)}`,
      tone: "negative",
      createdAt,
    };
  }

  if (current.scoreToPar !== previous.scoreToPar || current.thru !== previous.thru) {
    const tone =
      current.scoreToPar < previous.scoreToPar
        ? "positive"
        : current.scoreToPar > previous.scoreToPar
          ? "negative"
          : "neutral";

    return {
      playerId: current.playerId,
      text: `moves to ${formatScore(current.scoreToPar)} through ${current.thru}`,
      tone,
      createdAt,
    };
  }

  return null;
}

export function formatScore(scoreToPar: number) {
  if (scoreToPar === 0) {
    return "E";
  }

  return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
}

function ordinal(rank: number) {
  const mod10 = rank % 10;
  const mod100 = rank % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${rank}st`;
  }

  if (mod10 === 2 && mod100 !== 12) {
    return `${rank}nd`;
  }

  if (mod10 === 3 && mod100 !== 13) {
    return `${rank}rd`;
  }

  return `${rank}th`;
}

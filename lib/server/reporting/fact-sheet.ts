import { createHash } from "node:crypto";
import {
  matchTerminalResult,
  type OfficialResultsContext,
} from "@/lib/server/reporting/official-results";
import type {
  PlayerRound,
  PlayerSnapshot,
  TournamentSummary,
} from "@/lib/types";

export type ReportSnapshot = {
  id: number;
  sourceAt: string;
  contentHash: string;
  tournament: TournamentSummary;
  players: PlayerSnapshot[];
};

export const FACT_SHEET_VERSION = "4";
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const MIN_IN_ROUND_COVERAGE_PERCENT = 50;

function roundFacts(round: PlayerRound) {
  const holes = [...round.holes].sort((a, b) => a.hole - b.hole);
  const valid =
    holes.length > 0 &&
    new Set(holes.map((h) => h.hole)).size === holes.length &&
    holes.every(
      (h) =>
        Number.isInteger(h.score) &&
        Number.isInteger(h.par) &&
        (h.score ?? 0) > 0 &&
        (h.par ?? 0) > 0 &&
        h.relativeToPar === (h.score ?? 0) - (h.par ?? 0),
    );
  const scoreToPar = valid
    ? holes.reduce((sum, h) => sum + (h.score ?? 0) - (h.par ?? 0), 0)
    : null;
  const complete =
    valid && round.thru === "F" && scoreToPar === round.scoreToPar;
  return {
    round: round.order,
    sourceRoundId: round.id,
    holeCount: holes.length,
    complete,
    scoreToPar: complete ? scoreToPar : null,
    throws: complete ? holes.reduce((sum, h) => sum + (h.score ?? 0), 0) : null,
    birdies: complete
      ? holes.filter((h) => h.relativeToPar === -1).length
      : null,
    bogeyFree: complete
      ? holes.every((h) => (h.relativeToPar ?? 0) <= 0)
      : null,
    layout: holes.map((h) => `${h.hole}:${h.par}`).join(","),
  };
}

type InRoundStartPattern =
  | "sequential"
  | "shotgun-or-nonsequential"
  | "unknown";

function inferInRoundStartPatterns(
  snapshots: ReportSnapshot[],
  playerIds: Set<string>,
  totalRounds: number | undefined,
) {
  return Array.from({ length: totalRounds ?? 0 }, (_, index) => index + 1).map(
    (roundOrder) => {
      const observedPlayers = new Set<string>();
      const partiallyObservedPlayers = new Set<string>();
      let sawNonSequentialProgress = false;

      for (const snapshot of snapshots) {
        for (const player of snapshot.players) {
          if (!playerIds.has(player.playerId)) continue;
          const round = player.rounds?.find(
            (item) => item.order === roundOrder,
          );
          if (!round) continue;
          const scoredHoles = round.holes
            .filter((hole) => hole.score !== null)
            .sort((a, b) => a.hole - b.hole);
          if (!scoredHoles.length) continue;
          observedPlayers.add(player.playerId);
          if (scoredHoles.length < round.holes.length) {
            partiallyObservedPlayers.add(player.playerId);
            if (scoredHoles.some((hole, index) => hole.hole !== index + 1))
              sawNonSequentialProgress = true;
          }
        }
      }

      let pattern: InRoundStartPattern = "unknown";
      if (sawNonSequentialProgress) {
        pattern = "shotgun-or-nonsequential";
      } else if (
        observedPlayers.size >= 2 &&
        partiallyObservedPlayers.size === observedPlayers.size
      ) {
        pattern = "sequential";
      }
      return {
        round: roundOrder,
        pattern,
        observedPlayers: observedPlayers.size,
        playersWithPartialProgress: partiallyObservedPlayers.size,
      };
    },
  );
}

function buildInRoundFacts(
  snapshots: ReportSnapshot[],
  division: string,
  field: {
    playerId: string;
    resultStatus: string;
    rounds: ReturnType<typeof roundFacts>[];
  }[],
  startPatterns: ReturnType<typeof inferInRoundStartPatterns>,
) {
  const terminal = new Set(["DNF", "DNS", "DSQ"]);
  const activeField = field.filter(
    (player) => !terminal.has(player.resultStatus),
  );
  const checkpoints: {
    round: number;
    holesCompleted: number;
    sourceSnapshotId: number;
    sourceAt: string;
    fieldCoverage: { covered: number; fieldSize: number; percent: number };
    leaders: string[];
    scores: {
      playerId: string;
      scoreToPar: number;
      roundScoreToPar: number;
      deficit: number;
    }[];
  }[] = [];

  for (const startPattern of startPatterns) {
    if (startPattern.pattern !== "sequential") continue;
    const roundOrder = startPattern.round;
    const layoutKeys = new Set(
      snapshots.flatMap((snapshot) =>
        snapshot.players
          .filter((player) => player.division === division)
          .flatMap((player) => {
            const round = player.rounds?.find(
              (item) => item.order === roundOrder,
            );
            return round?.holes.length
              ? [
                  round.holes
                    .map((hole) => `${hole.hole}:${hole.par}`)
                    .join(","),
                ]
              : [];
          }),
      ),
    );
    if (layoutKeys.size !== 1) continue;
    const holeCount = snapshots
      .flatMap((snapshot) =>
        snapshot.players
          .filter((player) => player.division === division)
          .map(
            (player) =>
              player.rounds?.find((item) => item.order === roundOrder)?.holes
                .length ?? 0,
          ),
      )
      .find((count) => count > 0);
    if (!holeCount || activeField.length < 2) continue;

    const bestByHoleCount = new Map<number, (typeof checkpoints)[number]>();
    for (const snapshot of snapshots) {
      const snapshotPlayers = new Map(
        snapshot.players
          .filter((player) => player.division === division)
          .map((player) => [player.playerId, player]),
      );
      const snapshotRounds = activeField.flatMap((fieldPlayer) => {
        const player = snapshotPlayers.get(fieldPlayer.playerId);
        const round = player?.rounds?.find((item) => item.order === roundOrder);
        return round ? [{ fieldPlayer, round }] : [];
      });
      if (
        !snapshotRounds.length ||
        snapshotRounds.every(({ round }) => round.thru === "F")
      )
        continue;

      for (
        let holesCompleted = 3;
        holesCompleted < holeCount;
        holesCompleted++
      ) {
        const scores: (typeof checkpoints)[number]["scores"] = [];
        for (const { fieldPlayer, round } of snapshotRounds) {
          const previousRounds = fieldPlayer.rounds.filter(
            (fact) => fact.round < roundOrder,
          );
          if (
            previousRounds.length !== roundOrder - 1 ||
            previousRounds.some(
              (fact, index) => !fact.complete || fact.round !== index + 1,
            )
          )
            continue;
          const holes = [...round.holes].sort((a, b) => a.hole - b.hole);
          const prefix = holes.slice(0, holesCompleted);
          if (
            prefix.length !== holesCompleted ||
            prefix.some(
              (hole, index) =>
                hole.hole !== index + 1 ||
                !Number.isInteger(hole.score) ||
                !Number.isInteger(hole.par) ||
                hole.relativeToPar !== (hole.score ?? 0) - (hole.par ?? 0),
            )
          )
            continue;
          const roundScoreToPar = prefix.reduce(
            (sum, hole) => sum + (hole.relativeToPar ?? 0),
            0,
          );
          scores.push({
            playerId: fieldPlayer.playerId,
            scoreToPar:
              previousRounds.reduce(
                (sum, fact) => sum + (fact.scoreToPar ?? 0),
                0,
              ) + roundScoreToPar,
            roundScoreToPar,
            deficit: 0,
          });
        }
        const coveragePercent = Math.floor(
          (scores.length / activeField.length) * 100,
        );
        if (
          scores.length < 2 ||
          coveragePercent < MIN_IN_ROUND_COVERAGE_PERCENT
        )
          continue;
        const best = Math.min(...scores.map((score) => score.scoreToPar));
        const checkpoint = {
          round: roundOrder,
          holesCompleted,
          sourceSnapshotId: snapshot.id,
          sourceAt: snapshot.sourceAt,
          fieldCoverage: {
            covered: scores.length,
            fieldSize: activeField.length,
            percent: coveragePercent,
          },
          leaders: scores
            .filter((score) => score.scoreToPar === best)
            .map((score) => score.playerId)
            .sort(compare),
          scores: scores
            .map((score) => ({ ...score, deficit: score.scoreToPar - best }))
            .sort(
              (a, b) =>
                a.scoreToPar - b.scoreToPar || compare(a.playerId, b.playerId),
            ),
        };
        const previous = bestByHoleCount.get(holesCompleted);
        if (
          !previous ||
          checkpoint.fieldCoverage.covered > previous.fieldCoverage.covered ||
          (checkpoint.fieldCoverage.covered ===
            previous.fieldCoverage.covered &&
            checkpoint.sourceSnapshotId > previous.sourceSnapshotId)
        )
          bestByHoleCount.set(holesCompleted, checkpoint);
      }
    }
    checkpoints.push(...bestByHoleCount.values());
  }

  checkpoints.sort(
    (a, b) => a.round - b.round || a.holesCompleted - b.holesCompleted,
  );
  const leadChanges = checkpoints.slice(1).flatMap((checkpoint, index) => {
    const previous = checkpoints[index];
    if (JSON.stringify(checkpoint.leaders) === JSON.stringify(previous.leaders))
      return [];
    return [
      {
        fromRound: previous.round,
        fromHolesCompleted: previous.holesCompleted,
        previousLeaders: previous.leaders,
        toRound: checkpoint.round,
        toHolesCompleted: checkpoint.holesCompleted,
        leaders: checkpoint.leaders,
      },
    ];
  });

  return {
    minimumCoveragePercent: MIN_IN_ROUND_COVERAGE_PERCENT,
    eventStartPatterns: startPatterns,
    withheldRounds: startPatterns
      .filter((item) => item.pattern !== "sequential")
      .map(({ round, pattern }) => ({ round, reason: pattern })),
    checkpoints,
    leadChanges,
  };
}

/** Pure, conservative facts. Missing/invalid cards never become withdrawals or zero scores. */
export function buildFactSheet(
  input: ReportSnapshot[],
  officialResults?: OfficialResultsContext,
) {
  const snapshots = [...input].sort((a, b) => a.id - b.id);
  const latest = snapshots.at(-1);
  if (!latest) throw new Error("No archived snapshots");
  if (snapshots.some((s) => s.tournament.id !== latest.tournament.id))
    throw new Error("Mixed tournament snapshots");
  if (new Set(snapshots.map((s) => s.id)).size !== snapshots.length)
    throw new Error("Duplicate snapshot IDs");
  const tournament = latest.tournament;
  const totalRounds =
    Number.isInteger(tournament.totalRounds) &&
    (tournament.totalRounds ?? 0) > 0
      ? tournament.totalRounds
      : undefined;
  const gaps: string[] = [];
  if (!totalRounds || !Number.isInteger(totalRounds) || totalRounds < 1)
    gaps.push("unknown-round-count");
  if (!latest.players.length) gaps.push("empty-field");
  if (
    new Set(latest.players.map((p) => p.playerId)).size !==
    latest.players.length
  )
    throw new Error("Duplicate player IDs");
  const knownIds = new Set(
    snapshots.flatMap((s) => s.players.map((p) => p.playerId)),
  );
  const missingPlayers = [...knownIds]
    .filter((id) => !latest.players.some((p) => p.playerId === id))
    .sort(compare);
  if (missingPlayers.length) gaps.push("players-missing-from-latest-snapshot");
  const latestPlayers = [...latest.players].sort((a, b) =>
    compare(a.playerId, b.playerId),
  );
  const inRoundStartPatterns = inferInRoundStartPatterns(
    snapshots,
    knownIds,
    totalRounds,
  );
  const players = latestPlayers.map((player) => {
    const rounds = [...(player.rounds ?? [])]
      .sort((a, b) => a.order - b.order)
      .map(roundFacts);
    const complete =
      !!totalRounds &&
      rounds.length === totalRounds &&
      rounds.every((r, i) => r.round === i + 1 && r.complete);
    const scoreToPar = complete
      ? rounds.reduce((sum, r) => sum + (r.scoreToPar ?? 0), 0)
      : null;
    const consistent = complete && scoreToPar === player.scoreToPar;
    const terminalResult = matchTerminalResult(
      player,
      latestPlayers,
      officialResults,
    );
    if (!consistent && !terminalResult)
      gaps.push(`incomplete-or-inconsistent-scorecard:${player.playerId}`);
    return {
      playerId: player.playerId,
      name: player.name,
      division: player.division,
      club: player.club ?? null,
      source: { snapshotId: latest.id, playerId: player.playerId },
      complete: consistent,
      resultStatus:
        terminalResult?.status ?? (consistent ? "finished" : "unresolved"),
      resultEvidence: terminalResult
        ? {
            sourceUrl: officialResults?.sourceUrl,
            reportedAt: officialResults?.reportedAt,
            fetchedAt: officialResults?.fetchedAt,
            division: terminalResult.division,
            gtNumber: terminalResult.gtNumber,
          }
        : null,
      sourceRank: player.rank,
      scoreToPar: consistent ? scoreToPar : null,
      holesPlayed: rounds
        .filter((r) => r.complete)
        .reduce((n, r) => n + r.holeCount, 0),
      birdies: consistent
        ? rounds.reduce((n, r) => n + (r.birdies ?? 0), 0)
        : null,
      rounds,
      improvements: rounds.flatMap((r, i) => {
        const previous = rounds[i - 1];
        return previous?.complete && r.complete && previous.layout === r.layout
          ? [
              {
                fromRound: previous.round,
                toRound: r.round,
                strokes: (previous.scoreToPar ?? 0) - (r.scoreToPar ?? 0),
              },
            ]
          : [];
      }),
    };
  });
  const divisions = [...new Set(players.map((p) => p.division))]
    .sort(compare)
    .map((division) => {
      const field = players.filter((p) => p.division === division);
      const layoutsAgree = Array.from(
        { length: totalRounds ?? 0 },
        (_, i) => i + 1,
      ).every(
        (order) =>
          new Set(
            field.flatMap((p) =>
              p.rounds.filter((r) => r.round === order).map((r) => r.layout),
            ),
          ).size <= 1,
      );
      if (!layoutsAgree) gaps.push(`inconsistent-round-layouts:${division}`);
      const complete =
        field.every((p) => p.complete || p.resultStatus !== "unresolved") &&
        !missingPlayers.length &&
        layoutsAgree;
      const finishers = field.filter((p) => p.resultStatus === "finished");
      const sorted = complete
        ? [...finishers].sort(
            (a, b) =>
              (a.scoreToPar ?? 0) - (b.scoreToPar ?? 0) ||
              compare(a.playerId, b.playerId),
          )
        : [];
      const standings = sorted.map((p) => ({
        playerId: p.playerId,
        scoreToPar: p.scoreToPar,
        rank:
          1 +
          sorted.filter(
            (other) => (other.scoreToPar ?? 0) < (p.scoreToPar ?? 0),
          ).length,
      }));
      const leaders = standings.filter((p) => p.rank === 1);
      const tiedFirst = leaders.length > 1;
      if (tiedFirst) gaps.push(`unresolved-first-place-tie:${division}`);
      // Round-end comparisons use complete scorecards, never polling sequence as shot order.
      const checkpoints = Array.from(
        { length: totalRounds && totalRounds > 0 ? totalRounds : 0 },
        (_, i) => i + 1,
      ).flatMap((round) => {
        if (
          !field.every(
            (p) =>
              p.rounds.slice(0, round).length === round &&
              p.rounds
                .slice(0, round)
                .every((r, i) => r.complete && r.round === i + 1),
          )
        )
          return [];
        const scores = field.map((p) => ({
          playerId: p.playerId,
          scoreToPar: p.rounds
            .slice(0, round)
            .reduce((sum, r) => sum + (r.scoreToPar ?? 0), 0),
        }));
        const best = Math.min(...scores.map((s) => s.scoreToPar));
        return [
          {
            round,
            leaders: scores
              .filter((s) => s.scoreToPar === best)
              .map((s) => s.playerId),
            scores: scores.map((s) => ({ ...s, deficit: s.scoreToPar - best })),
          },
        ];
      });
      const winner = leaders.length === 1 ? leaders[0].playerId : null;
      const roundLeadChanges = checkpoints.slice(1).flatMap((checkpoint, i) => {
        const previous = checkpoints[i];
        if (
          checkpoint.round !== previous.round + 1 ||
          JSON.stringify(checkpoint.leaders) ===
            JSON.stringify(previous.leaders)
        )
          return [];
        return [
          {
            fromRound: previous.round,
            toRound: checkpoint.round,
            previousLeaders: previous.leaders,
            leaders: checkpoint.leaders,
          },
        ];
      });
      return {
        division,
        fieldSize: field.length,
        finisherCount: finishers.length,
        terminalResults: field
          .filter((p) => ["DNF", "DNS", "DSQ"].includes(p.resultStatus))
          .map((p) => ({ playerId: p.playerId, status: p.resultStatus }))
          .sort((a, b) => compare(a.playerId, b.playerId)),
        complete,
        standings,
        podium: standings.filter((s) => s.rank <= 3),
        tiedFirst,
        winner,
        winningMargin:
          winner && standings.length > 1
            ? (standings[1].scoreToPar ?? 0) - (standings[0].scoreToPar ?? 0)
            : null,
        checkpoints,
        roundLeadChanges,
        inRound: buildInRoundFacts(
          snapshots,
          division,
          field,
          inRoundStartPatterns,
        ),
        comebacks: winner
          ? checkpoints.flatMap((c) => {
              const score = c.scores.find((s) => s.playerId === winner);
              return score && score.deficit > 0
                ? [
                    {
                      playerId: winner,
                      afterRound: c.round,
                      deficit: score.deficit,
                    },
                  ]
                : [];
            })
          : [],
        bestRounds: bestRounds(field),
        fieldAchievements: fieldAchievements(finishers, complete),
      };
    });
  const facts = {
    schemaVersion: FACT_SHEET_VERSION,
    tournament,
    provenance: {
      latestSnapshotId: latest.id,
      snapshots: snapshots.map((s) => ({
        id: s.id,
        sourceAt: s.sourceAt,
        contentHash: s.contentHash,
      })),
      missingPlayers,
      officialResults: officialResults
        ? {
            sourceUrl: officialResults.sourceUrl,
            tournamentId: officialResults.tournamentId,
            fetchedAt: officialResults.fetchedAt,
            reportedAt: officialResults.reportedAt,
          }
        : null,
    },
    completion: {
      readyForReview: gaps.length === 0,
      gaps: gaps.sort(compare),
      policy:
        "All expected round scorecards must reconcile unless an official result source explicitly classifies the player DNF, DNS, or DSQ. Terminal results are excluded from scored standings; no withdrawal or playoff outcome is inferred.",
    },
    coverage: {
      snapshotCount: snapshots.length,
      firstSourceAt: snapshots[0].sourceAt,
      lastSourceAt: latest.sourceAt,
      note: "Round histories are reconstructed from saved scorecards. Polling order does not establish shot order. Layout identity is unavailable; cross-division best-round comparisons are omitted.",
    },
    fieldSize: players.length,
    players,
    divisions,
  };
  return {
    ...facts,
    contentHash: createHash("sha256")
      .update(JSON.stringify(facts))
      .digest("hex"),
  };
}

function bestRounds(
  players: { playerId: string; rounds: ReturnType<typeof roundFacts>[] }[],
) {
  const rounds = players.flatMap((p) =>
    p.rounds
      .filter((r) => r.complete)
      .map((r) => ({ ...r, playerId: p.playerId })),
  );
  return [...new Set(rounds.map((r) => r.round))]
    .sort((a, b) => a - b)
    .flatMap((round) => {
      const group = rounds.filter((r) => r.round === round);
      // A partial field or differing hole/par layouts cannot establish a division's best round.
      if (
        group.length !== players.length ||
        new Set(group.map((r) => r.layout)).size !== 1
      )
        return [];
      const best = Math.min(...group.map((r) => r.scoreToPar ?? 0));
      return [
        {
          round,
          scoreToPar: best,
          holeCount: group[0].holeCount,
          playerIds: group
            .filter((r) => r.scoreToPar === best)
            .map((r) => r.playerId),
        },
      ];
    });
}

function fieldAchievements(
  finishers: {
    playerId: string;
    complete: boolean;
    birdies: number | null;
    rounds: ReturnType<typeof roundFacts>[];
    improvements: { fromRound: number; toRound: number; strokes: number }[];
  }[],
  eligible: boolean,
) {
  if (!eligible || finishers.length === 0 || finishers.some((p) => !p.complete))
    return {
      scope: "completed-finishers",
      status: "withheld" as const,
      reason: "incomplete-finisher-scorecards-or-layouts",
      mostBirdies: null,
      mostBogeyFreeRounds: null,
      biggestRoundImprovement: null,
    };

  const maximum = (entries: { playerId: string; value: number }[]) => {
    if (!entries.length) return null;
    const value = Math.max(...entries.map((entry) => entry.value));
    return {
      value,
      playerIds: entries
        .filter((entry) => entry.value === value)
        .map((entry) => entry.playerId)
        .sort(compare),
    };
  };
  const mostBirdies = maximum(
    finishers.map((player) => ({
      playerId: player.playerId,
      value: player.birdies ?? 0,
    })),
  );
  const mostBogeyFreeRounds = maximum(
    finishers.map((player) => ({
      playerId: player.playerId,
      value: player.rounds.filter((round) => round.bogeyFree === true).length,
    })),
  );
  const improvements = finishers.flatMap((player) =>
    player.improvements
      .map((improvement) => ({
        playerId: player.playerId,
        value: improvement.strokes,
        fromRound: improvement.fromRound,
        toRound: improvement.toRound,
      }))
      .filter((improvement) => improvement.value > 0),
  );
  const biggestRoundImprovement = maximum(improvements);
  const improvementDetails = biggestRoundImprovement
    ? improvements
        .filter((entry) => entry.value === biggestRoundImprovement.value)
        .map(({ playerId, fromRound, toRound }) => ({
          playerId,
          fromRound,
          toRound,
        }))
        .sort(
          (a, b) =>
            compare(a.playerId, b.playerId) || a.fromRound - b.fromRound,
        )
    : [];
  return {
    scope: "completed-finishers",
    status: "available" as const,
    mostBirdies,
    mostBogeyFreeRounds,
    biggestRoundImprovement: biggestRoundImprovement
      ? { ...biggestRoundImprovement, occurrences: improvementDetails }
      : null,
  };
}

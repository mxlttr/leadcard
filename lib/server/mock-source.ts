import type { PlayerRound } from "@/lib/types";

type FixturePlayer = {
  playerId: string;
  name: string;
  division: string;
  rank: number;
  scoreToPar: number;
  thru: number | "F";
  lastFive: number[];
  rounds?: PlayerRound[];
};

type FixtureSnapshot = {
  generatedAt: string;
  players: FixturePlayer[];
};

type MockTournamentDefinition = {
  id: string;
  name: string;
  course: string;
  roundLabel: string;
  fixtures: FixtureSnapshot[];
};

type MockTournamentFeed = Omit<MockTournamentDefinition, "fixtures"> & {
  fixtures: string[];
};

const DEFAULT_PAR_VALUES = [3, 3, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 3];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function extractRoundCount(roundLabel: string) {
  const match = roundLabel.match(/(\d+)/);
  return match ? Math.max(1, Number(match[1])) : 1;
}

function buildSyntheticRound(
  playerId: string,
  order: number,
  scoreToPar: number,
  thru: number | "F",
  recentRelativeScores: number[] = [],
): PlayerRound {
  const playedCount = thru === "F" ? DEFAULT_PAR_VALUES.length : Math.max(0, thru);
  const relativeScores = Array.from({ length: playedCount }, () => 0);
  const recentScores = recentRelativeScores.slice(-Math.min(5, playedCount));

  recentScores.forEach((value, index) => {
    const holeIndex = playedCount - recentScores.length + index;
    relativeScores[holeIndex] = value;
  });

  let remainingScore = scoreToPar - relativeScores.reduce((sum, value) => sum + value, 0);

  while (remainingScore !== 0 && playedCount > 0) {
    let changed = false;

    for (let holeIndex = 0; holeIndex < playedCount; holeIndex += 1) {
      if (remainingScore === 0) {
        break;
      }

      if (remainingScore < 0) {
        const absoluteScore = DEFAULT_PAR_VALUES[holeIndex] + relativeScores[holeIndex];

        if (absoluteScore > 1) {
          relativeScores[holeIndex] -= 1;
          remainingScore += 1;
          changed = true;
        }
      } else {
        relativeScores[holeIndex] += 1;
        remainingScore -= 1;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return {
    id: `${playerId}-round-${order}`,
    order,
    label: `Round ${order}`,
    thru,
    scoreToPar,
    holes: DEFAULT_PAR_VALUES.map((par, index) => {
      const relativeToPar = index < playedCount ? relativeScores[index] : null;
      const score =
        relativeToPar === null ? null : Math.max(1, par + relativeToPar);

      return {
        hole: index + 1,
        par,
        score,
        relativeToPar,
      };
    }),
  };
}

function buildSyntheticRounds(player: FixturePlayer, roundCount: number) {
  if (roundCount <= 1) {
    return [
      buildSyntheticRound(
        player.playerId,
        1,
        player.scoreToPar,
        player.thru,
        player.lastFive,
      ),
    ];
  }

  const recentTotal = player.lastFive.reduce((sum, value) => sum + value, 0);
  const estimatedCurrentRoundScore = player.thru === "F"
    ? Math.round(player.scoreToPar / roundCount)
    : Math.round((player.scoreToPar / roundCount + recentTotal) / 2);
  const currentRoundScore = clamp(estimatedCurrentRoundScore, -8, 8);
  const previousRoundsTotal = player.scoreToPar - currentRoundScore;
  const basePreviousScore = Math.trunc(previousRoundsTotal / (roundCount - 1));
  let remainder = previousRoundsTotal - basePreviousScore * (roundCount - 1);

  return Array.from({ length: roundCount }, (_, index) => {
    const order = index + 1;

    if (order === roundCount) {
      return buildSyntheticRound(
        player.playerId,
        order,
        currentRoundScore,
        player.thru,
        player.lastFive,
      );
    }

    const remainderStep = remainder === 0 ? 0 : remainder > 0 ? 1 : -1;
    const roundScore = basePreviousScore + remainderStep;
    remainder -= remainderStep;

    return buildSyntheticRound(player.playerId, order, roundScore, "F");
  });
}

function serializeSnapshot(snapshot: FixtureSnapshot) {
  const rows = snapshot.players
    .map((player) => {
      const rounds =
        player.rounds ?? buildSyntheticRounds(player, 1);
      const encodedRounds = JSON.stringify(rounds).replaceAll('"', "&quot;");

      return `
        <li
          data-player-id="${player.playerId}"
          data-name="${player.name}"
          data-division="${player.division}"
          data-rank="${player.rank}"
          data-score="${player.scoreToPar}"
          data-thru="${player.thru}"
          data-last-five="${player.lastFive.join(",")}"
          data-rounds="${encodedRounds}"
        ></li>
      `;
    })
    .join("");

  return `
    <section data-generated-at="${snapshot.generatedAt}">
      <ul>${rows}</ul>
    </section>
  `;
}

function tournamentFeed(
  definition: MockTournamentDefinition,
): MockTournamentFeed {
  const roundCount = extractRoundCount(definition.roundLabel);

  return {
    id: definition.id,
    name: definition.name,
    course: definition.course,
    roundLabel: definition.roundLabel,
    fixtures: definition.fixtures.map((fixture) =>
      serializeSnapshot({
        ...fixture,
        players: fixture.players.map((player) => ({
          ...player,
          rounds: player.rounds ?? buildSyntheticRounds(player, roundCount),
        })),
      }),
    ),
  };
}

const definitions: MockTournamentDefinition[] = [
  {
    id: "berlin-open",
    name: "Berlin Open Live",
    course: "Volkspark Disc Golf Course",
    roundLabel: "Round 3",
    fixtures: [
      {
        generatedAt: "2026-03-24T14:00:00.000Z",
        players: [
          {
            playerId: "ber-p1",
            name: "Jonas Weber",
            division: "MPO",
            rank: 3,
            scoreToPar: -4,
            thru: 10,
            lastFive: [-1, 0, -1, 0, 0],
          },
          {
            playerId: "ber-p2",
            name: "Lukas Hartmann",
            division: "MPO",
            rank: 1,
            scoreToPar: -6,
            thru: 11,
            lastFive: [0, -1, 0, 0, -1],
          },
          {
            playerId: "ber-p3",
            name: "Mika Braun",
            division: "MPO",
            rank: 2,
            scoreToPar: -5,
            thru: 10,
            lastFive: [0, 0, -1, 0, 0],
          },
          {
            playerId: "ber-p4",
            name: "Nina Fischer",
            division: "FPO",
            rank: 1,
            scoreToPar: -2,
            thru: 9,
            lastFive: [0, -1, 0, 0, 0],
          },
          {
            playerId: "ber-p5",
            name: "Leonie Haas",
            division: "FPO",
            rank: 2,
            scoreToPar: 0,
            thru: 9,
            lastFive: [0, 0, 0, 0, 0],
          },
          {
            playerId: "ber-p6",
            name: "Sofia Brandt",
            division: "FPO",
            rank: 3,
            scoreToPar: 2,
            thru: 8,
            lastFive: [1, 0, 0, 1, 0],
          },
          {
            playerId: "ber-p7",
            name: "Tom Keller",
            division: "MA1",
            rank: 1,
            scoreToPar: -3,
            thru: 10,
            lastFive: [-1, 0, 0, 0, 0],
          },
          {
            playerId: "ber-p8",
            name: "Erik Vogel",
            division: "MA1",
            rank: 2,
            scoreToPar: -1,
            thru: 9,
            lastFive: [0, 0, 0, 1, -1],
          },
          {
            playerId: "ber-p9",
            name: "Felix Neumann",
            division: "MA1",
            rank: 3,
            scoreToPar: 1,
            thru: 9,
            lastFive: [0, 1, 0, 0, 0],
          },
        ],
      },
      {
        generatedAt: "2026-03-24T14:00:25.000Z",
        players: [
          {
            playerId: "ber-p1",
            name: "Jonas Weber",
            division: "MPO",
            rank: 1,
            scoreToPar: -6,
            thru: 12,
            lastFive: [-1, 0, -1, 0, -1],
          },
          {
            playerId: "ber-p2",
            name: "Lukas Hartmann",
            division: "MPO",
            rank: 2,
            scoreToPar: -5,
            thru: 12,
            lastFive: [0, -1, 0, 0, 1],
          },
          {
            playerId: "ber-p3",
            name: "Mika Braun",
            division: "MPO",
            rank: 3,
            scoreToPar: -4,
            thru: 11,
            lastFive: [0, 0, -1, 0, 1],
          },
          {
            playerId: "ber-p4",
            name: "Nina Fischer",
            division: "FPO",
            rank: 1,
            scoreToPar: -3,
            thru: 10,
            lastFive: [0, -1, 0, 0, -1],
          },
          {
            playerId: "ber-p5",
            name: "Leonie Haas",
            division: "FPO",
            rank: 2,
            scoreToPar: 0,
            thru: 10,
            lastFive: [0, 0, 0, 0, 0],
          },
          {
            playerId: "ber-p6",
            name: "Sofia Brandt",
            division: "FPO",
            rank: 3,
            scoreToPar: 2,
            thru: 9,
            lastFive: [1, 0, 0, 1, 0],
          },
          {
            playerId: "ber-p7",
            name: "Tom Keller",
            division: "MA1",
            rank: 1,
            scoreToPar: -4,
            thru: 11,
            lastFive: [-1, 0, 0, 0, -1],
          },
          {
            playerId: "ber-p8",
            name: "Erik Vogel",
            division: "MA1",
            rank: 2,
            scoreToPar: -1,
            thru: 10,
            lastFive: [0, 0, 1, -1, 0],
          },
          {
            playerId: "ber-p9",
            name: "Felix Neumann",
            division: "MA1",
            rank: 3,
            scoreToPar: 2,
            thru: 10,
            lastFive: [1, 0, 0, 0, 1],
          },
        ],
      },
      {
        generatedAt: "2026-03-24T14:00:50.000Z",
        players: [
          {
            playerId: "ber-p1",
            name: "Jonas Weber",
            division: "MPO",
            rank: 1,
            scoreToPar: -6,
            thru: "F",
            lastFive: [0, -1, 0, -1, 0],
          },
          {
            playerId: "ber-p2",
            name: "Lukas Hartmann",
            division: "MPO",
            rank: 2,
            scoreToPar: -5,
            thru: "F",
            lastFive: [0, 0, 1, 0, -1],
          },
          {
            playerId: "ber-p3",
            name: "Mika Braun",
            division: "MPO",
            rank: 3,
            scoreToPar: -4,
            thru: "F",
            lastFive: [0, 0, 1, 0, 0],
          },
          {
            playerId: "ber-p4",
            name: "Nina Fischer",
            division: "FPO",
            rank: 1,
            scoreToPar: -3,
            thru: "F",
            lastFive: [0, -1, 0, 0, 0],
          },
          {
            playerId: "ber-p5",
            name: "Leonie Haas",
            division: "FPO",
            rank: 2,
            scoreToPar: -1,
            thru: "F",
            lastFive: [0, 0, 0, -1, 0],
          },
          {
            playerId: "ber-p6",
            name: "Sofia Brandt",
            division: "FPO",
            rank: 3,
            scoreToPar: 1,
            thru: "F",
            lastFive: [1, 0, 0, -1, 0],
          },
          {
            playerId: "ber-p7",
            name: "Tom Keller",
            division: "MA1",
            rank: 1,
            scoreToPar: -4,
            thru: "F",
            lastFive: [0, 0, 0, -1, 0],
          },
          {
            playerId: "ber-p8",
            name: "Erik Vogel",
            division: "MA1",
            rank: 2,
            scoreToPar: -2,
            thru: "F",
            lastFive: [0, 0, -1, 0, 0],
          },
          {
            playerId: "ber-p9",
            name: "Felix Neumann",
            division: "MA1",
            rank: 3,
            scoreToPar: 2,
            thru: "F",
            lastFive: [1, 0, 0, 0, 0],
          },
        ],
      },
    ],
  },
  {
    id: "munich-masters",
    name: "Munich Masters Live",
    course: "Olympiapark Disc Golf",
    roundLabel: "Final Round",
    fixtures: [
      {
        generatedAt: "2026-03-24T14:01:00.000Z",
        players: [
          {
            playerId: "mun-p1",
            name: "David Huber",
            division: "MPO",
            rank: 1,
            scoreToPar: -8,
            thru: 13,
            lastFive: [-1, -1, 0, 0, -1],
          },
          {
            playerId: "mun-p2",
            name: "Marcel Koch",
            division: "MPO",
            rank: 2,
            scoreToPar: -6,
            thru: 13,
            lastFive: [0, -1, 0, 0, 0],
          },
          {
            playerId: "mun-p3",
            name: "Sven Adler",
            division: "MPO",
            rank: 3,
            scoreToPar: -5,
            thru: 12,
            lastFive: [0, 0, -1, 0, 0],
          },
          {
            playerId: "mun-p4",
            name: "Clara Beck",
            division: "FPO",
            rank: 2,
            scoreToPar: -1,
            thru: 11,
            lastFive: [0, 0, 0, -1, 0],
          },
          {
            playerId: "mun-p5",
            name: "Paula Stein",
            division: "FPO",
            rank: 1,
            scoreToPar: -2,
            thru: 12,
            lastFive: [0, -1, 0, 0, 0],
          },
          {
            playerId: "mun-p6",
            name: "Jana Lorenz",
            division: "FPO",
            rank: 3,
            scoreToPar: 1,
            thru: 10,
            lastFive: [0, 1, 0, 0, 0],
          },
          {
            playerId: "mun-p7",
            name: "Noah Graf",
            division: "MA1",
            rank: 1,
            scoreToPar: -5,
            thru: 12,
            lastFive: [-1, 0, 0, 0, -1],
          },
          {
            playerId: "mun-p8",
            name: "Tim Brand",
            division: "MA1",
            rank: 2,
            scoreToPar: -3,
            thru: 11,
            lastFive: [0, 0, -1, 0, 0],
          },
          {
            playerId: "mun-p9",
            name: "Ben Faber",
            division: "MA1",
            rank: 3,
            scoreToPar: 0,
            thru: 10,
            lastFive: [0, 0, 0, 0, 0],
          },
        ],
      },
      {
        generatedAt: "2026-03-24T14:01:25.000Z",
        players: [
          {
            playerId: "mun-p1",
            name: "David Huber",
            division: "MPO",
            rank: 1,
            scoreToPar: -9,
            thru: 15,
            lastFive: [-1, 0, 0, -1, 0],
          },
          {
            playerId: "mun-p2",
            name: "Marcel Koch",
            division: "MPO",
            rank: 2,
            scoreToPar: -7,
            thru: 14,
            lastFive: [0, -1, 0, 0, 0],
          },
          {
            playerId: "mun-p3",
            name: "Sven Adler",
            division: "MPO",
            rank: 3,
            scoreToPar: -5,
            thru: 14,
            lastFive: [0, 0, -1, 1, 0],
          },
          {
            playerId: "mun-p4",
            name: "Clara Beck",
            division: "FPO",
            rank: 1,
            scoreToPar: -3,
            thru: 13,
            lastFive: [0, -1, -1, 0, 0],
          },
          {
            playerId: "mun-p5",
            name: "Paula Stein",
            division: "FPO",
            rank: 2,
            scoreToPar: -2,
            thru: 13,
            lastFive: [0, 0, 0, 0, 0],
          },
          {
            playerId: "mun-p6",
            name: "Jana Lorenz",
            division: "FPO",
            rank: 3,
            scoreToPar: 1,
            thru: 12,
            lastFive: [1, 0, 0, 0, 0],
          },
          {
            playerId: "mun-p7",
            name: "Noah Graf",
            division: "MA1",
            rank: 1,
            scoreToPar: -6,
            thru: 14,
            lastFive: [0, -1, 0, 0, 0],
          },
          {
            playerId: "mun-p8",
            name: "Tim Brand",
            division: "MA1",
            rank: 2,
            scoreToPar: -4,
            thru: 13,
            lastFive: [0, -1, 0, 0, 0],
          },
          {
            playerId: "mun-p9",
            name: "Ben Faber",
            division: "MA1",
            rank: 3,
            scoreToPar: 0,
            thru: 12,
            lastFive: [0, 0, 0, 0, 0],
          },
        ],
      },
      {
        generatedAt: "2026-03-24T14:01:50.000Z",
        players: [
          {
            playerId: "mun-p1",
            name: "David Huber",
            division: "MPO",
            rank: 1,
            scoreToPar: -9,
            thru: "F",
            lastFive: [0, 0, -1, 0, 0],
          },
          {
            playerId: "mun-p2",
            name: "Marcel Koch",
            division: "MPO",
            rank: 2,
            scoreToPar: -7,
            thru: "F",
            lastFive: [0, 0, 0, -1, 0],
          },
          {
            playerId: "mun-p3",
            name: "Sven Adler",
            division: "MPO",
            rank: 3,
            scoreToPar: -4,
            thru: "F",
            lastFive: [1, 0, 0, 0, 0],
          },
          {
            playerId: "mun-p4",
            name: "Clara Beck",
            division: "FPO",
            rank: 1,
            scoreToPar: -3,
            thru: "F",
            lastFive: [0, 0, -1, 0, 0],
          },
          {
            playerId: "mun-p5",
            name: "Paula Stein",
            division: "FPO",
            rank: 2,
            scoreToPar: -1,
            thru: "F",
            lastFive: [0, 0, 0, 1, 0],
          },
          {
            playerId: "mun-p6",
            name: "Jana Lorenz",
            division: "FPO",
            rank: 3,
            scoreToPar: 1,
            thru: "F",
            lastFive: [0, 0, 0, 0, 0],
          },
          {
            playerId: "mun-p7",
            name: "Noah Graf",
            division: "MA1",
            rank: 1,
            scoreToPar: -6,
            thru: "F",
            lastFive: [0, -1, 0, 0, 0],
          },
          {
            playerId: "mun-p8",
            name: "Tim Brand",
            division: "MA1",
            rank: 2,
            scoreToPar: -4,
            thru: "F",
            lastFive: [0, 0, -1, 0, 0],
          },
          {
            playerId: "mun-p9",
            name: "Ben Faber",
            division: "MA1",
            rank: 3,
            scoreToPar: 1,
            thru: "F",
            lastFive: [0, 0, 0, 1, 0],
          },
        ],
      },
    ],
  },
];

// Replace this mock registry with your real scrape/API adapters.
// Keep the per-tournament shape the same and the rest of the app can stay untouched.
export const mockTournamentFeeds = definitions.reduce<
  Record<string, MockTournamentFeed>
>((feeds, definition) => {
  feeds[definition.id] = tournamentFeed(definition);
  return feeds;
}, {});

export const defaultMockTournamentId = definitions[0].id;

type FixturePlayer = {
  playerId: string;
  name: string;
  division: string;
  rank: number;
  scoreToPar: number;
  thru: number | "F";
  lastFive: number[];
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

function serializeSnapshot(snapshot: FixtureSnapshot) {
  const rows = snapshot.players
    .map(
      (player) => `
        <li
          data-player-id="${player.playerId}"
          data-name="${player.name}"
          data-division="${player.division}"
          data-rank="${player.rank}"
          data-score="${player.scoreToPar}"
          data-thru="${player.thru}"
          data-last-five="${player.lastFive.join(",")}"
        ></li>
      `,
    )
    .join("");

  return `
    <section data-generated-at="${snapshot.generatedAt}">
      <ul>${rows}</ul>
    </section>
  `;
}

function tournamentFeed(definition: MockTournamentDefinition): MockTournamentFeed {
  return {
    id: definition.id,
    name: definition.name,
    course: definition.course,
    roundLabel: definition.roundLabel,
    fixtures: definition.fixtures.map(serializeSnapshot),
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
          { playerId: "ber-p1", name: "Jonas Weber", division: "MPO", rank: 3, scoreToPar: -4, thru: 10, lastFive: [-1, 0, -1, 0, 0] },
          { playerId: "ber-p2", name: "Lukas Hartmann", division: "MPO", rank: 1, scoreToPar: -6, thru: 11, lastFive: [0, -1, 0, 0, -1] },
          { playerId: "ber-p3", name: "Mika Braun", division: "MPO", rank: 2, scoreToPar: -5, thru: 10, lastFive: [0, 0, -1, 0, 0] },
          { playerId: "ber-p4", name: "Nina Fischer", division: "FPO", rank: 1, scoreToPar: -2, thru: 9, lastFive: [0, -1, 0, 0, 0] },
          { playerId: "ber-p5", name: "Leonie Haas", division: "FPO", rank: 2, scoreToPar: 0, thru: 9, lastFive: [0, 0, 0, 0, 0] },
          { playerId: "ber-p6", name: "Sofia Brandt", division: "FPO", rank: 3, scoreToPar: 2, thru: 8, lastFive: [1, 0, 0, 1, 0] },
          { playerId: "ber-p7", name: "Tom Keller", division: "MA1", rank: 1, scoreToPar: -3, thru: 10, lastFive: [-1, 0, 0, 0, 0] },
          { playerId: "ber-p8", name: "Erik Vogel", division: "MA1", rank: 2, scoreToPar: -1, thru: 9, lastFive: [0, 0, 0, 1, -1] },
          { playerId: "ber-p9", name: "Felix Neumann", division: "MA1", rank: 3, scoreToPar: 1, thru: 9, lastFive: [0, 1, 0, 0, 0] },
        ],
      },
      {
        generatedAt: "2026-03-24T14:00:25.000Z",
        players: [
          { playerId: "ber-p1", name: "Jonas Weber", division: "MPO", rank: 1, scoreToPar: -6, thru: 12, lastFive: [-1, 0, -1, 0, -1] },
          { playerId: "ber-p2", name: "Lukas Hartmann", division: "MPO", rank: 2, scoreToPar: -5, thru: 12, lastFive: [0, -1, 0, 0, 1] },
          { playerId: "ber-p3", name: "Mika Braun", division: "MPO", rank: 3, scoreToPar: -4, thru: 11, lastFive: [0, 0, -1, 0, 1] },
          { playerId: "ber-p4", name: "Nina Fischer", division: "FPO", rank: 1, scoreToPar: -3, thru: 10, lastFive: [0, -1, 0, 0, -1] },
          { playerId: "ber-p5", name: "Leonie Haas", division: "FPO", rank: 2, scoreToPar: 0, thru: 10, lastFive: [0, 0, 0, 0, 0] },
          { playerId: "ber-p6", name: "Sofia Brandt", division: "FPO", rank: 3, scoreToPar: 2, thru: 9, lastFive: [1, 0, 0, 1, 0] },
          { playerId: "ber-p7", name: "Tom Keller", division: "MA1", rank: 1, scoreToPar: -4, thru: 11, lastFive: [-1, 0, 0, 0, -1] },
          { playerId: "ber-p8", name: "Erik Vogel", division: "MA1", rank: 2, scoreToPar: -1, thru: 10, lastFive: [0, 0, 1, -1, 0] },
          { playerId: "ber-p9", name: "Felix Neumann", division: "MA1", rank: 3, scoreToPar: 2, thru: 10, lastFive: [1, 0, 0, 0, 1] },
        ],
      },
      {
        generatedAt: "2026-03-24T14:00:50.000Z",
        players: [
          { playerId: "ber-p1", name: "Jonas Weber", division: "MPO", rank: 1, scoreToPar: -6, thru: "F", lastFive: [0, -1, 0, -1, 0] },
          { playerId: "ber-p2", name: "Lukas Hartmann", division: "MPO", rank: 2, scoreToPar: -5, thru: "F", lastFive: [0, 0, 1, 0, -1] },
          { playerId: "ber-p3", name: "Mika Braun", division: "MPO", rank: 3, scoreToPar: -4, thru: "F", lastFive: [0, 0, 1, 0, 0] },
          { playerId: "ber-p4", name: "Nina Fischer", division: "FPO", rank: 1, scoreToPar: -3, thru: "F", lastFive: [0, -1, 0, 0, 0] },
          { playerId: "ber-p5", name: "Leonie Haas", division: "FPO", rank: 2, scoreToPar: -1, thru: "F", lastFive: [0, 0, 0, -1, 0] },
          { playerId: "ber-p6", name: "Sofia Brandt", division: "FPO", rank: 3, scoreToPar: 1, thru: "F", lastFive: [1, 0, 0, -1, 0] },
          { playerId: "ber-p7", name: "Tom Keller", division: "MA1", rank: 1, scoreToPar: -4, thru: "F", lastFive: [0, 0, 0, -1, 0] },
          { playerId: "ber-p8", name: "Erik Vogel", division: "MA1", rank: 2, scoreToPar: -2, thru: "F", lastFive: [0, 0, -1, 0, 0] },
          { playerId: "ber-p9", name: "Felix Neumann", division: "MA1", rank: 3, scoreToPar: 2, thru: "F", lastFive: [1, 0, 0, 0, 0] },
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
          { playerId: "mun-p1", name: "David Huber", division: "MPO", rank: 1, scoreToPar: -8, thru: 13, lastFive: [-1, -1, 0, 0, -1] },
          { playerId: "mun-p2", name: "Marcel Koch", division: "MPO", rank: 2, scoreToPar: -6, thru: 13, lastFive: [0, -1, 0, 0, 0] },
          { playerId: "mun-p3", name: "Sven Adler", division: "MPO", rank: 3, scoreToPar: -5, thru: 12, lastFive: [0, 0, -1, 0, 0] },
          { playerId: "mun-p4", name: "Clara Beck", division: "FPO", rank: 2, scoreToPar: -1, thru: 11, lastFive: [0, 0, 0, -1, 0] },
          { playerId: "mun-p5", name: "Paula Stein", division: "FPO", rank: 1, scoreToPar: -2, thru: 12, lastFive: [0, -1, 0, 0, 0] },
          { playerId: "mun-p6", name: "Jana Lorenz", division: "FPO", rank: 3, scoreToPar: 1, thru: 10, lastFive: [0, 1, 0, 0, 0] },
          { playerId: "mun-p7", name: "Noah Graf", division: "MA1", rank: 1, scoreToPar: -5, thru: 12, lastFive: [-1, 0, 0, 0, -1] },
          { playerId: "mun-p8", name: "Tim Brand", division: "MA1", rank: 2, scoreToPar: -3, thru: 11, lastFive: [0, 0, -1, 0, 0] },
          { playerId: "mun-p9", name: "Ben Faber", division: "MA1", rank: 3, scoreToPar: 0, thru: 10, lastFive: [0, 0, 0, 0, 0] },
        ],
      },
      {
        generatedAt: "2026-03-24T14:01:25.000Z",
        players: [
          { playerId: "mun-p1", name: "David Huber", division: "MPO", rank: 1, scoreToPar: -9, thru: 15, lastFive: [-1, 0, 0, -1, 0] },
          { playerId: "mun-p2", name: "Marcel Koch", division: "MPO", rank: 2, scoreToPar: -7, thru: 14, lastFive: [0, -1, 0, 0, 0] },
          { playerId: "mun-p3", name: "Sven Adler", division: "MPO", rank: 3, scoreToPar: -5, thru: 14, lastFive: [0, 0, -1, 1, 0] },
          { playerId: "mun-p4", name: "Clara Beck", division: "FPO", rank: 1, scoreToPar: -3, thru: 13, lastFive: [0, -1, -1, 0, 0] },
          { playerId: "mun-p5", name: "Paula Stein", division: "FPO", rank: 2, scoreToPar: -2, thru: 13, lastFive: [0, 0, 0, 0, 0] },
          { playerId: "mun-p6", name: "Jana Lorenz", division: "FPO", rank: 3, scoreToPar: 1, thru: 12, lastFive: [1, 0, 0, 0, 0] },
          { playerId: "mun-p7", name: "Noah Graf", division: "MA1", rank: 1, scoreToPar: -6, thru: 14, lastFive: [0, -1, 0, 0, 0] },
          { playerId: "mun-p8", name: "Tim Brand", division: "MA1", rank: 2, scoreToPar: -4, thru: 13, lastFive: [0, -1, 0, 0, 0] },
          { playerId: "mun-p9", name: "Ben Faber", division: "MA1", rank: 3, scoreToPar: 0, thru: 12, lastFive: [0, 0, 0, 0, 0] },
        ],
      },
      {
        generatedAt: "2026-03-24T14:01:50.000Z",
        players: [
          { playerId: "mun-p1", name: "David Huber", division: "MPO", rank: 1, scoreToPar: -9, thru: "F", lastFive: [0, 0, -1, 0, 0] },
          { playerId: "mun-p2", name: "Marcel Koch", division: "MPO", rank: 2, scoreToPar: -7, thru: "F", lastFive: [0, 0, 0, -1, 0] },
          { playerId: "mun-p3", name: "Sven Adler", division: "MPO", rank: 3, scoreToPar: -4, thru: "F", lastFive: [1, 0, 0, 0, 0] },
          { playerId: "mun-p4", name: "Clara Beck", division: "FPO", rank: 1, scoreToPar: -3, thru: "F", lastFive: [0, 0, -1, 0, 0] },
          { playerId: "mun-p5", name: "Paula Stein", division: "FPO", rank: 2, scoreToPar: -1, thru: "F", lastFive: [0, 0, 0, 1, 0] },
          { playerId: "mun-p6", name: "Jana Lorenz", division: "FPO", rank: 3, scoreToPar: 1, thru: "F", lastFive: [0, 0, 0, 0, 0] },
          { playerId: "mun-p7", name: "Noah Graf", division: "MA1", rank: 1, scoreToPar: -6, thru: "F", lastFive: [0, -1, 0, 0, 0] },
          { playerId: "mun-p8", name: "Tim Brand", division: "MA1", rank: 2, scoreToPar: -4, thru: "F", lastFive: [0, 0, -1, 0, 0] },
          { playerId: "mun-p9", name: "Ben Faber", division: "MA1", rank: 3, scoreToPar: 1, thru: "F", lastFive: [0, 0, 0, 1, 0] },
        ],
      },
    ],
  },
];

// Replace this mock registry with your real scrape/API adapters.
// Keep the per-tournament shape the same and the rest of the app can stay untouched.
export const mockTournamentFeeds = definitions.reduce<Record<string, MockTournamentFeed>>(
  (feeds, definition) => {
    feeds[definition.id] = tournamentFeed(definition);
    return feeds;
  },
  {},
);

export const defaultMockTournamentId = definitions[0].id;

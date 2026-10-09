import { expect, type Page, test } from "@playwright/test";

type PlayerDelta = {
  rankDelta: number;
  scoreDelta: number;
  thruDelta: number;
};

type RecentUpdate = {
  id: string;
  playerId: string;
  playerName: string;
  division: string;
  text: string;
  importance: "high" | "medium" | "low";
  tone: "positive" | "negative" | "neutral";
  rank?: number;
  previousRank?: number;
  scoreToPar?: number;
  thru?: number | "F";
  createdAt: string;
};

type LeaderboardPlayer = {
  playerId: string;
  name: string;
  division: string;
  rank: number;
  scoreToPar: number;
  thru: number | "F";
  lastFive: number[];
  delta: PlayerDelta;
  latestUpdate: RecentUpdate | null;
};

type TournamentSummary = {
  id: string;
  name: string;
  course: string;
  roundLabel: string;
  status: "live" | "today" | "tomorrow" | "upcoming" | "recent" | "mock";
};

type LiveResponse = {
  tournament: TournamentSummary;
  tournaments: TournamentSummary[];
  hasLiveData: boolean;
  divisions: string[];
  leaders: LeaderboardPlayer[];
  divisionLeaders: Array<{
    division: string;
    leader: LeaderboardPlayer;
  }>;
  generatedAt: string;
  updateIntervalMs: number;
};

type LeaderboardResponse = {
  tournamentId: string;
  division: string;
  players: LeaderboardPlayer[];
  generatedAt: string;
};

type UpdatesResponse = {
  tournamentId: string;
  updates: RecentUpdate[];
  generatedAt: string;
};

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

function playerCard(page: Page, name: string) {
  return page
    .locator('button[class*="p-4"][class*="text-left"]')
    .filter({ hasText: name })
    .first();
}

function createPlayer(
  overrides: Partial<LeaderboardPlayer> & {
    playerId: string;
    name: string;
    division: string;
  },
): LeaderboardPlayer {
  const { playerId, name, division, ...rest } = overrides;

  return {
    playerId,
    name,
    division,
    rank: 1,
    scoreToPar: 0,
    thru: 6,
    lastFive: [0, 0, 0, 0, 0],
    delta: {
      rankDelta: 0,
      scoreDelta: 0,
      thruDelta: 0,
    },
    latestUpdate: null,
    ...rest,
  };
}

const alphaTournament: TournamentSummary = {
  id: "alpha-open",
  name: "Alpha Open",
  course: "Central Park Disc Golf",
  roundLabel: "Round 2",
  status: "live",
};

const betaTournament: TournamentSummary = {
  id: "beta-masters",
  name: "Beta Masters",
  course: "Harbor Hills",
  roundLabel: "Round 3",
  status: "live",
};

const upcomingTournament: TournamentSummary = {
  id: "future-invitational",
  name: "Future Invitational",
  course: "North Woods",
  roundLabel: "2026-03-30",
  status: "upcoming",
};

const alphaOpenPlayers = [
  createPlayer({
    playerId: "alice-ace",
    name: "Alice Ace",
    division: "Open",
    rank: 1,
    scoreToPar: -5,
    latestUpdate: {
      id: "alice-ace:2026-03-26T10:00:00.000Z:1:-5:6",
      playerId: "alice-ace",
      playerName: "Alice Ace",
      division: "Open",
      text: "Alice Ace takes the lead at -5",
      importance: "high",
      tone: "positive",
      rank: 1,
      previousRank: 2,
      scoreToPar: -5,
      thru: 6,
      createdAt: "2026-03-26T10:00:00.000Z",
    },
  }),
  createPlayer({
    playerId: "blake-birdie",
    name: "Blake Birdie",
    division: "Open",
    rank: 2,
    scoreToPar: -2,
  }),
];

const alphaWomenPlayers = [
  createPlayer({
    playerId: "cara-chain",
    name: "Cara Chain",
    division: "Women",
    rank: 1,
    scoreToPar: 1,
  }),
];

const betaMastersPlayers = [
  createPlayer({
    playerId: "bruno-birdie",
    name: "Bruno Birdie",
    division: "Masters",
    rank: 1,
    scoreToPar: -3,
  }),
];

const longDivisionPlayers = [
  createPlayer({
    playerId: "dora-drive",
    name: "Dora Drive",
    division: "Damen Master 40 mit sehr langem Namen",
    rank: 1,
    scoreToPar: -1,
  }),
];

function createLiveResponse({
  tournament,
  tournaments,
  divisions,
  leaders,
  divisionLeaders,
  hasLiveData = true,
}: {
  tournament: TournamentSummary;
  tournaments: TournamentSummary[];
  divisions: string[];
  leaders: LeaderboardPlayer[];
  divisionLeaders: Array<{ division: string; leader: LeaderboardPlayer }>;
  hasLiveData?: boolean;
}): LiveResponse {
  return {
    tournament,
    tournaments,
    hasLiveData,
    divisions,
    leaders,
    divisionLeaders,
    generatedAt: "2026-03-26T10:00:00.000Z",
    updateIntervalMs: 25_000,
  };
}

function createLeaderboardResponse(
  tournamentId: string,
  division: string,
  players: LeaderboardPlayer[],
): LeaderboardResponse {
  return {
    tournamentId,
    division,
    players,
    generatedAt: "2026-03-26T10:00:00.000Z",
  };
}

function createUpdatesResponse(
  tournamentId: string,
  updates: RecentUpdate[],
): UpdatesResponse {
  return {
    tournamentId,
    updates,
    generatedAt: "2026-03-26T10:00:00.000Z",
  };
}

async function mockApi(
  page: Page,
  options?: {
    waitForResponse?: (
      pathname: string,
      tournamentId: string,
    ) => Promise<void> | undefined;
    liveByTournamentId?: Record<string, LiveResponse>;
    leaderboardByKey?: Record<string, LeaderboardResponse>;
    updatesByTournamentId?: Record<string, UpdatesResponse>;
  },
) {
  const liveByTournamentId = options?.liveByTournamentId ?? {};
  const leaderboardByKey = options?.leaderboardByKey ?? {};
  const updatesByTournamentId = options?.updatesByTournamentId ?? {};

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const tournamentId = url.searchParams.get("tournamentId") ?? "default";
    const division = url.searchParams.get("division") ?? "";

    await options?.waitForResponse?.(pathname, tournamentId);

    if (pathname === "/api/live") {
      const body =
        liveByTournamentId[tournamentId] ?? liveByTournamentId.default;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      return;
    }

    if (pathname === "/api/leaderboard") {
      const body =
        leaderboardByKey[`${tournamentId}::${division}`] ??
        leaderboardByKey[`${tournamentId}::default`] ??
        leaderboardByKey.default;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      return;
    }

    if (pathname === "/api/updates") {
      const body =
        updatesByTournamentId[tournamentId] ?? updatesByTournamentId.default;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      return;
    }

    await route.fallback();
  });
}

test("keeps the previous leaderboard visible while switching tournaments", async ({
  page,
}) => {
  const releaseBeta = createDeferred();
  const tournaments = [alphaTournament, betaTournament];
  const alphaLive = createLiveResponse({
    tournament: alphaTournament,
    tournaments,
    divisions: ["Open", "Women"],
    leaders: [...alphaOpenPlayers, ...alphaWomenPlayers].slice(0, 3),
    divisionLeaders: [
      { division: "Open", leader: alphaOpenPlayers[0] },
      { division: "Women", leader: alphaWomenPlayers[0] },
    ],
  });
  const betaLive = createLiveResponse({
    tournament: betaTournament,
    tournaments,
    divisions: ["Masters"],
    leaders: betaMastersPlayers,
    divisionLeaders: [{ division: "Masters", leader: betaMastersPlayers[0] }],
  });
  const alphaLatestUpdate = alphaOpenPlayers[0]?.latestUpdate;

  if (!alphaLatestUpdate) {
    throw new Error("Expected seeded latest update for Alpha Open.");
  }

  await mockApi(page, {
    waitForResponse(pathname, tournamentId) {
      if (
        tournamentId === betaTournament.id &&
        (pathname === "/api/live" ||
          pathname === "/api/leaderboard" ||
          pathname === "/api/updates")
      ) {
        return releaseBeta.promise;
      }

      return undefined;
    },
    liveByTournamentId: {
      default: alphaLive,
      [alphaTournament.id]: alphaLive,
      [betaTournament.id]: betaLive,
    },
    leaderboardByKey: {
      [`${alphaTournament.id}::__all`]: createLeaderboardResponse(
        alphaTournament.id,
        "all",
        [...alphaOpenPlayers, ...alphaWomenPlayers],
      ),
      [`${alphaTournament.id}::Open`]: createLeaderboardResponse(
        alphaTournament.id,
        "Open",
        alphaOpenPlayers,
      ),
      [`${betaTournament.id}::Masters`]: createLeaderboardResponse(
        betaTournament.id,
        "Masters",
        betaMastersPlayers,
      ),
    },
    updatesByTournamentId: {
      default: createUpdatesResponse(alphaTournament.id, [alphaLatestUpdate]),
      [alphaTournament.id]: createUpdatesResponse(alphaTournament.id, [
        alphaLatestUpdate,
      ]),
      [betaTournament.id]: createUpdatesResponse(betaTournament.id, []),
    },
  });

  await page.goto("/en");
  await expect(playerCard(page, "Alice Ace")).toBeVisible();

  await page.getByRole("button", { name: /Beta Masters/i }).click();

  await expect(playerCard(page, "Alice Ace")).toBeVisible();

  releaseBeta.resolve();

  await expect(playerCard(page, "Bruno Birdie")).toBeVisible();
});

test("keeps the previous division leaderboard visible while a new division loads", async ({
  page,
}) => {
  const releaseWomen = createDeferred();
  const alphaLive = createLiveResponse({
    tournament: alphaTournament,
    tournaments: [alphaTournament],
    divisions: ["Open", "Women"],
    leaders: [...alphaOpenPlayers, ...alphaWomenPlayers].slice(0, 3),
    divisionLeaders: [
      { division: "Open", leader: alphaOpenPlayers[0] },
      { division: "Women", leader: alphaWomenPlayers[0] },
    ],
  });

  await mockApi(page, {
    waitForResponse(pathname, tournamentId) {
      if (
        pathname === "/api/leaderboard" &&
        tournamentId === alphaTournament.id
      ) {
        return undefined;
      }

      return undefined;
    },
    liveByTournamentId: {
      default: alphaLive,
      [alphaTournament.id]: alphaLive,
    },
    leaderboardByKey: {
      [`${alphaTournament.id}::__all`]: createLeaderboardResponse(
        alphaTournament.id,
        "all",
        [...alphaOpenPlayers, ...alphaWomenPlayers],
      ),
      [`${alphaTournament.id}::Open`]: createLeaderboardResponse(
        alphaTournament.id,
        "Open",
        alphaOpenPlayers,
      ),
      [`${alphaTournament.id}::Women`]: createLeaderboardResponse(
        alphaTournament.id,
        "Women",
        alphaWomenPlayers,
      ),
    },
    updatesByTournamentId: {
      default: createUpdatesResponse(alphaTournament.id, []),
      [alphaTournament.id]: createUpdatesResponse(alphaTournament.id, []),
    },
  });

  await page.goto("/en?division=Open");
  await expect(playerCard(page, "Alice Ace")).toBeVisible();

  await page.route(
    `**/api/leaderboard?tournamentId=${alphaTournament.id}&division=Women`,
    async (route) => {
      await releaseWomen.promise;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          createLeaderboardResponse(
            alphaTournament.id,
            "Women",
            alphaWomenPlayers,
          ),
        ),
      });
    },
  );

  const womenTab = page.getByRole("tab", { name: "Women" });
  await womenTab.click();

  await expect(playerCard(page, "Alice Ace")).toBeVisible();

  releaseWomen.resolve();

  await expect(playerCard(page, "Cara Chain")).toBeVisible();
});

test("shows the upcoming tournament empty state instead of old standings", async ({
  page,
}) => {
  const tournaments = [alphaTournament, upcomingTournament];
  const alphaLive = createLiveResponse({
    tournament: alphaTournament,
    tournaments,
    divisions: ["Open"],
    leaders: alphaOpenPlayers,
    divisionLeaders: [{ division: "Open", leader: alphaOpenPlayers[0] }],
  });
  const upcomingLive = createLiveResponse({
    tournament: upcomingTournament,
    tournaments,
    divisions: [],
    leaders: [],
    divisionLeaders: [],
    hasLiveData: false,
  });

  await mockApi(page, {
    liveByTournamentId: {
      default: alphaLive,
      [alphaTournament.id]: alphaLive,
      [upcomingTournament.id]: upcomingLive,
    },
    leaderboardByKey: {
      [`${alphaTournament.id}::__all`]: createLeaderboardResponse(
        alphaTournament.id,
        "all",
        alphaOpenPlayers,
      ),
      [`${alphaTournament.id}::Open`]: createLeaderboardResponse(
        alphaTournament.id,
        "Open",
        alphaOpenPlayers,
      ),
      [`${upcomingTournament.id}::default`]: createLeaderboardResponse(
        upcomingTournament.id,
        "",
        [],
      ),
      [`${upcomingTournament.id}::Open`]: createLeaderboardResponse(
        upcomingTournament.id,
        "Open",
        [],
      ),
    },
    updatesByTournamentId: {
      default: createUpdatesResponse(alphaTournament.id, []),
      [alphaTournament.id]: createUpdatesResponse(alphaTournament.id, []),
      [upcomingTournament.id]: createUpdatesResponse(upcomingTournament.id, []),
    },
  });

  await page.goto("/en?division=Open");
  await page.getByRole("button", { name: /Future Invitational/i }).click();

  await expect(
    page.getByText(
      "This tournament has not started live scoring yet. Check back closer to tee time.",
    ),
  ).toBeVisible();
  await expect(playerCard(page, "Alice Ace")).not.toBeVisible();
});

test("shows registered players before live scoring starts", async ({
  page,
}) => {
  const registeredPlayer = createPlayer({
    playerId: "future-open:registered-player",
    name: "Registered Player",
    division: "Open",
    thru: 0,
    lastFive: [],
  });
  const tournaments = [upcomingTournament];
  const upcomingLive = createLiveResponse({
    tournament: upcomingTournament,
    tournaments,
    divisions: ["Open"],
    leaders: [registeredPlayer],
    divisionLeaders: [{ division: "Open", leader: registeredPlayer }],
    hasLiveData: false,
  });

  await mockApi(page, {
    liveByTournamentId: {
      default: upcomingLive,
      [upcomingTournament.id]: upcomingLive,
    },
    leaderboardByKey: {
      [`${upcomingTournament.id}::default`]: createLeaderboardResponse(
        upcomingTournament.id,
        "Open",
        [registeredPlayer],
      ),
      [`${upcomingTournament.id}::Open`]: createLeaderboardResponse(
        upcomingTournament.id,
        "Open",
        [registeredPlayer],
      ),
    },
    updatesByTournamentId: {
      default: createUpdatesResponse(upcomingTournament.id, []),
      [upcomingTournament.id]: createUpdatesResponse(upcomingTournament.id, []),
    },
  });

  await page.goto("/en");

  await expect(playerCard(page, "Registered Player")).toBeVisible();
});

test("persists followed players across reloads", async ({ page }) => {
  const alphaLive = createLiveResponse({
    tournament: alphaTournament,
    tournaments: [alphaTournament],
    divisions: ["Open"],
    leaders: alphaOpenPlayers,
    divisionLeaders: [{ division: "Open", leader: alphaOpenPlayers[0] }],
  });

  await mockApi(page, {
    liveByTournamentId: {
      default: alphaLive,
      [alphaTournament.id]: alphaLive,
    },
    leaderboardByKey: {
      [`${alphaTournament.id}::__all`]: createLeaderboardResponse(
        alphaTournament.id,
        "all",
        alphaOpenPlayers,
      ),
      [`${alphaTournament.id}::Open`]: createLeaderboardResponse(
        alphaTournament.id,
        "Open",
        alphaOpenPlayers,
      ),
    },
    updatesByTournamentId: {
      default: createUpdatesResponse(alphaTournament.id, []),
      [alphaTournament.id]: createUpdatesResponse(alphaTournament.id, []),
    },
  });

  await page.goto("/en");

  await page.getByRole("button", { name: "Follow player" }).first().click();
  await page.getByRole("button", { name: "Following" }).click();

  await expect(playerCard(page, "Alice Ace")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Following" }).click();

  await expect(
    page.getByRole("button", { name: "Unfollow player" }),
  ).toHaveCount(1);
  await expect(playerCard(page, "Alice Ace")).toBeVisible();
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps long labels from causing page-level horizontal overflow", async ({
    page,
  }) => {
    const longTournament: TournamentSummary = {
      id: "long-label-open",
      name: "Exceptionally Long Tournament Name Designed To Stress Mobile Layout",
      course:
        "A Very Long Course Name With Detailed Venue Context For Overflow Testing",
      roundLabel: "Round 1",
      status: "live",
    };
    const longLive = createLiveResponse({
      tournament: longTournament,
      tournaments: [longTournament],
      divisions: [
        "Damen Master 40 mit sehr langem Namen",
        "Junioren 18 mit erweitertem Zusatz",
      ],
      leaders: longDivisionPlayers,
      divisionLeaders: [
        {
          division: "Damen Master 40 mit sehr langem Namen",
          leader: longDivisionPlayers[0],
        },
      ],
    });

    await mockApi(page, {
      liveByTournamentId: {
        default: longLive,
        [longTournament.id]: longLive,
      },
      leaderboardByKey: {
        [`${longTournament.id}::Damen Master 40 mit sehr langem Namen`]:
          createLeaderboardResponse(
            longTournament.id,
            "Damen Master 40 mit sehr langem Namen",
            longDivisionPlayers,
          ),
      },
      updatesByTournamentId: {
        default: createUpdatesResponse(longTournament.id, []),
        [longTournament.id]: createUpdatesResponse(longTournament.id, []),
      },
    });

    await page.goto("/en");

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalOverflow).toBe(false);
  });

  test("keeps long tournament names usable on the board view", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const longTournament: TournamentSummary = {
      id: "waldschwimmbad-open",
      name: "22. Waldschwimmbad Open, Zugunsten Förderverein Discgolf Jugend Deutschland",
      course:
        "A Very Long Course Name With Detailed Venue Context For Overflow Testing",
      roundLabel: "Round 2 of 3",
      status: "live",
    };
    const alternateTournament: TournamentSummary = {
      id: "alpha-open",
      name: "Alpha Open",
      course: "Central Park Disc Golf",
      roundLabel: "Round 2",
      status: "live",
    };
    const longLive = createLiveResponse({
      tournament: longTournament,
      tournaments: [longTournament, alternateTournament],
      divisions: ["Damen Master 40 mit sehr langem Namen"],
      leaders: longDivisionPlayers,
      divisionLeaders: [
        {
          division: "Damen Master 40 mit sehr langem Namen",
          leader: longDivisionPlayers[0],
        },
      ],
    });
    const alternateLive = createLiveResponse({
      tournament: alternateTournament,
      tournaments: [longTournament, alternateTournament],
      divisions: ["Open"],
      leaders: alphaOpenPlayers,
      divisionLeaders: [{ division: "Open", leader: alphaOpenPlayers[0] }],
    });

    await mockApi(page, {
      liveByTournamentId: {
        default: longLive,
        [longTournament.id]: longLive,
        [alternateTournament.id]: alternateLive,
      },
      leaderboardByKey: {
        [`${longTournament.id}::Damen Master 40 mit sehr langem Namen`]:
          createLeaderboardResponse(
            longTournament.id,
            "Damen Master 40 mit sehr langem Namen",
            longDivisionPlayers,
          ),
        [`${alternateTournament.id}::Open`]: createLeaderboardResponse(
          alternateTournament.id,
          "Open",
          alphaOpenPlayers,
        ),
      },
      updatesByTournamentId: {
        default: createUpdatesResponse(longTournament.id, []),
        [longTournament.id]: createUpdatesResponse(longTournament.id, []),
        [alternateTournament.id]: createUpdatesResponse(
          alternateTournament.id,
          [],
        ),
      },
    });

    await page.goto("/en/board");

    await expect(
      page.getByRole("combobox", { name: "Tournament" }),
    ).toHaveValue(longTournament.id);

    await expect(
      page.getByRole("heading", { name: longTournament.name }),
    ).toBeVisible();
    await expect(page.getByRole("article")).toBeVisible();

    const boardTitle = page.getByRole("heading", { name: longTournament.name });
    await expect(boardTitle).toBeVisible();

    const titleFitsInsideCard = await boardTitle.evaluate((element) => {
      const heading = element.getBoundingClientRect();
      const card = element.parentElement?.getBoundingClientRect();

      return Boolean(
        card && heading.left >= card.left && heading.right <= card.right,
      );
    });
    expect(titleFitsInsideCard).toBe(true);

    const tournamentSelect = page.getByRole("combobox", { name: "Tournament" });
    const selectFitsInsideViewport = await tournamentSelect.evaluate(
      (element) => {
        const select = element.getBoundingClientRect();

        return select.left >= 0 && select.right <= window.innerWidth;
      },
    );
    expect(selectFitsInsideViewport).toBe(true);

    const overflowInfo = await page.evaluate(() => {
      const offenders = Array.from(document.querySelectorAll("body *"))
        .map((element) => ({
          element: element.tagName.toLowerCase(),
          className: element.getAttribute("class") ?? "",
          text: element.textContent?.trim().slice(0, 80) ?? "",
          right: Math.round(element.getBoundingClientRect().right),
        }))
        .filter((item) => item.right > window.innerWidth + 1)
        .slice(0, 20);

      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        offenders,
      };
    });
    expect(overflowInfo.documentWidth).toBeLessThanOrEqual(
      overflowInfo.viewportWidth,
    );
  });
});

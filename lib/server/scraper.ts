import { load } from "cheerio";

import { formatPlayerDisplayName } from "@/lib/player-club";
import type { PlayerRound, PlayerSnapshot, ThruValue } from "@/lib/types";

export type ScrapedSnapshot = {
  generatedAt: string;
  players: PlayerSnapshot[];
};

function sanitizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function safeParseRounds(value: string | undefined): PlayerRound[] | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as PlayerRound[];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseMockSnapshot(html: string): ScrapedSnapshot {
  const $ = load(html);
  const generatedAt = $("section").attr("data-generated-at");

  if (!generatedAt) {
    throw new Error("Missing generated timestamp in scraped snapshot.");
  }

  const players: PlayerSnapshot[] = $("li[data-player-id]")
    .map((_, element) => {
      const row = $(element);
      const thruValue = row.attr("data-thru");
      const thru: ThruValue = thruValue === "F" ? "F" : Number(thruValue);
      const lastFive = (row.attr("data-last-five") ?? "")
        .split(",")
        .filter(Boolean)
        .map(Number);
      const rounds = safeParseRounds(row.attr("data-rounds"));

      return {
        playerId: row.attr("data-player-id") ?? "",
        name: row.attr("data-name") ?? "",
        club: row.attr("data-club") || undefined,
        division: row.attr("data-division") ?? "",
        rank: Number(row.attr("data-rank")),
        scoreToPar: Number(row.attr("data-score")),
        thru,
        lastFive,
        rounds,
      };
    })
    .get();

  return { generatedAt, players };
}

function parseHoleValue(cellText: string) {
  if (cellText === "") {
    return null;
  }

  const value = Number(cellText);
  return Number.isFinite(value) ? value : null;
}

function hasUnsupportedStatus(cells: string[]) {
  return cells.some((cell) => /^(DNF|DNS|DSQ)$/i.test(cell));
}

function playerIdFrom(division: string, name: string) {
  return `${division}:${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractScoreToPar(summaryCells: string[]) {
  const values = summaryCells.filter((cell) => cell !== "");

  if (values.length >= 4) {
    return Number(values[values.length - 2]);
  }

  return Number(values[0]);
}

function buildRound(
  playerId: string,
  rowCells: string[],
  parValues: Array<number | null>,
  order: number,
): PlayerRound {
  const holeTexts = rowCells.slice(2, 2 + parValues.length);
  const holeValues = holeTexts.map((cellText) => parseHoleValue(cellText));
  const playedCount = holeValues.filter(
    (value): value is number => value !== null,
  ).length;
  const thru: PlayerRound["thru"] =
    playedCount === 0 ? 0 : playedCount >= parValues.length ? "F" : playedCount;

  const holes = parValues.map((par, index) => {
    const score = holeValues[index] ?? null;
    return {
      hole: index + 1,
      par,
      score,
      relativeToPar: score === null || par === null ? null : score - par,
    };
  });

  const scoreToParValues = holes
    .map((hole) => hole.relativeToPar)
    .filter((value): value is number => value !== null);

  return {
    id: `${playerId}-round-${order}`,
    order,
    label: `Round ${order}`,
    thru,
    scoreToPar:
      scoreToParValues.length > 0
        ? scoreToParValues.reduce((sum, value) => sum + value, 0)
        : null,
    holes,
  };
}

function parseLiveSnapshot(html: string): ScrapedSnapshot {
  const $ = load(html);
  const generatedAt = new Date().toISOString();
  const players: PlayerSnapshot[] = [];

  const tableNode = $("#livescoring_");

  if (tableNode.length === 0) {
    throw new Error("No live scoring table found in live scoreboard page.");
  }

  const sections = tableNode.children().toArray();

  for (let index = 0; index < sections.length; index += 2) {
    const thead = sections[index];
    const tbody = sections[index + 1];

    if (
      !thead ||
      !tbody ||
      thead.tagName !== "thead" ||
      tbody.tagName !== "tbody"
    ) {
      continue;
    }

    const division = sanitizeText(
      $(thead).find("tr").eq(1).find("th.th_name").first().text(),
    );
    const parValues = $(thead)
      .find("tr")
      .first()
      .find("th.th_hole")
      .map((_, hole) => parseHoleValue(sanitizeText($(hole).text())))
      .get()
      .filter((value): value is number => value !== null)
      .map(Math.abs);

    const rows = $(tbody).find("> tr").toArray();
    let rowIndex = 0;

    while (rowIndex < rows.length) {
      const firstCells = $(rows[rowIndex])
        .find("td")
        .toArray()
        .map((cell) => sanitizeText($(cell).text()));
      const rankCell = firstCells[0] ?? "";
      const nameCell = firstCells[1] ?? "";

      if (!rankCell || !nameCell) {
        rowIndex += 1;
        continue;
      }

      const groupedRows: string[][] = [firstCells];
      let nextIndex = rowIndex + 1;

      while (nextIndex < rows.length) {
        const candidateCells = $(rows[nextIndex])
          .find("td")
          .toArray()
          .map((cell) => sanitizeText($(cell).text()));

        const candidateRank = candidateCells[0] ?? "";
        const candidateName = candidateCells[1] ?? "";

        if (candidateRank || candidateName) {
          break;
        }

        // Some live pages insert a blank separator row after the grouped round rows.
        // Skip over it, but do not let it become the player's active row.
        if (candidateCells.some((cell) => cell !== "")) {
          groupedRows.push(candidateCells);
        }
        nextIndex += 1;
      }

      const activeRow = groupedRows[groupedRows.length - 1];
      const rounds = groupedRows.map((row, roundIndex) =>
        buildRound(
          playerIdFrom(division, nameCell),
          row,
          parValues,
          roundIndex + 1,
        ),
      );

      if (hasUnsupportedStatus(firstCells) || hasUnsupportedStatus(activeRow)) {
        rowIndex = nextIndex;
        continue;
      }

      const holeTexts = activeRow.slice(2, 2 + parValues.length);
      const playedHoles = holeTexts
        .map((cellText) => parseHoleValue(cellText))
        .filter((value): value is number => value !== null);
      const thru: ThruValue =
        playedHoles.length >= parValues.length ? "F" : playedHoles.length;
      const summaryCells = activeRow.slice(2 + parValues.length);
      const scoreToPar = extractScoreToPar(summaryCells);

      if (Number.isFinite(scoreToPar)) {
        const lastFive = holeTexts
          .map((cellText, holeIndex) => {
            const score = parseHoleValue(cellText);
            const par = parValues[holeIndex];
            return score === null || par === null || par === undefined
              ? null
              : score - par;
          })
          .filter((value): value is number => value !== null)
          .slice(-5);

        players.push({
          playerId: playerIdFrom(division, nameCell),
          name: formatPlayerDisplayName(nameCell),
          division,
          rank: Number(rankCell),
          scoreToPar,
          thru,
          lastFive,
          rounds,
        });
      }

      rowIndex = nextIndex;
    }
  }

  return { generatedAt, players };
}

export function scrapeSnapshot(html: string): ScrapedSnapshot {
  if (html.includes("data-player-id=")) {
    return parseMockSnapshot(html);
  }

  return parseLiveSnapshot(html);
}

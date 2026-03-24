import { load } from "cheerio";

import type { PlayerSnapshot, ThruValue } from "@/lib/types";

export type ScrapedSnapshot = {
  generatedAt: string;
  players: PlayerSnapshot[];
};

function sanitizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
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

      return {
        playerId: row.attr("data-player-id") ?? "",
        name: row.attr("data-name") ?? "",
        division: row.attr("data-division") ?? "",
        rank: Number(row.attr("data-rank")),
        scoreToPar: Number(row.attr("data-score")),
        thru,
        lastFive,
      };
    })
    .get();

  return { generatedAt, players };
}

function parseHoleValue(cellText: string) {
  const value = Number(cellText);
  return Number.isFinite(value) ? value : null;
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

    if (!thead || !tbody || thead.tagName !== "thead" || tbody.tagName !== "tbody") {
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
      .slice(0, 18);

    const rows = $(tbody).find("> tr").toArray();
    let rowIndex = 0;

    while (rowIndex < rows.length) {
      const firstRow = $(rows[rowIndex]);
      const firstCells = firstRow.find("td").toArray().map((cell) => sanitizeText($(cell).text()));
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
      const holeTexts = activeRow.slice(2, 2 + parValues.length);
      const playedHoles = holeTexts
        .map((cellText) => parseHoleValue(cellText))
        .filter((value): value is number => value !== null);
      const thru: ThruValue =
        playedHoles.length >= parValues.length ? "F" : playedHoles.length;
      const summaryCells = activeRow.slice(2 + parValues.length);
      const scoreToPar = extractScoreToPar(summaryCells);

      if (Number.isFinite(scoreToPar)) {
        const lastFive = playedHoles
          .map((score, holeIndex) => score - (parValues[holeIndex] ?? score))
          .slice(-5);

        players.push({
          playerId: playerIdFrom(division, nameCell),
          name: nameCell,
          division,
          rank: Number(rankCell),
          scoreToPar,
          thru,
          lastFive,
        });
      }

      rowIndex = nextIndex;
    }
  }

  if (players.length === 0) {
    throw new Error("No player rows found in live scoreboard page.");
  }

  return { generatedAt, players };
}

export function scrapeSnapshot(html: string): ScrapedSnapshot {
  if (html.includes("data-player-id=")) {
    return parseMockSnapshot(html);
  }

  return parseLiveSnapshot(html);
}

#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { load } from "cheerio";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDir = path.resolve(
  scriptDir,
  "../lib/server/fixtures/lakers-open",
);

function parseArgs(args) {
  const options = { directory: defaultDir, format: "markdown", output: null };

  for (const arg of args) {
    if (arg === "--format=json") options.format = "json";
    else if (arg === "--format=markdown") options.format = "markdown";
    else if (arg.startsWith("--output=")) {
      options.output = path.resolve(arg.slice("--output=".length));
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.directory = path.resolve(arg);
    }
  }

  return options;
}

function text($, element) {
  return $(element).text().replace(/\s+/g, " ").trim();
}

function playerIdFrom(division, name) {
  return `${division}:${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseScoreToPar(summaryCells) {
  const values = summaryCells.filter(Boolean);
  return Number(values.length >= 4 ? values.at(-2) : values[0]);
}

function scrapeSnapshot(html, fileName) {
  const $ = load(html);
  const table = $("#livescoring_");
  if (!table.length)
    throw new Error(`${fileName}: missing #livescoring_ table`);

  const players = new Map();
  const sections = table.children().toArray();

  for (let index = 0; index < sections.length; index += 2) {
    const thead = sections[index];
    const tbody = sections[index + 1];
    if (thead?.tagName !== "thead" || tbody?.tagName !== "tbody") continue;

    const division = text(
      $,
      $(thead).find("tr").eq(1).find("th.th_name").first(),
    );
    const parValues = $(thead)
      .find("tr")
      .first()
      .find("th.th_hole")
      .map((_, hole) => {
        const value = Number(text($, hole));
        return Number.isFinite(value) ? value : null;
      })
      .get()
      .filter((value) => value !== null);
    const rows = $(tbody).find("> tr").toArray();
    let rowIndex = 0;

    while (rowIndex < rows.length) {
      const firstCells = $(rows[rowIndex])
        .find("td")
        .toArray()
        .map((cell) => text($, cell));
      const rankCell = firstCells[0] ?? "";
      const name = firstCells[1] ?? "";

      if (!rankCell || !name) {
        rowIndex += 1;
        continue;
      }

      const groupedRows = [firstCells];
      let nextIndex = rowIndex + 1;

      while (nextIndex < rows.length) {
        const candidate = $(rows[nextIndex])
          .find("td")
          .toArray()
          .map((cell) => text($, cell));
        if ((candidate[0] ?? "") || (candidate[1] ?? "")) break;
        if (candidate.some(Boolean)) groupedRows.push(candidate);
        nextIndex += 1;
      }

      const activeRow = groupedRows.at(-1);
      const unsupportedStatus = [...firstCells, ...activeRow].some((cell) =>
        /^(DNF|DNS|DSQ)$/i.test(cell),
      );

      if (!unsupportedStatus) {
        const playerId = playerIdFrom(division, name);
        const rounds = groupedRows.map((row, roundIndex) => {
          const holes = parValues.map((par, holeIndex) => {
            const score = Number(row[holeIndex + 2]);
            const parsedScore =
              Number.isFinite(score) && row[holeIndex + 2] !== ""
                ? score
                : null;
            return {
              hole: holeIndex + 1,
              par,
              score: parsedScore,
              relativeToPar: parsedScore === null ? null : parsedScore - par,
            };
          });
          return {
            id: `${playerId}-round-${roundIndex + 1}`,
            order: roundIndex + 1,
            holes,
          };
        });
        const playedHoles = activeRow
          .slice(2, 2 + parValues.length)
          .filter(Boolean);
        const thru =
          playedHoles.length >= parValues.length ? "F" : playedHoles.length;
        const scoreToPar = parseScoreToPar(
          activeRow.slice(2 + parValues.length),
        );

        if (Number.isFinite(scoreToPar)) {
          players.set(playerId, {
            playerId,
            name,
            division,
            rank: Number(rankCell),
            scoreToPar,
            thru,
            rounds,
          });
        }
      }

      rowIndex = nextIndex;
    }
  }

  if (!players.size) throw new Error(`${fileName}: no player rows found`);
  return players;
}

function formatScore(score) {
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

function throughSuffix(thru) {
  return thru === "F" ? "" : ` through ${thru}`;
}

function updateImportance(previous, current, kind) {
  const scoreSwing = Math.abs(previous.scoreToPar - current.scoreToPar);
  const rankSwing = Math.abs(previous.rank - current.rank);
  const topThreeShift =
    (previous.rank > 3 && current.rank <= 3) ||
    (previous.rank <= 3 && current.rank > 3);

  if (kind === "rank-up" && current.rank === 1) return "high";
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

function newlyRecordedSpecialHole(previous, current) {
  const previousHoles = new Map(
    (previous.rounds.at(-1)?.holes ?? []).map((hole) => [hole.hole, hole]),
  );

  for (const hole of current.rounds.at(-1)?.holes ?? []) {
    const previousHole = previousHoles.get(hole.hole);
    if (
      hole.relativeToPar === null ||
      (previousHole?.relativeToPar !== null &&
        previousHole?.relativeToPar !== undefined)
    ) {
      continue;
    }
    if (hole.score === 1) return { hole: hole.hole, type: "ace" };
    if (hole.relativeToPar <= -2) return { hole: hole.hole, type: "eagle" };
  }

  return null;
}

function findRoundStartHole(round) {
  const holeCount = round.holes.length;
  const playedHoles = new Set(
    round.holes
      .filter((hole) => hole.relativeToPar !== null)
      .map((hole) => hole.hole),
  );
  if (playedHoles.size === 0 || playedHoles.size === holeCount) return null;

  const starts = round.holes
    .filter((hole) => {
      const previousHole = hole.hole === 1 ? holeCount : hole.hole - 1;
      return playedHoles.has(hole.hole) && !playedHoles.has(previousHole);
    })
    .map((hole) => hole.hole);
  return starts.length === 1 ? starts[0] : null;
}

function newlyRecordedTurkey(previous, current) {
  const currentRound = current.rounds.at(-1);
  if (!currentRound) return [];
  const previousRound = previous.rounds.find(
    (round) => round.order === currentRound.order,
  );
  const startHole =
    findRoundStartHole(currentRound) ??
    (previousRound ? findRoundStartHole(previousRound) : null);
  if (startHole === null) return [];

  const playedInOrder = [
    ...currentRound.holes.filter((hole) => hole.hole >= startHole),
    ...currentRound.holes.filter((hole) => hole.hole < startHole),
  ];
  // Rotate once for the shotgun start; do not wrap after the final hole.
  const previousHoles = new Map(
    (previousRound?.holes ?? []).map((hole) => [hole.hole, hole]),
  );
  const newlyBirdied = new Set(
    playedInOrder
      .filter((hole) => {
        const oldHole = previousHoles.get(hole.hole);
        return (
          hole.relativeToPar !== null &&
          hole.relativeToPar <= -1 &&
          (oldHole?.relativeToPar === null ||
            oldHole?.relativeToPar === undefined ||
            oldHole.relativeToPar > -1)
        );
      })
      .map((hole) => hole.hole),
  );
  if (newlyBirdied.size === 0) return [];

  const milestones = [];
  for (let endIndex = 0; endIndex < playedInOrder.length; endIndex += 1) {
    const endingHole = playedInOrder[endIndex];
    if (
      !newlyBirdied.has(endingHole.hole) ||
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
      milestones.push(
        playedInOrder
          .slice(endIndex - 2, endIndex + 1)
          .map((hole) => hole.hole),
      );
    }
  }
  return milestones;
}

function createUpdate(previous, current) {
  if (!previous) return null;
  const score = formatScore(current.scoreToPar);
  const specialHole = newlyRecordedSpecialHole(previous, current);

  if (specialHole) {
    return {
      text: `${current.name} ${specialHole.type === "ace" ? "hits an ace" : "scores an eagle"} on hole ${specialHole.hole}`,
      importance: "high",
    };
  }
  if (current.rank === 1 && previous.rank !== 1) {
    return {
      text: `${current.name} takes the lead at ${score}`,
      importance: "high",
    };
  }
  if (previous.thru !== "F" && current.thru === "F") {
    const scoreSwing = Math.abs(previous.scoreToPar - current.scoreToPar);
    if (current.rank > 3 && scoreSwing < 3) return null;
    return {
      text: `${current.name} finishes at ${score}`,
      importance: updateImportance(previous, current, "finish"),
    };
  }
  if (current.rank < previous.rank) {
    if (!isNewsworthyRankMovement(previous, current)) return null;
    const importance = updateImportance(previous, current, "rank-up");
    if (importance === "low") return null;
    return {
      text: `${current.name} climbs ${previous.rank - current.rank} ${previous.rank - current.rank === 1 ? "spot" : "spots"} to #${current.rank} at ${score}${throughSuffix(current.thru)}`,
      importance,
    };
  }
  if (current.rank > previous.rank) {
    if (!isNewsworthyRankMovement(previous, current)) return null;
    const importance = updateImportance(previous, current, "rank-down");
    if (importance === "low") return null;
    return {
      text: `${current.name} drops ${current.rank - previous.rank} ${current.rank - previous.rank === 1 ? "spot" : "spots"} to #${current.rank} at ${score}${throughSuffix(current.thru)}`,
      importance,
    };
  }
  return null;
}

function isNewsworthyRankMovement(previous, current) {
  return previous.rank <= 3 || current.rank <= 3;
}

function snapshotLabel(fileName) {
  return fileName.match(/T(\d{2}-\d{2})-/)?.[1] ?? fileName;
}

function renderMarkdown(snapshots) {
  const lines = [
    "# Mock replay update strings",
    "",
    "The first snapshot is the baseline. Each later snapshot is compared with the previous one.",
    "",
  ];

  for (const snapshot of snapshots) {
    lines.push(`## ${snapshot.label} (${snapshot.updates.length} updates)`, "");
    for (const update of snapshot.updates) {
      lines.push(`- [${update.importance}] ${update.text}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!new Set(["json", "markdown"]).has(options.format)) {
    throw new Error("Format must be markdown or json");
  }

  const files = (await readdir(options.directory))
    .filter((name) => /^snapshot-.*\.html$/.test(name))
    .sort();
  if (!files.length)
    throw new Error(`No snapshot HTML files in ${options.directory}`);

  let previous = null;
  const snapshots = [];
  for (const fileName of files) {
    const players = scrapeSnapshot(
      await readFile(path.join(options.directory, fileName), "utf8"),
      fileName,
    );
    const updates = [];
    if (previous) {
      for (const [playerId, player] of players) {
        const previousPlayer = previous.get(playerId);
        const update = createUpdate(previousPlayer, player);
        if (update) updates.push(update);
        const turkeys = previousPlayer
          ? newlyRecordedTurkey(previousPlayer, player)
          : [];
        for (const turkey of turkeys) {
          updates.push({
            text: `${player.name} scores a turkey on holes ${turkey.join(", ")}`,
            importance: "high",
          });
        }
      }
    }
    snapshots.push({ file: fileName, label: snapshotLabel(fileName), updates });
    previous = players;
  }

  const output =
    options.format === "json"
      ? `${JSON.stringify(snapshots, null, 2)}\n`
      : renderMarkdown(snapshots);
  if (options.output) await writeFile(options.output, output);
  else process.stdout.write(output);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { load } from "cheerio";

const DEFAULT_TOURNAMENT_ID = "2423";
const DEFAULT_INTERVAL_SECONDS = 30;
const DEFAULT_STOP_AFTER_ROUND = 3;
const LIVE_URL = "https://turniere.discgolf.de/index.php?p=events&sp=live&id=";

function printUsage() {
  console.log(`Usage: npm run capture:tournament -- [tournament-id] [--interval=seconds] [--stop-after-round=number]

Polls the official live scorecard and saves a compact HTML snapshot whenever
the scores change. Stops after all listed players complete the target round.
Press Ctrl+C to stop early. Defaults to tournament 2423 every
${DEFAULT_INTERVAL_SECONDS} seconds and stops after round ${DEFAULT_STOP_AFTER_ROUND}.

Examples:
  npm run capture:tournament
  npm run capture:tournament -- 2423 --interval=15 --stop-after-round=3`);
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}

const tournamentId =
  args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_TOURNAMENT_ID;
const intervalArgument = args.find((arg) => arg.startsWith("--interval="));
const intervalSeconds = intervalArgument
  ? Number(intervalArgument.slice("--interval=".length))
  : DEFAULT_INTERVAL_SECONDS;
const stopAfterRoundArgument = args.find((arg) =>
  arg.startsWith("--stop-after-round="),
);
const stopAfterRound = stopAfterRoundArgument
  ? Number(stopAfterRoundArgument.slice("--stop-after-round=".length))
  : DEFAULT_STOP_AFTER_ROUND;

if (!/^\d+$/.test(tournamentId)) {
  console.error(`Invalid tournament id: ${tournamentId}`);
  process.exit(1);
}

if (
  !Number.isInteger(intervalSeconds) ||
  intervalSeconds < 5 ||
  intervalSeconds > 3600
) {
  console.error("Interval must be a whole number between 5 and 3600 seconds.");
  process.exit(1);
}

if (
  !Number.isInteger(stopAfterRound) ||
  stopAfterRound < 1 ||
  stopAfterRound > 20
) {
  console.error("Stop-after-round must be a whole number between 1 and 20.");
  process.exit(1);
}

const sessionName = new Date()
  .toISOString()
  .replaceAll(":", "-")
  .replaceAll(".", "-");
const outputDirectory = path.resolve(
  process.cwd(),
  "tmp",
  "tournament-captures",
  tournamentId,
  sessionName,
);
const manifestPath = path.join(outputDirectory, "manifest.jsonl");
const sourceUrl = `${LIVE_URL}${encodeURIComponent(tournamentId)}`;
let previousHash = "";
let stopping = false;

await mkdir(outputDirectory, { recursive: true });
console.log(
  `Capturing tournament ${tournamentId} every ${intervalSeconds}s; stopping after round ${stopAfterRound} is complete.`,
);
console.log(`Snapshots will be saved to ${outputDirectory}`);
console.log("Press Ctrl+C to stop.");

process.on("SIGINT", () => {
  stopping = true;
  console.log("\nStopping after the current request...");
});

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function compactScorecard(html) {
  const $ = load(html);
  const table = $("#livescoring_");

  if (table.length === 0) {
    throw new Error(
      "The response does not contain a live scorecard (#livescoring_).",
    );
  }

  const roundLinks = $(".lso_btn_navigation[data-target-element='round']")
    .toArray()
    .map((element) => {
      const link = $(element);
      const target = link.attr("data-target-value") ?? "";
      const href = link.attr("href") ?? "";
      const label = link.text().replace(/\s+/g, " ").trim();

      return `<a class="lso_btn_navigation" data-target-element="round" data-target-value="${escapeHtml(target)}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    })
    .join("");

  table
    .find("*")
    .contents()
    .each((_, node) => {
      if (node.type === "text") {
        node.data = node.data.replace(/\s+/g, " ");
      }
    });

  return {
    html: `<!doctype html><html><body><nav>${roundLinks}</nav>${table.toString()}</body></html>`.replace(
      />\s+</g,
      "><",
    ),
    eventTitle: $("h3").first().text().replace(/\s+/g, " ").trim(),
    roundCompletion: getRoundCompletion($, table, stopAfterRound),
  };
}

function getRoundCompletion($, table, targetRound) {
  const availableRounds = $(".lso_btn_navigation[data-target-element='round']")
    .toArray()
    .map((element) => Number($(element).attr("data-target-value")))
    .filter((value) => Number.isInteger(value) && value > 0 && value !== 99);

  if (Math.max(0, ...availableRounds) < targetRound) {
    return { complete: false, targetRound, playerCount: 0, terminalCount: 0 };
  }

  const sections = table.children().toArray();
  let playerCount = 0;
  let terminalCount = 0;
  let complete = true;

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

    const holeCount = $(thead).find("tr").first().find("th.th_hole").length;
    const rows = $(tbody).find("> tr").toArray();
    let rowIndex = 0;

    while (rowIndex < rows.length) {
      const firstCells = $(rows[rowIndex])
        .find("td")
        .toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, " ").trim());

      if (!firstCells[0] || !firstCells[1]) {
        rowIndex += 1;
        continue;
      }

      const groupedRows = [firstCells];
      let nextIndex = rowIndex + 1;

      while (nextIndex < rows.length) {
        const candidateCells = $(rows[nextIndex])
          .find("td")
          .toArray()
          .map((cell) => $(cell).text().replace(/\s+/g, " ").trim());

        if (candidateCells[0] || candidateCells[1]) {
          break;
        }

        if (candidateCells.some(Boolean)) {
          groupedRows.push(candidateCells);
        }
        nextIndex += 1;
      }

      playerCount += 1;
      const targetRow = groupedRows[targetRound - 1];
      const hasTerminalStatus = groupedRows.some((cells) =>
        cells.some((cell) => /^(DNF|DNS|DSQ)$/i.test(cell)),
      );

      if (hasTerminalStatus) {
        terminalCount += 1;
      } else if (
        !targetRow ||
        targetRow
          .slice(2, 2 + holeCount)
          .some((score) => score === "" || !Number.isFinite(Number(score)))
      ) {
        complete = false;
      }

      rowIndex = nextIndex;
    }
  }

  return {
    complete: complete && playerCount > 0,
    targetRound,
    playerCount,
    terminalCount,
  };
}

while (!stopping) {
  const capturedAt = new Date().toISOString();

  try {
    const response = await fetch(sourceUrl, {
      headers: { "user-agent": "leadcard-fixture-capture/1.0" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(`Scorecard request returned HTTP ${response.status}.`);
    }

    const sourceHtml = await response.text();
    const snapshot = compactScorecard(sourceHtml);
    const hash = createHash("sha256").update(snapshot.html).digest("hex");

    if (hash === previousHash) {
      console.log(`${capturedAt}: no scorecard changes`);
    } else {
      const fileTimestamp = capturedAt
        .replaceAll(":", "-")
        .replaceAll(".", "-");
      const htmlFile = `snapshot-${fileTimestamp}.html`;
      const metadataFile = `snapshot-${fileTimestamp}.json`;
      const metadata = {
        tournamentId,
        eventTitle: snapshot.eventTitle,
        capturedAt,
        sourceUrl,
        sha256: hash,
        htmlFile,
        roundCompletion: snapshot.roundCompletion,
      };

      await writeFile(path.join(outputDirectory, htmlFile), snapshot.html);
      await writeFile(
        path.join(outputDirectory, metadataFile),
        `${JSON.stringify(metadata, null, 2)}\n`,
      );
      await appendFile(manifestPath, `${JSON.stringify(metadata)}\n`);
      previousHash = hash;
      console.log(
        `${capturedAt}: saved ${htmlFile} (${snapshot.eventTitle || "live scorecard"})`,
      );
    }

    if (snapshot.roundCompletion.complete) {
      const completion = {
        tournamentId,
        eventTitle: snapshot.eventTitle,
        capturedAt,
        sourceUrl,
        ...snapshot.roundCompletion,
      };
      await writeFile(
        path.join(outputDirectory, "completion.json"),
        `${JSON.stringify(completion, null, 2)}\n`,
      );
      await appendFile(
        manifestPath,
        `${JSON.stringify({ type: "round-complete", ...completion })}\n`,
      );
      console.log(
        `Round ${stopAfterRound} is complete for ${snapshot.roundCompletion.playerCount} listed players (${snapshot.roundCompletion.terminalCount} terminal statuses). Stopping capture.`,
      );
      stopping = true;
    }
  } catch (error) {
    console.error(
      `${capturedAt}: capture failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!stopping) {
    await delay(intervalSeconds * 1000);
  }
}

console.log(`Capture session saved at ${outputDirectory}`);

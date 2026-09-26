import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { load } from "cheerio";

const DEFAULT_TOURNAMENT_ID = "2423";
const DEFAULT_INTERVAL_SECONDS = 30;
const LIVE_URL = "https://turniere.discgolf.de/index.php?p=events&sp=live&id=";

function printUsage() {
  console.log(`Usage: npm run capture:tournament -- [tournament-id] [--interval=seconds]

Polls the official live scorecard and saves a compact HTML snapshot whenever
the scores change. Press Ctrl+C to stop. Defaults to tournament 2423 every
${DEFAULT_INTERVAL_SECONDS} seconds.

Examples:
  npm run capture:tournament
  npm run capture:tournament -- 2423 --interval=15`);
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
console.log(`Capturing tournament ${tournamentId} every ${intervalSeconds}s.`);
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

  return {
    html: `<!doctype html><html><body><nav>${roundLinks}</nav>${table.toString()}</body></html>`,
    eventTitle: $("h3").first().text().replace(/\s+/g, " ").trim(),
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

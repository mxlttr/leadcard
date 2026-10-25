import { createHash } from "node:crypto";
import { load } from "cheerio";

export type TerminalResultStatus = "DNF" | "DNS" | "DSQ";

export type OfficialTerminalResult = {
  division: string;
  status: TerminalResultStatus;
  name: string;
  gtNumber: string | null;
};

export type OfficialResultsContext = {
  sourceUrl: string;
  tournamentId: string;
  fetchedAt: string;
  reportedAt: string | null;
  finalized: boolean;
  resultsFingerprint: string;
  results: OfficialTerminalResult[];
};

const statuses = new Set<TerminalResultStatus>(["DNF", "DNS", "DSQ"]);

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function pageUrl(tournamentId: string) {
  const url = new URL("https://turniere.discgolf.de/index.php");
  url.searchParams.set("p", "events");
  url.searchParams.set("sp", "list-results");
  url.searchParams.set("id", tournamentId);
  return url.toString();
}

/** Fetches the official classification table and identifies published final results. */
export async function fetchOfficialResults(
  tournamentId: string,
): Promise<OfficialResultsContext> {
  const sourceUrl = pageUrl(tournamentId);
  const response = await fetch(sourceUrl, {
    headers: { "user-agent": "Leadcard tournament reporting" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Official results request failed (${response.status})`);
  return parseOfficialResults(
    await response.text(),
    tournamentId,
    sourceUrl,
    new Date().toISOString(),
  );
}

export function parseOfficialResults(
  html: string,
  tournamentId: string,
  sourceUrl = pageUrl(tournamentId),
  fetchedAt = new Date().toISOString(),
): OfficialResultsContext {
  const $ = load(html);
  const tables = $("table[id^='results_layout_']");
  if (!tables.length) {
    if (
      /Ergebnisse\. Bitte warten sie bis das Turnier abgeschlossen ist\./i.test(
        clean($("body").text()),
      )
    )
      return {
        sourceUrl,
        tournamentId,
        fetchedAt,
        reportedAt: null,
        finalized: false,
        resultsFingerprint: createHash("sha256")
          .update("not-finalized")
          .digest("hex"),
        results: [],
      };
    throw new Error("Official results tables were not found");
  }

  const reportedAt =
    clean($("body").text()).match(
      /Zeitpunkt der Ergebnismeldung:\s*(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})/i,
    )?.[1] ?? null;
  const results: OfficialTerminalResult[] = [];
  const classificationRows: string[] = [];
  let playerRowCount = 0;
  let finalizedRowCount = 0;
  tables.each((_, table) => {
    const headers = $(table)
      .find("tr")
      .first()
      .find("th, td")
      .map((__, cell) => clean($(cell).text()))
      .get();
    const divisionIndex = headers.indexOf("Division");
    const placeIndex = headers.indexOf("#");
    const nameIndex = headers.indexOf("Name");
    const gtIndex = headers.indexOf("GT#");
    const totalIndex = headers.indexOf("Gesamt");
    if (divisionIndex < 0 || placeIndex < 0 || nameIndex < 0 || totalIndex < 0)
      return;

    $(table)
      .find("tr")
      .slice(1)
      .each((__, row) => {
        const cells = $(row)
          .find("th, td")
          .map((___, cell) => clean($(cell).text()))
          .get();
        const status = cells[placeIndex]?.toUpperCase() as
          | TerminalResultStatus
          | undefined;
        const name = cells[nameIndex];
        const division = cells[divisionIndex];
        const place = cells[placeIndex] ?? "";
        const total = cells[totalIndex] ?? "";
        const terminalPlace = statuses.has(
          place.toUpperCase() as TerminalResultStatus,
        );
        const terminalTotal = statuses.has(
          total.toUpperCase() as TerminalResultStatus,
        );
        if (!name || !division) return;
        playerRowCount += 1;
        const classified = /^\d+$/.test(place) || terminalPlace;
        const hasFinalTotal = /^[-+]?\d+$/.test(total) || terminalTotal;
        if (classified && hasFinalTotal) finalizedRowCount += 1;
        classificationRows.push(
          [
            division,
            place,
            name,
            gtIndex >= 0 ? cells[gtIndex] : "",
            total,
          ].join("|"),
        );
        if (status && terminalPlace)
          results.push({
            division,
            status,
            name,
            gtNumber: gtIndex >= 0 ? cells[gtIndex] || null : null,
          });
      });
  });
  if (!playerRowCount) throw new Error("Official result rows were not found");
  const finalized = finalizedRowCount === playerRowCount;
  const resultsFingerprint = createHash("sha256")
    .update(classificationRows.join("\n"))
    .digest("hex");
  return {
    sourceUrl,
    tournamentId,
    fetchedAt,
    reportedAt,
    finalized,
    resultsFingerprint,
    results,
  };
}

function normalizedName(value: string) {
  const normalized = value
    .normalize("NFC")
    .toLocaleLowerCase("de")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const commaName = value.split(",").map((part) => part.trim());
  const reversed = commaName.length === 2 ? commaName.reverse().join(" ") : "";
  return new Set([normalized, normalizedNameSimple(reversed)]);
}

function normalizedNameSimple(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("de")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizedDivision(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("de")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Returns a result only when the exact normalized name identifies one player. */
export function matchTerminalResult(
  player: { name: string; division: string },
  players: { name: string; division: string }[],
  context?: OfficialResultsContext,
) {
  if (!context) return null;
  const playerNames = normalizedName(player.name);
  const matches = context.results.filter((result) => {
    const resultNames = normalizedName(result.name);
    const nameMatches = [...resultNames].some(
      (name) => name && playerNames.has(name),
    );
    if (!nameMatches) return false;
    const sameNamePlayers = players.filter((candidate) => {
      const names = normalizedName(candidate.name);
      return [...names].some((name) => name && resultNames.has(name));
    });
    if (sameNamePlayers.length !== 1) return false;
    const officialDivision = normalizedDivision(result.division);
    const snapshotDivision = normalizedDivision(player.division);
    return (
      officialDivision === snapshotDivision ||
      officialDivision === snapshotDivision.replace(/^master/, "m") ||
      officialDivision.replace(/^m(?=\d)/, "master") === snapshotDivision
    );
  });
  return matches.length === 1 ? matches[0] : null;
}

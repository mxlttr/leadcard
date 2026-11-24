import { createHash } from "node:crypto";
import { getArchive } from "@/lib/server/archive";
import { createRatingsReportPullRequest } from "@/lib/server/reporting/automatic-ratings-pr";
import { fetchLatestProcessedRatingsEventDate } from "@/lib/server/reporting/ratings-client";
import {
  generateBilingualRatingsDraft,
  RATINGS_REPORT_PROMPT_VERSION,
  type RatingsFactSheet,
} from "@/lib/server/reporting/ratings-drafts";
import {
  buildRatingsFactSheet,
  RATINGS_FACT_SHEET_VERSION,
} from "@/lib/server/reporting/ratings-fact-sheet";

const completed = new Set<string>();
const held = new Set<string>();
const attempts = new Map<string, number>();
const RETRY_INTERVAL_MS = 15 * 60 * 1000;

function berlinDate(timestamp: string) {
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function daysBetween(earlier: string, later: string) {
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) /
      86_400_000,
  );
}

export type RatingsReportOutcome =
  | "disabled"
  | "insufficient-snapshots"
  | "unchanged-ratings"
  | "no-reportable-events"
  | "ratings-source-behind"
  | "already-processed"
  | "held-for-review"
  | "retry-deferred"
  | "already-published"
  | "pull-request-ready";

export async function generateAutomaticRatingsReport(): Promise<RatingsReportOutcome> {
  if (process.env.LEADCARD_AUTO_REPORTS_ENABLED !== "true") return "disabled";
  const archive = getArchive();
  const snapshots = archive.latestRatingsSnapshots(2);
  if (snapshots.length < 2) return "insufficient-snapshots";
  const [previous, current] = snapshots;
  if (previous.contentHash === current.contentHash) return "unchanged-ratings";
  if (archive.ratingsReportSubmitted(previous.contentHash, current.contentHash))
    return "already-processed";
  const releaseDate = berlinDate(current.capturedAt);
  const events = archive.summaries().flatMap((tournament) => {
    if (!tournament.endDate) return [];
    const weekday = new Date(`${tournament.endDate}T00:00:00Z`).getUTCDay();
    const age = daysBetween(tournament.endDate, releaseDate);
    if (![0, 6].includes(weekday) || age < 0 || age > 4) return [];
    const state = archive.load(tournament.id);
    return state?.players.length
      ? [
          {
            tournament,
            players: state.players.map(
              ({ playerId, name, division, club, rounds }) => ({
                playerId,
                name,
                division,
                club,
                rounds,
              }),
            ),
          },
        ]
      : [];
  });
  if (!events.length) return "no-reportable-events";
  const latestEventDate = events.reduce(
    (latest, { tournament }) =>
      tournament.endDate && tournament.endDate > latest
        ? tournament.endDate
        : latest,
    "",
  );
  const latestProcessedEventDate = await fetchLatestProcessedRatingsEventDate();
  if (latestProcessedEventDate < latestEventDate) {
    console.info("Automatic rating report waiting for ratings source", {
      latestEventDate,
      latestProcessedEventDate,
    });
    return "ratings-source-behind";
  }
  const sourceFingerprint = createHash("sha256")
    .update(
      `${RATINGS_FACT_SHEET_VERSION}:${previous.contentHash}:${current.contentHash}`,
    )
    .digest("hex");
  const existing = archive.ratingsFactSheetForSource(sourceFingerprint);
  const legacy = existing
    ? undefined
    : archive.ratingsFactSheetForSnapshots(
        previous.contentHash,
        current.contentHash,
      );
  if (
    legacy &&
    (JSON.parse(legacy.payload) as RatingsFactSheet).completion.readyForReview
  ) {
    archive.markRatingsReportSubmitted(
      previous.contentHash,
      current.contentHash,
      legacy.contentHash,
    );
    return "already-processed";
  }
  const facts = existing
    ? (JSON.parse(existing.payload) as RatingsFactSheet)
    : await buildRatingsFactSheet(previous, current, events);
  if (!existing)
    archive.saveRatingsFactSheet({
      sourceFingerprint,
      contentHash: facts.contentHash,
      payload: JSON.stringify(facts),
    });
  if (completed.has(facts.contentHash)) return "already-processed";
  if (held.has(facts.contentHash)) return "held-for-review";
  const lastAttemptAt = attempts.get(facts.contentHash);
  if (lastAttemptAt && Date.now() - lastAttemptAt < RETRY_INTERVAL_MS)
    return "retry-deferred";
  attempts.set(facts.contentHash, Date.now());
  if (!facts.completion.readyForReview) {
    held.add(facts.contentHash);
    console.info("Automatic rating report held for fact-sheet review", {
      ratingDate: releaseDate,
      factSheetHash: facts.contentHash,
      gaps: facts.completion.gaps,
    });
    return "held-for-review";
  }

  const generated = await generateBilingualRatingsDraft(facts);
  const result = await createRatingsReportPullRequest({
    date: releaseDate,
    facts,
    draft: generated.draft,
    model: generated.model,
    generatedAt: new Date().toISOString(),
  });
  archive.markRatingsReportSubmitted(
    previous.contentHash,
    current.contentHash,
    facts.contentHash,
  );
  completed.add(facts.contentHash);
  console.info(
    result.alreadyPublished
      ? "Automatic rating report already published"
      : "Automatic rating report pull request ready",
    {
      ratingDate: releaseDate,
      factSheetHash: facts.contentHash,
      promptVersion: RATINGS_REPORT_PROMPT_VERSION,
      pullRequest: result.url,
    },
  );
  return result.alreadyPublished ? "already-published" : "pull-request-ready";
}

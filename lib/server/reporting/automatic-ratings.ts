import { createHash } from "node:crypto";
import { getArchive } from "@/lib/server/archive";
import { createRatingsReportPullRequest } from "@/lib/server/reporting/automatic-ratings-pr";
import {
  generateBilingualRatingsDraft,
  RATINGS_REPORT_PROMPT_VERSION,
  type RatingsFactSheet,
} from "@/lib/server/reporting/ratings-drafts";
import { buildRatingsFactSheet } from "@/lib/server/reporting/ratings-fact-sheet";

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

export async function generateAutomaticRatingsReport() {
  if (process.env.LEADCARD_AUTO_REPORTS_ENABLED !== "true") return;
  const archive = getArchive();
  const snapshots = archive.latestRatingsSnapshots(2);
  if (snapshots.length < 2) return;
  const [previous, current] = snapshots;
  if (previous.contentHash === current.contentHash) return;
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
              ({ playerId, name, division, club }) => ({
                playerId,
                name,
                division,
                club,
              }),
            ),
          },
        ]
      : [];
  });
  const sourceFingerprint = createHash("sha256")
    .update(
      `${previous.contentHash}:${current.contentHash}:${events
        .map((event) => event.tournament.id)
        .sort()
        .join(",")}`,
    )
    .digest("hex");
  const existing = archive.ratingsFactSheetForSource(sourceFingerprint);
  const facts = existing
    ? (JSON.parse(existing.payload) as RatingsFactSheet)
    : await buildRatingsFactSheet(previous, current, events);
  if (!existing)
    archive.saveRatingsFactSheet({
      sourceFingerprint,
      contentHash: facts.contentHash,
      payload: JSON.stringify(facts),
    });
  if (completed.has(facts.contentHash) || held.has(facts.contentHash)) return;
  const lastAttemptAt = attempts.get(facts.contentHash);
  if (lastAttemptAt && Date.now() - lastAttemptAt < RETRY_INTERVAL_MS) return;
  attempts.set(facts.contentHash, Date.now());
  if (!facts.completion.readyForReview) {
    held.add(facts.contentHash);
    console.info("Automatic rating report held for fact-sheet review", {
      ratingDate: releaseDate,
      factSheetHash: facts.contentHash,
      gaps: facts.completion.gaps,
    });
    return;
  }

  const generated = await generateBilingualRatingsDraft(facts);
  const result = await createRatingsReportPullRequest({
    date: releaseDate,
    facts,
    draft: generated.draft,
    model: generated.model,
    generatedAt: new Date().toISOString(),
  });
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
}

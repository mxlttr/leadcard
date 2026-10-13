import { createHash } from "node:crypto";
import { getArchive } from "@/lib/server/archive";
import { buildFactSheet } from "@/lib/server/reporting/fact-sheet";
import type { OfficialResultsContext } from "@/lib/server/reporting/official-results";
import {
  buildRatingComparisons,
  matchRatings,
} from "@/lib/server/reporting/ratings";
import { ratingContextStatus } from "@/lib/server/reporting/ratings-client";

export type PostEventFactSheetResult = "saved" | "unchanged" | "no-snapshots";

export function savePostEventFactSheet(
  tournamentId: string,
  officialResults: OfficialResultsContext,
): PostEventFactSheetResult {
  if (!officialResults.finalized) return "unchanged";
  const archive = getArchive();
  const snapshots = archive.reportSnapshots(tournamentId);
  const latest = snapshots.at(-1);
  if (!latest) return "no-snapshots";

  const previous = archive.latestTournamentFactSheet(tournamentId);
  const previousFacts = previous?.value.facts as
    | { provenance?: { latestSnapshotId?: number } }
    | undefined;
  if (
    previous?.value.officialResults?.resultsFingerprint ===
      officialResults.resultsFingerprint &&
    previousFacts?.provenance?.latestSnapshotId === latest.id
  )
    return "unchanged";

  const facts = buildFactSheet(snapshots, officialResults);
  const ratingContext = previous?.value.ratingContext ?? null;
  const ratings = ratingContext
    ? matchRatings(latest.players, ratingContext)
    : [];
  const ratingComparisons = buildRatingComparisons(facts, ratings);
  const savedPayload = {
    facts,
    officialResults,
    ratingContext,
    ratings,
    ratingComparisons,
    ratingFetchError: previous?.value.ratingFetchError ?? null,
    ratingStatus: ratingContext ? ratingContextStatus(ratingContext) : null,
  };
  const contentHash = createHash("sha256")
    .update(JSON.stringify(savedPayload))
    .digest("hex");
  archive.saveFactSheet({
    tournamentId,
    sourceFingerprint: facts.contentHash,
    contentHash,
    payload: JSON.stringify(savedPayload),
  });
  return "saved";
}

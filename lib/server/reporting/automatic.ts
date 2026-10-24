import { getArchive } from "@/lib/server/archive";
import {
  assertReportPullRequestConfig,
  createReportPullRequest,
} from "@/lib/server/reporting/automatic-pr";
import {
  type BilingualArticleDraft,
  generateBilingualDraft,
  REPORT_DRAFT_PROMPT_VERSION,
} from "@/lib/server/reporting/drafts";
import type { buildFactSheet } from "@/lib/server/reporting/fact-sheet";

export async function generateAutomaticReport(tournamentId: string) {
  if (process.env.LEADCARD_AUTO_REPORTS_ENABLED !== "true") return;

  const archive = getArchive();
  const sheet = archive.latestTournamentFactSheet(tournamentId);
  if (!sheet) return;
  const facts = sheet.value.facts as ReturnType<typeof buildFactSheet>;
  if (!facts.completion.readyForReview) {
    console.info("Automatic report held for fact-sheet review", {
      tournamentId,
      factSheetHash: sheet.contentHash,
      gaps: facts.completion.gaps,
    });
    return;
  }
  if (!facts.tournament.startDate) {
    console.warn("Automatic report skipped because event dates are missing", {
      tournamentId,
      factSheetHash: sheet.contentHash,
    });
    return;
  }
  assertReportPullRequestConfig();

  const savedDraft = archive
    .reportDrafts(tournamentId)
    .find(
      (draft) =>
        draft.factSheetHash === sheet.contentHash &&
        draft.promptVersion === REPORT_DRAFT_PROMPT_VERSION,
    );
  let draft: BilingualArticleDraft;
  let model: string;
  let generatedAt: string;
  if (savedDraft) {
    const payload = JSON.parse(savedDraft.payload) as BilingualArticleDraft;
    draft = { english: payload.english, german: payload.german };
    model = savedDraft.model;
    generatedAt = savedDraft.createdAt;
  } else {
    const generated = await generateBilingualDraft(facts);
    const saved = archive.saveReportDraft({
      tournamentId,
      factSheetHash: sheet.contentHash,
      promptVersion: REPORT_DRAFT_PROMPT_VERSION,
      model: generated.model,
      payload: JSON.stringify({
        ...generated.draft,
        usage: generated.usage,
        partial: false,
      }),
    });
    draft = generated.draft;
    model = generated.model;
    generatedAt = saved.createdAt;
  }

  const result = await createReportPullRequest({
    tournament: facts.tournament,
    facts,
    draft,
    factSheetHash: sheet.contentHash,
    model,
    promptVersion: REPORT_DRAFT_PROMPT_VERSION,
    generatedAt,
  });
  if (result.alreadyPublished) {
    console.info("Automatic report already published", {
      tournamentId,
      factSheetHash: sheet.contentHash,
    });
    return;
  }
  console.info("Automatic report pull request ready", {
    tournamentId,
    factSheetHash: sheet.contentHash,
    pullRequest: result.url,
  });
}

import type { BilingualArticleDraft } from "@/lib/server/reporting/drafts";
import { FACT_SHEET_VERSION } from "@/lib/server/reporting/fact-sheet";

export type ReportLocale = "en" | "de";

function yamlString(value: string) {
  return JSON.stringify(value);
}

export function reportSlug(tournamentName: string, tournamentId: string) {
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/ß/g, "ss")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const name = normalize(
    tournamentName.replace(/^\s*\d+\.\s*/, "") || tournamentName,
  );
  const id = normalize(tournamentId);
  if (!name || !id) throw new Error("Tournament name and ID must form a slug");
  return `${name}-${id}`;
}

export function reportPermalink(locale: ReportLocale, slug: string) {
  const pathSlug = encodeURIComponent(slug);
  return locale === "de"
    ? `/de/berichte/${pathSlug}/`
    : `/reports/${pathSlug}/`;
}

export function buildReportMarkdown(input: {
  tournamentId: string;
  locale: ReportLocale;
  title: string;
  description: string;
  markdown: string;
  slug: string;
  publicationDate: string;
  eventStart: string;
  eventEnd: string;
  factSheetHash: string;
  factSheetVersion: string;
  promptVersion: string;
  model: string;
  generatedAt: string;
  status?: "draft" | "published";
  partialResults?: boolean;
  reviewGaps?: string[];
}) {
  const permalink = reportPermalink(input.locale, input.slug);
  const frontMatter = [
    "---",
    `tournamentId: ${yamlString(input.tournamentId)}`,
    `locale: ${input.locale}`,
    `title: ${yamlString(input.title)}`,
    `description: ${yamlString(input.description)}`,
    `slug: ${yamlString(input.slug)}`,
    `date: ${yamlString(input.publicationDate)}`,
    `language: ${input.locale}`,
    `eventStart: ${yamlString(input.eventStart)}`,
    `eventEnd: ${yamlString(input.eventEnd)}`,
    "originalPublicationDate: null",
    "updatedAt: null",
    `permalink: ${yamlString(permalink)}`,
    `status: ${input.status ?? "draft"}`,
    `sourceFactSheetHash: ${yamlString(input.factSheetHash)}`,
    `sourceFactSheetVersion: ${yamlString(input.factSheetVersion || FACT_SHEET_VERSION)}`,
    `promptVersion: ${yamlString(input.promptVersion)}`,
    `model: ${yamlString(input.model)}`,
    `generatedAt: ${yamlString(input.generatedAt)}`,
    ...(input.partialResults
      ? [
          "partialResults: true",
          `reviewGaps: [${(input.reviewGaps ?? []).map(yamlString).join(", ")}]`,
        ]
      : []),
    "---",
    "",
  ].join("\n");
  return `${frontMatter}${input.markdown.trim()}\n`;
}

export function localeDraft(
  draft: BilingualArticleDraft,
  locale: ReportLocale,
) {
  return locale === "en" ? draft.english : draft.german;
}

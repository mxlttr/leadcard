import type { BilingualArticleDraft } from "@/lib/server/reporting/drafts";
import type { buildFactSheet } from "@/lib/server/reporting/fact-sheet";
import {
  buildReportMarkdown,
  localeDraft,
  reportSlug,
} from "@/lib/server/reporting/markdown-export";
import type { TournamentSummary } from "@/lib/types";

type FactSheet = ReturnType<typeof buildFactSheet>;
type GitHubFile = { path: string; content: string };
type ReportPullRequest = {
  number: number;
  html_url: string;
  state: "open" | "closed";
  merged_at?: string | null;
  requested_reviewers?: Array<{ login: string }>;
  requested_teams?: Array<{ slug: string }>;
};
function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for automatic report PRs`);
  return value;
}

export function assertReportPullRequestConfig() {
  requiredEnv("LEADCARD_REPORTS_GITHUB_TOKEN");
  const repository = requiredEnv("LEADCARD_REPORTS_REPOSITORY");
  if (repository.split("/").length !== 2)
    throw new Error("LEADCARD_REPORTS_REPOSITORY must be owner/repository");
  const reviewer = process.env.LEADCARD_REPORTS_REVIEWER?.trim();
  if (reviewer === "team:")
    throw new Error("LEADCARD_REPORTS_REVIEWER team slug cannot be empty");
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function github<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    signal: AbortSignal.timeout(20_000),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "Leadcard report automation",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };
  if (!response.ok)
    throw new Error(
      `GitHub API ${init.method ?? "GET"} ${path} returned ${response.status}: ${body.message ?? "unknown error"}`,
    );
  return body;
}

function reportFiles(
  tournamentId: string,
  facts: FactSheet,
  draft: BilingualArticleDraft,
  factSheetHash: string,
  model: string,
  promptVersion: string,
  generatedAt: string,
): GitHubFile[] {
  const tournament = facts.tournament;
  const eventStart = tournament.startDate;
  const eventEnd = tournament.endDate ?? eventStart;
  if (!eventStart || !eventEnd)
    throw new Error("Tournament dates are required for automatic reports");
  const slug = reportSlug(tournament.name, tournamentId);
  return (["en", "de"] as const).map((locale) => {
    const article = localeDraft(draft, locale);
    const fullDescription =
      locale === "en"
        ? `Results and highlights from ${tournament.name} at ${tournament.course}.`
        : `Ergebnisse und Höhepunkte: ${tournament.name} auf dem Kurs ${tournament.course}.`;
    const description =
      fullDescription.length <= 160
        ? fullDescription
        : `${fullDescription.slice(0, 157).trimEnd()}...`;
    return {
      path: `content/reports/${locale}/${tournamentId}.md`,
      content: buildReportMarkdown({
        tournamentId,
        locale,
        title: article.title,
        description,
        markdown: article.markdown,
        slug,
        publicationDate: generatedAt.slice(0, 10),
        eventStart,
        eventEnd,
        factSheetHash,
        factSheetVersion: String(facts.schemaVersion),
        promptVersion,
        model,
        generatedAt,
        status: "published",
      }),
    };
  });
}

export async function createReportPullRequest(input: {
  tournament: TournamentSummary;
  facts: FactSheet;
  draft: BilingualArticleDraft;
  factSheetHash: string;
  model: string;
  promptVersion: string;
  generatedAt: string;
}) {
  assertReportPullRequestConfig();
  const token = requiredEnv("LEADCARD_REPORTS_GITHUB_TOKEN");
  const repository = requiredEnv("LEADCARD_REPORTS_REPOSITORY");
  const reviewer = process.env.LEADCARD_REPORTS_REVIEWER?.trim();
  const [owner, repo] = repository.split("/");
  if (!owner || !repo || repository.split("/").length !== 2)
    throw new Error("LEADCARD_REPORTS_REPOSITORY must be owner/repository");

  const repoInfo = await github<{ default_branch: string }>(
    token,
    `/repos/${encodePath(repository)}`,
  );
  const base = repoInfo.default_branch;
  const branch = `reports/auto-${input.tournament.id}-${input.factSheetHash.slice(0, 10)}`;
  const branchHead = `${owner}:${branch}`;
  const openPullRequests = await github<ReportPullRequest[]>(
    token,
    `/repos/${encodePath(repository)}/pulls?state=all&head=${encodeURIComponent(branchHead)}&base=${encodeURIComponent(base)}`,
  );
  let existingPullRequest: ReportPullRequest | undefined = openPullRequests[0];
  if (
    existingPullRequest?.state === "closed" &&
    !existingPullRequest.merged_at
  ) {
    existingPullRequest = await github<typeof existingPullRequest>(
      token,
      `/repos/${encodePath(repository)}/pulls/${existingPullRequest.number}`,
      { method: "PATCH", body: JSON.stringify({ state: "open" }) },
    );
  } else if (existingPullRequest?.state === "closed") {
    existingPullRequest = undefined;
  }

  const files = reportFiles(
    input.tournament.id,
    input.facts,
    input.draft,
    input.factSheetHash,
    input.model,
    input.promptVersion,
    input.generatedAt,
  );

  const baseRef = await github<{ object: { sha: string } }>(
    token,
    `/repos/${encodePath(repository)}/git/ref/${encodePath(`heads/${base}`)}`,
  );
  const alreadyPublished = await Promise.all(
    files.map(async (file) => {
      try {
        const current = await github<{ content: string }>(
          token,
          `/repos/${encodePath(repository)}/contents/${encodePath(file.path)}?ref=${encodeURIComponent(base)}`,
        );
        return Buffer.from(current.content.replace(/\s/g, ""), "base64")
          .toString("utf8")
          .includes(`sourceFactSheetHash: "${input.factSheetHash}"`);
      } catch (error) {
        if (error instanceof Error && error.message.includes("returned 404"))
          return false;
        throw error;
      }
    }),
  );
  if (alreadyPublished.every(Boolean))
    return { alreadyPublished: true as const, url: null, number: null, branch };
  const refPath = `/repos/${encodePath(repository)}/git/ref/${encodePath(`heads/${branch}`)}`;
  try {
    await github(token, `/repos/${encodePath(repository)}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseRef.object.sha,
      }),
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("returned 422"))
      throw error;
    await github(token, refPath);
  }

  for (const file of files) {
    const contentsPath = `/repos/${encodePath(repository)}/contents/${encodePath(file.path)}?ref=${encodeURIComponent(branch)}`;
    let sha: string | undefined;
    try {
      const existing = await github<{ sha: string; content: string }>(
        token,
        contentsPath,
      );
      const current = Buffer.from(
        existing.content.replace(/\s/g, ""),
        "base64",
      ).toString("utf8");
      if (current === file.content) continue;
      sha = existing.sha;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("returned 404"))
        throw error;
    }
    await github(
      token,
      `/repos/${encodePath(repository)}/contents/${encodePath(file.path)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `Generate ${input.tournament.name} ${file.path.includes("/de/") ? "German" : "English"} report`,
          content: Buffer.from(file.content, "utf8").toString("base64"),
          branch,
          ...(sha ? { sha } : {}),
        }),
      },
    );
  }

  const pullRequest =
    existingPullRequest ??
    (await github<ReportPullRequest>(
      token,
      `/repos/${encodePath(repository)}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({
          title: `Report ready: ${input.tournament.name}`,
          head: branch,
          base,
          draft: false,
          body: [
            `Automated English and German tournament reports for **${input.tournament.name}**.`,
            "",
            `Fact sheet: \`${input.factSheetHash}\``,
            `Generated with \`${input.model}\` at ${input.generatedAt}.`,
            "",
            "Both files use `status: published`; they become visible on the landing site after this PR is merged.",
          ].join("\n"),
        }),
      },
    ));

  const reviewerAlreadyRequested = reviewer
    ? pullRequest.requested_reviewers?.some(
        ({ login }) =>
          login.toLocaleLowerCase() === reviewer.toLocaleLowerCase(),
      ) ||
      (reviewer.startsWith("team:") &&
        pullRequest.requested_teams?.some(
          ({ slug }) =>
            slug.toLocaleLowerCase() ===
            reviewer.slice("team:".length).toLocaleLowerCase(),
        ))
    : true;
  if (reviewer && !reviewerAlreadyRequested)
    await github(
      token,
      `/repos/${encodePath(repository)}/pulls/${pullRequest.number}/requested_reviewers`,
      {
        method: "POST",
        body: JSON.stringify({
          ...(reviewer.startsWith("team:")
            ? { team_reviewers: [reviewer.slice("team:".length)] }
            : { reviewers: [reviewer] }),
        }),
      },
    );
  return { url: pullRequest.html_url, number: pullRequest.number, branch };
}

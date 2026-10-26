import {
  type BilingualRatingsDraft,
  RATINGS_REPORT_PROMPT_VERSION,
  type RatingsFactSheet,
} from "./ratings-drafts";

type ReportFile = { path: string; content: string };
type PullRequest = {
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

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function github<T>(token: string, path: string, init: RequestInit = {}) {
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

function yamlString(value: string) {
  return JSON.stringify(value);
}

function ratingReportFiles(
  date: string,
  facts: RatingsFactSheet,
  draft: BilingualRatingsDraft,
  model: string,
  generatedAt: string,
): ReportFile[] {
  const tournamentId = `weekly-ratings-${date}`;
  const slug = `rating-swings-week-${date}-${tournamentId}`;
  return (["en", "de"] as const).map((locale) => {
    const article = locale === "en" ? draft.english : draft.german;
    const permalink =
      locale === "de" ? `/berichte/${slug}/` : `/en/reports/${slug}/`;
    const content = [
      "---",
      `title: ${yamlString(article.title)}`,
      `description: ${yamlString(article.description)}`,
      `slug: ${slug}`,
      `tournamentId: ${yamlString(tournamentId)}`,
      `date: ${yamlString(date)}`,
      `language: ${locale}`,
      `status: published`,
      `permalink: ${yamlString(permalink)}`,
      `sourceFactSheetHash: ${yamlString(facts.contentHash)}`,
      `sourceFactSheetVersion: ${yamlString(facts.schemaVersion)}`,
      `promptVersion: ${yamlString(RATINGS_REPORT_PROMPT_VERSION)}`,
      `model: ${yamlString(model)}`,
      `generatedAt: ${yamlString(generatedAt)}`,
      "---",
      "",
      article.markdown.trim(),
      "",
    ].join("\n");
    return {
      path: `content/reports/${locale}/${tournamentId}.md`,
      content,
    };
  });
}

export async function createRatingsReportPullRequest(input: {
  date: string;
  facts: RatingsFactSheet;
  draft: BilingualRatingsDraft;
  model: string;
  generatedAt: string;
}) {
  const token = requiredEnv("LEADCARD_REPORTS_GITHUB_TOKEN");
  const repository = requiredEnv("LEADCARD_REPORTS_REPOSITORY");
  if (repository.split("/").length !== 2)
    throw new Error("LEADCARD_REPORTS_REPOSITORY must be owner/repository");
  const reviewer = process.env.LEADCARD_REPORTS_REVIEWER?.trim();
  if (reviewer === "team:")
    throw new Error("LEADCARD_REPORTS_REVIEWER team slug cannot be empty");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("Invalid reports repository");

  const repoInfo = await github<{ default_branch: string }>(
    token,
    `/repos/${encodePath(repository)}`,
  );
  const base = repoInfo.default_branch;
  const hash = input.facts.contentHash;
  const branch = `reports/ratings-${input.date}-${hash.slice(0, 10)}`;
  const branchHead = `${owner}:${branch}`;
  let pullRequest: PullRequest | undefined = (
    await github<PullRequest[]>(
      token,
      `/repos/${encodePath(repository)}/pulls?state=all&head=${encodeURIComponent(branchHead)}&base=${encodeURIComponent(base)}`,
    )
  )[0];
  if (pullRequest?.state === "closed" && !pullRequest.merged_at) {
    pullRequest = await github<PullRequest>(
      token,
      `/repos/${encodePath(repository)}/pulls/${pullRequest.number}`,
      { method: "PATCH", body: JSON.stringify({ state: "open" }) },
    );
  } else if (pullRequest?.state === "closed") {
    pullRequest = undefined;
  }

  const files = ratingReportFiles(
    input.date,
    input.facts,
    input.draft,
    input.model,
    input.generatedAt,
  );
  const published = await Promise.all(
    files.map(async (file) => {
      try {
        const current = await github<{ content: string }>(
          token,
          `/repos/${encodePath(repository)}/contents/${encodePath(file.path)}?ref=${encodeURIComponent(base)}`,
        );
        return Buffer.from(current.content.replace(/\s/g, ""), "base64")
          .toString("utf8")
          .includes(`sourceFactSheetHash: "${hash}"`);
      } catch (error) {
        if (error instanceof Error && error.message.includes("returned 404"))
          return false;
        throw error;
      }
    }),
  );
  if (published.every(Boolean))
    return { alreadyPublished: true as const, url: null, number: null, branch };

  const baseRef = await github<{ object: { sha: string } }>(
    token,
    `/repos/${encodePath(repository)}/git/ref/${encodePath(`heads/${base}`)}`,
  );
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
      const current = await github<{ sha: string; content: string }>(
        token,
        contentsPath,
      );
      if (
        Buffer.from(current.content.replace(/\s/g, ""), "base64").toString(
          "utf8",
        ) === file.content
      )
        continue;
      sha = current.sha;
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
          message: `Generate ${input.date} ${file.path.includes("/de/") ? "German" : "English"} rating report`,
          content: Buffer.from(file.content, "utf8").toString("base64"),
          branch,
          ...(sha ? { sha } : {}),
        }),
      },
    );
  }

  pullRequest ??= await github<PullRequest>(
    token,
    `/repos/${encodePath(repository)}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({
        title: `Rating report ready: week of ${input.date}`,
        head: branch,
        base,
        draft: false,
        body: [
          `Automated English and German rating change reports for the snapshot published on **${input.date}**.`,
          "",
          `Fact sheet: \`${hash}\``,
          `Generated with \`${input.model}\` at ${input.generatedAt}.`,
          "",
          "Both files use `status: published`; they become visible on the landing site after this PR is merged.",
        ].join("\n"),
      }),
    },
  );

  const reviewerRequested = reviewer
    ? pullRequest.requested_reviewers?.some(
        ({ login }) => login.toLowerCase() === reviewer.toLowerCase(),
      ) ||
      (reviewer.startsWith("team:") &&
        pullRequest.requested_teams?.some(
          ({ slug }) =>
            slug.toLowerCase() === reviewer.slice("team:".length).toLowerCase(),
        ))
    : true;
  if (reviewer && !reviewerRequested)
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

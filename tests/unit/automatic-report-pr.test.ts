import { afterEach, describe, expect, it, vi } from "vitest";
import { createReportPullRequest } from "@/lib/server/reporting/automatic-pr";
import type { BilingualArticleDraft } from "@/lib/server/reporting/drafts";
import type { buildFactSheet } from "@/lib/server/reporting/fact-sheet";
import type { TournamentSummary } from "@/lib/types";

const tournament: TournamentSummary = {
  id: "1234",
  name: "Autumn Open",
  course: "Forest Course",
  roundLabel: "24.10.2026",
  startDate: "2026-10-24",
  endDate: "2026-10-24",
  status: "finished",
};
const facts = {
  tournament,
  schemaVersion: 2,
} as unknown as ReturnType<typeof buildFactSheet>;
const draft: BilingualArticleDraft = {
  english: { title: "Autumn Open concludes", markdown: "English report." },
  german: { title: "Autumn Open beendet", markdown: "Deutscher Bericht." },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("automatic report pull requests", () => {
  it("creates a regular PR with published bilingual reports and requests review", async () => {
    vi.stubEnv("LEADCARD_REPORTS_GITHUB_TOKEN", "test-token");
    vi.stubEnv("LEADCARD_REPORTS_REPOSITORY", "owner/landing");
    vi.stubEnv("LEADCARD_REPORTS_REVIEWER", "editor");
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
        const request = { url: String(url), init };
        requests.push(request);
        const method = init.method ?? "GET";
        if (request.url.endsWith("/repos/owner/landing"))
          return Response.json({ default_branch: "main" });
        if (request.url.includes("/pulls?state=all")) return Response.json([]);
        if (request.url.endsWith("/git/ref/heads/main"))
          return Response.json({ object: { sha: "base-sha" } });
        if (request.url.includes("?ref=main"))
          return Response.json({ message: "Not Found" }, { status: 404 });
        if (request.url.endsWith("/git/refs") && method === "POST")
          return Response.json({
            ref: "refs/heads/reports/auto-1234-abcdef1234",
          });
        if (request.url.includes("?ref=reports%2Fauto-1234-abcdef1234"))
          return Response.json({ message: "Not Found" }, { status: 404 });
        if (request.url.includes("/contents/") && method === "PUT")
          return Response.json({ commit: { sha: "commit-sha" } });
        if (request.url.endsWith("/pulls") && method === "POST")
          return Response.json({
            number: 42,
            html_url: "https://github.com/owner/landing/pull/42",
          });
        if (request.url.endsWith("/pulls/42/requested_reviewers"))
          return Response.json({ requested_reviewers: [{ login: "editor" }] });
        throw new Error(`Unexpected GitHub request: ${method} ${request.url}`);
      }),
    );

    const result = await createReportPullRequest({
      tournament,
      facts,
      draft,
      factSheetHash: "abcdef1234567890",
      model: "gpt-4.1-mini",
      promptVersion: "4",
      generatedAt: "2026-10-24T10:00:00.000Z",
    });

    expect(result.url).toBe("https://github.com/owner/landing/pull/42");
    const fileWrites = requests.filter(
      ({ init, url }) => init.method === "PUT" && url.includes("/contents/"),
    );
    expect(fileWrites).toHaveLength(2);
    for (const write of fileWrites) {
      const payload = JSON.parse(String(write.init.body)) as {
        content: string;
      };
      expect(Buffer.from(payload.content, "base64").toString()).toContain(
        "status: published",
      );
    }
    const pullRequest = requests.find(
      ({ init, url }) => url.endsWith("/pulls") && init.method === "POST",
    );
    expect(JSON.parse(String(pullRequest?.init.body))).toMatchObject({
      draft: false,
      base: "main",
    });
    expect(
      requests.some(({ url }) => url.endsWith("/pulls/42/requested_reviewers")),
    ).toBe(true);
  });
});

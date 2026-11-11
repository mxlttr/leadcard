import type { Metadata } from "next";
import { getHealth } from "@/lib/server/health";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Service status | Leadcard",
  robots: { index: false, follow: false },
};

const outcomes: Record<string, string> = {
  idle: "No attempt since this server started",
  running: "In progress",
  succeeded: "Completed successfully",
  failed: "Last attempt failed",
  disabled: "Automatic reports are disabled",
  "insufficient-snapshots": "Waiting for two ratings snapshots",
  "unchanged-ratings": "No changed ratings to report",
  "already-processed": "The latest ratings have already been processed",
  "held-for-review": "Report held because its facts need review",
  "retry-deferred": "Waiting before retrying report generation",
  "already-published": "The latest report is already published",
  "pull-request-ready": "Report pull request is ready",
};

function timestamp(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

export default function HealthPage() {
  const health = getHealth();
  const checkedAt = new Date().toISOString();
  const collector = health.ok ? health.collector : null;
  const ratings = health.ok ? health.ratings : null;
  const sections = [
    {
      title: "Tournament collection",
      rows: [
        [
          "Collector",
          !collector
            ? "Not running"
            : collector.running
              ? "Collecting now"
              : "Between collection cycles",
        ],
        ["Last successful cycle", timestamp(collector?.lastSuccessAt)],
        [
          "Recent tournament sweep started",
          timestamp(collector?.lastPostEventSweepAt),
        ],
        [
          "Recent tournament sweep completed",
          timestamp(collector?.lastPostEventSweepCompletedAt),
        ],
      ],
    },
    {
      title: "Ratings data",
      rows: [
        ["Last successful poll", timestamp(ratings?.lastSuccessfulPollAt)],
        ["Latest saved ratings snapshot", timestamp(ratings?.latestSnapshotAt)],
        [
          "Saved snapshots",
          ratings?.snapshotCount == null
            ? "Unavailable"
            : String(ratings.snapshotCount),
        ],
        [
          "Poll status since restart",
          outcomes[collector?.ratingsPollStatus ?? "idle"],
        ],
        [
          "Last poll attempt since restart",
          timestamp(collector?.lastRatingsPollAttemptAt),
        ],
      ],
    },
    {
      title: "Rating reports",
      rows: [
        [
          "Automatic generation",
          ratings
            ? ratings.automaticReportsEnabled
              ? "Enabled"
              : "Disabled"
            : "Unavailable",
        ],
        [
          "Latest sweep result",
          collector
            ? (outcomes[collector.ratingsReportStatus] ??
              collector.ratingsReportStatus)
            : "Collector unavailable",
        ],
        ["Last sweep started", timestamp(collector?.lastRatingsReportSweepAt)],
        [
          "Last successful sweep completed",
          timestamp(collector?.lastRatingsReportSweepCompletedAt),
        ],
      ],
    },
  ];
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-12">
      <header className="space-y-3">
        <a
          className="text-sm font-medium text-primary underline"
          href="https://app.leadcard.de"
        >
          Leadcard
        </a>
        <h1 className="font-display text-4xl font-bold">Service status</h1>
        <p className="text-muted">
          Checked {timestamp(checkedAt)}. Times shown in Europe/Berlin.
        </p>
        <div className="flex gap-5 text-sm">
          <a href="/health" className="text-primary underline">
            Refresh status
          </a>
          <a
            href="https://app.leadcard.de/health.json"
            className="text-primary underline"
          >
            View JSON
          </a>
        </div>
      </header>
      <p
        className={`rounded-xl border p-5 font-medium ${health.ok ? "border-border bg-surface" : "border-negative text-negative"}`}
      >
        {health.ok
          ? "Application responding · archive check passed"
          : "Application responding · archive unavailable"}
      </p>
      {health.ok ? (
        sections.map(({ title, rows }) => (
          <section
            key={title}
            className="rounded-xl border border-border bg-surface p-5 sm:p-7"
          >
            <h2 className="mb-5 font-display text-xl font-semibold">{title}</h2>
            <dl className="space-y-4">
              {rows.map(([label, value]) => (
                <div key={label} className="grid gap-1 sm:grid-cols-2 sm:gap-6">
                  <dt className="text-muted">{label}</dt>
                  <dd className="break-words font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      ) : (
        <p>
          Health details are unavailable until the archive can be read again.
        </p>
      )}
      <aside className="space-y-3 text-sm leading-relaxed text-muted">
        <p>
          Ratings are checked every six hours on Monday, Tuesday and Wednesday.
          A successful poll only creates a new snapshot when an existing
          player’s rating changes. An older snapshot does not by itself mean
          polling has stopped.
        </p>
        <p>
          Poll attempts and report sweep status reset when the server restarts.
          Successful poll and saved snapshot dates are kept in the archive. A
          completed report sweep may have skipped or held an article; its result
          explains why.
        </p>
        <p>
          This page is a snapshot. Refresh to see the latest status. It checks
          the application and archive; it does not verify every external service
          or whether an article is visible on the landing site.
        </p>
      </aside>
    </main>
  );
}

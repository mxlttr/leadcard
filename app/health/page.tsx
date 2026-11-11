import type { Metadata } from "next";
import {
  type HealthIndicator,
  healthIndicators,
} from "@/lib/health-indicators";
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

const indicatorStyles = {
  green:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  amber:
    "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  red: "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300",
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-300",
  gray: "border-border bg-background text-muted",
};

function Indicator({ tone, label }: HealthIndicator) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${indicatorStyles[tone]}`}
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full bg-current"
      />
      {label}
    </span>
  );
}

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
  const indicators = healthIndicators(health, Date.parse(checkedAt));
  const collector = health.ok ? health.collector : null;
  const ratings = health.ok ? health.ratings : null;
  const sections = [
    {
      title: "Tournament collection",
      indicator: indicators.collector,
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
      indicator: indicators.ratings,
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
      indicator: indicators.reports,
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
      <div className="rounded-xl border border-border bg-surface p-5">
        <Indicator {...indicators.application} />
        <p className="mt-3 text-sm text-muted">
          Green: normal · Blue: working · Amber: needs attention or waiting ·
          Red: failed · Gray: disabled or unavailable
        </p>
      </div>
      {health.ok ? (
        sections.map(({ title, rows, indicator }) => (
          <section
            key={title}
            className="rounded-xl border border-border bg-surface p-5 sm:p-7"
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">{title}</h2>
              <Indicator {...indicator} />
            </div>
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

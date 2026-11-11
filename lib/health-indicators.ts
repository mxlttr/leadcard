import type { getHealth } from "@/lib/server/health";

export type HealthIndicator = {
  tone: "green" | "amber" | "red" | "blue" | "gray";
  label: string;
};

export function healthIndicators(
  health: ReturnType<typeof getHealth>,
  now = Date.now(),
): Record<
  "application" | "collector" | "ratings" | "reports",
  HealthIndicator
> {
  const unavailable: HealthIndicator = { tone: "gray", label: "Unavailable" };
  if (!health.ok) {
    return {
      application: { tone: "red", label: "Archive unavailable" },
      collector: unavailable,
      ratings: unavailable,
      reports: unavailable,
    };
  }
  const collector = health.collector;
  const lastSuccess = Date.parse(collector?.lastSuccessAt ?? "");
  const collectorStatus: HealthIndicator = !collector
    ? { tone: "amber", label: "Collector not running" }
    : !Number.isFinite(lastSuccess)
      ? { tone: "amber", label: "Awaiting successful cycle" }
      : now - lastSuccess > 5 * 60_000
        ? { tone: "amber", label: "No successful cycle for over 5 minutes" }
        : {
            tone: "green",
            label: collector.running ? "Collecting" : "Operating normally",
          };

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    weekday: "short",
  }).format(now);
  const pollingDay = ["Mon", "Tue", "Wed"].includes(weekday);
  const lastPoll = Date.parse(health.ratings.lastSuccessfulPollAt ?? "");
  const ratings: HealthIndicator =
    collector?.ratingsPollStatus === "failed"
      ? { tone: "red", label: "Polling failed" }
      : collector?.ratingsPollStatus === "running"
        ? { tone: "blue", label: "Checking ratings" }
        : !Number.isFinite(lastPoll)
          ? { tone: "amber", label: "Awaiting first successful poll" }
          : pollingDay && now - lastPoll > 6.25 * 60 * 60_000
            ? { tone: "amber", label: "Ratings poll overdue" }
            : {
                tone: "green",
                label: pollingDay
                  ? "Polling on schedule"
                  : "Scheduled pause until Monday",
              };

  const reportStates: Record<string, HealthIndicator> = {
    failed: { tone: "red", label: "Report check failed" },
    running: { tone: "blue", label: "Checking reports" },
    "held-for-review": { tone: "amber", label: "Needs review" },
    "retry-deferred": { tone: "amber", label: "Waiting to retry" },
    "insufficient-snapshots": {
      tone: "amber",
      label: "Waiting for ratings data",
    },
    idle: { tone: "amber", label: "Awaiting first check" },
    disabled: { tone: "gray", label: "Disabled" },
    succeeded: { tone: "green", label: "Check completed" },
    "already-processed": { tone: "green", label: "Up to date" },
    "already-published": { tone: "green", label: "Published" },
    "pull-request-ready": { tone: "green", label: "Pull request ready" },
    "unchanged-ratings": { tone: "green", label: "No rating changes" },
  };
  let reports: HealthIndicator = !health.ratings.automaticReportsEnabled
    ? reportStates.disabled
    : collector
      ? (reportStates[collector.ratingsReportStatus] ?? unavailable)
      : unavailable;
  if (
    reports.tone === "green" &&
    (!collector?.lastRatingsReportSweepCompletedAt ||
      now - Date.parse(collector.lastRatingsReportSweepCompletedAt) >
        5 * 60_000)
  ) {
    reports = { tone: "amber", label: "Report check overdue" };
  }
  return {
    application: { tone: "green", label: "Application and archive available" },
    collector: collectorStatus,
    ratings,
    reports,
  };
}

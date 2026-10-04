import * as Sentry from "@sentry/nextjs";

const REPORT_INTERVAL_MS = 5 * 60_000;
const lastReportedAt = new Map<string, number>();

export function reportServerError(
  error: unknown,
  source: string,
  tags: Record<string, string> = {},
) {
  const key = [source, ...Object.entries(tags).sort().flat()].join(":");
  const now = Date.now();
  const previousReport = lastReportedAt.get(key);
  if (
    previousReport !== undefined &&
    now - previousReport < REPORT_INTERVAL_MS
  ) {
    return;
  }

  lastReportedAt.set(key, now);
  Sentry.withScope((scope) => {
    scope.setTag("error.source", source);
    for (const [name, value] of Object.entries(tags)) {
      scope.setTag(name, value);
    }
    Sentry.captureException(error);
  });
}

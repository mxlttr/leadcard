import { describe, expect, it } from "vitest";
import { healthIndicators } from "@/lib/health-indicators";
import type { getHealth } from "@/lib/server/health";

const now = Date.parse("2026-11-11T08:00:00Z");
function healthy(): ReturnType<typeof getHealth> & { ok: true } {
  return {
    ok: true,
    collector: {
      running: false,
      lastSuccessAt: new Date(now - 25_000).toISOString(),
      lastPostEventSweepAt: null,
      lastPostEventSweepCompletedAt: null,
      lastRatingsPollAttemptAt: null,
      ratingsPollStatus: "idle",
      lastRatingsReportSweepAt: new Date(now - 25_000).toISOString(),
      lastRatingsReportSweepCompletedAt: new Date(now - 25_000).toISOString(),
      ratingsReportStatus: "already-processed",
    },
    ratings: {
      automaticReportsEnabled: true,
      lastSuccessfulPollAt: "2026-11-11T05:00:00Z",
      latestSnapshotAt: "2026-10-28T09:00:00Z",
      snapshotCount: 4,
    },
  };
}

describe("health indicators", () => {
  it("shows healthy polling despite an old snapshot and idle state after restart", () => {
    const result = healthIndicators(healthy(), now);
    expect(Object.values(result).map((item) => item.tone)).toEqual([
      "green",
      "green",
      "green",
      "green",
    ]);
  });

  it("flags stalled collection and overdue polls and report sweeps", () => {
    const result = healthIndicators(healthy(), now + 7 * 60 * 60_000);
    expect(result.collector.tone).toBe("amber");
    expect(result.ratings.tone).toBe("amber");
    expect(result.reports.tone).toBe("amber");
  });

  it("does not mark ratings overdue during the scheduled weekend pause", () => {
    expect(
      healthIndicators(healthy(), Date.parse("2026-11-14T12:00:00Z")).ratings,
    ).toEqual({ tone: "green", label: "Scheduled pause until Monday" });
  });

  it("shows failures in red and disabled reports in gray", () => {
    const health = healthy();
    if (health.collector) {
      health.collector.ratingsPollStatus = "failed";
      health.collector.ratingsReportStatus = "failed";
    }
    expect(healthIndicators(health, now).ratings.tone).toBe("red");
    expect(healthIndicators(health, now).reports.tone).toBe("red");
    health.ratings.automaticReportsEnabled = false;
    expect(healthIndicators(health, now).reports.tone).toBe("gray");
    expect(
      healthIndicators({ ok: false, error: "Archive unavailable" }, now)
        .application.tone,
    ).toBe("red");
  });
});

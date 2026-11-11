import { getArchive } from "@/lib/server/archive";

export function getHealth() {
  try {
    const archive =
      process.env.LEADCARD_FORCE_MOCK_DATA === "true" ? null : getArchive();
    archive?.db.prepare("SELECT 1").get();
    const latestRatings = archive?.latestRatingsSnapshot();
    return {
      ok: true as const,
      collector: globalThis.leadcardCollector?.status() ?? null,
      ratings: {
        automaticReportsEnabled:
          process.env.LEADCARD_AUTO_REPORTS_ENABLED === "true",
        lastSuccessfulPollAt: archive?.lastRatingsPollAt() ?? null,
        latestSnapshotAt: latestRatings?.capturedAt ?? null,
        snapshotCount: archive?.ratingsSnapshotCount() ?? null,
      },
    };
  } catch {
    return { ok: false as const, error: "Archive unavailable" };
  }
}

import { NextResponse } from "next/server";
import { getArchive } from "@/lib/server/archive";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const archive =
      process.env.LEADCARD_FORCE_MOCK_DATA === "true" ? null : getArchive();
    archive?.db.prepare("SELECT 1").get();
    const latestRatings = archive?.latestRatingsSnapshot();
    return NextResponse.json({
      ok: true,
      collector: globalThis.leadcardCollector?.status() ?? null,
      ratings: {
        automaticReportsEnabled:
          process.env.LEADCARD_AUTO_REPORTS_ENABLED === "true",
        lastSuccessfulPollAt: archive?.lastRatingsPollAt() ?? null,
        latestSnapshotAt: latestRatings?.capturedAt ?? null,
        snapshotCount: archive?.ratingsSnapshotCount() ?? null,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Archive unavailable" },
      { status: 503 },
    );
  }
}

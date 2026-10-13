import { getArchive } from "@/lib/server/archive";
import { collectTournament } from "@/lib/server/live-store";
import { reportServerError } from "@/lib/server/report-error";
import { fetchOfficialResults } from "@/lib/server/reporting/official-results";
import { savePostEventFactSheet } from "@/lib/server/reporting/post-event-results";
import { fetchRatingsSnapshot } from "@/lib/server/reporting/ratings-client";
import { getTournamentCatalog } from "@/lib/server/tournament-source";
import type { TournamentSummary } from "@/lib/types";

export const COLLECTION_INTERVAL_MS = 25_000;
export const POST_EVENT_RESULTS_INTERVAL_MS = 6 * 60 * 60 * 1_000;
export const RATINGS_POLL_INTERVAL_MS = 6 * 60 * 60 * 1_000;

type CollectorDependencies = {
  catalog: () => Promise<TournamentSummary[]>;
  pending?: () => string[];
  collect: (id: string, final?: boolean) => Promise<void>;
  sweepRecentResults?: (tournamentId: string) => Promise<void>;
  pollRatings?: () => Promise<void>;
  lastRatingsPollAt?: () => string | null;
  onError: (error: unknown, tournamentId?: string) => void;
};

export function createCollector(dependencies: CollectorDependencies) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;
  const pending = new Set(dependencies.pending?.() ?? []);
  let lastSuccessAt: string | null = null;
  let lastPostEventSweepAt = 0;
  let lastPostEventSweepCompletedAt: string | null = null;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const catalog = await dependencies.catalog();
      const active = catalog.filter(
        (t) => t.status === "live" || t.status === "today",
      );
      const activeIds = new Set(active.map((t) => t.id));
      for (const id of activeIds) pending.add(id);
      const queue = [...pending];
      let failed = false;
      // Limit upstream concurrency; failure of one tournament does not stop others.
      await Promise.all(
        Array.from({ length: Math.min(3, queue.length) }, async () => {
          while (!stopped && queue.length) {
            const id = queue.shift();
            if (!id) break;
            try {
              await dependencies.collect(id, !activeIds.has(id));
              if (!activeIds.has(id)) pending.delete(id);
            } catch (error) {
              failed = true;
              dependencies.onError(error, id);
            }
          }
        }),
      );
      if (
        dependencies.sweepRecentResults &&
        Date.now() - lastPostEventSweepAt >= POST_EVENT_RESULTS_INTERVAL_MS
      ) {
        lastPostEventSweepAt = Date.now();
        const recent = catalog.filter(
          (tournament) => tournament.status === "recent",
        );
        const queue = [...recent];
        await Promise.all(
          Array.from({ length: Math.min(2, queue.length) }, async () => {
            while (!stopped && queue.length) {
              const tournament = queue.shift();
              if (!tournament) break;
              try {
                await dependencies.sweepRecentResults?.(tournament.id);
              } catch (error) {
                failed = true;
                dependencies.onError(error, tournament.id);
              }
            }
          }),
        );
        lastPostEventSweepCompletedAt = new Date().toISOString();
      }
      if (dependencies.pollRatings) {
        const lastPollAt = dependencies.lastRatingsPollAt?.();
        const due =
          !lastPollAt ||
          Date.now() - Date.parse(lastPollAt) >= RATINGS_POLL_INTERVAL_MS;
        const berlinWeekday = new Intl.DateTimeFormat("en-US", {
          timeZone: "Europe/Berlin",
          weekday: "short",
        }).format(new Date());
        if (due && ["Mon", "Tue", "Wed"].includes(berlinWeekday)) {
          try {
            await dependencies.pollRatings();
          } catch (error) {
            failed = true;
            dependencies.onError(error);
          }
        }
      }
      if (!failed) lastSuccessAt = new Date().toISOString();
    } catch (error) {
      dependencies.onError(error);
    } finally {
      running = false;
    }
  };
  const schedule = async () => {
    await tick();
    if (!stopped) {
      timer = setTimeout(schedule, COLLECTION_INTERVAL_MS);
      timer.unref?.();
    }
  };
  return {
    tick,
    start() {
      if (!timer && !running && !stopped) void schedule();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    status() {
      return {
        running,
        lastSuccessAt,
        lastPostEventSweepAt:
          lastPostEventSweepAt > 0
            ? new Date(lastPostEventSweepAt).toISOString()
            : null,
        lastPostEventSweepCompletedAt,
      };
    },
  };
}

declare global {
  var leadcardCollector: ReturnType<typeof createCollector> | undefined;
}

export function startCollector() {
  if (
    globalThis.leadcardCollector ||
    process.env.LEADCARD_FORCE_MOCK_DATA === "true" ||
    process.env.LEADCARD_COLLECTOR_ENABLED === "false"
  )
    return;
  getArchive(); // Fail startup if durable storage cannot be opened/migrated.
  globalThis.leadcardCollector = createCollector({
    catalog: getTournamentCatalog,
    collect: collectTournament,
    sweepRecentResults: async (tournamentId) => {
      // Capture one last scorecard snapshot before resolving official results.
      await collectTournament(tournamentId, true);
      const results = await fetchOfficialResults(tournamentId);
      if (!results.finalized) return;
      const outcome = savePostEventFactSheet(tournamentId, results);
      if (outcome === "saved")
        console.info("Saved post-event fact sheet", tournamentId);
    },
    lastRatingsPollAt: () => getArchive().lastRatingsPollAt(),
    pollRatings: async () => {
      const archive = getArchive();
      const snapshot = await fetchRatingsSnapshot();
      const previous = archive.latestRatingsSnapshot();
      archive.saveRatingsSnapshot(snapshot.payload, snapshot.contentHash);
      archive.markRatingsPolled();
      if (previous?.contentHash !== snapshot.contentHash) {
        console.info("Saved ratings snapshot", {
          itemCount: snapshot.itemCount,
          contentHash: snapshot.contentHash,
        });
      }
    },
    pending: () =>
      getArchive()
        .summaries()
        .filter((t) => t.status === "live" || t.status === "today")
        .map((t) => t.id),
    onError(error, tournamentId) {
      console.error(
        "Archive collection failed",
        tournamentId ?? "catalog",
        error,
      );
      reportServerError(
        error,
        "archive-collector",
        tournamentId ? { "tournament.id": tournamentId } : {},
      );
    },
  });
  globalThis.leadcardCollector.start();
  process.once("SIGTERM", () => globalThis.leadcardCollector?.stop());
  process.once("SIGINT", () => globalThis.leadcardCollector?.stop());
}

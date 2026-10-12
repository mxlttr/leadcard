import { getArchive } from "@/lib/server/archive";
import { collectTournament } from "@/lib/server/live-store";
import { reportServerError } from "@/lib/server/report-error";
import { getTournamentCatalog } from "@/lib/server/tournament-source";
import type { TournamentSummary } from "@/lib/types";

export const COLLECTION_INTERVAL_MS = 25_000;

type CollectorDependencies = {
  catalog: () => Promise<TournamentSummary[]>;
  pending?: () => string[];
  collect: (id: string, final?: boolean) => Promise<void>;
  onError: (error: unknown, tournamentId?: string) => void;
};

export function createCollector(dependencies: CollectorDependencies) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;
  const pending = new Set(dependencies.pending?.() ?? []);
  let lastSuccessAt: string | null = null;
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
      return { running, lastSuccessAt };
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

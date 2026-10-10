import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COLLECTION_INTERVAL_MS,
  createCollector,
} from "@/lib/server/collector";
import type { TournamentSummary } from "@/lib/types";

const tournament = (
  id: string,
  status: TournamentSummary["status"],
): TournamentSummary => ({
  id,
  status,
  name: id,
  course: "Course",
  roundLabel: "Round 1",
});
afterEach(() => vi.useRealTimers());

describe("unattended collector", () => {
  it("collects live/today without subscribers and captures final scores before stopping", async () => {
    vi.useFakeTimers();
    const catalog = vi
      .fn()
      .mockResolvedValue([
        tournament("1", "live"),
        tournament("2", "today"),
        tournament("3", "upcoming"),
        tournament("4", "mock"),
      ]);
    const collect = vi.fn().mockResolvedValue(undefined);
    const collector = createCollector({ catalog, collect, onError: vi.fn() });
    collector.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(collect.mock.calls).toEqual([
      ["1", false],
      ["2", false],
    ]);
    catalog.mockResolvedValue([
      tournament("1", "finished"),
      tournament("2", "today"),
    ]);
    await vi.advanceTimersByTimeAsync(COLLECTION_INTERVAL_MS);
    expect(collect).toHaveBeenCalledWith("1", true);
    collect.mockClear();
    await vi.advanceTimersByTimeAsync(COLLECTION_INTERVAL_MS);
    expect(collect.mock.calls).toEqual([["2", false]]);
    collector.stop();
    await vi.advanceTimersByTimeAsync(COLLECTION_INTERVAL_MS);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it("restores unfinished collection and retries failures without blocking other tournaments", async () => {
    const onError = vi.fn();
    const collect = vi
      .fn()
      .mockRejectedValueOnce(new Error("source down"))
      .mockResolvedValue(undefined);
    const collector = createCollector({
      pending: () => ["1"],
      catalog: async () => [
        tournament("1", "finished"),
        tournament("2", "live"),
      ],
      collect,
      onError,
    });
    await collector.tick();
    expect(collect).toHaveBeenCalledWith("2", false);
    expect(onError).toHaveBeenCalledTimes(1);
    await collector.tick();
    expect(collect.mock.calls.filter(([id]) => id === "1")).toHaveLength(2);
    expect(collector.status().lastSuccessAt).toBeTruthy();
    collector.stop();
  });

  it("never overlaps a slow collection cycle", async () => {
    let done: (() => void) | undefined;
    const collect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          done = resolve;
        }),
    );
    const collector = createCollector({
      catalog: async () => [tournament("1", "live")],
      collect,
      onError: vi.fn(),
    });
    const first = collector.tick();
    await Promise.resolve();
    await collector.tick();
    expect(collect).toHaveBeenCalledTimes(1);
    done?.();
    await first;
    collector.stop();
  });
});

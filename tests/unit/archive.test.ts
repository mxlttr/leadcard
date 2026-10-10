import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Archive,
  ArchiveVersionChanged,
  InvalidArchiveCursor,
} from "@/lib/server/archive";
import type { LiveState } from "@/lib/server/live-state";
import type { PlayerSnapshot } from "@/lib/types";

const players = (step: number): PlayerSnapshot[] =>
  Array.from({ length: 4 }, (_, i) => ({
    playerId: `p${i}`,
    name: `Player ${i}`,
    division: "Open",
    lastFive: [],
    thru: 2,
    rank: i < 2 ? (step % 2 === i ? 1 : 2) : i + 1,
    scoreToPar: i < 2 ? (step % 2 === i ? -2 : 0) : 3,
  }));
function state(step: number, revision = 0, id = "2506"): LiveState {
  const at = new Date(Date.UTC(2026, 9, 10, 10, 0, step)).toISOString();
  return {
    tournament: {
      id,
      name: "Open",
      course: "Course",
      roundLabel: "Round 1",
      status: "live",
    },
    revision,
    hasLiveData: true,
    autoRefresh: true,
    fixtureIndex: 0,
    replayPaused: false,
    lastAdvancedAt: Date.parse(at),
    generatedAt: at,
    updates: [],
    players: players(step).map((p) => ({
      ...p,
      delta: { rankDelta: 0, scoreDelta: 0, thruDelta: 0 },
      latestUpdate: null,
    })),
  };
}

describe("SQLite archive", () => {
  let dir: string;
  let archive: Archive;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "leadcard-archive-"));
    archive = new Archive(join(dir, "archive.sqlite"));
  });
  afterEach(() => {
    if (archive.db.open) archive.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const count = (archive: Archive, table: string) =>
    (
      archive.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
        n: number;
      }
    ).n;

  it("restores standings and events after reopening, preserving the comparison baseline", () => {
    archive.commit(state(0), players(0));
    archive.commit(state(1, 1), players(1));
    const before = archive.page("2506");
    expect(before.updates.length).toBeGreaterThan(0);
    archive.close();
    archive = new Archive(join(dir, "archive.sqlite"));
    expect(archive.page("2506")).toEqual(before);
    const saved = archive.load("2506");
    if (!saved) throw new Error("Missing saved state");
    expect(saved.revision).toBe(2);
    archive.commit(
      { ...saved, lastAdvancedAt: Date.now() },
      [...players(1)].reverse(),
    );
    expect(count(archive, "snapshots")).toBe(2);
    expect(archive.page("2506").updates).toEqual(before.updates);
    archive.commit(state(2, 3), players(2));
    expect(count(archive, "snapshots")).toBe(3); // A -> B -> A must retain the return to A.
  });

  it("rolls back snapshot, updates and baseline together on a write failure", () => {
    archive.commit(state(0), players(0));
    archive.db.exec(
      "CREATE TRIGGER fail_update BEFORE INSERT ON updates BEGIN SELECT RAISE(ABORT, 'disk failure'); END",
    );
    expect(() => archive.commit(state(1, 1), players(1))).toThrow(
      "disk failure",
    );
    expect(count(archive, "snapshots")).toBe(1);
    expect(count(archive, "updates")).toBe(0);
    expect(archive.load("2506")?.revision).toBe(1);
  });

  it("rejects stale writers and keeps archive data when only metadata is saved", () => {
    archive.commit(state(0), players(0));
    archive.commit(state(1, 1), players(1));
    const current = archive.load("2506");
    expect(archive.commit(state(2, 1), players(2))).toEqual(current);
    if (!current) throw new Error("Missing saved state");
    archive.commit({ ...current, lastAdvancedAt: Date.now() });
    expect(count(archive, "snapshots")).toBe(2);
    expect(archive.page("2506").updates.length).toBeGreaterThan(0);
  });

  it("pages 50 events without gaps across new arrivals and replays identical IDs", () => {
    for (let i = 0; i < 40; i++) archive.commit(state(i, i), players(i));
    const initial = archive.page("2506");
    expect(initial.updates).toHaveLength(50);
    expect(initial.nextCursor).toBeTruthy();
    archive.commit(state(40, 40), players(40));
    const older = archive.page("2506", initial.nextCursor);
    const ids = [...initial.updates, ...older.updates].map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(count(archive, "updates") - 2);
    const beforeReplay = archive.page("2506");
    archive.replay("2506");
    expect(archive.page("2506")).toEqual(beforeReplay);
    expect(() => archive.page("other", initial.nextCursor)).toThrow(
      InvalidArchiveCursor,
    );
    expect(() => archive.page("2506", "garbage")).toThrow(InvalidArchiveCursor);
    archive.db.prepare("UPDATE tournaments SET active_version = 'old'").run();
    expect(() => archive.page("2506", initial.nextCursor)).toThrow(
      ArchiveVersionChanged,
    );
    expect(() => archive.commit(state(41, 42), players(41))).toThrow("replay");
    archive.replay("2506");
    expect(archive.page("2506").updates).toEqual(beforeReplay.updates);
  });

  it("backs up WAL contents into a standalone database", async () => {
    archive.commit(state(0), players(0));
    archive.commit(state(1, 1), players(1));
    const backupPath = join(dir, "backup.sqlite");
    await archive.db.backup(backupPath);
    const restored = new Archive(backupPath);
    expect(restored.page("2506")).toEqual(archive.page("2506"));
    expect(restored.load("2506")).toEqual(archive.load("2506"));
    restored.close();
  });
});

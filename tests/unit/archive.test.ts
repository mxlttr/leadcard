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
    thru: "F",
    rank: i < 2 ? (step % 2 === i ? 1 : 2) : i + 1,
    scoreToPar: i < 2 ? (step % 2 === i ? -2 : 0) : 3,
    rounds: [1, 2].map((order) => {
      const birdieLeader = step % 4;
      const bogeyLeader = (step + 1) % 4;
      const birdies = i === birdieLeader ? 3 : 1;
      const bogeys = i === bogeyLeader ? 0 : 2;
      const holes = Array.from({ length: 18 }, (_, holeIndex) => {
        const relativeToPar =
          holeIndex < birdies ? -1 : holeIndex < birdies + bogeys ? 1 : 0;
        return {
          hole: holeIndex + 1,
          par: 3,
          score: 3 + relativeToPar,
          relativeToPar,
        };
      });
      return {
        id: `p${i}-round-${order}`,
        order,
        label: `Round ${order}`,
        thru: "F" as const,
        scoreToPar: null,
        holes,
      };
    }),
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

  it("exports original report snapshots without replaying or changing the feed", () => {
    archive.commit(state(0), players(0));
    const before = archive.page("2506");
    const snapshots = archive.reportSnapshots("2506");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      sourceAt: state(0).generatedAt,
      tournament: state(0).tournament,
    });
    expect(snapshots[0].players).toEqual(players(0));
    expect(archive.page("2506")).toEqual(before);
    archive.db.prepare("UPDATE snapshots SET schema_version = 99").run();
    expect(() => archive.reportSnapshots("2506")).toThrow(
      "Unsupported report snapshot schema",
    );
  });

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

  it("carries old events forward and backfills only round summaries on version upgrade", () => {
    archive.commit(state(0), players(0));
    archive.commit(state(1, 1), players(1));
    archive.db
      .prepare("DELETE FROM updates WHERE tournament_id = ?")
      .run("2506");
    archive.db
      .prepare(
        "INSERT INTO updates(tournament_id, version, snapshot_id, event_id, payload) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        "2506",
        "v1",
        1,
        "1:legacy-event",
        JSON.stringify({
          id: "1:legacy-event",
          playerId: "p0",
          playerName: "Player 0",
          division: "Open",
          text: "A legacy update",
          kind: "lead_change",
          importance: "high",
          tone: "positive",
          createdAt: state(0).generatedAt,
        }),
      );
    archive.db
      .prepare("UPDATE tournaments SET active_version = ? WHERE id = ?")
      .run("v1", "2506");

    expect(archive.upgradeVersion("2506")).toBe(true);
    expect(archive.upgradeVersion("2506")).toBe(false);

    const response = archive.page("2506");
    expect(response.archiveVersion).toBe("v2");
    expect(
      response.updates.some((update) => update.id === "1:legacy-event"),
    ).toBe(true);
    expect(
      response.updates.filter(
        (update) => update.kind === "round_stats_summary",
      ),
    ).toHaveLength(4);
    expect(
      response.updates.some((update) => update.kind === "opening_birdie"),
    ).toBe(false);
  });

  it("rolls back snapshot, updates and baseline together on a write failure", () => {
    archive.commit(state(0), players(0));
    const updatesBefore = count(archive, "updates");
    archive.db.exec(
      "CREATE TRIGGER fail_update BEFORE INSERT ON updates BEGIN SELECT RAISE(ABORT, 'disk failure'); END",
    );
    expect(() => archive.commit(state(1, 1), players(1))).toThrow(
      "disk failure",
    );
    expect(count(archive, "snapshots")).toBe(1);
    expect(count(archive, "updates")).toBe(updatesBefore);
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
    const saved = archive.load("2506");
    if (!saved) throw new Error("Missing saved state");
    archive.db.prepare("UPDATE tournaments SET active_version = 'old'").run();
    expect(() => archive.page("2506", initial.nextCursor)).toThrow(
      ArchiveVersionChanged,
    );
    archive.commit(saved);
    expect(archive.page("2506").archiveVersion).toBe("v2");
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

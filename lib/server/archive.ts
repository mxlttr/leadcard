import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { LiveState } from "@/lib/server/live-state";
import {
  toLeaderboardPlayers,
  UPDATE_LOGIC_VERSION,
} from "@/lib/server/update-engine";
import type {
  PlayerSnapshot,
  RecentUpdate,
  TournamentSummary,
  UpdatesResponse,
} from "@/lib/types";

export class InvalidArchiveCursor extends Error {}
export class ArchiveVersionChanged extends Error {}

type StateRow = { state: string; revision: number; active_version: string };
type SnapshotRow = {
  id: number;
  schema_version: number;
  payload: string;
  content_hash: string;
  source_at: string;
};
type UpdateRow = { snapshot_id: number; event_id: string; payload: string };
type Cursor = {
  tournament: string;
  version: string;
  snapshot: number;
  event: string;
};

export function isArchivedTournament(tournament: TournamentSummary) {
  return (
    process.env.LEADCARD_FORCE_MOCK_DATA !== "true" &&
    tournament.status !== "mock"
  );
}

function canonicalPlayers(players: PlayerSnapshot[]) {
  // Field order and scraper row order must not cause duplicate snapshots.
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, canonical(v)]),
      );
    }
    return value;
  };
  return JSON.stringify(
    canonical(
      [...players].sort((a, b) => a.playerId.localeCompare(b.playerId)),
    ),
  );
}

export class Archive {
  readonly db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("foreign_keys = ON");
    this.db
      .transaction(() => {
        const version = this.db.pragma("user_version", {
          simple: true,
        }) as number;
        if (version > 1)
          throw new Error("Archive schema is newer than this application");
        if (version === 0) {
          this.db.exec(`
          CREATE TABLE tournaments (
            id TEXT PRIMARY KEY, state TEXT NOT NULL, summary TEXT NOT NULL, revision INTEGER NOT NULL,
            active_version TEXT NOT NULL
          );
          CREATE TABLE snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id TEXT NOT NULL REFERENCES tournaments(id),
            observed_at TEXT NOT NULL, source_at TEXT NOT NULL,
            schema_version INTEGER NOT NULL DEFAULT 1,
            content_hash TEXT NOT NULL, payload TEXT NOT NULL, tournament TEXT NOT NULL
          );
          CREATE INDEX snapshots_tournament ON snapshots(tournament_id, id DESC);
          CREATE TABLE updates (
            tournament_id TEXT NOT NULL REFERENCES tournaments(id),
            version TEXT NOT NULL, snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
            event_id TEXT NOT NULL, payload TEXT NOT NULL,
            PRIMARY KEY(tournament_id, version, event_id)
          );
          CREATE INDEX updates_page ON updates(tournament_id, version, snapshot_id DESC, event_id DESC);
          PRAGMA user_version = 1;
        `);
        }
      })
      .immediate();
  }

  load(tournamentId: string): LiveState | undefined {
    const row = this.db
      .prepare("SELECT state, revision FROM tournaments WHERE id = ?")
      .get(tournamentId) as StateRow | undefined;
    return row
      ? { ...JSON.parse(row.state), revision: row.revision }
      : undefined;
  }

  summaries(): TournamentSummary[] {
    return (
      this.db.prepare("SELECT summary FROM tournaments").all() as {
        summary: string;
      }[]
    ).map((row) => JSON.parse(row.summary) as TournamentSummary);
  }

  private insertUpdates(
    tournamentId: string,
    version: string,
    snapshotId: number,
    updates: RecentUpdate[],
  ) {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO updates(tournament_id, version, snapshot_id, event_id, payload) VALUES (?, ?, ?, ?, ?)",
    );
    return updates.map((update) => {
      const persisted = { ...update, id: `${snapshotId}:${update.id}` };
      insert.run(
        tournamentId,
        version,
        snapshotId,
        persisted.id,
        JSON.stringify(persisted),
      );
      return persisted;
    });
  }

  commit(candidate: LiveState, players?: PlayerSnapshot[]): LiveState {
    return this.db
      .transaction(() => {
        const id = candidate.tournament.id;
        const row = this.db
          .prepare(
            "SELECT state, revision, active_version FROM tournaments WHERE id = ?",
          )
          .get(id) as StateRow | undefined;
        // A request or overlapping deployment already committed a fresher state.
        if ((row?.revision ?? 0) !== (candidate.revision ?? 0)) {
          const saved = this.load(id);
          if (!saved)
            throw new Error("Archived state disappeared during commit");
          return saved;
        }
        if (row && row.active_version !== UPDATE_LOGIC_VERSION) {
          throw new Error(
            `Archive uses ${row.active_version}; replay to ${UPDATE_LOGIC_VERSION} before collecting`,
          );
        }
        const next = {
          ...candidate,
          updates: [],
          revision: (row?.revision ?? 0) + 1,
        };
        this.db
          .prepare(
            "INSERT OR IGNORE INTO tournaments(id, state, summary, revision, active_version) VALUES (?, ?, ?, 0, ?)",
          )
          .run(
            id,
            JSON.stringify(next),
            JSON.stringify(candidate.tournament),
            UPDATE_LOGIC_VERSION,
          );
        if (players?.length) {
          const payload = canonicalPlayers(players);
          const hash = createHash("sha256").update(payload).digest("hex");
          const previous = this.db
            .prepare(
              "SELECT id, payload, content_hash, source_at FROM snapshots WHERE tournament_id = ? ORDER BY id DESC LIMIT 1",
            )
            .get(id) as SnapshotRow | undefined;
          if (previous?.content_hash !== hash) {
            const inserted = this.db
              .prepare(
                "INSERT INTO snapshots(tournament_id, observed_at, source_at, content_hash, payload, tournament) VALUES (?, ?, ?, ?, ?, ?)",
              )
              .run(
                id,
                new Date(candidate.lastAdvancedAt).toISOString(),
                candidate.generatedAt,
                hash,
                payload,
                JSON.stringify(candidate.tournament),
              );
            const derived = toLeaderboardPlayers(
              previous ? JSON.parse(previous.payload) : [],
              players,
              candidate.generatedAt,
            );
            const updates = this.insertUpdates(
              id,
              UPDATE_LOGIC_VERSION,
              Number(inserted.lastInsertRowid),
              derived.updates,
            );
            const byId = new Map(
              updates.map((u) => [u.id.slice(u.id.indexOf(":") + 1), u]),
            );
            next.players = derived.players.map((player) => ({
              ...player,
              latestUpdate: player.latestUpdate
                ? (byId.get(player.latestUpdate.id) ?? null)
                : null,
            }));
          }
        }
        this.db
          .prepare(
            "UPDATE tournaments SET state = ?, summary = ?, revision = ? WHERE id = ?",
          )
          .run(
            JSON.stringify(next),
            JSON.stringify(candidate.tournament),
            next.revision,
            id,
          );
        return next;
      })
      .immediate();
  }

  page(tournamentId: string, cursor?: string | null): UpdatesResponse {
    return this.db.transaction(() => {
      const row = this.db
        .prepare("SELECT state, active_version FROM tournaments WHERE id = ?")
        .get(tournamentId) as StateRow | undefined;
      const version = row?.active_version ?? UPDATE_LOGIC_VERSION;
      let boundary: Cursor | undefined;
      if (cursor) {
        try {
          if (cursor.length > 2048) throw new Error();
          boundary = JSON.parse(
            Buffer.from(cursor, "base64url").toString(),
          ) as Cursor;
          if (
            boundary.tournament !== tournamentId ||
            !Number.isSafeInteger(boundary.snapshot) ||
            boundary.snapshot < 1 ||
            typeof boundary.event !== "string" ||
            typeof boundary.version !== "string"
          )
            throw new Error();
        } catch {
          throw new InvalidArchiveCursor("Invalid archive cursor");
        }
        if (boundary.version !== version)
          throw new ArchiveVersionChanged(
            "Archive was rebuilt; reload the first page",
          );
      }
      const rows = (
        boundary
          ? this.db
              .prepare(
                "SELECT snapshot_id, event_id, payload FROM updates WHERE tournament_id = ? AND version = ? AND (snapshot_id < ? OR (snapshot_id = ? AND event_id < ?)) ORDER BY snapshot_id DESC, event_id DESC LIMIT 51",
              )
              .all(
                tournamentId,
                version,
                boundary.snapshot,
                boundary.snapshot,
                boundary.event,
              )
          : this.db
              .prepare(
                "SELECT snapshot_id, event_id, payload FROM updates WHERE tournament_id = ? AND version = ? ORDER BY snapshot_id DESC, event_id DESC LIMIT 51",
              )
              .all(tournamentId, version)
      ) as UpdateRow[];
      const page = rows.slice(0, 50);
      const last = page.at(-1);
      return {
        tournamentId,
        updates: page.map((r) => JSON.parse(r.payload) as RecentUpdate),
        generatedAt: row
          ? (JSON.parse(row.state) as LiveState).generatedAt
          : new Date().toISOString(),
        archiveVersion: version,
        nextCursor:
          rows.length > 50 && last
            ? Buffer.from(
                JSON.stringify({
                  tournament: tournamentId,
                  version,
                  snapshot: last.snapshot_id,
                  event: last.event_id,
                } satisfies Cursor),
              ).toString("base64url")
            : null,
      };
    })();
  }

  replay(tournamentId: string, version = UPDATE_LOGIC_VERSION) {
    if (version !== UPDATE_LOGIC_VERSION)
      throw new Error(
        `Only the installed update engine (${UPDATE_LOGIC_VERSION}) can be replayed`,
      );
    return this.db
      .transaction(() => {
        const state = this.load(tournamentId);
        if (!state) throw new Error("Unknown archived tournament");
        this.db
          .prepare(
            "DELETE FROM updates WHERE tournament_id = ? AND version = ?",
          )
          .run(tournamentId, version);
        let previous: PlayerSnapshot[] = [];
        let count = 0;
        let latestPlayers = state.players;
        let after = 0;
        while (true) {
          const batch = this.db
            .prepare(
              "SELECT id, schema_version, payload, source_at FROM snapshots WHERE tournament_id = ? AND id > ? ORDER BY id LIMIT 100",
            )
            .all(tournamentId, after) as SnapshotRow[];
          if (!batch.length) break;
          for (const snapshot of batch) {
            if (snapshot.schema_version !== 1)
              throw new Error("Unsupported parsed snapshot schema");
            after = snapshot.id;
            const players = JSON.parse(snapshot.payload) as PlayerSnapshot[];
            const derived = toLeaderboardPlayers(
              previous,
              players,
              snapshot.source_at,
            );
            const saved = this.insertUpdates(
              tournamentId,
              version,
              snapshot.id,
              derived.updates,
            );
            count += saved.length;
            latestPlayers = derived.players.map((p) => ({
              ...p,
              latestUpdate: p.latestUpdate
                ? (saved.find(
                    (u) => u.id === `${snapshot.id}:${p.latestUpdate?.id}`,
                  ) ?? null)
                : null,
            }));
            previous = players;
          }
        }
        this.db
          .prepare(
            "UPDATE tournaments SET active_version = ?, state = ?, revision = revision + 1 WHERE id = ?",
          )
          .run(
            version,
            JSON.stringify({ ...state, players: latestPlayers, updates: [] }),
            tournamentId,
          );
        return count;
      })
      .immediate();
  }

  close() {
    this.db.close();
  }
}

declare global {
  var leadcardArchive: Archive | undefined;
}

export function getArchive() {
  if (!globalThis.leadcardArchive) {
    const path = process.env.LEADCARD_DB_PATH;
    if (!path && process.env.NODE_ENV === "production")
      throw new Error("LEADCARD_DB_PATH must point to persistent storage");
    globalThis.leadcardArchive = new Archive(path ?? ".data/leadcard.sqlite");
  }
  return globalThis.leadcardArchive;
}

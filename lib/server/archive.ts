import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { LiveState } from "@/lib/server/live-state";
import type { ReportSnapshot } from "@/lib/server/reporting/fact-sheet";
import type { OfficialResultsContext } from "@/lib/server/reporting/official-results";
import type { RatingContext } from "@/lib/server/reporting/ratings";
import {
  hashRatingValues,
  haveRatingsChanged,
} from "@/lib/server/reporting/ratings-snapshot-hash";
import {
  createRoundStatUpdates,
  toLeaderboardPlayers,
  UPDATE_LOGIC_VERSION,
} from "@/lib/server/update-engine";
import type {
  PlayerRound,
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
  tournament?: string;
};
type UpdateRow = { snapshot_id: number; event_id: string; payload: string };
type Cursor = {
  tournament: string;
  version: string;
  snapshot: number;
  event: string;
};
export type SavedFactSheet = {
  tournamentId: string;
  sourceFingerprint: string;
  contentHash: string;
  payload: string;
  createdAt: string;
};
export type SavedReportDraft = {
  id: number;
  tournamentId: string;
  factSheetHash: string;
  promptVersion: string;
  model: string;
  payload: string;
  createdAt: string;
};
export type SavedReportExport = {
  id: number;
  tournamentId: string;
  locale: "en" | "de";
  draftId: number;
  factSheetHash: string;
  filePath: string;
  permalink: string;
  status: "draft-exported" | "submitted" | "published";
  publicationCommit: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type SavedRatingsSnapshot = {
  id: number;
  capturedAt: string;
  contentHash: string;
  payload: string;
};

export type SavedRatingsFactSheet = {
  id: number;
  sourceFingerprint: string;
  contentHash: string;
  payload: string;
  createdAt: string;
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
        if (version > 6)
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
        const updatedVersion = this.db.pragma("user_version", {
          simple: true,
        }) as number;
        if (updatedVersion === 1) {
          this.db.exec(`
            CREATE TABLE report_fact_sheets (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              tournament_id TEXT NOT NULL REFERENCES tournaments(id),
              source_fingerprint TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              payload TEXT NOT NULL,
              created_at TEXT NOT NULL,
              UNIQUE(tournament_id, content_hash)
            );
            CREATE INDEX report_fact_sheets_latest ON report_fact_sheets(tournament_id, source_fingerprint, id DESC);
            PRAGMA user_version = 2;
          `);
        }
        const reportVersion = this.db.pragma("user_version", {
          simple: true,
        }) as number;
        if (reportVersion === 2) {
          this.db.exec(`
            CREATE TABLE report_drafts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              tournament_id TEXT NOT NULL REFERENCES tournaments(id),
              fact_sheet_hash TEXT NOT NULL,
              prompt_version TEXT NOT NULL,
              model TEXT NOT NULL,
              payload TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE INDEX report_drafts_latest ON report_drafts(tournament_id, id DESC);
            PRAGMA user_version = 3;
          `);
        }
        const exportVersion = this.db.pragma("user_version", {
          simple: true,
        }) as number;
        if (exportVersion === 3) {
          this.db.exec(`
            CREATE TABLE report_exports (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              tournament_id TEXT NOT NULL REFERENCES tournaments(id),
              locale TEXT NOT NULL CHECK(locale IN ('en', 'de')),
              draft_id INTEGER NOT NULL REFERENCES report_drafts(id),
              fact_sheet_hash TEXT NOT NULL,
              file_path TEXT NOT NULL,
              permalink TEXT NOT NULL,
              status TEXT NOT NULL CHECK(status IN ('draft-exported', 'submitted', 'published')),
              publication_commit TEXT,
              published_at TEXT,
              created_at TEXT NOT NULL,
              UNIQUE(tournament_id, locale, draft_id)
            );
            CREATE INDEX report_exports_lookup ON report_exports(tournament_id, locale, id DESC);
            PRAGMA user_version = 4;
          `);
        }
        const ratingsVersion = this.db.pragma("user_version", {
          simple: true,
        }) as number;
        if (ratingsVersion === 4) {
          this.db.exec(`
            CREATE TABLE ratings_snapshots (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              captured_at TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE INDEX ratings_snapshots_latest ON ratings_snapshots(id DESC);
            CREATE TABLE ratings_poll_state (
              id INTEGER PRIMARY KEY CHECK(id = 1),
              last_polled_at TEXT NOT NULL
            );
            PRAGMA user_version = 5;
          `);
        }
        const factSheetVersion = this.db.pragma("user_version", {
          simple: true,
        }) as number;
        if (factSheetVersion === 5) {
          this.db.exec(`
            CREATE TABLE ratings_fact_sheets (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              source_fingerprint TEXT NOT NULL,
              content_hash TEXT NOT NULL UNIQUE,
              payload TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE INDEX ratings_fact_sheets_latest ON ratings_fact_sheets(id DESC);
            PRAGMA user_version = 6;
          `);
        }
        const ratingsSnapshotVersion = this.db.pragma("user_version", {
          simple: true,
        }) as number;
        if (ratingsSnapshotVersion === 6) {
          const snapshots = this.db
            .prepare("SELECT id, payload FROM ratings_snapshots ORDER BY id")
            .all() as { id: number; payload: string }[];
          const groups: { id: number; payload: string }[] = [];
          let currentGroup: (typeof snapshots)[number] | undefined;
          for (const snapshot of snapshots) {
            const payload = JSON.parse(snapshot.payload) as {
              items?: { gtNumber: number; rating: number | null }[];
            };
            if (!Array.isArray(payload.items))
              throw new Error("Ratings snapshot has no player list");
            if (!currentGroup) {
              currentGroup = snapshot;
              continue;
            }
            const previousPayload = JSON.parse(currentGroup.payload) as {
              items?: { gtNumber: number; rating: number | null }[];
            };
            if (!Array.isArray(previousPayload.items))
              throw new Error("Ratings snapshot has no player list");
            if (haveRatingsChanged(previousPayload.items, payload.items)) {
              groups.push(currentGroup);
              currentGroup = snapshot;
            } else {
              currentGroup = snapshot;
            }
          }
          if (currentGroup) groups.push(currentGroup);
          const retainedIds = new Set(groups.map(({ id }) => id));
          const updateHash = this.db.prepare(
            "UPDATE ratings_snapshots SET content_hash = ? WHERE id = ?",
          );
          const deleteDuplicate = this.db.prepare(
            "DELETE FROM ratings_snapshots WHERE id = ?",
          );
          for (const snapshot of snapshots) {
            if (retainedIds.has(snapshot.id)) continue;
            deleteDuplicate.run(snapshot.id);
          }
          for (const snapshot of groups) {
            const payload = JSON.parse(snapshot.payload) as {
              items?: { gtNumber: number; rating: number | null }[];
            };
            if (!Array.isArray(payload.items))
              throw new Error("Ratings snapshot has no player list");
            updateHash.run(hashRatingValues(payload.items), snapshot.id);
          }
          this.db.exec("PRAGMA user_version = 7");
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

  backfillOutOfBounds(tournamentId: string, sourcePlayers: PlayerSnapshot[]) {
    const completedRounds = new Map<string, Map<number, PlayerRound>>();
    for (const player of sourcePlayers) {
      const rounds = new Map<number, PlayerRound>();
      for (const round of player.rounds ?? []) {
        if (round.thru === "F") rounds.set(round.order, round);
      }
      if (rounds.size > 0) completedRounds.set(player.playerId, rounds);
    }

    return this.db
      .transaction(() => {
        const tournament = this.db
          .prepare("SELECT state FROM tournaments WHERE id = ?")
          .get(tournamentId) as { state: string } | undefined;
        if (!tournament)
          throw new Error(`Unknown archived tournament: ${tournamentId}`);

        let updatedSnapshots = 0;
        let markedHoles = 0;
        const snapshots = this.db
          .prepare(
            "SELECT id, payload FROM snapshots WHERE tournament_id = ? ORDER BY id",
          )
          .all(tournamentId) as Array<{ id: number; payload: string }>;
        const updateSnapshot = this.db.prepare(
          "UPDATE snapshots SET payload = ?, content_hash = ? WHERE id = ?",
        );

        const applyFlags = (players: PlayerSnapshot[]) => {
          let changed = false;
          const nextPlayers = players.map((player) => {
            const sourceRounds = completedRounds.get(player.playerId);
            if (!sourceRounds || !player.rounds?.length) return player;
            let playerChanged = false;
            const rounds = player.rounds.map((round) => {
              const sourceRound = sourceRounds.get(round.order);
              if (!sourceRound) return round;
              const sourceHoles = new Map(
                sourceRound.holes.map((hole) => [hole.hole, hole]),
              );
              const holes = round.holes.map((hole) => {
                const sourceHole = sourceHoles.get(hole.hole);
                if (
                  !sourceHole?.outOfBounds ||
                  sourceHole.score !== hole.score ||
                  hole.outOfBounds
                ) {
                  return hole;
                }
                playerChanged = true;
                markedHoles += 1;
                return { ...hole, outOfBounds: true };
              });
              return playerChanged ? { ...round, holes } : round;
            });
            if (!playerChanged) return player;
            changed = true;
            return { ...player, rounds };
          });
          return { players: nextPlayers, changed };
        };

        for (const snapshot of snapshots) {
          const original = JSON.parse(snapshot.payload) as PlayerSnapshot[];
          const result = applyFlags(original);
          if (!result.changed) continue;
          const payload = canonicalPlayers(result.players);
          updateSnapshot.run(
            payload,
            createHash("sha256").update(payload).digest("hex"),
            snapshot.id,
          );
          updatedSnapshots += 1;
        }

        const state = JSON.parse(tournament.state) as LiveState;
        const current = applyFlags(state.players);
        if (current.changed) {
          this.db
            .prepare(
              "UPDATE tournaments SET state = ?, revision = revision + 1 WHERE id = ?",
            )
            .run(
              JSON.stringify({ ...state, players: current.players }),
              tournamentId,
            );
        }

        return {
          completedPlayerRounds: [...completedRounds.values()].reduce(
            (sum, rounds) => sum + rounds.size,
            0,
          ),
          updatedSnapshots,
          markedHoles,
          updatedCurrentState: current.changed,
        };
      })
      .immediate();
  }

  summaries(): TournamentSummary[] {
    return (
      this.db.prepare("SELECT summary FROM tournaments").all() as {
        summary: string;
      }[]
    ).map((row) => JSON.parse(row.summary) as TournamentSummary);
  }

  saveRatingsSnapshot(payload: unknown, contentHash: string) {
    const previous = this.latestRatingsSnapshot();
    if (previous) {
      if (previous.contentHash === contentHash) return previous;
      const previousPayload = JSON.parse(previous.payload) as {
        items?: { gtNumber: number; rating: number | null }[];
      };
      const currentPayload = payload as {
        items?: { gtNumber: number; rating: number | null }[];
      };
      if (
        Array.isArray(previousPayload.items) &&
        Array.isArray(currentPayload.items) &&
        !haveRatingsChanged(previousPayload.items, currentPayload.items)
      )
        return previous;
    }
    const capturedAt = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO ratings_snapshots(captured_at, content_hash, payload) VALUES (?, ?, ?)",
      )
      .run(capturedAt, contentHash, JSON.stringify(payload));
    return this.latestRatingsSnapshot();
  }

  latestRatingsSnapshot() {
    return this.db
      .prepare(
        "SELECT id, captured_at AS capturedAt, content_hash AS contentHash, payload FROM ratings_snapshots ORDER BY id DESC LIMIT 1",
      )
      .get() as SavedRatingsSnapshot | undefined;
  }

  ratingsSnapshots() {
    return this.db
      .prepare(
        "SELECT id, captured_at AS capturedAt, content_hash AS contentHash, payload FROM ratings_snapshots ORDER BY id",
      )
      .all() as SavedRatingsSnapshot[];
  }

  latestRatingsSnapshots(limit = 2) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new Error("Invalid ratings snapshot limit");
    return (
      this.db
        .prepare(
          "SELECT id, captured_at AS capturedAt, content_hash AS contentHash, payload FROM ratings_snapshots WHERE id IN (SELECT MAX(id) FROM ratings_snapshots GROUP BY content_hash) ORDER BY id DESC LIMIT ?",
        )
        .all(limit) as SavedRatingsSnapshot[]
    ).reverse();
  }

  ratingsSnapshotCount() {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM ratings_snapshots")
      .get() as { count: number };
    return row.count;
  }

  saveRatingsFactSheet(sheet: Omit<SavedRatingsFactSheet, "id" | "createdAt">) {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        "INSERT OR IGNORE INTO ratings_fact_sheets(source_fingerprint, content_hash, payload, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(
        sheet.sourceFingerprint,
        sheet.contentHash,
        sheet.payload,
        createdAt,
      );
    const saved = this.db
      .prepare(
        "SELECT id, source_fingerprint AS sourceFingerprint, content_hash AS contentHash, payload, created_at AS createdAt FROM ratings_fact_sheets WHERE content_hash = ?",
      )
      .get(sheet.contentHash) as SavedRatingsFactSheet | undefined;
    if (!saved) throw new Error("Ratings fact sheet was not saved");
    return saved;
  }

  latestRatingsFactSheet() {
    return this.db
      .prepare(
        "SELECT id, source_fingerprint AS sourceFingerprint, content_hash AS contentHash, payload, created_at AS createdAt FROM ratings_fact_sheets ORDER BY id DESC LIMIT 1",
      )
      .get() as SavedRatingsFactSheet | undefined;
  }

  ratingsFactSheetForSource(sourceFingerprint: string) {
    return this.db
      .prepare(
        "SELECT id, source_fingerprint AS sourceFingerprint, content_hash AS contentHash, payload, created_at AS createdAt FROM ratings_fact_sheets WHERE source_fingerprint = ? ORDER BY id DESC LIMIT 1",
      )
      .get(sourceFingerprint) as SavedRatingsFactSheet | undefined;
  }

  lastRatingsPollAt() {
    const row = this.db
      .prepare(
        "SELECT last_polled_at AS lastPolledAt FROM ratings_poll_state WHERE id = 1",
      )
      .get() as { lastPolledAt: string } | undefined;
    return row?.lastPolledAt ?? null;
  }

  markRatingsPolled(at = new Date().toISOString()) {
    this.db
      .prepare(
        "INSERT INTO ratings_poll_state(id, last_polled_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET last_polled_at = excluded.last_polled_at",
      )
      .run(at);
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

  private advanceVersion(tournamentId: string, fromVersion: string) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO updates(tournament_id, version, snapshot_id, event_id, payload) SELECT tournament_id, ?, snapshot_id, event_id, payload FROM updates WHERE tournament_id = ? AND version = ?",
      )
      .run(UPDATE_LOGIC_VERSION, tournamentId, fromVersion);

    let previous: PlayerSnapshot[] = [];
    const snapshots = this.db
      .prepare(
        "SELECT id, schema_version, payload, source_at FROM snapshots WHERE tournament_id = ? ORDER BY id",
      )
      .all(tournamentId) as SnapshotRow[];
    for (const snapshot of snapshots) {
      if (snapshot.schema_version !== 1) {
        throw new Error("Unsupported parsed snapshot schema");
      }
      const players = JSON.parse(snapshot.payload) as PlayerSnapshot[];
      const summaries = createRoundStatUpdates(
        previous,
        players,
        snapshot.source_at,
      );
      this.insertUpdates(
        tournamentId,
        UPDATE_LOGIC_VERSION,
        snapshot.id,
        summaries,
      );
      previous = players;
    }

    this.db
      .prepare("UPDATE tournaments SET active_version = ? WHERE id = ?")
      .run(UPDATE_LOGIC_VERSION, tournamentId);
  }

  upgradeVersion(tournamentId: string) {
    return this.db
      .transaction(() => {
        const row = this.db
          .prepare("SELECT active_version FROM tournaments WHERE id = ?")
          .get(tournamentId) as { active_version: string } | undefined;
        if (!row)
          throw new Error(`Unknown archived tournament: ${tournamentId}`);
        if (row.active_version === UPDATE_LOGIC_VERSION) return false;
        this.advanceVersion(tournamentId, row.active_version);
        return true;
      })
      .immediate();
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
          this.advanceVersion(id, row.active_version);
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
              candidate.tournament,
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

  reportSnapshots(tournamentId: string): ReportSnapshot[] {
    const rows = this.db
      .prepare(
        "SELECT id, schema_version, payload, content_hash, source_at, tournament FROM snapshots WHERE tournament_id = ? ORDER BY id",
      )
      .all(tournamentId) as SnapshotRow[];
    return rows.map((row) => {
      if (row.schema_version !== 1 || !row.tournament)
        throw new Error("Unsupported report snapshot schema");
      return {
        id: row.id,
        sourceAt: row.source_at,
        contentHash: row.content_hash,
        tournament: JSON.parse(row.tournament) as TournamentSummary,
        players: JSON.parse(row.payload) as PlayerSnapshot[],
      };
    });
  }

  latestFactSheet(tournamentId: string, sourceFingerprint: string) {
    const row = this.db
      .prepare(
        "SELECT tournament_id AS tournamentId, source_fingerprint AS sourceFingerprint, content_hash AS contentHash, payload, created_at AS createdAt FROM report_fact_sheets WHERE tournament_id = ? AND source_fingerprint = ? ORDER BY id DESC LIMIT 1",
      )
      .get(tournamentId, sourceFingerprint) as SavedFactSheet | undefined;
    return row
      ? {
          ...row,
          value: JSON.parse(row.payload) as {
            facts: unknown;
            ratingContext: RatingContext | null;
            ratings: unknown[];
          },
        }
      : undefined;
  }

  latestTournamentFactSheet(tournamentId: string) {
    const row = this.db
      .prepare(
        "SELECT tournament_id AS tournamentId, source_fingerprint AS sourceFingerprint, content_hash AS contentHash, payload, created_at AS createdAt FROM report_fact_sheets WHERE tournament_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(tournamentId) as SavedFactSheet | undefined;
    return row
      ? {
          ...row,
          value: JSON.parse(row.payload) as {
            facts: unknown;
            officialResults?: OfficialResultsContext | null;
            ratingContext: RatingContext | null;
            ratings: unknown[];
            ratingFetchError?: string | null;
          },
        }
      : undefined;
  }

  saveFactSheet(sheet: Omit<SavedFactSheet, "createdAt">) {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        "INSERT OR IGNORE INTO report_fact_sheets(tournament_id, source_fingerprint, content_hash, payload, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        sheet.tournamentId,
        sheet.sourceFingerprint,
        sheet.contentHash,
        sheet.payload,
        createdAt,
      );
    const saved = this.db
      .prepare(
        "SELECT tournament_id AS tournamentId, source_fingerprint AS sourceFingerprint, content_hash AS contentHash, payload, created_at AS createdAt FROM report_fact_sheets WHERE tournament_id = ? AND content_hash = ?",
      )
      .get(sheet.tournamentId, sheet.contentHash) as SavedFactSheet | undefined;
    if (!saved) throw new Error("Fact sheet was not saved");
    return saved;
  }

  saveReportDraft(draft: Omit<SavedReportDraft, "id" | "createdAt">) {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare(
        "INSERT INTO report_drafts(tournament_id, fact_sheet_hash, prompt_version, model, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        draft.tournamentId,
        draft.factSheetHash,
        draft.promptVersion,
        draft.model,
        draft.payload,
        createdAt,
      );
    const saved = this.db
      .prepare(
        "SELECT id, tournament_id AS tournamentId, fact_sheet_hash AS factSheetHash, prompt_version AS promptVersion, model, payload, created_at AS createdAt FROM report_drafts WHERE id = ?",
      )
      .get(result.lastInsertRowid) as SavedReportDraft | undefined;
    if (!saved) throw new Error("Report draft was not saved");
    return saved;
  }

  reportDrafts(tournamentId: string) {
    return this.db
      .prepare(
        "SELECT id, tournament_id AS tournamentId, fact_sheet_hash AS factSheetHash, prompt_version AS promptVersion, model, payload, created_at AS createdAt FROM report_drafts WHERE tournament_id = ? ORDER BY id DESC",
      )
      .all(tournamentId) as SavedReportDraft[];
  }

  saveReportExport(
    reportExport: Omit<
      SavedReportExport,
      "id" | "createdAt" | "status" | "publicationCommit" | "publishedAt"
    >,
  ) {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO report_exports(tournament_id, locale, draft_id, fact_sheet_hash, file_path, permalink, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft-exported', ?)
         ON CONFLICT(tournament_id, locale, draft_id) DO UPDATE SET
           fact_sheet_hash = excluded.fact_sheet_hash,
           file_path = excluded.file_path,
           permalink = excluded.permalink`,
      )
      .run(
        reportExport.tournamentId,
        reportExport.locale,
        reportExport.draftId,
        reportExport.factSheetHash,
        reportExport.filePath,
        reportExport.permalink,
        createdAt,
      );
    const saved = this.db
      .prepare(
        `SELECT id, tournament_id AS tournamentId, locale, draft_id AS draftId,
          fact_sheet_hash AS factSheetHash, file_path AS filePath, permalink, status,
          publication_commit AS publicationCommit, published_at AS publishedAt,
          created_at AS createdAt
         FROM report_exports WHERE tournament_id = ? AND locale = ? AND draft_id = ?`,
      )
      .get(
        reportExport.tournamentId,
        reportExport.locale,
        reportExport.draftId,
      ) as SavedReportExport | undefined;
    if (!saved) throw new Error("Report export mapping was not saved");
    return saved;
  }

  reportExports(tournamentId: string) {
    return this.db
      .prepare(
        `SELECT id, tournament_id AS tournamentId, locale, draft_id AS draftId,
          fact_sheet_hash AS factSheetHash, file_path AS filePath, permalink, status,
          publication_commit AS publicationCommit, published_at AS publishedAt,
          created_at AS createdAt
         FROM report_exports WHERE tournament_id = ? ORDER BY id DESC`,
      )
      .all(tournamentId) as SavedReportExport[];
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
              "SELECT id, schema_version, payload, source_at, tournament FROM snapshots WHERE tournament_id = ? AND id > ? ORDER BY id LIMIT 100",
            )
            .all(tournamentId, after) as SnapshotRow[];
          if (!batch.length) break;
          for (const snapshot of batch) {
            if (snapshot.schema_version !== 1)
              throw new Error("Unsupported parsed snapshot schema");
            after = snapshot.id;
            const players = JSON.parse(snapshot.payload) as PlayerSnapshot[];
            const tournament = snapshot.tournament
              ? (JSON.parse(snapshot.tournament) as TournamentSummary)
              : undefined;
            const derived = toLeaderboardPlayers(
              previous,
              players,
              snapshot.source_at,
              tournament,
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

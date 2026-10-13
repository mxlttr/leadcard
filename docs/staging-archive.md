# Temporary Coolify staging and archive cutover

Production stays on its current in-memory release until the staging soak is accepted.
Do not point production auto-deployment at this branch during the soak.

## Staging

1. Create a separate Coolify application using this repository and the
   `staging/sqlite-archive` branch, built with the repository Dockerfile.
   Choose the staging hostname when creating the application. Use one replica.
   In the application's Container settings, set **Container naming** to
   **Consistent name (no rolling updates)**. Coolify then builds the replacement
   image before stopping the current container and starting the replacement,
   avoiding overlapping SQLite collectors during deployment.
2. Add a persistent **local volume** mounted at `/data`. Give the container user
   (UID/GID 1001) read/write access. Mount the directory, not just the SQLite file:
   SQLite also writes WAL and shared-memory files beside it. Do not use NFS.
3. Set runtime `LEADCARD_DB_PATH=/data/leadcard.sqlite` and
   `LEADCARD_COLLECTOR_ENABLED=true`. Keep `LEADCARD_FORCE_MOCK_DATA` unset.
   Set `NEXT_PUBLIC_SITE_URL` to the staging origin at build time. Do not share
   production's eventual database volume with staging.
4. Deploy and use `/api/health` for the health check. `collector.lastSuccessAt`
   advances after successful collection cycles, including cycles with no active
   tournaments. Logs report individual collection failures. No browser traffic is
   required; the collector starts in the Node server startup hook.
5. In Coolify's application terminal run `node archive.cjs status`. Confirm a
   healthy database, snapshots for active tournaments, and growing update counts
   when newsworthy score changes occur. Close all browser clients and check again
   during live scoring. Collection runs every 25 seconds after the preceding pass
   completes, with at most three concurrent tournament fetches and fetch timeouts.
6. Redeploy staging using the same volume. Verify previous snapshot/update counts
   are retained, IDs remain stable, and scores collected after restart extend the
   archive. Check English/German feeds, Load older (50 per request), and tournament
   switching. Events with no newsworthy changes still produce score snapshots.

The collector also sweeps events listed as `recent` in the source catalog every
six hours. That catalog exposes completed events for seven days. Each sweep takes
one final scorecard sample, checks the official results table, and saves a new
fact sheet when the table has final classifications and its results or saved
scorecards have changed. Exact-name/division matches can resolve explicit DNF,
DNS, or DSQ statuses; unmatched or unfinalized rows remain unresolved. The health
endpoint reports the last sweep start and completion times. Events no longer in
the source's seven-day catalog window are not rechecked automatically.

The collector also takes a final sample when a tracked event leaves Live/Today.
Real archives and snapshots are retained indefinitely. Mock replays are held only
in memory and never enter SQLite. Local development defaults to
`.data/leadcard.sqlite`; set `LEADCARD_COLLECTOR_ENABLED=false` to disable unattended
collection. Production requires an explicit database path.

## Backup and replay

Create a consistent backup in the application terminal:

```sh
node archive.cjs backup /data/backups/before-replay.sqlite
node archive.cjs status
```

The backup command uses SQLite's online backup API. Do **not** copy only an open
`.sqlite` file: committed writes may still be in the WAL. Export backups off the
host separately if protection against host/volume failure is needed.

Replay uses the installed update engine, not an arbitrary historical code label:

```sh
node archive.cjs replay 2506 v1
node archive.cjs replay --all v1
```

For an engine change, bump `UPDATE_LOGIC_VERSION` with the implementation. On the
first write after deployment, the archive advances each tournament to the new
version in the same transaction: it carries existing events forward and
backfills round summaries from saved snapshots, without regenerating other
historical events. New snapshots use the new engine. This preserves the existing
feed while making summary history available.

Use the explicit `replay --all` command only when you intend to regenerate the
full event history with the installed engine. Replays publish a complete version
atomically per tournament and retain other versions. Each snapshot retains its
original source time and observation time; replay uses the original source time.
Already issued pagination cursors expire when the active version changes;
clients restart from the first page.

To advance all archived tournaments and backfill only round summaries without
waiting for a live collection cycle, run:

```sh
node archive.cjs upgrade --all
node archive.cjs status
```

The upgrade is transactional per tournament and safe to rerun. Back up the
archive first; summary events are added using each snapshot's original source
time.

Only parsed player snapshots (including divisions, standings, round/hole scores
and club enrichment) are stored. Unchanged consecutive snapshots are deduplicated;
A → B → A records three states. Raw HTML is not kept. Future parser fixes cannot
recover fields absent from these snapshots. Existing in-memory history predating
staging cannot be recovered.

## Cutover after the soak

1. Wait for explicit acceptance of the staging soak. Production remains on its
   existing in-memory version until then.
2. Stop staging collection and traffic. With the staging app stopped, run
   `node archive.cjs backup /data/backups/cutover.sqlite` in a one-off container
   using the staging image and volume. This captures all final WAL contents.
3. Prepare production's own persistent `/data` volume. With its DB-backed app
   stopped, restore the backup as `/data/leadcard.sqlite` into an empty volume,
   owned by UID/GID 1001. Do not overwrite a live database or carry stale WAL/SHM
   files from a different database. Keep the original backup until verified.
4. Deploy the exact image/code validated in staging to production, with its own
   origin, `LEADCARD_DB_PATH`, and collector enabled. Check health, counts and
   historical IDs, then confirm newly scraped changes extend the archive.
5. Remove the temporary staging app after production checks pass. Keep the backup
   independently of the staging volume before removing that volume.

For rollback, stop the DB-backed app and redeploy the previous in-memory release;
keep the database volume and backup intact. Updates generated only by the old
in-memory release during rollback will not be in the database. A later DB-backed
restart resumes from its last saved snapshot.

One instance and local persistent storage are required. Avoid overlapping writers
in rolling deployments; a brief stop/start deployment is appropriate for this
SQLite setup. A database write failure never silently falls back to memory.

References: [Coolify storage mounts](https://coolify.io/docs/core/persistent-storage/storage-mounts/overview),
[SQLite online backups](https://sqlite.org/backup.html).

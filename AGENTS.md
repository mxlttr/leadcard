# Leadcard Dev Guide

This file is the working guide for contributors and coding agents in this repo.

## Environment

- Use Node `20.x` as declared in `package.json`.
- Install dependencies with `npm install`.
- Production site: <https://app.leadcard.de>.
- For production readiness checks, use the production URL rather than assuming a local server is running; `/api/health` reports service health.

## Main Commands

- Start local dev server: `npm run dev`
- Create a production build: `npm run build`
- Start the production server after a build: `npm run start`
- Run Next lint: `npm run lint`
- Run Biome checks: `npm run lint:biome`
- Auto-format with Biome: `npm run format`
- Run TypeScript typecheck directly: `npm run typecheck`
- Run unit tests once: `npm test`
- Run unit tests in watch mode: `npm run test:watch`
- Run Playwright e2e tests: `npm run test:e2e`
- Run Playwright headed: `npm run test:e2e:headed`
- Run Playwright UI mode: `npm run test:e2e:ui`

## Expected Validation

Use the smallest reasonable validation while iterating, then finish with the broader checks that match the risk of the change.

- For parser, diff, live-store, and other server logic changes:
  Run the relevant Vitest files first.
- For UI-only changes:
  Run the most relevant tests you have, then run a production build.
- Before finishing substantial work:
  Run `npm run build`.

If you changed formatting-sensitive files, also run:

- `npm run lint:biome`

If you want Biome to rewrite files:

- `npm run format`

## Testing Notes

- Unit tests live under `tests/unit`.
- E2E tests live under `tests/e2e`.
- Live HTML fixtures live under `tests/fixtures/live`.
- When fixing a scraper edge case, prefer saving the real HTML as a fixture and adding a regression test before changing scraper logic.

## Mock Data

To force the app to use only mock tournaments and mock leaderboard snapshots:

```bash
echo 'LEADCARD_FORCE_MOCK_DATA=true' >> .env.local
npm run dev
```

## Repo-Specific Guidance

- This app uses dynamic tournament discovery from `turniere.discgolf.de`.
- The live board and leaderboard can look fine in local tests while still failing type checks at build time, so do not skip `npm run build`.
- For `/board` changes, manually check:
  tournament switching,
  division switching,
  rotation behavior,
  fullscreen behavior if touched,
  long-name overflow behavior if touched.
- React Query polling behavior is part of user-visible functionality here, so changes around live refresh logic should be checked in the running UI when possible.

## Debugging missing production reports

Follow this investigation through to an evidence-backed explanation. Do not stop
after listing possible causes or ask the user to inspect resources available on
this machine. Treat tournament reports and rating reports as separate pipelines.

### 1. Find the actual production app

Production runs in Docker through Coolify on this machine. The checkout's
`.env.local`, `.data` database, file modification times, and host port 3000 are
not evidence of production state. Host port 3000 may belong to another service.

```bash
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
```

Identify Leadcard's current container from its image/deployment metadata and set
`LEADCARD_CONTAINER` to its name. Do not hardcode a container ID from a previous
session. A failed lookup may be a typo; re-list containers before claiming that
the deployment disappeared. Docker access can work even when reading another
user's `/proc/<pid>/environ` is denied.

Print only explicitly allowed configuration fields and secret presence:

```bash
docker exec -i "$LEADCARD_CONTAINER" node <<'JS'
for (const key of ["LEADCARD_COLLECTOR_ENABLED", "LEADCARD_FORCE_MOCK_DATA", "LEADCARD_AUTO_REPORTS_ENABLED", "LEADCARD_DB_PATH", "LEADCARD_REPORTS_REPOSITORY", "OPENAI_REPORT_MODEL"]) {
  console.log(key, process.env[key] ?? "<unset>");
}
for (const key of ["OPENAI_API_KEY", "OPENAI_SECRET_KEY", "LEADCARD_REPORTS_GITHUB_TOKEN"]) {
  console.log(key, process.env[key] ? "<set>" : "<unset>");
}
JS
```

Never dump all environment variables or full `docker inspect` output. Do not
depend on a secret-name blacklist for redaction. Check flag **values**:
`LEADCARD_FORCE_MOCK_DATA=false` does not disable collection. Collector startup
is disabled by mock mode being `true` or collector enabled being `false`;
automatic reports require `LEADCARD_AUTO_REPORTS_ENABLED=true`.

### 2. Check health and logs

Start with `https://app.leadcard.de/api/health`. If that cannot be reached, query
the app inside its container:

```bash
docker exec "$LEADCARD_CONTAINER" node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||3000)+"/api/health").then(r=>r.text()).then(console.log).catch(e=>{console.error(e.message);process.exitCode=1})'
docker logs --timestamps --since 336h "$LEADCARD_CONTAINER" 2>&1 | rg -i -C 3 'Archive collection failed|Automatic report|Automatic rating report|Saved ratings snapshot|Saved post-event fact sheet'
```

Docker accepts `336h`, not `14d`, for this duration. Check command errors before
interpreting empty filtered output as an absence of logs. Collector `running:
false` can simply mean it is between ticks; inspect `lastSuccessAt` and sweep
timestamps. Follow errors to their cause, including upstream, OpenAI, or GitHub
failures. A remaining OpenAI balance alone does not prove requests succeed.

Health also exposes `ratings.lastSuccessfulPollAt`, `latestSnapshotAt`, and
`snapshotCount` from the archive. The collector's `lastRatingsPollAttemptAt`,
`ratingsPollStatus`, `lastRatingsReportSweepAt`,
`lastRatingsReportSweepCompletedAt`, and `ratingsReportStatus` describe its
current process and reset on restart. A completed sweep can be a held or skipped
report; read its status. Failure retains the previous successful sweep timestamp.

### 3. Inspect the live archive read-only

Use the container's configured database, including its current WAL, through
`better-sqlite3`. Do not infer archive freshness from the main SQLite file's
mtime or copy that file alone while the database is active.

```bash
docker exec -i "$LEADCARD_CONTAINER" node <<'JS'
const Database = require("better-sqlite3");
const db = new Database(process.env.LEADCARD_DB_PATH || ".data/leadcard.sqlite", { readonly: true });
console.log("Last ratings poll", db.prepare("SELECT * FROM ratings_poll_state").all());
console.log("Ratings snapshots", db.prepare("SELECT id, captured_at, content_hash FROM ratings_snapshots ORDER BY id DESC LIMIT 5").all());
console.log("Report drafts", db.prepare("SELECT id, tournament_id, created_at, model FROM report_drafts ORDER BY id DESC LIMIT 10").all());
console.log("Recent events", db.prepare("SELECT id, summary, state FROM tournaments").all().map(row => {
  const summary = JSON.parse(row.summary);
  const state = JSON.parse(row.state);
  return { id: row.id, name: summary.name, end: summary.endDate, players: state.players?.length ?? 0 };
}).sort((a, b) => (b.end || "").localeCompare(a.end || "")).slice(0, 20));
db.close();
JS
```

For missing tournament reports, inspect relevant fact sheets and log completion
gaps. Zero archived players means no usable archived scorecards; investigate the
source before claiming the tournament had no players or scores. Completed event
dates alone do not guarantee reportable data.

### 4. Verify whether ratings actually changed

A recent `ratings_poll_state.last_polled_at` with an older snapshot does **not**
mean polling stopped. `saveRatingsSnapshot` suppresses unchanged ratings and
changes involving only new/missing players; it also ignores rank/display-only
changes. Inspect `lib/server/reporting/ratings-snapshot-hash.ts` and the deployed
version when necessary.

Fetch **all pages** of `https://api.syndikat.golf/ratings?page=1&pageSize=100`
(increment `page` until `total` items have been collected). Compare each matching
`gtNumber`'s `rating` against `items` in the latest archived snapshot payload.
Report counts of changed ratings, added players, and removed players. Do not
infer identical payloads from the absence of a new snapshot. If unchanged,
check cache headers/a cache-busting request and the original source at
`https://rating.discgolf.de/`, including its latest processed tournament date.
Distinguish a stale API from an original source that has not released updates.

Also inspect `collector.ts` and `reporting/automatic-ratings.ts`: currently
ratings are polled every six hours on Monday–Wednesday, and reports require two
distinct snapshots plus eligible weekend-event player data and a fact sheet
ready for review. Do not generate a duplicate article just to make activity
appear recent.

### 5. Check generation, merge, and publication separately

```bash
gh pr list --repo mxlttr/leadcard-landing --state all --limit 20 --json title,state,mergedAt,url
gh pr view <number> --repo mxlttr/leadcard-landing --json title,state,mergedAt,url
```

Use the configured reports repository if it differs. A log saying “pull request
ready” does not establish its current state. Verify whether it is open, closed,
or merged. If merged but missing from the site, inspect the landing site's
deployment and actual report URL. Do not claim a merged report is awaiting merge
or that a merge proves successful publication.

Conclude with verified timestamps, affected events, upstream comparison results,
and PR links. Explicitly separate confirmed causes from remaining unknowns.
Make necessary fixes within the requested scope; avoid changing production flags,
restarting services, or spending API quota merely to test a speculative diagnosis.

## Biome Config Summary

From `biome.json`:

- Formatter is enabled.
- Linter is enabled with recommended rules.
- JavaScript/TypeScript formatting uses:
  double quotes,
  semicolons,
  trailing commas.
- `tests/fixtures` and `.next` are excluded from Biome processing.

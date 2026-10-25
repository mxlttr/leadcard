# Tournament reporting: deterministic foundation (issue #8)

Build and save a versioned fact sheet from saved snapshots without replaying feed events:

```sh
LEADCARD_DB_PATH=.data/leadcard-history-2.sqlite npm run --silent archive -- facts 2506 > /tmp/hubertus-facts.json
LEADCARD_DB_PATH=.data/leadcard-history-2.sqlite npm run --silent archive -- facts 2698 > /tmp/nagelfluh-facts.json
LEADCARD_DB_PATH=.data/leadcard-history-2.sqlite npm run --silent archive -- facts 2698 --refresh-results > /tmp/nagelfluh-final-facts.json
```

For an already captured official result page, pass its HTML snapshot instead:

```sh
LEADCARD_DB_PATH=.data/leadcard-history-2.sqlite npm run --silent archive -- facts 2698 --results-html=/path/to/results.html
```

The long-running archive collector checks catalog events marked `recent` every
six hours on weekdays and every hour on Saturday and Sunday (Europe/Berlin).
Recent events stay in the catalog for seven days after their end date.
The sweep takes a final scorecard sample, waits for a fully classified official
results table, and saves a new fact sheet when the published classifications or
archived snapshot change. Unfinalized tables are retried on the next sweep.

The bundled equivalent is `node dist/archive.cjs facts <id>`. The generated JSON
is saved in the SQLite `report_fact_sheets` table and printed to stdout. It is
idempotent for the same facts and rating response; refreshes create a new immutable
record. The snapshot fingerprint ties each saved fact sheet to its exact archive
input, while the JSON includes the full rating response used.

## Bilingual article drafts

Generate a draft from the latest saved fact sheet, then list saved drafts without
making another model call:

```sh
LEADCARD_DB_PATH=.data/leadcard-history-2.sqlite npm run --silent archive -- draft 2506
LEADCARD_DB_PATH=.data/leadcard-history-2.sqlite npm run --silent archive -- draft 2484 --model=gpt-6-luna --allow-incomplete
LEADCARD_DB_PATH=.data/leadcard-history-2.sqlite npm run --silent archive -- drafts 2506
```

The command reads `OPENAI_SECRET_KEY` (or `OPENAI_API_KEY`) from the environment
or `.env.local`. Manual `draft` calls generate on demand. Automatic generation
can also run after the collector saves finalized official results, when enabled
as described below. Generation uses OpenAI API quota and may incur charges.
Set `OPENAI_REPORT_MODEL` or pass `--model=<model-id>` to choose another model.
The default is `gpt-4.1-mini`. Pass `--allow-incomplete` only when an editorial
partial report is appropriate; it uses complete divisions, notes tied leaders,
and excludes unresolved divisions. Partial drafts remain editorial drafts and
are not approved for publication. Exported drafts record `partialResults` and
the fact-sheet review gaps in their frontmatter. Generation uses one
structured response for English and German Markdown, asks the model to use only
the supplied fact sheet, and disables OpenAI response storage. The command refuses
fact sheets that are not ready for review unless `--allow-incomplete` is passed.

Each generated version is stored immutably in SQLite with its source fact-sheet
hash, prompt version, model, generation time, token usage, and both language
versions. Re-running `draft` makes a new model call and saves a new version.

## Automatic report pull requests

Set these production environment variables to have the collector generate reports
when every expected scorecard is complete and reconciles with the leaderboard.
The collector checks live events as scorecards update; official result finalization
by a tournament director is not required:

```sh
LEADCARD_AUTO_REPORTS_ENABLED=true
LEADCARD_REPORTS_GITHUB_TOKEN=<fine-grained token with Contents: read/write and Pull requests: read/write on the landing repository>
LEADCARD_REPORTS_REPOSITORY=mxlttr/leadcard-landing
LEADCARD_REPORTS_REVIEWER=
```

The token should belong to a GitHub App or bot account. `LEADCARD_REPORTS_REVIEWER`
is optional and may be a GitHub username or `team:<slug>`. When set, that reviewer
is requested on each pull request; email delivery depends on their GitHub
notification settings. When empty, no review is requested and email notification
depends on the repository watchers' settings.
The app also needs `OPENAI_SECRET_KEY` or `OPENAI_API_KEY`. Keep the collector
enabled and use its persistent archive as usual.

Tied first place is reportable from the scorecards. The article states that the
players are tied and that the scorecards do not identify a tiebreak winner.
Incomplete or inconsistent scorecards still hold the report. The collector
reuses a saved article for the same fact-sheet hash if a GitHub request needs
retrying. It creates a regular PR containing English and German files with
`status: published`; the PR itself does not publish the content. Merge the PR to
deploy the report. Fact sheets with incomplete or inconsistent scorecards are
held and do not generate a report. Repeated checks do not create another PR once
the same fact sheet is published. GitHub API failures are logged and retried on
the next eligible collector check, with a 15-minute retry interval per unchanged
fact sheet.

## Exporting local Markdown drafts

Export the saved bilingual draft into the landing-page repository's working tree:

```sh
LEADCARD_DB_PATH=.data/leadcard-history-2.sqlite npm run --silent archive -- export-markdown 2506 --out-dir=../leadcard-landing
```

The exporter writes `content/reports/en/<tournament-id>.md` and
`content/reports/de/<tournament-id>.md`, matching the landing site's current
Markdown renderer. Their permanent URLs use a normalized tournament-name slug
with the tournament ID appended (for example, `/reports/hubertus-open-2506/`
and `/de/berichte/hubertus-open-2506/`). Leading edition numbers such as `13.`
are omitted from the slug. The ID keeps the slug unique, and the generated slug
remains stable if the report headline changes. Each file has
the landing renderer's required `title`, `description`,
`slug`, `date`, `language`, and `status` fields plus tournament ID, locale,
event start/end dates, original publication date, update date, permalink,
fact-sheet hash/version, prompt version, model, and generation time. Drafts use
`status: draft`; `date` is set to the generation date only to satisfy the
renderer schema and must be replaced with the actual publication date when an
editor changes `status` to `published`. Original publication and update dates stay
`null` until then.

The exporter uses only a saved draft tied to the latest saved fact sheet. If the
archive does not have the tournament's event dates, supply both verified values
with `--event-start=YYYY-MM-DD --event-end=YYYY-MM-DD`. It refuses to replace
different files unless `--overwrite` is passed; repeating an identical export is
safe. Leadcard records the file-path/permalink mapping per language and draft in
`report_exports` with status `draft-exported`. This is a local export only: it
does not create a GitHub PR, change publication dates, or make the report
available to readers. A submitted or published file cannot be overwritten by
this draft exporter; corrections need a separate editorial workflow.

To capture the current ratings when an event finishes:

```sh
LEADCARD_DB_PATH=.data/leadcard-history-2.sqlite npm run --silent archive -- facts 2506 --refresh-ratings
```

This fetches all pages from `GET /ratings` and player profiles for uniquely
matched names or confirmed GT mappings. The API response does not identify its
ranking date, so the saved context records `ratingDate: null` and its retrieval
time. Code will not label a current ranking as pre-event when the date is unknown.
Player rating history has dated values but no historical ranks. For a historical
backfill, supply a verified event start time:

```sh
npm run --silent archive -- facts 2698 --refresh-ratings --event-start=2026-10-10T08:00:00Z
```

The profile values are then filtered to dates before that timestamp. Omit this
option if the event start date/time is not confirmed. Confirmed mappings can be
supplied as a JSON array with `--mappings=path/to/player-mappings.json`; each row
has `{ "playerId": "...", "gtNumber": 1234 }`. The fetched mapping context is
saved with the sheet for later regeneration.

Each player points to the source snapshot and round IDs; provenance includes all
snapshot hashes and source timestamps. Final totals and competition ranks are
calculated from reconciled hole scores. Birdies mean exactly one under par;
bogey-free means no hole over par. Division best rounds require complete coverage
and identical hole/par layouts. Field achievements report the most birdies, most
bogey-free rounds, and biggest improvement between adjacent comparable rounds.
They are explicitly scoped to completed finishers and are withheld if any finisher's
cards are incomplete or the division's layouts conflict. Ties retain every player
ID; improvement ties also retain the round pair. Improvements compare adjacent
rounds only when those layouts agree. Round-end lead changes and comeback deficits
are reconstructed from complete round scorecards, not from the sequence of polling
observations.
Small divisions, including single entrants and women, are always retained.

In-round checkpoints use archived scorecards from the same snapshot. A round is
eligible only when every observed player with scores was also seen partway through
that round and every partial card shows a `1..N` hole prefix. Any non-prefix
progress marks the round shotgun/non-sequential; missing evidence marks it unknown.
Both cases suppress interim leader claims. Eligible checkpoints require at least
two players and 50% field coverage, and each carries its covered-player count,
percentage, source snapshot and cumulative score. They describe checkpoint
standings, not the order or timing of shots.

`readyForReview` is a scorecard integrity gate, **not publication authorization**.
Unknown round counts, missing players/cards, inconsistent totals/layouts, and tied
first place require resolution. An incomplete latest snapshot never silently falls
back to older final results. Complete divisions remain inspectable when another
is incomplete. A sole entrant has no winning margin. Ties retain competition ranks;
no playoff winner or withdrawal is inferred. `--refresh-results` fetches the official
event result page and resolves only explicit DNF, DNS, or DSQ entries matched by a
unique player name and compatible division. Those players remain in the field but
are excluded from scored standings; missing rounds and totals stay null. The fetched
page, its fetch time, and its displayed result-submission time are retained as
evidence. The displayed time is not assumed to be the first-publication time or a
specific timezone. The readiness flag cannot establish completeness of players
never captured.

## Saved rating context

Saved context follows `RatingContext` in `lib/server/reporting/ratings.ts`: source
URL, retrieval timestamp, actual rating date (or null), optional event start,
usage (`event-time` or `historical-backfill`), normalized `items`, dated
`historicalValues`, confirmed mappings, and the original raw responses. No source
date is inferred from weekdays or `lastRound`.

GT numbers take priority where provided. Current archived IDs are name-derived,
so they never serve as GT numbers. Otherwise only a unique NFC-normalized exact
name matches; duplicate or approximate names stay unresolved. Club agreement is
supporting evidence. Rating division stays separate from tournament division.
Historical backfills use saved pre-event rankings or dated pre-event rating values;
they never borrow an undated current rank. Rating comparisons are produced only
when both ratings have a known date, and field-strength comparisons require a
complete same-date match of the division. Historical club membership is not
inferred from current identity metadata. A missing rating never blocks results.

## Verification and remaining stages

Regression fixtures contain the first and last original snapshots from events
2506 and 2698, exported from the local archive (65 and 196 snapshots respectively).
The fixtures deliberately contain two snapshots each, not an invented complete
observation history. Hubertus checks the Open winner, margin, birdies and women's
results. Nagelfluh checks the Open result, Master-40 comeback, both women's divisions,
and the missing Master-60 final scorecard.

The current implementation covers deterministic facts, ratings acquisition and
matching, comparison gates, immutable fact-sheet persistence, coverage-aware
in-round checkpoints, finisher-scoped field achievements, automated resolution
of explicit official DNF/DNS/DSQ classifications, and stored bilingual article
drafts. Ambiguous start patterns, matches, and missing official result pages
remain unresolved. Next: claim validation, editor preview/publish, corrections
policy and permanent article URLs. Human review of the first article comes before
publication. RSS, weekend recaps, ratings reports and club reports remain later
stages.

# Leadcard

Mobile-first live leaderboard for disc golf tournaments.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui primitives
- TanStack Query
- Node.js + Cheerio scraping pipeline

## Development

```bash
npm install
npm run dev
```

To force the local app to use only mock tournaments and mock leaderboard snapshots:

```bash
echo 'LEADCARD_FORCE_MOCK_DATA=true' >> .env.local
npm run dev
```

In mock mode, choose **15 Years Anniversary Lakers Open** to replay a real
Round 3 capture. The replay uses ten scoreboards sampled across the round and
advances one snapshot on each mock refresh (about every 25 seconds). The ten
selected snapshots each produce at least one newsworthy update from the
previous step. A floating replay panel on the leaderboard and board pages lets
you step or scrub through snapshots and pause or resume automatic refresh.

List update messages generated from those captured scoreboards:

```bash
npm run mock:updates
npm run mock:updates -- --format=json
npm run mock:updates -- --output=tmp/mock-replay-update-strings.md
npm run mock:updates -- tmp/tournament-captures/2423/2026-09-27T09-06-39-122Z
```

To capture real scorecard snapshots during a tournament:

```bash
npm run capture:tournament -- 2423 --interval=30
```

The recorder saves a compact HTML scorecard and capture metadata only when the
scorecard changes. It stops when all listed players complete round 3 (or have
an explicit DNF/DNS/DSQ status). Press Ctrl+C to stop early. Use
`--stop-after-round=2` to choose a different completion target. Files are written under
`tmp/tournament-captures/` and are ignored by Git; selected snapshots can later
be moved into `tests/fixtures/live/` for offline regression tests.

## Testing

```bash
npm test
npm run test:watch
```

- Parser and server regressions live under `tests/unit`.
- Real scoreboard fixtures live under `tests/fixtures/live`.
- When you find a scrape edge case, save the raw HTML as a fixture and add a regression test before changing the parser.

## Notes

- Tournament discovery is loaded dynamically from `turniere.discgolf.de`.
- Live standings are scraped per tournament and normalized into a derived leaderboard API for the frontend.
- This MVP is optimized for near-live spectator viewing, not real-time shot tracking.

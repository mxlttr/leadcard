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

To capture real scorecard snapshots during a tournament:

```bash
npm run capture:tournament -- 2423 --interval=30
```

The recorder saves a compact HTML scorecard and capture metadata only when the
scorecard changes. Press Ctrl+C to stop. Files are written under
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

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

## Testing

```bash
npm test
npm run test:watch
```

- Parser and server regressions live under `tests/unit`.
- Real scoreboard fixtures live under `tests/fixtures/live`.
- When you find a scrape edge case, save the raw HTML as a fixture and add a regression test before changing the parser.

## Heroku

This app can be deployed to Heroku as a standard Node.js web process.

```bash
heroku create leadcard
git push heroku main
```

- Heroku will use the `Procfile` to run `npm run start`.
- The app currently keeps live state in memory, so run it on a single web dyno for the MVP.
- Dyno restarts will reset the in-memory cache, which is fine for the current near-live setup.

## Notes

- Tournament discovery is loaded dynamically from `turniere.discgolf.de`.
- Live standings are scraped per tournament and normalized into a derived leaderboard API for the frontend.
- This MVP is optimized for near-live spectator viewing, not real-time shot tracking.

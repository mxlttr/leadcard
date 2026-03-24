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

## Notes

- Tournament discovery is loaded dynamically from `turniere.discgolf.de`.
- Live standings are scraped per tournament and normalized into a derived leaderboard API for the frontend.
- This MVP is optimized for near-live spectator viewing, not real-time shot tracking.

# Leadcard Dev Guide

This file is the working guide for contributors and coding agents in this repo.

## Environment

- Use Node `20.x` as declared in `package.json`.
- Install dependencies with `npm install`.

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

## Biome Config Summary

From `biome.json`:

- Formatter is enabled.
- Linter is enabled with recommended rules.
- JavaScript/TypeScript formatting uses:
  double quotes,
  semicolons,
  trailing commas.
- `tests/fixtures` and `.next` are excluded from Biome processing.

# This Day

`This Day` is an Even Hub app for the Even Realities G2 glasses. It serves one UTC-canonical historical moment per day from a Cloudflare Worker and renders it in two modes:

- a richly styled WebView companion built with `even-toolkit`
- a manual-paginated HUD built with the official Even SDK

## Scripts

- `npm run dev` starts QR, Vite, and Wrangler together
- `npm run server` starts the Cloudflare Worker locally on port `3001`
- `npm run backfill` generates and optionally uploads all `MM-DD` artifacts
- `npm run test` runs unit tests
- `npm run pack` builds an `.ehpk`

## Worker config

The Worker expects:

- `OPENROUTER_API_KEY` as a Cloudflare secret or `.dev.vars` entry
- `THIS_DAY_KV` bound to a real KV namespace before deployment

The checked-in `wrangler.toml` uses placeholder KV ids so the app structure is complete in-repo. Replace them with real namespace ids before deploying.

## Product rules

- one public endpoint: `GET /api/today`
- one UTC fact per day
- English-only v1
- fixed section order: `moment`, `why-it-matters`, `context`, `aftermath`, `artifact`

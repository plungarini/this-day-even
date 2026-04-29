# This Day

> One addictive historical moment every day — delivered to your Even Realities Glasses glasses.

**This Day** is a daily history ritual that surfaces a single, carefully curated historical event based on the current UTC date. Each "artifact" is researched from live sources, scored and written by AI, then rendered in two complementary modes: a richly styled WebView companion for your phone and a manual-paginated HUD you can read directly on your glasses.

---

## What it does

Every day at 00:00 UTC, the app generates a new historical moment tied to today's date. The story is broken into five narrative sections — **The Moment**, **Why It Matters**, **Context**, **Aftermath**, and **Artifact** — each sourced from Wikimedia, Library of Congress, and Open Library data. You can browse the full story on your phone, or scroll through a paginated text view on the G2 HUD.

The app also tracks your reading streaks, weekly consistency, and monthly progress, turning daily learning into a lightweight habit game.

---

## Key Features

- **One UTC fact per day** — canonically keyed to `MM-DD`, so everyone gets the same story at the same time
- **Dual rendering** — rich React companion UI on the phone + paginated Even SDK HUD on the glasses
- **AI-curated content** — events are shortlisted from Wikimedia, scored for retention/obscurity/weirdness, and rewritten by an LLM via OpenRouter
- **Live source enrichment** — pulls Wikipedia summaries, Wikimedia Commons images, Library of Congress snippets, and Open Library references
- **Progress & streaks** — daily streaks, best streaks, weekly consistency, and milestones stored in Bridge Local Storage so they survive restarts
- **Auto-refresh at midnight** — the app detects UTC day rollovers and fetches the new artifact automatically
- **Glasses-native navigation** — scroll up/down to paginate, tap to reset, double-tap to exit
- **Access gating** — supports free, trial, and subscription phases with webhook-driven payment integration

---

## How it works / User flow

1. **Boot** — The app loads on your phone and simultaneously initializes the Even Hub bridge for the glasses.
2. **Identity & progress** — It hydrates your Even user identity and reading history from Bridge Local Storage.
3. **Fetch today's artifact** — The app calls the Cloudflare Worker at `GET /api/today`, passing your identity and resolving access rules.
4. **WebView companion** — Your phone shows the full story: hero card, countdown to the next drop, progress stats, section cards, and source links.
5. **Glasses HUD** — The G2 displays a paginated text view. Scroll to move between pages and sections. The header shows a live clock and the date.
6. **Midnight rollover** — A background timer checks every minute; when UTC flips to a new day, the artifact refreshes automatically.

---

## Tech Stack

| Layer        | Tech                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- |
| Language     | TypeScript                                                                            |
| Build tool   | Vite                                                                                  |
| Phone UI     | React + `even-toolkit`                                                                |
| Glasses HUD  | `@evenrealities/even_hub_sdk`                                                         |
| Backend      | Cloudflare Worker (Hono)                                                              |
| Storage      | Cloudflare KV + D1                                                                    |
| AI pipeline  | OpenRouter (scoring + writing)                                                        |
| Data sources | Wikimedia Events API, Wikipedia, Wikimedia Commons, Library of Congress, Open Library |

---

## Getting Started

```bash
cd apps/this-day
npm install

# Start everything: Vite dev server, QR code, and local Worker
npm run dev

# Start the Cloudflare Worker only
npm run server

# Run tests
npm test

# Build and package for distribution
npm run pack
```

### Dev commands breakdown

| Command               | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `npm run dev`         | Concurrently runs `qr`, Vite (`:5173`), and the Worker (`:3001`) |
| `npm run qr`          | Generates a QR code to scan with the Even App on your iPhone     |
| `npm run server`      | Runs the Hono Worker locally via Wrangler                        |
| `npm run backfill`    | Generates and optionally uploads all `MM-DD` artifacts           |
| `npm run reset:today` | Clears today's cache and regenerates the artifact (local only)   |
| `npm run pack`        | Builds the app and produces `this-day.ehpk`                      |

### Worker secrets (local dev)

Create `.dev.vars` in the app root:

```
OPENROUTER_API_KEY=your_key_here
```

For deployment, bind `THIS_DAY_KV` to a real KV namespace and update `wrangler.toml` with your D1 database ID.

---

## Why it exists

Smart glasses are perfect for micro-moments of learning — but most content is either too long or too shallow. **This Day** solves that by delivering a single, high-signal historical story every day, formatted specifically for the G2's constraints. You don't need to doom-scroll; you just put on your glasses and read one addictive moment. The streaks and progress turn curiosity into a daily ritual, while the dual UI means you get a beautiful archive on your phone and a lightweight, paginated reader on your glasses.

It's history as a habit, not a homework assignment.

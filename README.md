# 🏟️ Sports-Hub

Your personal multi-sport command center — **NFL (Go Birds 🦅), NBA, MLB, and Soccer/FIFA** in one web app, powered by [API-Sports](https://api-sports.io).

It combines four things in one place:

- **Home dashboard** — your featured team (the Eagles) front and center, plus today's games across every sport (your favorites bubble to the top).
- **Scores** — browse any sport's slate for any date.
- **Standings** — division/conference tables for each sport, with your teams highlighted.
- **Predictions** — pick winners of upcoming games and get graded automatically once they finish (saved in your browser).

## Why a backend?

The API-Sports free plan allows roughly **100 requests/day per sport**. To make that go a long way, this app puts a small **Node/Express caching proxy** between the browser and API-Sports:

- Your API key lives on the server only — it never reaches the browser.
- Every response is cached (configurable TTL), so repeated views don't burn requests.
- One API-Sports key works for **all** sports.

## Quick start

```bash
npm install
npm start
```

Open **http://localhost:3000**. It runs immediately in **DEMO mode** with bundled sample data so you can see the whole app right away.

## Going live with real data

1. Get a free key at [dashboard.api-sports.io](https://dashboard.api-sports.io).
2. Copy the env template and add your key:
   ```bash
   cp .env.example .env
   # edit .env -> API_SPORTS_KEY=your_key_here
   ```
3. Restart (`npm start`). The badge in the header flips from **DEMO** to **LIVE**.

## Customizing

- **Favorite teams & leagues:** `config/teams.js` (team IDs resolve by name automatically).
- **Seasons, soccer league, cache TTL:** `.env` (see `.env.example`).

## Project layout

```
server.js          Express server + caching proxy + demo fallback
lib/apiSports.js   API-Sports client + per-sport response normalizers
lib/cache.js       In-memory TTL cache (with stale-on-error fallback)
lib/demoData.js    Bundled sample data for DEMO mode
config/teams.js    Your teams, leagues, and seasons
public/            Frontend (single-page app: HTML/CSS/vanilla JS)
```

## Notes

- **Golf** isn't part of API-Sports, so it's intentionally not included yet. It can be added later from a separate golf/PGA data source.
- Response shapes differ per sport; `lib/apiSports.js` normalizes them into one common shape. If a sport's data looks off once you're live, the normalizers there are the place to adjust.

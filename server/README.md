# Sports-Hub Fantasy Backend

A tiny Python (FastAPI) server that pulls your **real ESPN fantasy leagues**
(football + baseball) via the [`espn-api`](https://github.com/cwendt94/espn-api)
library and hands them to the Sports-Hub frontend as JSON.

This is the "backend half" the static app never had. It's the only way to sync
your actual league (private leagues need your ESPN cookies, which a browser-only
app can't safely hold).

---

## The 3 things only you can do

Everything else is already built. These need *your* ESPN account, so they can't
be automated:

### 1. Get your league ID(s)
Open your league on ESPN. The URL looks like:

```
https://fantasy.espn.com/football/league?leagueId=1234567
```

That number after `leagueId=` is it. Grab one for football, one for baseball.

### 2. Get your ESPN cookies (private leagues only)
If your league is public, skip this. Otherwise, on a desktop browser logged into
ESPN:

1. Go to your ESPN fantasy page.
2. Open DevTools (**F12** or right-click → Inspect) → **Application** tab →
   **Cookies** → `https://fantasy.espn.com`.
3. Copy the **`espn_s2`** value (long string) and the **`SWID`** value
   (looks like `{XXXXXXXX-XXXX-...}`, keep the curly braces).

### 3. Deploy on Railway (one time)
1. Go to [railway.app](https://railway.app) → sign in with GitHub.
2. **New Project → Deploy from GitHub repo →** pick `sports-hub`.
3. Set **Root Directory** to `server`.
4. Open **Variables** and paste in the values from `.env.example`
   (league IDs, cookies, years).
5. Railway gives you a public URL like `https://sports-hub-production.up.railway.app`.
   That's your API. Send it to me and I'll point the frontend at it.

---

## Run it locally (optional)

```bash
cd server
pip install -r requirements.txt
cp .env.example .env        # fill in your values
set -a; source .env; set +a
uvicorn main:app --reload
# open http://localhost:8000/api/health
```

## Endpoints

| Route | What it returns |
|---|---|
| `GET /api/health` | Liveness + which sports are configured |
| `GET /api/fantasy/{sport}/roster` | Your team's real roster |
| `GET /api/fantasy/{sport}/matchup` | This week's head-to-head score |
| `GET /api/fantasy/{sport}/standings` | League standings |
| `GET /api/fantasy/{sport}/opponent` | This week's opponent + their roster |
| `GET /api/fantasy/{sport}/freeagents` | Top available players (waivers/FA) |
| `GET /api/fantasy/{sport}/catranks` | Per-team season category totals + league rank (powers the opponent comparison) |
| `GET /api/fantasy/{sport}/playoffs` | Monte-Carlo playoff odds (`?slots=6&sims=10000`) from season category strength |
| `GET /api/draft/prospects` | Real NFL draft class as a ranked prospect board (`?year=2025&limit=260`) for the Labs mock-draft sim. Pulled from ESPN's public core API server-side (the browser can't read it directly) and cached for `DRAFT_TTL_SECONDS` (default 24h). Uses only the Python stdlib — no extra dependency. |
| `GET /api/refresh` | Clear the cache, re-pull from ESPN |

`{sport}` is `football` or `baseball`.

League data is cached in memory for `LEAGUE_TTL_SECONDS` (default 300s / 5 min)
so repeated calls don't hammer ESPN; the cache also auto-expires when that window
passes, and `/api/refresh` clears it immediately. Set `LEAGUE_TTL_SECONDS=0` to
disable caching.

## Security notes

- Cookies/league IDs live **only** in the host's environment variables — never
  in the repo. `.env` is gitignored.
- CORS is locked to your frontend origin(s) via `ALLOW_ORIGINS`.
- The server only ever **reads** your league. It can't change your lineup.

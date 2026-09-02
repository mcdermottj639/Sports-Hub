# Deploy the backend on Render (free tier)

The Railway trial expired, so the same FastAPI backend now targets **Render's
free plan**. Render runs the identical code (`server/main.py`) — the only real
tradeoff is a **cold start**: after ~15 min idle the service sleeps, and the
next request takes ~30–60s to wake before it answers. The app waits for that
(45s request timeout) and shows a **"Wake backend & retry"** button if it can't.

## One-time setup (≈5 minutes)

1. **Create the service.** Go to [dashboard.render.com](https://dashboard.render.com)
   → **New +** → **Blueprint** → connect this GitHub repo (`mcdermottj639/Sports-Hub`).
   Render finds `render.yaml` at the repo root and proposes a web service named
   **`sports-hub-fantasy-api`** (root dir `server`, Python, free plan). Click
   **Apply**.

2. **Enter the two secrets** when Render prompts (they're marked `sync:false`, so
   they're never stored in the repo):
   - `ESPN_S2` — your ESPN `espn_s2` cookie
   - `SWID` — your ESPN `SWID` cookie (include the `{ }` braces)

   The league values (`BASEBALL_LEAGUE_ID=42353353`, `BASEBALL_YEAR=2026`,
   `BASEBALL_TEAM_ID=2`, `ALLOW_ORIGINS`) are already in `render.yaml` — no need
   to type them. (When your NFL league is set, uncomment the `FOOTBALL_*` block.)

3. **Grab the URL.** After it builds, Render shows the service URL. If it's
   exactly **`https://sports-hub-fantasy-api.onrender.com`**, the app already
   points there — you're done. If Render gave a different URL (the name was
   taken), either:
   - tell me the URL and I'll update one line in `app.js`, **or**
   - in the app, open the browser console and run
     `localStorage.setItem('sportshub:api','https://YOUR-URL.onrender.com')`
     (the app reads this override before its built-in default).

## Adding your football league (after the draft)

The backend already knows how to serve football — it just needs to be told
which league is yours. **Nothing in the app has to change.** Three env vars,
read from your ESPN league URL:

    https://fantasy.espn.com/football/team?leagueId=1234567&teamId=10
                                                    ^^^^^^^         ^^

| Var | Value |
|---|---|
| `FOOTBALL_LEAGUE_ID` | the `leagueId=` number |
| `FOOTBALL_TEAM_ID` | the `teamId=` number — **your** team |
| `FOOTBALL_YEAR` | `2026` |

**On a service that's already live**, do it in the dashboard (a `render.yaml`
edit only re-prompts on a fresh Blueprint apply): Render → the
`sports-hub-fantasy-api` service → **Environment** → **Add Environment
Variable** ×3 → **Save**. That triggers a redeploy; wait for it to finish.

⚠️ **Set `FOOTBALL_YEAR` even though it looks optional.** `main.py` falls back
to `2025`, so a league id with no year quietly serves last season's league —
which looks like a working app with the wrong roster.

⚠️ **`FOOTBALL_TEAM_ID` is not optional either, in practice.** Without it
`my_team()` falls back to the *first* team in the league, so the app would
happily show someone else's roster as yours.

Then: `https://sports-hub-fantasy-api.onrender.com/api/health` should report
`"configured": {"football": true, ...}`, and **Fantasy → Football** in the app
flips from the draft-prep view to the live league view (matchup, standings,
roster, waivers). The prep tools stay reachable via the
**"🏈 Draft board & prep tools →"** link.

## Verify

- Open `https://<your-url>/api/health` — it should return JSON with
  `"version": "b8-fflranks"` and a `configured` block showing `baseball`.
  (First hit after idle is slow — that's the cold start.)
- In the app: **Fantasy → Baseball** → the live matchup/waivers/standings load;
  the **Draft Board's ⚡ Auto-fill** now pulls real ESPN ADP instead of the
  built-in board.

## Getting your ESPN cookies (if they've expired)

Log into `fantasy.espn.com` in a desktop browser → DevTools → Application →
Cookies → copy `espn_s2` and `SWID`. Paste into Render → the service's
**Environment** tab → save (triggers a redeploy). Cookies lapse every few
months; if the league stops loading later, that's the first thing to refresh.

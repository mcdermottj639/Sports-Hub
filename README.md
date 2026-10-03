# 🏟️ Sports-Hub

A personal sports decision workspace for **NFL, college football (Top 25), NBA, MLB and fantasy**. Use it alongside your favorite score and news apps: inspect saved forecasts, test ideas, plan roster moves, and keep a shortlist of games with your own notes. The frontend is plain HTML/CSS/JavaScript on GitHub Pages; existing services supply private fantasy sync and automatic model history.

**Live:** https://mcdermottj639.github.io/Sports-Hub/

## Features

- **Today** — your daily brief: what needs attention, upcoming games, saved forecasts, official model results and a compact game radar with TV and saved-market coverage.
- **Find anything** — search destinations, games and personal notes with the header button, Cmd/Ctrl+K or /. Direct URLs support reloads and Back/Forward, including model scopes and fantasy sections.
- **Watchlist** — bookmark games and keep personal notes, with undo for removal. Notes remain on this browser; they do not log bets or change predictions.
- **Research** — clear paths for situational betting systems and experimental model challengers. NFL and CFB studies retain their own data and results.
- **Fantasy HQ** — real league matchup, lineup, roster needs, waivers and trade leads. Search can open the waiver/trade plan, lineup or season analysis directly.
- **Navigation** — desktop sidebar and a five-button phone dock: Today, Models, Research, Fantasy, More. More groups every destination by purpose. The optional score rail is available from the header.
- **🏈 NFL** — the weekly slate, a betting board (line + model price + where the money is), league headlines, a power board and the playoff picture.
- **📊 Game Report** — tap any game: the book's line against the model's price, line movement, DraftKings bets-vs-dollars splits, and **🔪 Sharp Action** — how many times the line has moved toward each side, plus how the books disagree with each other. Honestly labelled: it counts what the app actually saw, not a paid steam feed.
- **🎓 CFB** — college football, **Top 25 only**: the ranked slate, the poll with weekly movement, the projected playoff field, a betting board and league news. A game appears anywhere in the app only when a ranked team is playing in it.
- **Live NFL football model** — the former play-level challenger now drives official winner, spread and total forecasts. It measures QB ability, opponent-adjusted passing/rushing, protection and pace. Open a game comparison for personnel/weather context and conditional QB scenarios. Dated scouting notes and separate prospective validation live in Board details. Promoted by owner choice in v276; a new official record starts with nfl-football-v1. The previous v239 model remains the comparison benchmark; statistical improvement is not yet established.
- **Models** — forecasts, official results, calibration and methodology. Winner, spread and total stay separate. Official performance uses scheduled cloud capture and saved quotes; missing-price coverage is explicit. Local older records remain available separately.
- **🧪 Labs** — standalone experiments: an NFL mock draft simulator, a sports trivia lab, a fantasy mock draft, and a **Workout Lab** (a 3-day training split with guided sessions, rest timers and load tracking).

## How it works

Live public sports data comes from **ESPN**, fetched directly in the browser. The NFL engine also uses scheduled public **nflverse** play-by-play aggregates; see [the football engine](docs/NFL_FOOTBALL_ENGINE.md). Private fantasy league sync uses the existing Render service; durable model and research history uses the existing Supabase collection services. No frontend build step is needed. Collection continues while the app is closed.

## Make it yours

Edit the `LEAGUES` block at the top of [`app.js`](app.js) to add a league or change the `espnPath`. Change the `fav` arrays to highlight your teams anywhere they appear.

## Run locally

It's plain HTML/CSS/JS — open `index.html`, or serve the folder:

```bash
python3 -m http.server 8080   # then visit http://localhost:8080
```

## Deploy (one-time GitHub Pages setup)

In the repo: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**, pick the branch and the `/ (root)` folder, then **Save**. After about a minute the site is live at the URL above, and it re-publishes automatically on every push to that branch.

## Notes

- **News & scores** retains headlines, the team snapshot and the seasonal PGA leaderboard.
- Run regression checks with `node --test tests/*.test.js`. New desk utilities have focused coverage in `tests/desk-core.test.js`.
- Model math, kickoff locks, collection jobs, existing pool picks and external league URLs are preserved by the v272 redesign.

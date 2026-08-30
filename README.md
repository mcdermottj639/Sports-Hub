# 🏟️ Sports-Hub

A personal multi-sport hub — **NFL (Go Birds 🦅), college football (Top 25), NBA, and MLB** — with live scores, standings, and a prediction game. **Runs entirely in the browser**, just like a static site: no server, no login, no API key.

**Live:** https://mcdermottj639.github.io/Sports-Hub/

## Features

- **Live rail** — every game today, pinned above the header on every tab. Live games lead and carry that sport's own gamecast (bases, count and outs; field position with down &amp; distance; period and clock), then what's coming up, then finals. Little league bubbles under it filter which sports show.
- **Home** — the Eagles up top, then **🎲 The Board**: where the model disagrees with the book across every in-season sport — moneyline, spread and totals — with its own record printed on it.
- **🏈 NFL** — the weekly slate, a betting board (line + model price + where the money is), league headlines, a power board and the playoff picture.
- **🎓 CFB** — college football, **Top 25 only**: the ranked slate, the poll with weekly movement, the projected playoff field, a betting board and league news. A game appears anywhere in the app only when a ranked team is playing in it.
- **🤖 AI Picks** — the model's full read as a conviction ladder (best bets → edges → leans → spread → totals → the games it passes on), plus backtesting: calibration, record by tier, and moneyline / spread / totals kept apart per sport. Picks grade themselves once games go final and save in your browser.
- **🧪 Labs** — standalone experiments: an NFL mock draft simulator, a sports trivia lab, a fantasy mock draft, and a **Workout Lab** (a 3-day training split with guided sessions, rest timers and load tracking).

## How it works

Live data comes from **ESPN's free public sports feed**, fetched directly in the browser. That feed allows browser requests, so there's nothing to host or configure — the page just works wherever it's opened.

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

- **Golf** isn't included yet (ESPN has golf, but leaderboard data is shaped differently) — easy to add later.

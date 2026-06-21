# 🏟️ Sports-Hub

A personal multi-sport hub — **NFL (Go Birds 🦅), NBA, MLB, and Soccer** — with live scores, standings, and a prediction game. **Runs entirely in the browser**, just like a static site: no server, no login, no API key.

**Live:** https://mcdermottj639.github.io/Sports-Hub/

## Features

- **Home** — the Eagles up top (record + today's game), plus today's games across every sport (your favorites float to the top).
- **Scores** — browse any sport's slate for any date.
- **Standings** — division/conference tables, your teams highlighted.
- **Predictions** — pick winners of upcoming games; they grade automatically once final. Picks save in your browser.

## How it works

Live data comes from **ESPN's free public sports feed**, fetched directly in the browser. That feed allows browser requests, so there's nothing to host or configure — the page just works wherever it's opened.

## Make it yours

Edit the `LEAGUES` block at the top of [`app.js`](app.js):

```js
soccer: { ..., espnPath: 'soccer/eng.1' }  // eng.1 = Premier League
// usa.1 = MLS · esp.1 = La Liga · uefa.champions = UCL · fifa.world = World Cup
```

Change the `fav` arrays to highlight your teams anywhere they appear.

## Run locally

It's plain HTML/CSS/JS — open `index.html`, or serve the folder:

```bash
python3 -m http.server 8080   # then visit http://localhost:8080
```

## Deploy (one-time GitHub Pages setup)

In the repo: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**, pick the branch and the `/ (root)` folder, then **Save**. After about a minute the site is live at the URL above, and it re-publishes automatically on every push to that branch.

## Notes

- **Golf** isn't included yet (ESPN has golf, but leaderboard data is shaped differently) — easy to add later.

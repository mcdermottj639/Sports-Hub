# CLAUDE.md — Sports-Hub

Guidance for Claude (and humans) working on this repo. Read this first.

> ## ⚠️ Standing rule: keep this file current
> Whenever you change the architecture, build/deploy pipeline, data model, or
> add/remove a feature, **update the relevant section of this file in the SAME
> change** (same commit). Future sessions rely on this file being accurate —
> don't wait to be asked. When you bump `APP_VERSION`, also update the
> "Current version" line below if it's drifted.

## What this is

**Sports-Hub** is a personal, multi-sport web app for the owner (a Philadelphia
Eagles superfan; also follows Red Sox, NFL, MLB, NBA, FIFA World Cup soccer, and
golf). It's a **pure static browser app** — HTML/CSS/vanilla JS, no build step,
no framework, no backend, no API keys. It ships from this repo via **GitHub
Pages** and runs entirely in the user's browser.

Live URL: **https://mcdermottj639.github.io/Sports-Hub/**

> ### Optional backend (`server/`) — LIVE, powers the Fantasy tab
> The owner evolved past pure-static for ONE capability: syncing their **real
> ESPN fantasy leagues**, which is impossible client-side (private-league
> endpoints are CORS- and cookie-gated). `server/` is a small **Python FastAPI**
> service wrapping the `cwendt94/espn-api` library, deployed on **Railway** free
> tier at **`https://sports-hub-production.up.railway.app`** (set in `app.js` as
> `FANTASY_API`). Config (league IDs, ESPN `espn_s2`/`SWID` cookies, team id) lives
> ONLY in Railway env vars — never in the repo; see `server/.env.example` +
> `server/README.md`. Endpoints: `/api/health`, `/api/fantasy/{sport}/roster`,
> `/api/fantasy/{sport}/matchup`, `/api/fantasy/{sport}/standings`, `/api/refresh`.
> **Baseball is live** (league `42353353`, team "Duran Duran" id `2`); football is
> coded but not yet configured (no league id set). The Fantasy tab calls the API
> once per session (`syncFromLeague`), overwrites the saved roster with the real
> one, shows a team/record/matchup header (`#fantasy-league`, `renderLeagueHeader`)
> with a **🔄 Refresh from ESPN** button + "synced Xm ago" timestamp,
> then runs the existing stat pipeline. **Freshness/caching:** it is NOT real-time —
> two cache layers sit in front of ESPN. (a) The backend caches each League object
> for `LEAGUE_TTL_SECONDS` (default 300s, env-tunable; `_build_league` time-bucketed
> `lru_cache`) and auto-expires after that, plus `/api/refresh` clears it on demand.
> (b) The frontend syncs once per session; the Refresh button sets `fanState.forceSync`,
> which calls `/api/refresh` and cache-busts `fetchJSON` to force a true re-pull.
> If the backend is unreachable it falls back
> to the locally-saved/manual roster, so the app never looks broken. The constraints
> below still govern the **frontend**; the backend is the deliberate, scoped
> exception. Cookies expire periodically — if the league stops loading, re-grab
> `espn_s2`/`SWID` and update the Railway vars.

## Hard constraints (do not break these)

- **No backend, no API keys, no build step.** Everything must run client-side
  from static files. This is deliberate — it's how the owner's other apps deploy.
- **Deploys from the `main` branch** via GitHub Pages (root). The owner has
  explicitly authorized pushing to `main`. Also keep the feature branch
  `claude/sports-app-ideas-130q0f` in sync (fast-forward it to main and push both).
- **⚠️ Standing rule — SHIP TO LIVE BY DEFAULT.** When a change is complete and
  syntax-checks pass, push it straight to `main` so it goes live on the app — do
  NOT stop at a feature branch and do NOT ask first. The owner wants to see every
  finished change on their phone without having to request a deploy. If you did
  your work on a session/feature branch, fast-forward `main` to it and push `main`
  (and sync `claude/sports-app-ideas-130q0f`) as the final step of the task. Only
  hold back from `main` if the owner explicitly says not to ship, or the change is
  knowingly broken/incomplete.
- **Data source = ESPN's free public feeds only.** ESPN endpoints send permissive
  CORS headers, so the browser can read them directly. Most other sources
  (API-Sports, X/Twitter, Reddit) **block browser CORS** and are NOT usable here —
  see "Things we tried that don't work."
- **No model identifier** (e.g. the exact model name/ID) in commits, code, PRs, or
  any pushed artifact. Chat only.
- Don't create PRs unless explicitly asked.

## Files

- `index.html` — single page, all tabs/sections. Asset URLs carry `?v=N` cache-busting.
- `app.js` (~2100 lines) — all logic. Top of file has `APP_VERSION`, `LEAGUES`, `EAGLES` config.
- `styles.css` — all styling. Dark theme; CSS vars at top (`--accent` #3ad29f green, `--gold`, `--eagles-green` #004C54, etc.).
- `sw.js` — service worker (network-first auto-update; see below).
- `manifest.webmanifest` — PWA manifest. Icons are real eagle emoji extracted from NotoColorEmoji (one-off via `/tmp/make-icon.js`, not in repo).
- `scriptable/` — optional iOS Home Screen widgets ([Scriptable](https://scriptable.app), JS).
  **Companion scripts, NOT part of the web app** — they don't deploy with Pages and
  don't affect `APP_VERSION`. `SportsHubFantasy.js` renders the fantasy matchup
  (verdict + category scores) by calling the Railway backend directly (native HTTP,
  so no CORS limit; no secrets on the phone). See `scriptable/README.md`. Editing
  these does NOT require the versioning ritual below.

## Release / versioning ritual (do this on EVERY change)

1. Bump `APP_VERSION` in `app.js` (e.g. `v60` → `v61`).
2. Bump the matching `?v=N` on BOTH `styles.css` and `app.js` in `index.html`.
3. `node --check app.js` (and `sw.js` if touched) — there is no test suite; syntax check is the gate.
4. Commit, `git push -u origin main`, then fast-forward + push `claude/sports-app-ideas-130q0f`.
5. The version shows in a header badge so the user can confirm what they're running.

Commit message footer (always):
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016mJ14XQi9xzznM5kmhshq1
```

Current version as of this writing: **v72**.

## Testing reality

- The sandbox **cannot reach ESPN** (network blocked / not in allowlist), and
  `WebFetch` is 403'd. So you **cannot test live data from here** — code
  defensively with graceful fallbacks, and have the user verify via screenshots.
  Several data-shape assumptions (e.g. standings hierarchy) were tuned from the
  user's screenshots, not from live calls.

## Architecture notes

- **ESPN endpoints used** (`SITE = site.api.espn.com/apis/site/v2/sports`,
  `CORE = site.api.espn.com/apis/v2/sports`, plus core stat hosts
  `sports.core.api.espn.com/...` aliased `FBCORE` (football) / `BBCORE` (baseball)):
  `/{path}/scoreboard`, `/summary?event=`, `/teams`, `/{id}/roster`,
  `/{id}/schedule`, `/news`, `/standings?level=3`, athlete gamelogs, team
  statistics/leaders/depthcharts.
  Sport paths: `football/nfl`, `baseball/mlb`, `basketball/nba`,
  `soccer/fifa.world`, `golf/pga`.
- `fetchJSON(url, ttl)` — in-memory cache by URL with TTL; 9s abort. All data goes through it.
- `LEAGUES` — per-sport config (label, emoji, espnPath, `fav` favorite teams, type).
  **Favorites are Eagles + Red Sox only** (NOT Phillies/Sixers).
- Tabs: Home, Eagles, Scores, Standings, AI Picks, Fantasy, About. `showTab()` +
  `renderers{}` map drive rendering.
- **`sportsDate()`** — "today" doesn't roll to the next day until **4 AM ET**, so
  late/live games stay on the current slate overnight. Use this (not `new Date()`)
  for default game dates.
- UX rules the owner cares about: scannable views with **tap-to-expand**
  accordions (`makeAccordion`); jump-nav chip rows that **wrap** (all visible, no
  horizontal scroll); compact rows; `–` for not-yet-played scores.
- **Live/Demo mode badge** — the header badge (`#mode-badge`, set by `setMode`)
  reads **LIVE** when ESPN fetches succeed and **DEMO** when they all fail, in
  which case the app renders the hardcoded `DEMO` fixtures so it never looks
  broken offline. `setMode(true)` is called from `renderHome` once any feed loads.

## Features built (high level)

- **Home** — Top Headlines (numbered 1-2-3 story strip from in-season leagues'
  lead stories, tap → in-app summary popup), My Teams featured card, Today's Games
  grouped by league (jump-nav chips), each league's slate sorted live → finished →
  unstarted; leagues with a live game get a 🔴 flag on their chip/heading. (The old
  cross-league "Live" section was removed in v68 in favor of in-league sorting.)
- **Eagles tab** — hero, Next Opponent, Latest News (tap → summary), Team Stats &
  rankings, Schedule (2026-27), Depth Chart (Offense/Defense/ST, **Field formation
  view** + List), Player Leaders, By the Numbers, Coaching Staff. Section order and
  jump-nav defined in `renderEagles`.
- **Scores** — per-sport slate; cards show kickoff time (`scheduledLabel` falls
  back to game time when ESPN returns a generic "Scheduled"); tap → detail modal.
  Cards get a **⚡ Model edge** badge when the model disagrees with the betting line.
- **Standings** — grouped by league → division (`?level=3`), GB column, plus a
  per-league **Wild Card** table (MLB/NFL) with a dashed playoff cutoff line.
- **AI Picks** — a multi-factor logistic model (`predictGame`): record, scoring
  margin, recent form, home/road split, rest, plus matchup factors (MLB starter
  ERA/WHIP, team OPS). **Shows ONLY edge games** (model vs. line) since the full
  slate is on Scores. Stat bar tracks **all-time model record** and **vs-the-line
  record**; below the edges are **Team Trends** and **Player Prop trends**.
  Records persist + auto-grade: see "AI record" below.
- **Game detail modal** (`renderGameDetail`) — score, **🔴 Live Situation** panel
  (MLB bases diamond + count/outs/pitcher/batter; NFL field-position bar w/ red
  zone; soccer possession + shots; others last play), AI pick + factor breakdown,
  betting odds (open by default) with model-vs-market compare, line score, top
  performers, team stats.
- **Fantasy** — roster saved in localStorage; season stats + hot/cold recent-form
  trends (hitters by OPS over last ~20 days; pitchers by ERA/WHIP over last 5
  outings), grouped Hitters/Pitchers, top-3 hitters, projected starters. MLB teams
  auto-detected across all 30 rosters (`autoResolveTeams`, cached in localStorage).
  Live ESPN-league sections (baseball; see optional backend above): league header,
  category matchup scoreboard, standings/power table, opponent scouting. Added v71:
  - **Weekly category projection** (`renderProjection`, `#fantasy-projection`) —
    verdict (Leading/Trailing/Tied) + the CLOSE categories still in play to
    🎯 Target (flip) or 🛡 Defend, derived client-side from the matchup totals.
  - **Today's Lineup Check** (`renderStartSit`) — start/sit now factors whether a
    player actually has a game today (`ss[].today`), not just hot/cold.
  - **Category Strengths** (`renderCatStrength`, `#fantasy-strength`) — a roster
    profile counting strong contributors per scoring category (HR/RBI/OPS/ERA/
    WHIP/K/W). Heuristic, NOT league-relative (labeled as such).
  - **Suggested Moves** (`renderAddDrop`, `#fantasy-adddrop`) — surfaces the hottest
    free agents (`fanState.faHot`, set in `renderWaivers`) and pairs each with a
    same-type roster player to drop: a cold/drop-watch player (`fanState.dropCandidates`)
    first, else the weakest droppable spot from the broader pool (`fanState.dropPool`,
    both set in `fillSeasonStats`, weakest-first). If there are hot pickups but no
    clearly droppable player, the add still shows with a "🆓 OPEN — open a roster spot"
    note instead of a bare/empty heading. The section hides only when there are no hot
    pickups at all. Whichever async half finishes last renders the suggestions.
  - **Waiver-run timing** — waivers process **Wed & Sun 11 PM ET**
    (`nextWaiverRun`/`nextWaiverRunLabel`); shown on the waiver wire + add/drop
    notes so pickups are framed to when they'd actually clear (no daily streaming).
  - **Live-day auto-refresh** (`scheduleLiveRefresh`) — while any roster game is
    live AND the Fantasy tab is open, force-resyncs every 5 min (matches backend
    cache TTL); cleared/re-armed each render, stops when idle or tab inactive.
  - **Football chip hidden until configured** — the 🏈 chip only renders when the
    backend reports a football league (`cfg.football`), so the tab never shows a
    hollow football view out of season.
- **World Cup neutral sites** — soccer games get **no home-field edge** in the
  model except host nations (USA/Mexico/Canada via `isWorldCupHost`); neutral games
  read "vs" not "@" in the modal.
- **AI record persistence** — every pick is stashed in `localStorage`
  (`sportshub:pending`) and **auto-graded** against final results on app load
  (`gradePending`), so the all-time + vs-line tallies (`sportshub:aitally`) keep
  building even if the AI Picks tab wasn't open when games ended. Stale (>14d) purged.
- **Auto-update** — `sw.js` is a network-first service worker that fetches app
  files with `cache:'no-store'`, so launches pull the newest deploy (with an
  offline cache fallback). Registered at the end of `app.js`. This replaced the
  manual `?v=` cache-busting dance. ESPN requests bypass the worker (cross-origin).
  The offline cache is **versioned** (`CACHE = 'sportshub-vN'`) and the `activate`
  handler purges any older `sportshub-*` caches — bump it alongside `APP_VERSION`.
- **HTML escaping** — names/headlines/descriptions from ESPN or the fantasy league
  are run through `esc()` before being interpolated into `innerHTML`, so a stray
  `&`/`<`/`'` in a name can't break markup or inject HTML. Use `esc()` for any new
  external-data interpolation.
- **Accessibility** — the tab bar is a real ARIA tablist (`role="tablist"`/`tab`/
  `tabpanel`, `aria-selected` toggled in `showTab`); interactive controls meet the
  44px touch-target floor; keyboard focus shows a `:focus-visible` ring.

## localStorage keys

- `sportshub:aitally` — graded pick results (all-time + vs-line record).
- `sportshub:pending` — ungraded picks awaiting results.
- `sportshub:mlbidx` — cached MLB player→team index for fantasy auto-detect.
- `sportshub:fantasy:{sport}` — the saved fantasy roster, one per sport
  (`fanKey(sport)`, e.g. `sportshub:fantasy:baseball`).
- Note: localStorage is **per browser/device** — the home-screen PWA and Safari
  keep separate tallies/rosters.

## Things we tried that DON'T work (don't re-attempt without a backend)

- **API-Sports** — blocks browser CORS. (Why we use ESPN at all.)
- **X / Twitter embeds** — widgets hang/throttle, especially in PWAs; removed.
- **Reddit "Buzz" feeds** — Reddit sends no CORS header; even free CORS proxies
  (allorigins, corsproxy.io) didn't pull through reliably. Removed in v60.
- General rule: **social/highlight feeds need a server.** Not viable in this
  no-backend app. ESPN is the one source that allows direct browser reads.

## GitHub Pages gotcha

- Pages must be enabled manually (Settings → Pages → Deploy from branch → `main`
  / root). A bot cannot enable it. If links 404, that's the first thing to check.

## Style of work the owner expects

- Be honest about platform limits (CORS, paid APIs, caching) instead of shipping
  something flaky. When something can't work client-side, say so and offer the
  real options (incl. "do nothing").
- Ship small, verifiable increments; bump the version each time so the owner can
  confirm. They verify on iPhone (Safari + home-screen PWA) and a desktop app.

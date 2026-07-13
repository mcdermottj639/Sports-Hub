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
> `FANTASY_API`). ⚠️ **Railway deploy gotcha:** Railway auto-deploys the
> **"Branch connected to production"** set in the service's Settings → Source —
> this MUST be **`main`** (root directory `server`). It was once mis-set to an old
> `claude/*` feature branch, so pushes to `main` silently never deployed and new
> endpoints 404'd while old ones kept serving. After any backend change, confirm
> the live build via `GET /api/health` → `version` (`SERVER_VERSION` in
> `main.py`, bump it on backend changes). Config (league IDs, ESPN
> `espn_s2`/`SWID` cookies, team id) lives
> ONLY in Railway env vars — never in the repo; see `server/.env.example` +
> `server/README.md`. Endpoints: `/api/health`, `/api/fantasy/{sport}/roster`,
> `/api/fantasy/{sport}/matchup`, `/api/fantasy/{sport}/standings`,
> `/api/fantasy/{sport}/opponent`, `/api/fantasy/{sport}/freeagents`,
> `/api/fantasy/{sport}/catranks` (per-team season category totals + league rank,
> powers the opponent comparison), `/api/fantasy/{sport}/playoffs` (Monte-Carlo
> playoff odds), `/api/draft/prospects?year=&limit=` (real NFL draft class as a
> ranked board **plus that year's real round-1 pick order** for the Labs
> mock-draft sim — pulled from ESPN's core API server-side since the browser
> can't read it; **defaults to `year=2026`**, the most recent draft; cached
> `DRAFT_TTL_SECONDS`/24h, stdlib-only), `/api/betting/{sport}/report`
> (mlb/nfl/nba; powers the v88 **Game Report** view — bundles (a) **DraftKings
> betting splits scraped from VSiN's public page** (`_vsin_splits`, stdlib
> `_TableGrab` HTML-table parser, tries several URLs, cached
> `VSIN_TTL_SECONDS`/10m, self-diagnosing: returns `ok/error/attempts`, add
> `?debug=1` for header rows + per-URL statuses + `forensics` (table row
> counts, sample rows, ajax-URL candidates) — a VSiN redesign shows as
> "unavailable + reason", never wrong numbers. b7 rewrote the parser for the
> LIVE page layout confirmed via debug: **one row per game** with away/home
> stacked inside each cell (line breaks preserved from `<br>/<div>`), 6
> percent cells per row ordered `_SIX_COL` = spread/total/ML × handle/bets,
> decimals rounded, logo/time cells skipped; a legacy two-rows-per-game path
> is kept) and (b) **ESPN line movement** — a daemon thread (`_lines_loop`,
> `LINES_POLL_SECONDS`/15m) snapshots each scoreboard game's ML/spread/O-U on
> change, keyed by ESPN event id, **in-memory only** (resets on redeploy —
> intraday movement is the product, so that's fine). NOTE: ESPN's MLB
> scoreboard sends NO raw moneylines — only the favorite string ("SEA -231")
> + O/U — so snapshots often have `hML/aML: null` and only `details`),
> `/api/refresh` (also clears the VSiN cache).
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
- `styles.css` — all styling. **Dark theme is the default** (base `:root` CSS vars at top:
  `--accent` #3ad29f green, `--gold`, `--eagles-green` #004C54, etc.). A **light theme**
  ("Editorial / Premium" — warm paper `#f7f4ee`, off-white cards, hairline rules, gold
  "kicker" section headings, serif masthead/headlines) lives in a `:root[data-theme="light"]`
  block appended at the END of the file. It re-declares the variables (so most surfaces
  recolor for free) plus targeted overrides for spots that hardcoded dark-only values
  (white hairline borders, dark gradients, dark chips/tracks). **Dark mode is untouched** —
  the light block only applies when `<html data-theme="light">`. Theme is chosen by a
  header toggle (🌙/☀️): an inline `<head>` script sets `data-theme` before first paint
  (saved pref in `sportshub:theme`, else the OS `prefers-color-scheme`); `applyTheme()` in
  `app.js` wires the toggle, syncs the `theme-color` meta, and follows the OS until the user
  picks explicitly. When adding new components, use the CSS vars (esp. `var(--card)`,
  `var(--text)`, `var(--muted)`, `var(--line)`) so they theme automatically.
- `sw.js` — service worker (network-first auto-update; see below).
- `manifest.webmanifest` — PWA manifest. Icons are real eagle emoji extracted from NotoColorEmoji (one-off via `/tmp/make-icon.js`, not in repo).
- `draft.html` / `draft.css` / `draft.js` — **🧪 Labs: NFL Mock Draft Simulator**,
  a standalone page (linked from the About tab's Labs card). Self-contained, no
  backend, no shared code with `app.js` (its own tiny `$`/`el`/`esc` helpers). It's
  a **test ground** for features that may later move into the app. Setup screen
  (pick your team, rounds, order = actual/random/custom) → **war room** (best-available
  board with position filters + search, sim-1 / sim-to-my-pick, pick-for-pick trades
  scored on the Jimmy Johnson value chart, your-picks / draft-log / team-needs side
  panel). The prospect board is a **SAMPLE** big board — a full 7-round class
  (~264 prospects hand-listed in `TOP_PROSPECTS`; `buildBoard` only generates
  filler if that array is ever trimmed below the needed depth) with placeholder
  names — this is the **fallback**. On load it calls the backend
  `/api/draft/prospects` (`DRAFT_YEAR`, default **2026**) and, if reachable,
  **replaces the board with the real draft class AND uses that year's real round-1
  order** (`REAL_ORDER`, from the endpoint's `order`) for "actual" mode. Cached to
  `localStorage` `draftsim:board` (prospects + order) for instant/offline reuse;
  `boardSource` flips `sample`→`real` and the setup note says which is live. Swap
  the bundled fallback by editing `TOP_PROSPECTS`. Draft order: the setup default
  "Actual draft order" uses `REAL_ORDER` when loaded, else the bundled
  **`ACTUAL_2025_R1`** (real 2025 R1 — trades included, NYG & ATL twice, HOU & LAR
  absent); rounds 2–7 (and random/custom modes) use `BASE_ORDER` (2025
  reverse-standings, 32 distinct). Team abbrevs from ESPN are normalized via
  `ABBR_ALIAS`.
  CPU picks = best-available with a positional-needs nudge (`TEAM_NEEDS`). State
  autosaves to `localStorage` (`draftsim:v1`). **Draft Recap (`#recap`,
  `showRecap`/`recapHTML`/`draftGrades`, `.rc-*` CSS):** auto-opens when the
  final pick is made (also via the 📊 button on the completed clock bar). Grades
  the draft — overall letter weighted from **value vs board** (per-pick: how far
  each player fell vs board rank, scaled by pick number via `pickScore01`,
  aggregated weighted by JJ pick capital; 55–70%), **needs filled** (of the
  needs you could hit with your pick count; 25–30%) and **trade value** (net
  Jimmy Johnson chart points from the ledger reconstructed off pick
  owner-vs-origin; 20% when trades exist). Shows per-pick letter grades,
  best-value/biggest-reach callouts, needs checklist, trade ledger, position
  mix, and full round-by-round results in `<details>` accordions, with
  back-to-war-room / new-draft actions. Because
  it's standalone it does NOT participate in the `APP_VERSION`/`?v=` ritual, though
  it links `styles.css` for the base theme (uses `?v=80`; bump if you change shared
  CSS it depends on).
- `trivia.html` / `trivia.css` / `trivia.js` — **🧠 Labs: Sports Trivia Lab**, a
  standalone page (linked from the About tab's Labs card, alongside the draft sim).
  Self-contained, no backend. **NFL-focused** — categories: NFL History, **NFL Draft
  (its own section)**, Super Bowl, Eagles, plus MLB, NBA, College — **no NHL/Olympics**
  (owner's pick). ~90 hand-written MC questions in `Q` (`{q, a, w:[3 wrong], c:category,
  d:difficulty, ex?:fact}`). **Difficulty is intentionally hard/deep-cut** (`d:2`=HARD /
  `d:3`=ELITE, worth 100/150 base) — not casual bar trivia. Centerpiece is a **Daily
  Challenge**: a seeded (date-hash PRNG) set of 10 mixed questions, identical for a
  given day. Also free-play by category (or Mixed). Scoring = base×streak multiplier
  (1.5× at 3, 2× at 5); results screen has a miss-by-miss review.
  Persists to `localStorage`: `trivialab:life` (lifetime played/accuracy/best run),
  `trivialab:best` (per-category best score), `trivialab:daily` (per-date result →
  day-streak). NFL-themed skin (`trivia.css`) over `styles.css` (`?v=81`). Standalone,
  so NOT part of the `APP_VERSION`/`?v=` ritual. Add questions by editing `Q`.
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

Current version as of this writing: **v114**.

- **News summaries** (`summarize`, v110) — the in-app news popup (Home
  headlines, Eagles news, Team Research player modal) uses a real **extractive**
  summary: sentences are scored by term-frequency (across the article) +
  headline overlap, length-normalized with a mild lead boost; the top ~4 are
  taken and **re-ordered to original position** so it reads as prose. Replaced
  the old "first N sentences" (which was just the lede). Client-side only, no LLM.

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
- Tabs: Home, Eagles, **Red Sox**, AI Picks, Fantasy, **Labs**, About. `showTab()` +
  `renderers{}` map drive rendering. (**Labs** — its own top-level tab as of
  v107, holding the Labs experiments: the standalone `draft.html`/`trivia.html`
  links plus the in-app **Fantasy Mock Draft** rendered into `#labs-mock`; its
  renderer is a no-op since the content is static + launched on demand.) (**Scores** and **Standings** tabs were
  removed in v78 — the owner gets those better elsewhere; Home is now the daily
  full-slate overview. In v79 the Home slate was made view-only; **v89 reversed
  that** — cards open the detail modal again, since the modal now leads with
  the Game Report the owner wants one tap away.)
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

- **Home** — the app's front door and full daily overview. Top Headlines
  (numbered story strip, **up to 10** as of v111, from in-season leagues' lead
  stories — leads first, then up to 5 more per league, deduped; tap → in-app
  summary popup — headlines stay tappable; the strip stays a horizontal scroll on
  desktop too via fixed-width `.hl-card`), My Teams featured card, then Today's
  Games grouped by league (jump-nav chips), each league's slate sorted live →
  upcoming → finished (`STATE_ORDER`; changed v93 — finals now sink to the
  bottom); leagues with a live game get a 🔴 flag on their
  chip/heading. **The game cards are TAPPABLE again (v89, reversing v79's
  view-only):** `gameCard(sport, g, {odds:true})` — tap opens the game modal,
  which leads with the 📊 Game Report (see AI Picks v88 note). Cards still show
  the quick-scan info: score/time, the **📺 TV channel** (`tvFor()` reads
  `geoBroadcasts`/`broadcasts` in `normEvent`, stored as `g.tv`), and — v85 —
  the **📊 pregame betting line** (`.game-odds` in `gameCard`, gated on the
  `odds` option + scheduled games only: spread/ML via `normOdds` + O/U; falls
  back to raw moneylines when ESPN sends no `details` string; NOT on the WC
  bracket cards, and AI Picks cards keep their own odds block). The golf card
  stays view-only and shows a compact
  **view-only top-5 leaderboard** inline (no modal). (The old cross-league "Live"
  section was removed in v68; the Scores-tab ⚡ Model-edge badges that briefly
  lived here in v78 were dropped in v79 to keep the slate a clean scan — edges
  still live on the AI Picks tab.) **🏆 World Cup Bracket (v82)** — a knockout
  bracket below Today's Games (`#home-wc`, `renderWCBracket`, `.wc-*` CSS): one
  ranged scoreboard call covers the whole 2026 knockout window (`WC_ROUNDS`,
  Jun 28 – Jul 19 ET), games are bucketed into rounds by ESPN's round note when
  present else by date window (`wcRoundOf`), and rendered as a horizontally
  swipeable column per round (R32 → R16 → QF → SF → 3rd → Final) that
  auto-scrolls to the current round. View-only match cards show score / pens /
  live status (winner via ESPN's `winner` flag, falling back to score then
  shootout), TV for upcoming games, dashed TBD slots for unset matchups, and a
  fav highlight (USA). A 🏆 Bracket chip is appended to the Home jump-nav once
  loaded. Renders only while `LEAGUES.soccer` points at `fifa.world` AND
  knockout fixtures exist — the section hides itself (`#home-wc:empty`) after
  the tournament or if ESPN is unreachable, so nothing needs removing when the
  Cup ends (the dead code can be cleaned up later).
- **Red Sox tab** (⚾, v114) — an MLB deep-dive mirroring the Eagles tab
  (`renderRedSox` + `renderRedSox*` sub-renderers; `REDSOX={teamId:2}`, ESPN MLB
  id for BOS): hero (record/standing/next game, ⚾ watermark via
  `.featured-card.rs-hero::after`), curated jump-nav, Next Game, Latest News
  (tap → in-app summary), Team Stats & Rankings (batting+pitching from `BBCORE`
  statistics, ranked), Schedule & Results (windowed to last ~6 + next ~8 with a
  recent W/L trend), Roster (grouped by the roster's position groups), Team
  Leaders (`BBCORE` leaders), By the Numbers, Manager (Alex Cora, static). Curated
  nav so `injectJumpNav` skips it (like Eagles). Reuses the Eagles CSS
  (`.stat-row`/`.leader-row`/`.sched-row`/`.depth-player`/`.opp-card`). NOTE:
  ESPN not reachable from the sandbox — verified structure/empty-states/no-errors;
  live MLB data verifies on device. The Red Sox are also the MLB `fav`
  (highlighted on the Home slate + AI Picks); this tab is the deep-dive.
- **Eagles tab** — hero, Next Opponent, Latest News (tap → summary), Team Stats &
  rankings, Schedule (2026-27), Depth Chart (Offense/Defense/ST, **Field formation
  view** + List), Player Leaders, By the Numbers, Coaching Staff. Section order and
  jump-nav defined in `renderEagles`.
- **AI Picks** — a multi-factor logistic model (`predictGame`): record, scoring
  margin, recent form, home/road split, rest, plus matchup factors (MLB starter
  ERA/WHIP, team OPS). **Shows ONLY edge games** (model vs. line) since the full
  slate is on Home. Stat bar tracks **all-time model record** and **vs-the-line
  record**; below the edges are **Team Trends** and **Player Prop trends**.
  Records persist + auto-grade: see "AI record" below. **v83 additions:**
  - **Calibration meta** — every pick now stores its confidence, and graded
    tally entries carry `{s: sport, d: date, cf: conf, p: pick, m: matchup}`
    (see localStorage note). Pre-v83 entries only have `{c,e}` and still count
    toward totals; `recordResult` is write-once per game id so re-renders of a
    final can't wipe the meta.
  - **📜 Model Report Card** (`reportCard`/`tallyDetails`, `.ai-report`/`.rep-*`
    CSS) — a tap-to-expand panel under the stat bar: record by confidence
    bucket (50–59/60–69/70+ — shows whether a "75%" pick really wins ~75%),
    record by sport, a this-week line in the header, and the last 15 graded
    picks (✅/❌, ⚡ = against-the-line, matchup, pick + conf, date). Renders
    whenever the tally is non-empty, even on no-game days.
  - **"No lines" ≠ "no edges"** — if ESPN sent no odds for the slate, the
    empty-edges note and the Edges-today tile say "no lines posted yet"
    instead of claiming the model agrees with the book.
  - **Shootout grading fix** — `winnerName` now prefers ESPN's per-competitor
    `winner` flag (captured in `teamObj`) before comparing scores, so World Cup
    knockout picks decided on penalties (level score) grade instead of being
    dropped as ties. Also fixes winner bolding on cards for those games.

  **v84 — edge quality:** edges are now sized against the market, not just
  flagged. `marketHomeProb` de-vigs the two moneylines into an implied home
  win probability; `marketGap(pred, info)` = model's pick-side probability −
  market's (in points; `predictGame` now returns raw `probHome`). When MLs are
  posted, a disagreement only QUALIFIES as an edge at `gap ≥ MIN_EDGE_GAP`
  (5 pts) — coin-flip disagreements against ~-110 lines no longer count (shown
  nowhere, and not counted in the vs-line record). Spread-only odds (no MLs)
  keep the old any-disagreement behavior. Edge cards sort by gap (conf
  tiebreak) and the badge shows "+N vs market" (`.edge-gap`);
  `marketCompare` (card + modal) appends "model X%, market Y%" on
  disagreements. Pending picks store the qualified flag (`eg`) so
  `gradePending` counts the same edges as live grading (old entries fall back
  to fav-comparison). Also: the home/road split factor is damped by sample
  (`min(homeGP, roadGP)/10`, blended with the generic home edge) so a 3-1
  home record doesn't swing early-season picks; `teamProfile` now returns
  `homeGP`/`roadGP`.

  **v86 — totals picks + starter form:**
  - **🎯 Totals Edges** — `predictGame` returns `projTotal` (average of the
    two teams' combined-scoring rates); vs the posted O/U, a gap ≥
    `TOT_EDGE_MIN` (mlb 1.0 / nba 6 / nfl 4 / soccer 0.6) makes a totals
    edge, listed as compact rows under the side edges (sorted by gap, graded
    result shown inline on finals; model total also shows in the game modal).
    Totals picks persist keyed `${gameId}:t` with `t:1` (pending + tally) and
    grade off the combined final score (push → dropped ungraded). They keep
    their OWN record — `tallyStats` returns `tw/tl/tn`, shown in the header
    line ("totals X-Y"), a Totals row in the report card, and 🎯-marked
    entries in Recent picks — so side-pick calibration stays clean.
  - **SP recent form** — `starterForm(athleteId)` aggregates each probable's
    last 3 starts from `athleteGamelog('mlb', …)` (needs 12+ outs, else
    silent); adds a 0.12-weight `SP recent form` factor (half the season-line
    weight) + an `SP form (L3)` note when both starters have samples.
  - NOT done (deliberately): backend record sync — Railway free tier has no
    persistent disk, so a naive sync endpoint would silently lose the record
    on every redeploy/restart; needs a volume or external store first.

  **v88 — 📊 Game Report (Action-Network-style betting view):**
  - Opens from the **Home slate's tappable cards** (v89; a v88-only "Game
    Reports" list on this tab was removed the next day — the owner wants AI
    Picks kept to model tracking + trends). The game modal leads its extra
    sections with the **📊 Game Report** (`gameReportHTML`, `.gr-*` CSS):
    (1) **model vs market table** — the model's fair moneyline per side
    (`fairML` from `probHome`), the book's ML, and a per-side **price grade**
    (`priceGrade`: model prob − de-vigged market prob → A…F, A = book price
    much better than model-fair). v90: the report's odds come from the
    summary's `pickcenter` first (like the odds grid), falling back to the
    scoreboard object — the scoreboard often lacks MLs (always once live),
    which blanked Book/Grade. v91: because ESPN's MLB scoreboard sends no raw
    MLs at all, `normOdds` now extracts the favorite's ML from the details
    string (`dML` + `favHome`; 3+ digit numbers only so NFL/NBA spreads don't
    trigger it) and `marketHomeProb` falls back to it — this re-arms the v84
    edge-gap sizing on MLB and `snapHomeProb` does the same for movement
    snapshots so RLM works with details-only data; (2) model total vs the O/U; (3) **line
    movement** — backend snapshots (real intraday, keyed by ESPN event id)
    with device-local first-seen tracking as fallback (`trackLines` in
    `getGames`, localStorage `sportshub:lines:{date}`, today only, old days
    purged); (4) **💰 Big Money** — DK moneyline splits (bets% vs money%
    bars + diff) matched to the game by team-name fuzzy match (`vsinMatches`,
    handles "LA Angels"/"Red Sox vs White Sox" ambiguity); (5) **🔪 sharp
    signals** — money-vs-tickets divergence (handle − bets ≥ 7) and
    **reverse line movement** (ML implied-prob move ≥ 1.5 pts toward one side
    while ≥55% of bets sit on the other). All of it degrades: backend down →
    model grades + device movement + an honest note; splits source down →
    "unavailable + reason" (surfaced from the backend's diagnostics).
  - What this deliberately is NOT: real-time paid data. Bet%/handle% comes
    from VSiN's free DK page (scrape may break on redesign — check
    `/api/betting/mlb/report?debug=1`); "sharp" is computed RLM/divergence,
    not a proprietary feed.
- **Game detail modal** (`renderGameDetail`) — **section order (v92):**
  **🔴 Live Situation** on top *when the game is live* (MLB bases diamond +
  count/outs/pitcher/batter; NFL field-position bar w/ red zone; soccer
  possession + shots; others last play), then **Betting Odds** (model-vs-market
  compare), then the **📊 Game Report** (passed into `renderGameDetail` as its
  own `report` arg — split out of `extra` so it can be positioned), then **AI
  Pick** + factor breakdown, then the sport extras (starters/hitters/key
  players), line score, top performers, team stats. The owner wanted the two
  betting sections (odds + report) leading for a non-live game, with the live
  panel jumping above them while a game is in progress.
- **Fantasy** — roster saved in localStorage; season stats + hot/cold recent-form
  trends (hitters by OPS over last ~20 days; pitchers by ERA/WHIP over last 5
  outings), grouped Hitters/Pitchers, top-3 hitters, projected starters. MLB teams
  auto-detected across all 30 rosters (`autoResolveTeams`, cached in localStorage).
  Live ESPN-league sections (baseball; see optional backend above): league header,
  category matchup scoreboard, standings/power table, opponent comparison. Added v71:
  - **Weekly category projection** (`renderProjection`, `#fantasy-projection`) —
    verdict (Leading/Trailing/Tied) + the CLOSE categories still in play to
    🎯 Target (flip) or 🛡 Defend, derived client-side from the matchup totals.
    **v87: 📊 win-probability meter** (`matchupWinProb`/`weekProgress`,
    `.pj-prob`/`.pj-meter` CSS) — P(win the week) from current category
    margins vs time left in the Mon–Sun week (ET, hourly): counting cats =
    can the margin survive the remaining volume (variance ≈ volume still to
    come at the week's combined pace); rate cats = does the lead hold as the
    remaining sample shrinks (normalized by `RATE_SD` typical spreads,
    ERA/WHIP reversed); per-cat probs combine via Poisson-binomial DP into
    P(more cats won than lost), exact splits/ties count half. Rendered as a
    colored meter (green ≥55 / gold 45–54 / red <45) with a 50% notch and a
    days-left note, above the Target/Defend chips. Labeled as an estimate —
    it is NOT ESPN's projection and ignores pitcher-start scheduling.
  - **How You Stack Up** (`renderOpponent`, `#fantasy-opponent`) — v76 replaced the
    old opponent-roster scouting list with a **head-to-head SEASON comparison**: my
    team vs this week's opponent in every scored category, with each side's season
    total + league rank (`#rank`) and a green highlight on the categories I'm
    leading, plus a "you N–M" tally. Data comes from the backend `/catranks`
    endpoint (ESPN `mTeam.valuesByStat` season totals + `mSettings.scoringItems`
    for which stats are counted and their direction — reverse cats like ERA/WHIP
    rank low-is-best server-side); fetched in `syncFromLeague` as
    `fanState.league[sport].catranks`. Falls back to a blank section if the
    endpoint is unreachable. **Removed in v76:** the standalone *Hot & Cold* list
    (`#fantasy-recs`) and *Today's Lineup Check* (`renderStartSit`) — the per-player
    ▲/▼ form arrows already live on each roster row and the hot/cold counts remain
    in Snapshot, so the lists were redundant. The hot/cold computation in
    `fillSeasonStats` is kept (it still feeds the roster arrows, Snapshot counts,
    and Suggested Moves drop pool).
  - **Tab layout (v77)** — order is: this-week cluster (league header, matchup
    scoreboard, projection, How You Stack Up), then Snapshot + Roster, then the
    **roster-building tools grouped together** (Category Strengths → Suggested
    Moves → Waiver Wire), then the **League Analyzer block at the bottom**
    (standings/power table → Playoff Predictor). Sections are fixed `#fantasy-*`
    divs in `index.html`; reordering = moving divs (renderers target ids, so JS
    call order doesn't affect layout).
  - **League Analyzer** (`renderFantasyStandings`, `#fantasy-standings`) — the
    standings/power table (renamed from "League" in v77). Sort toggle now has a
    third option **Category** (when `/catranks` is loaded): ranks teams by
    *category power* = Σ over scored cats of `(teamCount − rank + 1)`, i.e. how
    much a team's SEASON totals dominate the league — a roster-strength read that
    record alone misses early. The last column + footnote switch with the sort.
  - **Playoff Predictor** (`renderPlayoffs`, `#fantasy-playoffs`, backend
    `/playoffs`) — Monte-Carlo playoff odds (default `slots=6`, `sims=10000`).
    The backend plays out every remaining (undecided) matchup `sims` times,
    deciding each by the two teams' **season category strength** (`_cat_win_prob`:
    count direction-aware category edges → logistic), then counts how often each
    team finishes in the top `slots`. Returns playoff odds, projected final wins,
    and average seed per team; the frontend renders an odds-bar table with a
    dashed **playoff cut line**, your team highlighted, 🔒 clinched / ❌ eliminated,
    and a "you N% to make it" verdict. Reuses the same `_season_cats` helper as
    `/catranks` (one ESPN `mTeam`+`mSettings` pull). Falls back to a record-based
    model + blank section if category data is unavailable. NOTE: not real ESPN
    tiebreakers — sim seeds by wins with a random tiebreak, which is fine for odds.
  - **Top-of-tab jump-nav** (`injectJumpNav`) — the Fantasy tab's section chip row.
    v76 fix: labels now strip nested controls (so the "League" heading's
    Standings/Power toggle no longer bleeds into the chip text), and the nav is
    **re-built after the async sections render** (Waiver Wire, Category Strengths,
    Suggested Moves finish after the initial one-shot build) by re-invoking
    `injectJumpNav('fantasy')` at the end of `renderAddDrop` — the terminal call in
    every async fantasy flow. Without this, late sections had no working chip.
  - **Category Strengths** (`renderCatStrength`, `#fantasy-strength`) — a roster
    profile counting strong contributors per scoring category (HR/RBI/OPS/ERA/
    WHIP/K/W). Heuristic, NOT league-relative (labeled as such).
  - **Suggested Moves** (`renderAddDrop`, `#fantasy-adddrop`) — surfaces the hottest
    free agents (`fanState.faHot`, set in `renderWaivers`) and pairs each with a
    same-type roster player to drop: a cold/drop-watch player (`fanState.dropCandidates`)
    first, else the weakest droppable spot from the broader pool (`fanState.dropPool`,
    both set in `fillSeasonStats`, weakest-first). **Never drops a real contributor
    (v75):** each player gets a season-value read — `essential` (a good rate stat
    OPS≥.760 / ERA≤3.90 / WHIP≤1.25, or real counting totals) is excluded from ALL
    drop suggestions (even if cold — a cold star stays on the drop-WATCH display but
    is never suggested), and players with no season stats are excluded too (never cut
    someone we couldn't value). The rest rank weakest-first by `weakKey` (lowest OPS /
    highest ERA), so the worst bat/arm goes first; the drop line shows the weak stat
    (e.g. ".705 OPS"). If everyone left is a keeper, the pickup shows "🆓 OPEN". **Category-aware (v73):** pickups
    that fill a THIN scoring category sort first and get a "🎯 fills HR/RBI need" tag.
    Needs come from `fanState.catNeeds` (`{hitters:[], pitchers:[]}`, set in
    `renderCatStrength` from the same THIN/SOLID/STRONG gauges) — matched at
    hitter-vs-pitcher granularity since free agents only carry recent-form leads, not
    per-category stats. If there are hot pickups but no clearly droppable player, the
    add still shows with a "🆓 OPEN — open a roster spot" note. The whole body is
    wrapped so it NEVER leaves a bare heading: empty pickups → an explicit "no hot
    free agents" line; a thrown error → an inline message. Whichever async half
    finishes last renders the suggestions; `renderCatStrength` also re-invokes it once
    needs are known. **v74:** the cards are rendered with INLINE styles (not the
    `.ad-*` classes) — a class-based version rendered invisibly on the owner's device
    even though the cards were in the DOM and the CSS was valid (structurally identical
    `.cs-row` rendered fine; root cause never identified). Inlining the essential
    styles guarantees visibility regardless of the stylesheet. The `.ad-*` CSS rules
    are now vestigial.
  - **Waiver-run timing** — waivers process **Wed & Sun 11 PM ET**
    (`nextWaiverRun`/`nextWaiverRunLabel`); shown on the waiver wire + add/drop
    notes so pickups are framed to when they'd actually clear (no daily streaming).
  - **Live-day auto-refresh** (`scheduleLiveRefresh`) — while any roster game is
    live AND the Fantasy tab is open, force-resyncs every 5 min (matches backend
    cache TTL); cleared/re-armed each render, stops when idle or tab inactive.
  - **Owner's NFL fantasy league scoring = Half-PPR (0.5 per reception)**
    (`NFL_SCORING`, v112) — shown in the Football prep hero and reflected in the
    prep tips. Relevant when tuning the mock-draft board / any scoring-dependent
    ranking, and for the live football league once wired. Edit `NFL_SCORING` if
    the settings change.
  - **🏈 Football — Preseason Prep** (v99) — the Football chip now shows
    year-round. Until a live NFL league is wired up, selecting it renders a
    self-contained **preseason-prep view** (`renderFantasyFootball`,
    `#fantasy-football`, `.pp-*`/`.tl-*`/`.bd-*` CSS) instead of the baseball
    category sections: a **kickoff countdown** + **offseason timeline** (expected
    2026 dates, `NFL_DATES`/`daysUntil`), a personal **Draft Board** (add
    name/pos/tier, quick-add suggestion chips from `NFL_SUGGEST`, position
    filter; **each row's tier is an editable `<select>`** (`.bd-tier-sel`, v113)
    that re-ranks the player and re-sorts the board; saved on-device in
    `sportshub:fantasy:nflboard`), and evergreen prep
    tips. Section order (v113): Team Research → My Draft Board → Prep Tips →
    **Offseason Timeline (last)**. `renderFantasy` hides the baseball wrapper (`#fantasy-live`) and returns
    early for football; `injectJumpNav` now skips hidden headings so the hidden
    baseball sections don't produce dead chips. The **live** football league
    sections (matchup/standings/etc., which need the backend league + `catranks`)
    are still TODO — they'll branch on `cfg.football` when the NFL league is
    configured. The Labs rookie **Mock Draft Simulator** is a different thing (real
    NFL draft of incoming rookies).
  - **🏈 Fantasy Mock Draft** (v100; moved out of the Fantasy tab in v106; the
    **Labs tab** became its own top-level tab in v107) — a client-side snake
    draft vs CPU GMs. Launched from the Labs tab
    (`#labs-mock-start`) and rendered into `#labs-mock` (`renderMockDraft`;
    `closeMockDraft` clears it; state in `fanState.mock`, `.mk-*`/`.mock-*` CSS).
    Setup (teams/your slot/rounds; **defaults to 12 teams, slot 6**) → draft room
    (best-available board with position filter + search, your team by position,
    recent-picks log, auto-pick / sim-rest / exit) → completion screen that lists
    **every one of your picks with its value grade** (round · overall slot, +/−
    vs board rank) plus an overall **value-vs-slot grade** (`mockGrade`). The
    sample board (~100) is **padded with generic "Depth" filler at `mockStart`**
    to `teams×rounds` so the board never empties on a deep draft (filler carries
    rank ≥900 → shown as "–", excluded from the grade). CPU
    uses a value model (`mockScore`/`mockCpuChoose`): tier-shaped rank value ×
    positional need (`MOCK_NEED` vs `MOCK_CAP`) × a per-pick reach/slide factor,
    with K/DST gated to the last two rounds — so drafts vary run-to-run and CPU
    teams draft to their needs (v104 replaced the old fixed top-3 pick, which
    played out near-identically every time). Snake order via `mockTeamOnClock`. Player pool
    is a **built-in SAMPLE board** (`MOCK_POOL_RAW`, ~100 names + K/DST) — for
    practice, NOT live ADP. Distinct from the Labs *rookie* sim.
  - **🏈 Team Research** (v101, backups added v102) — in the Football prep view,
    a team `<select>` built from a **static id list** (`NFL_TEAM_LIST`, all 32,
    Eagles default) — v101 fetched the team list from ESPN and it hung ("Loading
    teams…") on device, so v102 hardcoded the ids (stable; only per-team
    roster/depth still fetch). **v109** added a **division quick-nav** above the
    dropdown (`paintTeamNav`/`selectResearchTeam`, `NFL_DIVISIONS`/`DIVISIONS`,
    `.tr-nav`/`.tr-div`/`.tr-team-chip` CSS): 8 division chips → that division's
    4 teams as chips; the dropdown itself is grouped by division via `<optgroup>`.
    Shows **projected offensive fantasy starters +
    backups** grouped QB/RB/WR/TE
    (`renderTeamResearch`/`paintResearch`, `.tr-*` CSS). Starters come from the
    latest depth chart (`FBCORE/.../depthcharts`, `STAT_SEASON`) with the top N
    per `FANTASY_STARTERS` (QB1/RB2/WR3/TE1) marked "Projected starter" (+2 depth
    each); falls back to roster-by-position if the depth chart is empty. Each
    player row opens a **player detail modal** (`openPlayerModal`, reuses
    `#game-modal`, `.pl-*` CSS): headshot, pos·#, an injury banner when present,
    a bio grid (position/age/height/weight/college/experience from the roster
    athlete object), and a "Full profile & stats on ESPN ↗" link. **Backups show
    an estimated "% to start"** (`stealOdds`/`paintResearch`) = position base
    rate × depth-rank decay × the starter's injury severity (`injSeverity`) × the
    starter's age (`ageMult`), floored high when the starter is Out/Doubtful; a
    starter's own injury shows as a 🩹 badge on their row. **News-enriched
    (v103):** each shown player is matched to a recent **ESPN team-news** headline
    (`${SITE}/.../news?team=`, `playerNews`/`classifyNews`) — a starter with a
    downgrade signal (IR/out-for-season/suspended) pushes his primary backup to a
    high floor, a backup with a promote signal (first-team reps / named starter)
    gets bumped, and the driving headline shows on the row (🔻/🔼/🗞) and in the
    player modal's "Latest News" card. **v108:** the news card opens an **in-app
    summary** (`openNewsSummary(article, backFn)` — the raw ESPN article is kept
    on `fanState.researchNews[id].article`; a "‹ Back" returns to the player), and
    the "Full profile" link uses the canonical id **+ name slug** URL so it
    universal-links into the ESPN app instead of bouncing to a browser.
    **v111 match precision (`playerNews`/`newsNorm`):** requires the **full name**
    (word-bounded, initials/apostrophes normalized so "A.J."↔"AJ", "De'Von"↔"DeVon"),
    and allows last-name-only matching ONLY for **distinctive surnames (≥6 chars)** —
    this stops common-word surnames (Price, Love, Green, Chase, Rice…) from
    matching generic article words (the "Jadarian Price" ↔ "$9.6B purchase price"
    false positive). All ESPN free feeds, no keys — Twitter/X
    is paywalled and Reddit is browser-CORS-blocked + noisy, so neither is used.
    Clearly labeled an estimate, not a real probability. Selection +
    fetched depth are cached in `fanState.researchCache`/`researchAthletes` so the
    section survives the prep view's full re-renders. NOTE: needs a live
    connection — the sandbox can't reach ESPN, so the team list + depth data were
    NOT testable here (structure + the modal were verified with seeded data);
    verify live on device.
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

- `sportshub:aitally` — graded pick results (all-time + vs-line record). v83+:
  entries also carry `{s, d, cf, p, m}` (sport, date, confidence, pick,
  matchup) for the Report Card; older `{c,e}`-only entries remain valid.
- `sportshub:pending` — ungraded picks awaiting results (v83+ includes `conf`).
- `sportshub:mlbidx` — cached MLB player→team index for fantasy auto-detect.
- `sportshub:lines:{YYYYMMDD}` — device-local line tracking for today's games
  (first-seen + latest ML/O-U per game; movement fallback for Game Reports).
  Only today's key is kept; older days are purged on write.
- `sportshub:fantasy:{sport}` — the saved fantasy roster, one per sport
  (`fanKey(sport)`, e.g. `sportshub:fantasy:baseball`).
- `sportshub:theme` — chosen color theme (`'light'` | `'dark'`). Absent = follow the
  OS `prefers-color-scheme`. Read by the inline `<head>` script and by `applyTheme`.
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

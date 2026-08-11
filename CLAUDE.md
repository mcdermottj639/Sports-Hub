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
Eagles superfan; also follows Red Sox, NFL, MLB, NBA, and golf). It's a **pure
static browser app** — HTML/CSS/vanilla JS, no build step,
no framework, no backend, no API keys. It ships from this repo via **GitHub
Pages** and runs entirely in the user's browser.

Live URL: **https://mcdermottj639.github.io/Sports-Hub/**

> ### Optional backend (`server/`) — LIVE, powers the Fantasy tab
> The owner evolved past pure-static for ONE capability: syncing their **real
> ESPN fantasy leagues**, which is impossible client-side (private-league
> endpoints are CORS- and cookie-gated). `server/` is a small **Python FastAPI**
> service wrapping the `cwendt94/espn-api` library. **HOST (v134): Render free
> tier** — `render.yaml` blueprint at the repo root, service
> `sports-hub-fantasy-api`, URL **`https://sports-hub-fantasy-api.onrender.com`**
> (set in `app.js` as `FANTASY_API`, overridable via localStorage `sportshub:api`);
> see **`server/RENDER.md`** for the deploy steps. ⚠️ **Render free-tier cold
> start:** the service sleeps after ~15 min idle and takes ~30–60s to wake, so the
> frontend uses a 45s timeout on backend calls, defers the health check off the
> Football view, and shows a "🔄 Wake backend & retry" button (see v134). The
> service isn't live until the owner runs the RENDER.md steps (create Blueprint +
> paste `ESPN_S2`/`SWID`). **(History: was on Railway free tier at
> `sports-hub-production.up.railway.app` until its trial expired in v134 — that URL
> is dead. The old Railway "Branch connected to production must be `main`" gotcha no
> longer applies.)** After any backend change, confirm the live build via
> `GET /api/health` → `version` (`SERVER_VERSION` in `main.py`, bump it on backend
> changes). Config (league IDs, ESPN `espn_s2`/`SWID` cookies, team id) lives ONLY
> in the host's env vars — never in the repo; see `server/.env.example`,
> `render.yaml` + `server/README.md`. Endpoints: `/api/health`, `/api/fantasy/{sport}/roster`,
> `/api/fantasy/{sport}/matchup`, `/api/fantasy/{sport}/standings`,
> `/api/fantasy/{sport}/opponent`, `/api/fantasy/{sport}/freeagents`,
> `/api/fantasy/{sport}/catranks` (per-team season category totals + league rank,
> powers the opponent comparison), `/api/fantasy/{sport}/playoffs` (Monte-Carlo
> playoff odds), `/api/draft/prospects?year=&limit=` (real NFL draft class as a
> ranked board **plus that year's real round-1 pick order** for the Labs
> mock-draft sim — pulled from ESPN's core API server-side since the browser
> can't read it; **defaults to `year=2026`**, the most recent draft; cached
> `DRAFT_TTL_SECONDS`/24h, stdlib-only), `/api/fantasy/football/rankings`
> (real ESPN fantasy **draft ranks**, positionally tiered — powers the Fantasy
> tab's auto-filled "My Draft Board"; cookie-less server-side pull of ESPN's
> fantasy game API the browser can't read, `year=2026`/`scoring=PPR` defaults,
> prior-season fallback, cached `RANKINGS_TTL_SECONDS`/12h, stdlib-only),
> `/api/betting/{sport}/report`
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
  `trivialab:best` (per-category best score, incl. key `live` for Sports Mix),
  `trivialab:daily` (per-date result →
  day-streak). NFL-themed skin (`trivia.css`) over `styles.css` (`?v=81`). Standalone,
  so NOT part of the `APP_VERSION`/`?v=` ritual (but bump `trivia.css`/`trivia.js`
  `?v=` in `trivia.html` on changes — currently **v6**). Add questions by editing `Q`.
  **Free play is ENDLESS** (v6): every free-play mode (curated categories, Mixed,
  Sports Mix, non-sports labs, Sports IQ) keeps serving questions forever — `S.endless`
  + an `S.refill()` callback that `extendQueue()` calls to top up the queue; **only the
  Daily Challenge stays a fixed 10**. The quiz header shows a **Finish & save** button +
  "N answered" instead of a progress bar; stopping saves lifetime stats + per-key best
  (results use `S.picks.length`, not queue length; review capped to last 40).
  **🌍 Non-sports labs** (option 3): OpenTDB's other categories (General/Movies/Music/
  Science/Geography/History, `GK` config) as their own endless tiles under a "Beyond
  sports" section — same harvest/cache pipeline, generalized per-category
  (`harvestCat(id, classifyFn)`, `loadCat`/`saveCat`, key `trivialab:otdb:{id}`; sports
  stays key `trivialab:otdb` and runs `classifyLive` for the blend).
  **🔴 Live Sports IQ** (`startLiveIQ`, tile `data-iq`) — a bankless mode that
  **generates questions on the fly from real ESPN scores**. `buildLiveIQ` pulls the
  last ~day's finished games from the ESPN public scoreboard (`espnScoreboard`,
  `IQ_SPORTS` = mlb/nfl/nba, `?dates=` yesterday-today range, 9s abort, all parsing
  defensive via `normGame`) and `genFromGames` synthesizes MC questions with REAL
  distractors: **who won (with the game DATE)** and **which team a game's statistical
  standout plays for** (`extractPlayers` reads each competitor's `leaders`, so the
  names are recognizable). **The old "guess the exact score / combined total" number
  questions were removed** (v6) — the owner (correctly) called them dumb/arbitrary and
  they had no date. Endless (`refill` reshuffles the built pool); mode `liveiq`, best
  under `trivialab:best` key `liveiq`. If fewer than 5 questions can be built
  (off-season / ESPN unreachable — the July slate is basically MLB-only) it falls back
  to the local Mixed set. NOTE: sandbox can't reach ESPN, so structure/fallbacks were
  verified but live generation (esp. the `leaders` shape) must be checked on device.
  Possible next step the owner floated: **historical stat leaders** ("who led the NFL
  in passing yards in 2021") — needs ESPN's per-season core leaders endpoints
  (athlete `$ref` resolution), NOT yet built, would need on-device verification.
  **🌍 Live questions from OpenTDB** (`opentdb.com/api.php`, category 21 = Sports,
  `type=multiple`) **live, browser-direct** — OpenTDB is one of the rare sources that
  sends permissive CORS (`Access-Control-Allow-Origin: *`), no key, no backend. Two ways
  they surface, both kept OUT of the curated NFL bank and the deterministic Daily
  Challenge (which must stay reproducible):
    1. **Blended into each free-play category.** OpenTDB has ONE flat "Sports" bucket
       (no per-sport tag), so `classifyLive(text)` best-effort keyword-routes each
       question into our category keys (cfb/sb/eagles/draft/nfl/mlb/nba) or null. A
       `harvestOTDB()` fetches 50 at a time (tokenless, 9s abort, `response_code`
       handled: 5 = 1-req/5s rate limit) and **dedupes into a growing localStorage
       cache** (`trivialab:otdb`, `MAX_POOL` 800, `HARVEST_MIN_MS` 20s time-guard) that
       accumulates across visits (warmed once on boot + after each quiz via
       `warmLiveBg`; boot re-renders home once if the pool grew). `startCategory` blends
       up to `LIVE_BLEND` (4) matching live questions into the curated quiz — each stays
       visibly tagged 🌍 (via `makeLiveQuestion`). Tiles show a `+N 🌍` pill
       (`liveCountsByCat`). This is a **casual, fuzzy bonus** — small pool, some
       misfiling — NOT curated depth; labeled as such in the home note.
    2. **🌍 Sports Mix tile** (`startSportsMix`) — the all-sports bag (any bucket incl.
       soccer/cricket). Serves ~12 from the cache, only hitting the network when the
       pool is thin.
  `makeLiveQuestion` HTML-entity-decodes text (detached `<textarea>` via `decodeHTML`,
  then still `esc()`d on render), shuffles `incorrect_answers` into our `choices`, and
  maps easy/medium/hard → 50/100/150 pts (`diffInfo`, `d1` pill). On any failure Sports
  Mix falls back to the local Mixed set with a one-shot notice banner
  (`liveFallback`/`pendingNotice`). `trivialab:best` key `live` holds the Sports Mix
  best. Attribution (CC BY-SA 4.0) on the home note + live results.
- `workout.html` / `workout.css` / `workout.js` — **🏋️ Labs: Workout Lab**, a standalone
  page (linked from the Labs tab, alongside the draft sim and trivia lab). Self-contained,
  no backend, no ESPN — it's the owner's **3-day training split** (Day 1 chest & triceps,
  Day 2 back & biceps, Day 3 legs & shoulders), built from the 30-minute dumbbell/kettlebell
  format they wrote for chest day: short warm-up → 3 timed blocks (superset / superset /
  circuit) → cooldown. Data lives in one `PLAN` const (`{k,n,sub,emoji,color,mins,focus,
  intro,warmup[],blocks[],cooldown[]}`; block = `{id,name,mins,style,rounds,rest,note,gap,
  why,ex[]}`; exercise = `{n,reps,load,cue,alts[]}`) plus `ADDONS` (Conditioning /
  Core Blitz / Mobility / Neck & Grip — optional standalone modules). **Edit `PLAN` to
  change the program; nothing else needs to move.**
  - **Gap-fix blocks** — a 3-day split leaves real holes, so each day ends with a short
    block (`gap:true`, rendered gold with a "Why this is here" note) covering what the
    split misses: **Day 1 → core/abs**, **Day 2 → grip, forearms & spinal erectors**,
    **Day 3 → calves & anti-rotation core**. Two more gaps are fixed inside normal blocks
    — the **RDL** (hamstrings/glutes) and the **lateral raise** (side delts) headline
    Day 3 Block B — and rear delts show up in three places. The `COVERAGE` const drives a
    **Muscle coverage map** screen listing every major muscle as `ok` / `fix` / `note`
    (`note` = deliberately optional: neck, cardio).
  - **Guided session** — one block per screen with tappable set chips, a per-exercise
    weight field, a rest timer (auto-starts on a set tap, WebAudio beep + `navigator.vibrate`
    at zero), elapsed clock, block dots, and Prev/Next. Finishing writes a session log and
    stashes each load so the next time that day comes around the row reads
    "Last time: 45 lb". Summary screen shows duration, sets and rough tonnage
    (weight × sets × rep-range midpoint — approximate, labeled).
  - **Exercise visuals (wk v2)** — every exercise row shows a small **stick-figure
    "how it looks" diagram**: inline SVG (no image assets), 1–2 frames reading
    start → finish with an arrow, figure strokes in `currentColor` (so both themes
    work free) and weights/bars/bands in the lab accent. Data: the `VIS` const
    (~45 hand-drawn poses; frame primitives `['h',x,y]` head / `['p',…]` limb
    polyline / `['e',…]` accent equipment line / `['d'|'k',x,y]` dumbbell/kettlebell
    / `['o',x,y,r]` accent circle / `['g',…]` ground-wall line, in a 95×96 box,
    ground y=84) + the ORDERED `VIS_MATCH` regex table keying exercise NAMES to
    poses (specific before generic: rear-delt before flye, wrist curl before curl…).
    `visFor(name)` → `visSVG(vis)`. Always visible on block exercises (plan +
    session); warm-up/cooldown lists tuck theirs in a "👁 Show me" `<details>`.
    A home-screen chip (`#vis-toggle`, pref `vis`) turns them all off. Add a new
    exercise to `PLAN` → add/reuse a `VIS` entry + matcher.
  - **Time tracking (wk v2)** — per-day workout time is now surfaced (duration was
    always logged in `workoutlab:log` `dur`): a **Time this wk** tile in the (now
    5-tile) home stat strip, a "⏱ N min trained today" line on the finish summary
    (sums multiple sessions that day), and a **⏱ Time trained** card atop History —
    this-week / last-week / avg-session totals + a 14-day minutes-per-day bar chart
    (`timeChartHTML`, `.wk-tchart`/`.wk-time-tots` CSS, today's bar highlighted).
  - localStorage: `workoutlab:log` (sessions), `workoutlab:last` (load per exercise id,
    `day.blockIdN`), `workoutlab:prefs` (`unit` lb/kg, `autoRest`, `sound`, `vis`).
  - Themed via the shared `styles.css` vars **and** the `<head>` theme script, so unlike
    `draft.html`/`trivia.html` it renders correctly in BOTH light and dark. Standalone, so
    NOT part of the `APP_VERSION`/`?v=` ritual — but bump `workout.css`/`workout.js` `?v=`
    in `workout.html` on changes (currently **v2**), and its `styles.css?v=` (now 143) if
    you change shared CSS it leans on.
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

Current version as of this writing: **v148**.

- **🔒 League keepers + real draft order (v148)** — the owner sent the
  commissioner's keeper sheet (PDF) and the 2026 draft order for their 12-team
  keep-the-round league ("Nectars Bologna"). Two new consts near `TURN_ROUNDS`
  are now the single source of truth:
  - **`LEAGUE_ORDER`** — slots 1–12 with the manager ↔ team-name mapping
    (Gotch=Thurgood Marshall, Riz, Hurd, Hyman, Christel, Slemp=Slob On My Cobb,
    Woods=Morning Woods, Zach, CC, **McD=Current Champ = the owner, slot 10**,
    Buley=GMDD, Jew(=Wolff)=Future champ). `team: null` = keepers not reported.
  - **`LEAGUE_KEEPERS`** — 16 kept players across 8 reported teams, each
    `{team, n, p, r}` (+`you` for the owner's). ⚠️ **PARTIAL — Riz, Hurd, Hyman
    and Zach haven't reported; append them here and everything downstream
    updates.** The league's 1st/2nd/final-keep bookkeeping is deliberately NOT
    modeled (owner: "just player and round matter"). Names must match
    `MOCK_POOL_RAW` spelling; `keptEntry(name)`/`keepNorm` do the lookups.
  Wired into four places: (1) **Draft-Turn Plan targets that are kept render
  struck-through** with who holds them, so a stale plan can't send you hunting an
  undraftable player; (2) a new **🔒 League Keepers & Draft Order** card above
  the plan — the league in draft order, keepers per team as pills, unreported
  teams called out, plus a **turn-insight box**: only 4 picks (Buley, Jew, Jew,
  Buley) happen between the owner's 1.10 and 2.15, and both those managers'
  keepers are known, so you can read what they still need; (3) the **Labs mock
  draft** pulls opponents' keepers off the board (previously it would offer you
  Ja'Marr Chase, whom Buley keeps) and labels CPU teams with the real manager
  names when teams===12; (4) the ⭐ turn-target board merge **skips kept
  players** and says how many it skipped.
  **R1/R2 plan retuned to the real board:** 4 of R1's old targets (JSN, Puka,
  Achane, Nico Collins) and R2's McConkey are kept by others. Because ~6 top-15
  players never enter the draft while every team still picks in R1, the board at
  #10 is DEEPER than a normal draft — verified by simulating the pool minus
  keepers (top available: Bijan, Jefferson, Saquon, Gibbs, CeeDee, CMC, JT,
  ARSB, Jeanty, then Love ≈ the owner's pick). R1 groups now read Bijan/
  Jefferson/ARSB → Saquon/Gibbs/JT/CMC → CeeDee/London/A.J. Brown. Five kept
  names remain in R3/R4/R5/R9 groups on purpose — they render struck-through,
  which is the informative treatment for a mid-round group with alternatives.

- **⚾ Fantasy baseball SHELVED for the season (v147)** — owner call: their
  fantasy-baseball season is done, football season is starting, so the Fantasy
  tab is now **football-only**. This is a shelf, NOT a removal: the entire
  baseball live-league stack (syncFromLeague, league header, matchup scoreboard,
  projection, How You Stack Up, Snapshot/Roster, Category Strengths, Suggested
  Moves, Waiver Wire, League Analyzer, Playoff Predictor, all `#fantasy-live`
  HTML and CSS) is intact and dormant. Mechanism: `renderFantasy`'s `sports`
  list (the shelf point, with a SHELVED comment) now holds only football, and
  `fanState.sport` defaults to `'football'`; the sport chip row auto-hides when
  only one sport is listed (`chips.style.display` gate). **To revive next
  spring: re-add `['baseball', '⚾ Baseball']` to that list — nothing else.**
  The backend (`server/` on Render) stays deployed untouched — the Scriptable
  widget still calls it directly, and the baseball endpoints remain live for
  the revival. Saved rosters/localStorage keys are untouched.

- **Game modal sits preseason out too (v146)** — the owner's screenshot of a
  preseason final (CAR@ARI) showed the modal running the full model treatment:
  an AI Pick (63%), model-vs-book price grades (A-/F), and "model total 45.1 →
  OVER 34.5". The model's data is regular-season (v145 blend = last season's
  real games), which is exactly wrong for preseason where backups play — the
  totals read especially so. `openGameDetail` now skips `predictGame` when
  `g.seasonType === 1` and shows an honest "🤖 Preseason — the model sits these
  out" note instead; the odds grid and the report's market-only parts (line
  movement, DK splits) still render, since real market data is fine to show.
  With `pred` null the model-agrees banner, factor breakdown, and the report's
  model rows all self-suppress (existing null paths). Matches the AI Picks
  tab's v145 preseason skip.

- **🏈 NFL tab + NFL model data readiness (v145)** — new top-level **🏈 NFL tab**
  (after Eagles; the Eagles tab stays the team deep-dive, this is the league
  lens) + fixes that make the model safe for the NFL season start:
  - **Model readiness (Step 0):** (a) `normEvent` now captures ESPN's
    `seasonType` (1=pre/2=reg/3=post) on every game object; (b) `teamProfile`
    filters preseason games out via `isPreseasonEv` (shape-defensive — NFL
    preseason AND MLB spring training are seasonType 1), so August/September
    profiles are no longer polluted by practice games; (c) **prior-season
    blend** — when `beforeDate` is passed (the model path only; the season-trends
    display caller omits it and stays pure current-season) and a team has <6
    current-season games, last season's full schedule (`?season=yr-1`) is
    blended into winPct/pdpg/ppg/papg at weight `((6-gp)/6)×0.75` (never full —
    rosters turn over; needs ≥8 prior games). Week 1 picks are now real instead
    of "home edge only" coin flips; a `blended` flag adds an honest "Early
    season — blended with last season (damped)" note to the pick. Form/streak/
    splits/rest stay current-season only. (d) **AI Picks skips preseason
    entirely** (`g.seasonType !== 1` filter before the pick pipeline) — no picks
    rendered, recorded, or graded on preseason games, with an honest empty-state
    ("model sits these out"); the Home slate still shows them normally.
    (e) `CONF_CAP.nfl = 85` — the NFL side has NO validated calibration data
    (all graded NFL picks predate the confidence meta and the v138 leak fix), so
    it gets a principled ceiling until this season builds a clean sample.
  - **The tab** (`renderNFL` + `renderNFLWeek`/`renderNFLNews`/`renderNFLPower`,
    `#nfl-*` ids, `.pw-*`/`.npo-*`/`.nfl-*` CSS, curated nav so `injectJumpNav`
    skips it, hero watermark 🏈): **hero** (season phase + kickoff countdown via
    `NFL_KICKOFF`, auto-detects Preseason/Week N/Playoffs from the scoreboard's
    `week`/`season.type`); **This Week's Slate** — the bare NFL scoreboard call
    returns the current week's full Thu–Mon slate, grouped by day headings
    (`.nfl-day`), rendered with the standard tappable `gameCard` (odds+TV+modal;
    the weekly view Home's daily slate can't give); **Top NFL Headlines** (league
    news feed → in-app `openNewsSummary` popup, same pattern as Eagles news);
    **⚡ Power Board** — all 32 teams ranked by `win% + (point diff/gm)/28` from
    ONE standings pull (`normStandings` now also extracts `pf/pa/diff/seed`;
    `getStandings` gained an optional `season` param) — in the offseason it
    falls back to **final 2025 standings** (labeled as such) so the board is
    never empty; Eagles row highlighted (`.pw-row.you`); **Playoff Picture** —
    AFC/NFC seeds 1–7 off ESPN's `playoffSeed` (approx-by-record fallback,
    labeled), dashed cut line, "in the hunt" list; hidden behind an honest note
    until 2026 games count. All sections degrade independently to empty-states.
    NOTE: sandbox can't reach ESPN — structure/fallbacks verified, live shapes
    (scoreboard `week`, standings `pf/pa/seed`, `?season=2025` param) need
    on-device verification.

- **💰 Contract Angle card (v144)** — the Fantasy → Football prep view gained a
  contract-status targeting section (between the Draft-Turn Plan and My Draft
  Board): players to target because they either **just signed/re-signed for big
  money** (team commitment = locked-in volume) or are in a **contract year**
  playing for the next deal. Driven by the `CONTRACT_WATCH` const (two groups
  `paid`/`year`, each player `{n, p, tier, deal}` with a one-line verified deal
  note); rendered with inline styles (v74 lesson) plus a **⭐ Add contract
  targets to my board** button (`#cw-add`) doing the same non-destructive merge
  as the turn plan's (tier from the player entry). Facts web-verified this
  session (Aug 2026), same method as v141: paid = JSN 4yr/$168.6M (record WR
  deal), Achane extended (a MIA "pillar"), KW3→KC 3/$43M, Evans→SF, Jones
  re-upped MIN, Pierce re-signed IND 4/$114M; contract-year = Nacua (Day-3 deal,
  unextended), Chase Brown (CIN tag talk), Rashee Rice (KC won't extend
  pre-season), LaPorta (final rookie year), Murray (1-yr MIN). **Maintenance:
  when a contract-year guy signs an extension, move him to the `paid` group.**

- **🏋️ Workout Lab (v143)** — a new standalone Labs page (`workout.html`/`.css`/`.js`,
  linked from the Labs tab) holding the owner's 3-day training split. Built from the
  chest-day session they wrote, kept in the same 30-minute block format, and extended to
  all three days. See the `workout.*` entry in **Files** for the data model and features.
  The design decision worth remembering: rather than adding a 4th day for the muscles a
  3-day split misses (core, calves, hamstrings, side/rear delts, grip, erectors), each day
  ends with a short **gap-fix block** and two gaps were folded into Day 3's main work —
  so it stays three sessions of ~33 min. The **Coverage map** screen is the in-app answer
  to "what body parts did I miss?". No ESPN, no backend, so it was fully verifiable in the
  sandbox — the whole flow (plan → session → set logging → summary → history → "last time"
  prefill) was driven end-to-end in headless Chromium in both themes, no console errors.
  The app itself only changed by one link in the Labs tab + the version bump.

- **Keeper flip: Drake Maye (R11) in, Kyren (R6) out (v142)** — the owner
  decided (after a value comparison: Maye ~ADP 52 / consensus QB2-3 kept at
  pick #130 = ~78 picks of surplus, vs Kyren ~ADP 24-31 kept at #63 = ~35).
  **League keepers are now Trey McBride (R7 · #82) + Drake Maye (R11 · #130);
  Kyren Williams goes back into the draft pool.** `TURN_ROUNDS` re-planned for
  the scenario: R1 elite-RB group promoted (roster starts with zero RBs), R2
  Love/Jeanty marked near-mandatory, R3 leads RB2, **R4's "elite QB if one
  slides" group is gone and R8's QB1 window replaced** (never draft a QB —
  Maye is the keeper), **R6 #63 is a live pick again** ("bonus pick — Kyren's
  old slot"), R9 drops the Corum-handcuff framing (he handcuffs a Kyren the
  owner no longer rosters; kept as a dart), **R10 handcuff re-pointed to Trey
  Benson** (ARI — the handcuff for a 2.15 Jeremiyah Love pick), R11 renders as
  the locked Maye keeper row, sleepers header now R12+ (#135+), and the QB2
  sleeper group is reframed as optional Maye insurance. `MOCK_KEEPERS` updated
  to McBride R7 + Maye R11 (launch default unchanged otherwise) and
  `Drake Maye|QB|NE` added to `MOCK_POOL_RAW` (~rank 52).

- **Draft-Turn Plan retuned to verified Aug-2026 reality (v141)** — this CCR
  session CAN web-search (WebFetch/curl are proxy-blocked; ESPN still
  unreachable), so the v140 targets were checked against live sources and
  re-curated. Verified 2026-offseason facts baked into `TURN_ROUNDS`/
  `TURN_SLEEPERS` + `MOCK_POOL_RAW`: **Jeremiyah Love** (Notre Dame RB) went
  **#3 overall to the Cardinals**, ~ADP 16 → headline R2 target;
  **Jadarian Price** rookie RB → **Seahawks**, ~R5 ADP with a lead-back path
  (Walker left, Charbonnet hurt) → R5 target; **Kenneth Walker III** (Super
  Bowl LX MVP) signed **KC** 3yr/$43M; **Kyler Murray** benched → released by
  ARI → **MIN** 1-yr (pulled from the R8 QB group, now a QB2 sleeper);
  **Mike Evans → SF** 3yr; Aaron Jones re-upped MIN; **Malik Nabers**
  (ACL 9/2025, ~31–46 ADP) is the R3 buy-zone swing; consensus top-6 now
  Bijan/Chase/JSN/Puka/Gibbs/ARSB (JSN + JT moved up in `MOCK_POOL_RAW`,
  Nabers down, Love/Price inserted); **Ricky Pearsall** (knee, season in
  doubt) and **Isaac Guerendo** (PUP pec) dropped from the plan; Corum-as-
  Kyren's-handcuff CONFIRMED on the 2026 Rams depth chart; rookie sleeper
  fliers Carnell Tate (TEN) + Zachariah Branch added. Team-label fixes in the
  pool: KW3→KC, Murray→MIN, Bigsby→PHI (2025 trade), Evans→SF.

- **Draft-Turn Plan → full 10-round plan + sleepers (v140)** — the 🎯 card
  (Fantasy → Football) grew from the fixed 1.10/2.15 turn into the owner's
  whole draft. `TURN_PLAN` was replaced by **`TURN_ROUNDS`** (one entry per
  round R1–R10: `pick` = overall pick # from slot 10 in the 12-team snake —
  #10/#15/#34/#39/#58/#63/#82/#87/#106/#111 — plus `tag` collapsed-row
  summary, `note`, tiered `groups`; the R6/R7 entries are `keeper` rows
  rendered locked for Kyren/McBride) and **`TURN_SLEEPERS`** (R11+ pool:
  handcuffs / WR darts / QB2 / K+DST, picks #130–#178). Each round renders as
  a **collapsed native `<details>` row** (tap to expand; inline-styled per the
  v74 lesson; tiny `.tp-r` CSS just hides the webkit marker + rotates the
  chevron). Targets align with the built-in `MOCK_POOL_RAW` ranks (rank ≈
  pick). The ⭐ "Add these targets to my board" merge now walks all round
  groups + sleepers (still non-destructive; skips K/DST and dupes; tier =
  group tier). The old "Later: grab Blake Corum…" footer is gone — Corum is
  now the R9/R10 group itself. Edit `TURN_ROUNDS`/`TURN_SLEEPERS` to update.

- **Player modal: live Health Status + 2026 Outlook (v139)** — the Team
  Research player modal (`openPlayerModal`) gained two cards above Latest News:
  - **Health Status** (`athleteHealth`/`healthCardHTML`, `.pl-health`/`.pl-h-*`
    CSS) — replaces the old one-line `🩹 Out` banner (`.pl-inj` markup dropped;
    its CSS kept, vestigial). Paints instantly from the roster feed's injury
    object, then refreshes live from ESPN's **common-v3 athlete card**
    (`WEBAPI` = `site.web.api.espn.com/apis/common/v3/sports`, 15-min TTL) which
    carries richer injuries: status + body part/detail/side + expected return
    date + the written beat-report comment (`longComment`/`shortComment`).
    Card is severity-colored (`healthSev`: ok/warn/out) with a source line
    ("live from ESPN" / "from team roster · checking…" / "(live check
    unreachable)" on fetch failure). Healthy = ✅ Active, "No injuries
    reported." Date-only strings anchored to noon (`fmtHDate`) so return dates
    don't shift a day.
  - **2026 Outlook** (`outlook2026`, `.pl-outlook`/`.pl-o-note`) — a ≤3-sentence
    auto-generated blurb from: depth-chart role (`fanState.researchRole`, now
    stashed per athlete in `paintResearch` — starter flag / depth / slots /
    steal-odds pct), age curve per position, rookie status, live health
    severity, and the news signal. Re-renders alongside the live health refresh
    (guarded by `body.dataset.aid` so a re-opened modal for another player
    isn't overwritten). Clearly labeled auto-generated, not a scouting report.
  NOTE: sandbox can't reach ESPN — the common-v3 injury shape (`athlete.injuries`
  with `details`/`longComment`) was coded defensively and smoke-tested with
  seeded data; verify the live shape on device. If `site.web.api.espn.com`
  ever refuses browser CORS, the card just stays on the roster read with the
  honest "live check unreachable" label.

- **AI model: look-ahead fix + data-fitted calibration (v138)** — the owner
  exported a month of graded picks (289 entries; 119 pregame MLB side picks with
  confidence). Four changes, all MLB-only except the first:
  - **🚨 Look-ahead leakage (the real bug).** `teamProfile` built each team's
    profile from **every completed game on its schedule**, with no cutoff at the
    game being predicted. So any game that was already final when the tab
    rendered it fed its own result — and every later game — into the prediction
    that then got graded (`renderPredictions` grades finals inline at the
    `recordResult` call). Records built that way flatter the model. `teamProfile`
    and `starterForm` now take a `beforeDate` and count only games/starts that
    finished strictly before the predicted game; `predictGame` passes `g.date`.
    The season-trends caller (line ~1684) omits the arg and is unchanged. NOTE:
    `teamOPS` and the probables' season ERA/WHIP are still whatever ESPN serves
    *today* — those feeds can't be rewound, so grading a several-day-old date
    still has minor leakage through them. Picks stashed pregame by `recordPick`
    (the normal path) were always clean.
  - **`MODEL_SHRINK` (calibration).** The exported record showed stated
    confidence was ~2x too wide: 70%+ picks won 63%, the 80–84% bucket won 22%,
    and the Brier score (.2553) was *worse than saying "52%" every game* (.2465)
    — i.e. the confidence number carried negative information. The factor sum
    `z` is now shrunk toward even money before the logistic (`mlb: 0.5`,
    `default: 1` so NFL/NBA are untouched). Max-likelihood shrink was 0.26 with
    a 90% bootstrap CI to 0.54; **0.5 is deliberately the least-correcting end**
    of that range. Brier improves .2553 → .2382. The shrink is monotonic, so it
    **does not change which side is picked** — the straight-up record is
    identical. It fixes (a) honest confidence and (b) **edge sizing**, since
    `marketGap` is measured off `probHome`: inflated probabilities were
    manufacturing edges that went **10-12 (45.5%) against the line**, under the
    52.4% break-even. Expect far fewer ⚡ edges — that's the point.
    `CONF_CAP.mlb` (72) stays as a backstop but now rarely binds.
  - **Park factors for totals.** Totals picks skewed **OVER 17 of 23** — the
    signature of a park-blind projection built from season scoring averages
    (it priced Coors like Oracle). Added static `MLB_PARK` (3-yr run factors,
    100 = neutral) applied at `PARK_WEIGHT` 0.7, because the teams' season rates
    already bake in ~a quarter of the home park's effect. Swing is ~1.25 runs
    across the 30 parks. `TOT_EDGE_MIN.mlb` raised 1.0 → 1.5 (park alone can't
    trigger an edge).
  - **Report Card shows calibration.** Confidence buckets went 50–54/55–59/
    60–64/65–69/70+ (the old three collapsed the post-shrink range), and each
    row now reads `W-L → actual% (gap vs claimed)` — green within 6 pts, red
    when overconfident, "thin" under 10 graded picks. Entries with no stored
    confidence are counted (`det.legacy`) and called out: 130 of the owner's 289
    entries had no meta and won 72.3% vs 59.3% for the labeled pregame sample,
    inflating the all-time headline.
  NOT done: **bullpen quality**, the biggest remaining MLB input gap (~1/3 of
  innings, currently zero model weight). It needs an ESPN team-pitching split
  the sandbox can't reach, so it wasn't shipped blind — next step, verify the
  feed shape on device first.

- **Football live view — 4 manager tools (v137)** — `renderFootballLive` (now
  async) gained the football analogs of the baseball live tools, all in the live
  view (only renders when `cfg.football === true`, so dormant/zero-risk until the
  NFL league is configured):
  - **Live Win-Probability** (`footballWinProb`) — P(win the week) from
    projected-or-actual point totals + how many players are still to play (more
    left → more variance; logistic on the margin/sd). Shown in the This Week card
    with a colored bar. Heir to baseball's `matchupWinProb`. Estimate, labeled.
  - **Start/Sit optimizer** (`startSitAdvice`) — flags bench players who
    out-project a startable starter at the same slot (incl. a FLEX swap for
    RB/WR/TE), top upgrades by projected gain. "✅ optimal" when none.
  - **Bye & Injury radar** — `nflWeekGames()` pulls ESPN's FREE public NFL
    scoreboard (dateless = current week) keyed by team abbrev; starters whose
    proTeam is absent = **bye**, injuryStatus ≠ active = flagged. Shows a
    ⚠️ Lineup Alerts card + a per-player game chip (`@OPP Sun 1:00` / BYE) on
    every roster row. Works even if the fantasy backend is asleep (ESPN-direct).
  - **Opponent Scouting** (`nflBucket` + `sumB`) — your projected points vs the
    opponent's **by position** (QB/RB/WR/TE/K/DST) with a total row, green = your
    edge. The points/position analog of baseball's "How You Stack Up". Uses the
    `/opponent` lineup.
  NOTE: still no NFL league at build time + sandbox can't reach ESPN — the
  feature logic was unit-smoke-tested (win%, start/sit incl. FLEX, scouting,
  empty states) but the espn-api shapes must be verified on device once live.

- **Fantasy category display order (v136)** — the category-league screens (How
  You Stack Up `renderOpponent`, matchup scoreboard `renderMatchup`) showed
  categories in ESPN's raw scoring-config order, which interleaves hitting and
  pitching. Added `CAT_ORDER` + `orderCats()` so they read as ALL hitting first
  (R, HR, RBI, OPS, SB, …) then ALL pitching (counting QS/SV/K, then ratios
  ERA/WHIP).

- **Live football league view (v135)** — the Fantasy → Football tab now shows a
  real **points-based H2H live view** when an NFL league is configured on the
  backend (`health` → `configured.football === true`), not just the draft-prep
  tools. New `renderFootballLive()` (into `#fantasy-football`) renders: a **weekly
  points matchup** (my score vs opponent, projected pre-kickoff via the roster's
  summed `projected`, a lead/trail verdict + bar), **standings** (reuses the
  generic `/standings` payload — W-L, streak, power), **roster** grouped
  starters/bench with weekly/projected points + injury flags (from a new
  `rosterFull` stash on `fanState.league.football` = the backend `/roster`
  player dicts), and a **waiver wire** (top `/freeagents`). Football is
  points-scoring, so it deliberately does NOT reuse baseball's category renderers
  (matchup categories, projection, catranks opponent, playoffs) — and
  `syncFromLeague` now **skips `/catranks` + `/playoffs` for football** (baseball-
  only endpoints). `renderFantasy`'s football branch: if `cfg.football` and
  `fanState.footballView !== 'prep'` → sync + live view; else the prep view (with
  a lazy `leagueConfig()` upgrade so prep still paints instantly). Toggle between
  them via **"🏈 Draft board & prep tools →"** (live→prep) and **"← Back to live
  league"** (prep→live, shown only when configured). NOTE: **no NFL league existed
  at build time and the sandbox can't reach ESPN**, so the espn-api football
  shapes (box-score `home_score`/points, `player.points`/`projected`) were coded
  defensively but **must be verified on device once the league is live**. To turn
  it on: add `FOOTBALL_LEAGUE_ID`/`FOOTBALL_TEAM_ID`/`FOOTBALL_YEAR` in Render (see
  the commented block in `render.yaml`) → `/api/health` flips `football:true`.

- **Backend host → Render free tier (v134)** — the **Railway trial expired**
  (deploys greyed out), so the backend was migrated OFF Railway. Added a repo-root
  **`render.yaml`** blueprint (service `sports-hub-fantasy-api`, root dir `server`,
  `plan: free`, same `uvicorn main:app` start, `healthCheckPath: /api/health`,
  `PYTHON_VERSION 3.12.7`, ESPN cookies as `sync:false` secrets, baseball league
  values inline) + `server/.python-version` (Render ignores `runtime.txt`) +
  `server/RENDER.md` (3-step deploy). Frontend: **`FANTASY_API`** now defaults to
  **`https://sports-hub-fantasy-api.onrender.com`** with a **localStorage override**
  (`sportshub:api`) so the URL can change without a code push. Render's free plan
  **cold-starts** (~30–60s after ~15 min idle), so: `fetchJSON` gained a 3rd
  `timeoutMs` arg and auto-uses **45s** for any `FANTASY_API` URL (ESPN stays 9s);
  `renderFantasy` **defers the `/api/health` check to the baseball branch** (Football
  prep view + sport chips render instantly, never waiting on a cold backend); and the
  v133 offline notice gained a **🔄 Wake backend & retry** button that clears the
  cfg cache and re-syncs (waits out the cold start). NOTE: the Render service isn't
  live until the owner runs the `server/RENDER.md` steps (create Blueprint, paste
  `ESPN_S2`/`SWID`); until then the app runs on fallbacks. The old Railway URL
  (`sports-hub-production.up.railway.app`) is dead.

- **"League sync offline" notice (v133)** — when the fantasy backend is
  unreachable (`leagueConfig`'s `/api/health` fetch throws → `fanState.backendDown`),
  the baseball live-league area no longer just renders blank. `renderLeagueHeader`
  shows an explicit ⚠️ notice (matchup/waivers/standings/opponent can't load; roster
  + snapshot still work from the saved team) instead of an empty `#fantasy-league`.
  Context: the owner's **Railway free trial expired**, so the backend
  (`sports-hub-production.up.railway.app`) is **down** — `/api/health` returns
  Railway's "train has not arrived" 404 and the service shows offline (Redeploy
  greyed out = account capped). Bringing it back needs the **Hobby plan (~$5/mo)**
  or a migration to another host (e.g. Render free tier, with cold-starts). Until
  then the app runs on its fallbacks: draft board uses the built-in ranked board,
  live-league sections show this notice.

- **🎯 Draft-Turn Plan card (v132)** — a fixed, read-only cheat-sheet in the
  Fantasy → Football view (between Team Research and My Draft Board) for the
  owner's 1.10 + 2.15 turn (12-team half-PPR, keepers McBride TE + Kyren RB → WR-lean
  unless an elite RB falls). Driven by a `TURN_PLAN` const (tiered target groups,
  each `{label, tier, players:[{n,p}]}`); rendered as color-coded tier rows of
  player pills with **inline styles** (per the v74 visibility lesson). Includes a
  Blake Corum reminder (R9 #106 / R10 #111) and a **⭐ Add these targets to my
  board** button (`#tp-add`) that non-destructively merges the turn players into
  the editable `sportshub:fantasy:nflboard` (tier = draft priority; WR/RB only, no
  TE). Consensus targets, edit `TURN_PLAN` to change.

- **Fantasy Mock Draft — keeper support + owner's league preset (v131)** — the
  Labs Fantasy Mock Draft now models a **keeper league**. New `MOCK_KEEPERS`
  (`[{name,round,pos,team}]`) + `mockUserOverallInRound(m, round)`: kept players
  are pulled off the board (no CPU can draft them) and **auto-fill the user's pick
  in the round they cost** (keep-the-round format), so the user forfeits that
  round's pick. Wired through `mockAssign` (new `keeper` flag), `mockAdvance`/
  `mockSimRest` (auto-place at the user's keeper slots), `mockStart` (builds
  `m.keeperAt` overall→player map; keepers whose round exceeds the draft length
  are pre-rostered), and `mockGrade` (keepers excluded from the value grade).
  Setup screen has a **Use my keepers** toggle + a note; kept players show a
  **🔒 kept** tag on the roster and "🔒 kept" (no value) on the completion Picks
  list. The launch default is now **12 teams / slot 10 / 15 rounds** with the
  owner's keepers on: **Trey McBride (R7)** + **Kyren Williams (R6)**. Only the
  user's keepers are modeled (other teams draft the full board — labeled as such).
  Also added ~17 real deep names to `MOCK_POOL_RAW` (handcuffs/rookies/fliers) so
  rounds 8–11 aren't filler — incl. **Blake Corum** (Kyren's handcuff) placed at
  ~rank 113 (≈ round 10) so he's targetable at the slot-10 user's R9 (#106) / R10
  (#111) picks. NOTE: the added names use consensus-style ranks (sandbox can't
  reach ESPN); the backend `/api/fantasy/football/rankings` endpoint is the
  live-ADP source for the separate auto-filled Draft Board.

- **Fix: Draft Board auto-fill bled into the Baseball view (v130)** — v128's
  auto-fill trigger in `renderFantasyFootball` did
  `autoFillNflBoard().then(() => renderFantasyFootball())` with **no sport guard**.
  Because it resolves async (backend fetch up to 9s, then fallback), if you left
  the Football sub-view for **Baseball** before it resolved, the deferred `.then`
  re-rendered football content back into `#fantasy-football` — repainting the
  football section headings (Team Research / My Draft Board / Prep Tips /
  Offseason Timeline) over the baseball view and hijacking the shared
  `injectJumpNav` chip row (baseball's Waiver Wire / League Analyzer / matchup
  chips got replaced by football ones). Fixed by guarding the deferred re-render
  with `fanState.sport === 'football'`. (Separately: the live-league sections —
  matchup, waivers, opponent, standings, playoffs — render blank whenever the
  Railway backend league sync is unavailable, e.g. expired ESPN
  `espn_s2`/`SWID` cookies or a cold redeploy; Snapshot + Roster still show from
  the local roster. That's backend/cookies, not this bug.)

- **Draft Board auto-fill fallback (v129)** — v128's ⚡ auto-fill added nobody on
  device: it depended entirely on the backend `/api/fantasy/football/rankings`, so
  a backend hiccup (Railway not yet redeployed to `b8-fflranks`, or an ESPN
  fantasy-API parse miss — neither testable from the sandbox) meant an empty result
  and no players. Fixed by giving `autoFillNflBoard` a **client-side fallback**: it
  still prefers ESPN's live ranks via the backend, but when that's unreachable/empty
  it fills from the maintained fantasy `MOCK_POOL` (the ~100-player board already
  used by the Labs Fantasy Mock Draft), tiered per position by `nflTierFor` (mirrors
  the backend's `_ffl_tier`). So auto-fill **never comes up empty** now. The source
  is recorded (`sportshub:fantasy:nflboard:src` `source: 'espn'|'builtin'`) and the
  board's note says which was used ("built-in ranked board (ESPN live ranks weren't
  reachable)" vs "ESPN's real fantasy draft ranks"). Merge is still non-destructive.
  The backend endpoint remains the preferred/fresh source once Railway has the
  `b8-fflranks` build live (confirm via `/api/health` → `version`).

- **Auto-filled fantasy Draft Board (v128, backend `b8-fflranks`)** — the Fantasy
  → Football "My Draft Board" used to be manual-only: you typed every name and set
  every tier yourself, because the browser can't read ESPN's fantasy game API
  (not CORS-open) so there was no ranking source. Added backend endpoint
  **`/api/fantasy/football/rankings?year=&limit=&scoring=`** (`fantasy_football_rankings`
  in `main.py`) — a cookie-less server-side pull of ESPN's REAL fantasy draft ranks
  (`lm-api-reads.fantasy.espn.com/.../players` + `x-fantasy-filter` sorting by
  `sortDraftRanks`), mapped to our board buckets (`FFL_POS`) and **tiered per
  position** (`_ffl_tier`: best few at a position = T1, then T2…T5). Defaults
  `year=2026`, `scoring=PPR` (closest ESPN rank type to the owner's half-PPR), falls
  back to the prior season if the requested year has no ranks yet, cached
  `RANKINGS_TTL_SECONDS`/12h (also cleared by `/api/refresh`). Frontend
  (`autoFillNflBoard` in `app.js`): the board **auto-fills once** when it's empty
  (guarded by `fanState.nflRankTried` so re-renders don't re-fetch) and there's a
  **⚡ Auto-fill ESPN rankings** button + source note (`sportshub:fantasy:nflboard:src`).
  The merge is **non-destructive** — it only adds names you don't already have and
  never overwrites tiers you've edited; if the backend is unreachable the board stays
  manual with an honest note. NOTE: sandbox can't reach ESPN's fantasy API, so the
  endpoint's response shape (kona_player_info `player.draftRanksByRankType` /
  `defaultPositionId`) was coded defensively but must be verified live on device.

- **MLB confidence cap — calibration fix (v127)** — the owner exported their
  graded `sportshub:aitally` and it showed the model was badly overconfident on
  MLB: its 80–84% confidence bucket won only ~22% (2-7), its 90%+ bucket ~73%,
  and it repeatedly called games 92% (Dodgers/Braves) that lost. Straight-up MLB
  was ~54% (51-44) and the vs-line record 7-11 (39%, under the 52.4% break-even).
  A single MLB game tops out ~65–70% even best-vs-worst, so `predictGame`'s final
  `conf` clamp is now per-sport via **`CONF_CAP`** (`{ mlb: 72, default: 92 }`,
  near `MLB_AVG_ERA`) — MLB confidence can no longer exceed 72%. This is the
  honesty guardrail on top of the v126 reweight (which is the actual mechanism
  fix — it compresses the underlying `probHome`, so it also thins the false
  edges). NOTE: the cap only changes the *stated* confidence + report-card
  buckets; edge detection keys off raw `probHome`/`marketGap`, so it's the v126
  reweight, not this cap, that changes which games qualify as edges. Re-export
  the record after ~2 weeks of post-v126 games to measure the reweight's effect
  on fresh data before tuning weights further (don't refit on the pre-v126 sample).

- **MLB model retune + record export (v126)** — the AI Picks model was weighted
  like a football/team-strength model, which fits baseball poorly (pitching
  dominates, home edge is tiny, season record barely predicts one game). Changes,
  all MLB-only (NFL/NBA untouched — they use `MODEL_W.default`):
  - New per-sport weight table **`MODEL_W`** (near `PD_SCALE`) read in
    `predictGame` as `w`. MLB weights vs the old shared values: **Record 1.1→0.6**
    (weak game-level signal, was double-counting with scoring margin), **Home edge
    0.28→0.12** (real MLB home win rate ~52–53%; the old value implied ~57%),
    **Home/road split 1.0→0.7**; Scoring margin/Recent form weights unchanged but
    **`PD_SCALE.mlb` 1.3→2.2** so a big run-differential gap no longer rockets a
    game to ~80%. All three `add('Home field', …)` spots + the limited-data branch
    now use `w.homeEdge`.
  - **Starting pitching weighted up** in `matchupFactor` (MLB is pitcher-driven):
    `Starting pitcher` factor **0.24→0.42**, `SP recent form` **0.12→0.18**,
    `Lineup OPS` **0.18→0.20**. A real ERA edge now outweighs the home tick.
  - **Pitcher-aware projected total** — `projTotal` was purely the four teams'
    season scoring rates (ignored who's pitching, so two aces still projected a
    league-average total → junk totals edges). `matchupFactor` now returns
    `starters:{hERA,aERA}`; `predictGame` nudges the MLB total by
    `((hERA−AVG)+(aERA−AVG))×0.6` (each starter ~0.6 run of the 9 innings), anchor
    `MLB_AVG_ERA=4.10`, clamped 4–20.
  - **📋 Record export** — the Model Report Card (`reportCard`) gained a "Copy my
    record data" button that copies the raw `sportshub:aitally` JSON to the
    clipboard (falls back to a reveal-and-select `<textarea>` if the clipboard API
    is blocked). This is how the on-device graded record gets off the phone for
    calibration analysis — localStorage never leaves the device otherwise.
  NOTE: weights are a principled first pass, not fit to data — the export button
  is step one of a data-driven retune. Verify pick behavior on device.

- **Removed the World Cup / soccer entirely (v125)** — the 2026 FIFA World Cup is
  over, so the whole soccer league was pulled out (owner request). Gone: the
  `soccer` entry in `LEAGUES`/`SEASON_MONTHS`/`BASE_ORDER`; the Home **World Cup
  Bracket** (`#home-wc`, `renderWCBracket`, `WC_ROUNDS`, `wcRoundOf`/`wcMatchObj`/
  `wcMatchHTML`/`wcWinSide`/`wcTeamObj`/`etYmd`, and all `.wc-*` bracket CSS —
  the wild-card `.wc-in`/`tr.wc-cut` classes are unrelated and stay); the soccer
  live panel (`soccerSituation` + `.poss-*` CSS); the neutral-site "vs" logic and
  `WC_HOSTS`/`isWorldCupHost`; and every soccer entry in the model/odds constants
  (`PD_SCALE`, `TOT_EDGE_MIN`, `TOTALS`) and the soccer branch in `predictGame`
  and `matchupLabel`. About-tab + README + `<meta>` copy updated to "NFL, NBA and
  MLB". Since soccer here only ever meant the World Cup, nothing soccer-related
  remains — re-add a `LEAGUES.soccer` entry to bring a competition back.

- **Depth-chart Field view — defensive rows (v124)** — the Eagles depth chart's
  Field formation view laid the defense out with corners + nickel jammed into the
  same middle row as the linebackers (a 7-wide row). `FIELD_ROWS.defense` now reads
  bottom→top as **3-4-4**: D-line on the bottom, the four linebackers
  (WLB/LILB/RILB/SLB) in the middle, and the secondary on top with the **corners
  flanking the safeties** (LCB … FS SS … RCB), `FIELD_ORDER` retuned so they sort
  L→R. A **nickel back** (`NB`) sits in the secondary row, so ESPN nickel personnel
  shows that row as 5 (base 3-4 shows a clean 4).

- **Playoff Predictor light-theme contrast** (v123) — `renderPlayoffs`' inline row
  styles hardcoded dark-mode colors (near-white `#e8efed` team names, `rgba(255,255,255,…)`
  borders/track) that were nearly invisible on the light theme's paper background. Switched
  to theme vars (`var(--text)`, `var(--line)`, `var(--muted)`, `var(--accent)`), a
  grey-on-both progress track (`rgba(128,128,128,.22)`), and a gold cut line/`you` highlight
  that read in both themes. Dark mode is visually unchanged.

- **Eagles/Red Sox hero parity** (v122) — both team heroes use the exact same
  `heroFormChips` + `injectHeroLastGame`, so they show the identical six chips
  (label differs only "Pt Diff" vs "Run Diff"). The Eagles just render fewer in
  the NFL offseason (no current-season games → no streak/splits/diff/last game).
  v122 also gates BOTH schedule chips (Last game + Last 10) on the same 15-day
  recency of the most recent completed game, so an offseason team never shows a
  stale partial subset (previously Last 10 had no recency gate).

- **Team-hero quick-form chips** (`heroFormChips` + `injectHeroLastGame`, v117–v119)
  — the Eagles + Red Sox hero cards used to end with a "Next:" game line that just
  duplicated the Next Game/Next Opponent section right below. That line is replaced
  by a row of compact **form stat chips** (`.hero-chips`/`.hero-chip`) pulled from
  the ESPN team object's `record.items`: current **Streak**, **Home**/**Away**
  split, **Last 10** (MLB), and **Run/Point Diff**, plus a **Last game** chip
  (`W 5-3 · vs OPP`, W green / L red) injected async from the team schedule
  (`injectHeroLastGame`, cached same URL as the Schedule section; skipped when the
  last completed game is >15 days old so an offseason team shows nothing stale).
  **v118 data fixes:** Streak derives its W/L prefix from the stat's signed `value`
  when ESPN sends a bare number (so it's `L9`, not `9`); Run/Point Diff prefers
  `pointsFor − pointsAgainst` and, when ESPN only gives the *per-game average*
  `differential` (e.g. `0.2999…`), converts it to a rounded season total via games
  played (so it reads `+28`, not `+0.2999999999999998`). Only chips with data
  render, so a preseason 0-0 team just shows name + record + standing. Shared by
  both team heroes. **v119:** the **Last 10** chip is now computed from the
  schedule too (appended as the LAST card by `injectHeroLastGame` — ESPN's team
  object doesn't reliably carry a "last ten" record item, so the old record-item
  path was dropped from `heroFormChips`). **v121:** chips are sorted into a fixed
  left-to-right order (`HERO_CHIP_ORDER`/`orderHeroChips`, applied after the async
  schedule chips land): **Last game · Streak · Last 10 · Home · Away · Run/Pt Diff**.

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
  Sport paths: `football/nfl`, `baseball/mlb`, `basketball/nba`, `golf/pga`.
  (Soccer / FIFA World Cup was removed in v125 once the 2026 Cup ended — the app
  no longer tracks any soccer competition.)
- `fetchJSON(url, ttl)` — in-memory cache by URL with TTL; 9s abort. All data goes through it.
- `LEAGUES` — per-sport config (label, emoji, espnPath, `fav` favorite teams, type).
  **Favorites are Eagles + Red Sox only** (NOT Phillies/Sixers).
- Tabs: Home, Eagles, **🏈 NFL** (league-wide lens, v145), **Red Sox**, AI Picks, Fantasy, **Labs**, About. `showTab()` +
  `renderers{}` map drive rendering. (**Labs** — its own top-level tab as of
  v107, holding the Labs experiments: the standalone `draft.html`/`trivia.html`/
  `workout.html` links plus the in-app **Fantasy Mock Draft** rendered into `#labs-mock`; its
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
  still live on the AI Picks tab.) (A **🏆 World Cup Bracket** lived below Today's
  Games from v82 until the 2026 Cup ended; **v125 removed it and the entire soccer
  league** — the bracket, its `#home-wc`/`renderWCBracket`/`WC_ROUNDS`/`.wc-*`
  code, the soccer live-situation panel, and every soccer branch in the model /
  odds constants. Soccer here only ever meant the World Cup, so nothing
  soccer-related remains. Re-add a `soccer` entry to `LEAGUES` if a future
  competition should be tracked.)
- **Red Sox tab** (⚾, v114) — an MLB deep-dive mirroring the Eagles tab
  (`renderRedSox` + `renderRedSox*` sub-renderers; `REDSOX={teamId:2}`, ESPN MLB
  id for BOS): hero (record/standing/next game, ⚾ watermark via
  `.featured-card.rs-hero::after`), curated jump-nav, Next Game, Latest News
  (tap → in-app summary), Team Stats & Rankings (batting+pitching from `BBCORE`
  statistics, ranked), Schedule & Results (windowed to last ~6 + next ~8 with a
  recent W/L trend), Roster (**pitching staff laid out as Starting Rotation →
  Bullpen → Closer, then Catchers/Infielders/Outfielders/DH** — `renderRedSoxRoster`,
  v120; pitcher roles from ESPN's position label, rotation ORDER + closer refined
  via the season Games-Started / Saves leaders, a cache hit on the Leaders feed;
  degrades to a single "Pitchers" group when no role data exists), Team
  Leaders (`BBCORE` leaders — the feed gives athletes as `$ref` only, so
  `renderRedSoxLeaders` resolves names from the roster map and **fetches any
  missing `$ref`**, v116, so rows don't fall back to "—"), By the Numbers, Manager
  (`REDSOX.manager` — was Alex Cora, now fired; bump when the replacement is
  known). Curated
  nav so `injectJumpNav` skips it (like Eagles). **Standings + Playoff Outlook
  (v115, on BOTH the Eagles and Red Sox tabs)** — `renderStandingsBlock(sport,
  teamName, standSel, poSel)` renders the team's **division standings** table
  (real ESPN `getStandings`, W/L/PCT/GB, team row highlighted) and a **Playoff
  Outlook** card (`playoffOutlook`): a **pace-based** read (projected final record
  from current win% over `SEASON_GAMES`, division-lead vs wild-card position with
  games ahead/back of the cut, in/out of the field). **v116:** when the team is
  NOT its division leader (so the wild card is its path), the outlook also renders
  a **Wild Card race** table (`o.wildPool`/`o.wc`) — top teams with WC1/WC2… badges,
  a dashed cut line (`tr.wc-cut`), and WCGB vs the last wild-card spot. Clearly
  labeled "not official odds" — ESPN's free feed has no playoff-probability endpoint. Reuses
  the Eagles CSS
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
  count/outs/pitcher/batter; NFL field-position bar w/ red zone; others last
  play), then **Betting Odds** (model-vs-market
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
    `sportshub:fantasy:nflboard`). **v128: auto-filled from real ESPN fantasy
    draft ranks** — `autoFillNflBoard` pulls the backend
    `/api/fantasy/football/rankings` (positionally tiered) and fills the board
    once when it's empty (guard `fanState.nflRankTried`), plus a **⚡ Auto-fill
    ESPN rankings** button + source note (`sportshub:fantasy:nflboard:src`). The
    merge is **non-destructive** (adds only missing names, never overwrites your
    edited tiers); backend down → board stays manual with an honest note. And
    evergreen prep
    tips. Section order (v113): Team Research → My Draft Board → Prep Tips →
    **Offseason Timeline (last)**. `renderFantasy` hides the baseball wrapper (`#fantasy-live`) and returns
    early for football; `injectJumpNav` now skips hidden headings so the hidden
    baseball sections don't produce dead chips. The **live** football league
    view (points-based matchup/standings/roster/waivers) is **built as of v135**
    (`renderFootballLive`) and shows when `cfg.football === true`; this prep view
    is the pre-league / "Draft Tools" mode (toggle between them). The Labs rookie
    **Mock Draft Simulator** is a different thing (real NFL draft of incoming rookies).
  - **🏈 Fantasy Mock Draft** (v100; moved out of the Fantasy tab in v106; the
    **Labs tab** became its own top-level tab in v107) — a client-side snake
    draft vs CPU GMs. Launched from the Labs tab
    (`#labs-mock-start`) and rendered into `#labs-mock` (`renderMockDraft`;
    `closeMockDraft` clears it; state in `fanState.mock`, `.mk-*`/`.mock-*` CSS).
    Setup (teams/your slot/rounds + a **keeper toggle**; **defaults to 12 teams,
    slot 10, 15 rounds** with the owner's keepers on — see the v131 note) → draft room
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

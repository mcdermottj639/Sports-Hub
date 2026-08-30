# CLAUDE.md — Sports-Hub

Guidance for Claude (and humans) working on this repo. Read this first.

> ## ⚠️ Standing rule: keep this file current
> Whenever you change the architecture, build/deploy pipeline, data model, or
> add/remove a feature, **update the relevant section of this file in the SAME
> change** (same commit). Future sessions rely on this file being accurate —
> don't wait to be asked. When you bump `APP_VERSION`, also update the
> "Current version" line below if it's drifted.

> ## 🧮 Before you touch ANY model constant
> Several model fixes are shipped but not yet verified against results. There
> is a checklist of exactly what to read, where, and what "it worked" looks
> like — search this file for **"⏳ Open measurements"** (it sits below the
> "Current version" line and the changelog entries under it). The rule that section enforces is the
> one this repo has followed since v126: **measure, then fit — and never refit
> on a sample the change itself produced.**

## What this is

**Sports-Hub** is a personal, multi-sport web app for the owner (a Philadelphia
Eagles superfan; also follows Red Sox, NFL, **college football (Top 25)**, MLB,
NBA, and golf). It's a **pure
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
> `/api/articles/{sport}` (nfl → **FantasyPros articles**, see v155 — server-side
> scrape because fantasypros.com sends no CORS headers; cached
> `ARTICLES_TTL_SECONDS`/30m, stdlib-only, self-diagnosing with `?debug=1`),
> `/api/refresh` (also clears the VSiN + articles caches).
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
  Holds `#live-rail` (above the masthead), the icon-over-label tab rail, and
  `#home-board` (🎲 The Board, between My Teams and Today's Games).
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
  - **No-zoom on iPhone (wk v3)** — the owner reported the page zooming in (and
    staying zoomed) whenever they typed a weight or tapped a set chip. Two separate
    iOS Safari behaviors, both fixed in `workout.css`: (a) **focus zoom** — Safari
    zooms the viewport whenever you focus an input whose `font-size` is **under
    16px**, and never zooms back out. `.wk-load input` was `14px`; it's now **16px**
    (width 68→74px to keep 3 digits comfortable) with a comment saying it must stay
    ≥16px. (b) **double-tap zoom** — tapping set chips in a rhythm reads as
    double-tap-to-zoom, so `touch-action: manipulation` is set on every
    `button`/`input`/`select`/`label`/`summary`/`a` under `.wk-body`, which kills
    the double-tap gesture while **leaving pinch-zoom intact** (the viewport meta
    is deliberately NOT locked with `user-scalable=no` — that breaks accessibility).
    Plus `-webkit-text-size-adjust: 100%` on the body. **When adding any new input
    to this page, keep it at 16px+.**
  - **Shareable plan view (wk v4)** — the owner wanted to send a day's session to
    someone who wants to do the workout. The plan screen (`showPlan`) now carries a
    **📤 Share this workout** / **📋 Copy as text** pair (`.wk-share` CSS), and the
    whole SHARING section of `workout.js` sits just above the plan view. Two routes,
    because they suit different recipients:
    - **A link** — `workout.html#plan=<key>` (`planURL`). The program is baked into
      the page, so the link is just a bookmark to a screen: no data is encoded in it,
      nothing personal travels with it, and the recipient's own logs stay in their own
      localStorage. Works for the three days AND the four `ADDONS`. `navigator.share`
      opens the native iOS share sheet (Messages/Mail/AirDrop); no share sheet →
      clipboard + a toast; clipboard blocked too → the text is dropped into a
      pre-selected `<textarea>` (`shareFallback`, 16px per the iOS zoom rule).
      `AbortError`/`NotAllowedError` from a cancelled sheet are swallowed, not
      treated as failures.
    - **Plain text** (`planText`) — the entire session written out (~4.1k chars for
      Day 1): title, focus, warm-up, every block with its style/rounds/rest, each
      exercise with reps + full form cue + equipment swaps, gap-fix "why", cooldown,
      and the link back at the bottom. For anyone who'd rather read it in a message.
    - **Routing:** `route()` runs at boot and on `hashchange`; an unknown day falls
      back to home. The address bar tracks the plan view via `setHash`, which uses
      **`history.replaceState`** deliberately — the back button should leave the page,
      not walk back through screens (so Safari's own share button also yields the
      right URL). `show()` clears the hash for every non-plan screen.
    - **Recipient orientation:** opening a shared link sets `SHARED_KEY`, which paints
      a one-time green "📬 Someone shared this workout with you" banner (`.wk-shared`)
      and relabels Back as "☰ See the full 3-day program". Cleared on `showHome`, so
      the owner never sees it and it doesn't come back on a later visit to the plan.
    - Verified end-to-end in headless Chromium at 390px in BOTH themes (62 checks):
      owner share, share-sheet payload, text contents, clipboard fallback,
      everything-blocked fallback, recipient deep link → banner → guided session →
      finish → save, junk hash, add-on links, no history spam, no console errors.
  - localStorage: `workoutlab:log` (sessions), `workoutlab:last` (load per exercise id,
    `day.blockIdN`), `workoutlab:prefs` (`unit` lb/kg, `autoRest`, `sound`, `vis`).
  - Themed via the shared `styles.css` vars **and** the `<head>` theme script, so unlike
    `draft.html`/`trivia.html` it renders correctly in BOTH light and dark. Standalone, so
    NOT part of the `APP_VERSION`/`?v=` ritual — but bump `workout.css`/`workout.js` `?v=`
    in `workout.html` on changes (currently **v4**), and its `styles.css?v=` (now 143) if
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

Current version as of this writing: **v175** (backend **b13-pregame-lines**).

- **🚨 Kept players were being auto-filled onto the Draft Board (v174)** — the
  owner asked why Chase Brown, a rival's R6 keeper, was sitting on their draft
  board. **`autoFillNflBoard` had no keeper filter at all.** It shipped in v128,
  ten versions before `LEAGUE_KEEPERS` existed (v148), and was never taught the
  rule that the ⭐ turn-target merge and the player modal's Draft Plans card
  (v158) both already follow. So every auto-fill — live ESPN ranks or the
  built-in fallback alike — seeded **all 22 kept players** onto the board.
  Measured on the fallback path: `kept=22`, i.e. every keeper in the league was
  being added.
  - **The filter goes at the MERGE point, not inside either source.** Both
    `nflFallbackRanks()` and the backend's ranking payload flow through the same
    loop in `autoFillNflBoard`, so one `keptEntry(p.name)` guard covers both and
    the two paths cannot drift apart.
  - **The owner's OWN keepers are filtered too** (McBride, Maye). The board is
    the list of players to DRAFT; a keeper never enters the draft regardless of
    who holds him. This matches what the v158 Draft Plans card already told the
    user at the player level.
  - **`pruneKeptFromBoard()` cleans boards the bug already polluted.** The bad
    names are in the owner's `localStorage`, so fixing the writer alone would
    have left them there forever. It runs from `renderFantasyFootball` (a no-op
    once clean, and it must run on render rather than once at boot because the
    board is also hand-editable), and the board note **names the players it
    removed** — a list that silently shrinks under the owner is worse than the
    bug.
  - **Non-destructive as before:** hand-added names the ranks don't know are
    untouched, and tiers the owner edited are never clobbered.
  - Verified against the real functions with a stubbed `localStorage` —
    **12 checks**: fresh auto-fill adds no keeper while still adding normal
    players, Chase Brown specifically absent, the owner's own keeper excluded,
    prune removing exactly the kept rows and being idempotent, a hand-typed
    name surviving, and an edited tier surviving an auto-fill. The v173
    300-draft sim (54,000 picks) still passes clean.
  - **Lesson for the next keeper-aware feature:** `LEAGUE_KEEPERS` now has FOUR
    consumers (turn-plan strikeouts, the mock sim pool, the Draft Plans card,
    the board auto-fill). Anything new that produces a list of draftable players
    must call `keptEntry` — grep for it before shipping.

- **🔒 Keeper sheet closed + 24 stale pro teams fixed (v173)** — the owner sent
  the commissioner's FINAL keeper sheet and reported (a) kept players still
  showing up in mock drafts and (b) "lots of players on wrong teams".
  - **One keeper was genuinely missing: Chris Olave (Samrizz, R5).** Every other
    row on the sheet already matched `LEAGUE_KEEPERS` exactly — all 11 other
    teams, both slots, every round. `LEAGUE_KEEPERS` is now **22** players.
    That single omission is the whole of the "names still in the pool" report:
    a keeper absent from the list is never pulled off the board, so Olave was
    draftable by any CPU team in every sim.
  - **24 team labels in `MOCK_POOL_RAW` were stale**, verified division by
    division (8 parallel subagents, one per NFL division, working from web
    search since the sandbox can't reach ESPN or any fantasy site). The
    headline moves: **A.J. Brown PHI → NE** (traded for a 2028 1st; he is an R1
    target in `TURN_ROUNDS`), **Rachaad White TB → WSH** (he is a *keeper*, so
    his label was wrong on the keepers card), **Tua Tagovailoa MIA → ATL**,
    **David Montgomery DET → HOU**, **Geno Smith LV → NYJ** with **Justin
    Fields NYJ → KC** (the same trade, cross-checked by two independent
    agents), plus Jakobi Meyers→JAX, Keenan Allen→IND, Najee Harris→NYG,
    Isiah Pacheco→DET, Jonnu Smith→GB, Chig Okonkwo→WSH, Christian Kirk→SF,
    Jauan Jennings→MIN, Jarquez Hunter→MIA, Rashid Shaheed→SEA, Darnell
    Mooney→NYG, Wan'Dale Robinson→TEN, Brian Robinson Jr.→ATL, Romeo Doubs→NE,
    Dontayvion Wicks→PHI, Emanuel Wilson→SEA, Younghoe Koo→NYJ, Jason
    Sanders→NYG.
  - **⚠️ Agent output is a lead, not a fact.** One agent blanket-confirmed
    "Tua Tagovailoa MIA" as correct off a stale depth-chart snippet while
    another agent, working a different division, reported Atlanta had acquired
    him. A direct search settled it (ATL). **When two divisions disagree about
    a player, or an agent confirms by omission rather than by evidence, verify
    it yourself before writing it in.** The A.J. Brown move was likewise
    re-checked directly because it changes an R1 target.
  - **3 players removed from the board** — undraftable, so offering them is
    worse than leaving a stale label: **Nick Chubb** (retired Aug 21 2026),
    **Jayden Higgins** (torn ACL, out for 2026), **Ricky Pearsall**
    (season-ending PCL surgery, Aug 1). Pool 227 → **224**, still well clear of
    the 180 picks a 12×15 draft needs.
  - **4 unsigned free agents relabelled `FA`** rather than deleted — **Stefon
    Diggs, Deebo Samuel, Austin Ekeler, Zach Ertz**. They have no 2026 team but
    could still sign, so they stay draftable with an honest label. The team
    string is display-only, so `FA` is safe (it is already what the generated
    filler players use).
  - **The Draft-Turn Plan's R6 group was stale as a consequence** — it listed
    Deebo Samuel and Brian Robinson Jr. as "100% available" targets. Deebo has
    no team and B-Rob is now Bijan's backup in Atlanta, so both were swapped for
    **Jaylen Warren** and **Jayden Reed** and the note says why. The rest of
    `TURN_ROUNDS` was deliberately left alone: its availability percentages come
    from measured sims (v156) and re-planning was not the ask.
  - Verified by driving the REAL `mockStart`/`mockSimRest` out of `app.js`
    across **300 full 12×15 drafts = 54,000 picks**: **0 duplicate picks, 0
    filler picks, 0 kept players ever drafted**, and all **6,600** keeper
    placements landing at the correct manager AND round.
  - ⚠️ Still unverified live: the sandbox reaches web *search* but not ESPN, so
    these are search-snippet confirmations. Spot-check the board on device.

- **🖥️ Desktop layout + collapse-all + mouse-reachable nav (v175)** — the owner
  uses the app on a PC as well as the phone, and two things were phone-only by
  construction:
  - **The tab rail was a horizontal scroller with no way to scroll it.** v163
    made `.tabs` one `overflow-x: auto` line, which a thumb swipes but a mouse
    cannot. On desktop (`min-width: 700px`) it now **wraps to a centered block**
    — there is room for all nine tabs, so scrolling isn't needed at all. And
    `wheelScrollsSideways('.tabs, .live-rail, .rail-leagues')` maps a plain
    vertical wheel to horizontal scroll on the three rails that still scroll,
    so a trackpad works without holding shift.
  - **AI Picks and The Board were one 1500px-wide column.** At `min-width:
    860px` both become a **two-column grid** (`.brd-card` children side by
    side; everything else spans `1 / -1`), the backtest cards reflow with
    `auto-fit`, and prose/notes are capped at 760px so a sentence doesn't run
    the whole width. `.ai-flow { display: block }` is the mobile base so the
    grid only ever exists on desktop.
  - **Collapse all / Expand all** button (`.sec-all`) in AI Picks — the ladder
    is long and the owner wanted one control instead of nine chevrons. It
    writes through `setSecState`, so its result persists like a manual toggle.
  - ⚠️ **Layout test lesson:** the first cut asserted every non-card element was
    full *width*, which failed on the deliberately capped prose. The real
    signature of "parked in a column" is the **left-edge offset**, not the
    width — assert the thing you actually mean.
  - Verified in headless Chromium at 390px and 1280px in both themes —
    **32 checks** on the desktop layout plus the existing 105/53/44/40/16/10/14
    suites still green.

## ⏳ Open measurements — read these BEFORE touching model constants

Several fixes are shipped but **unverified against results**, because the data
that would verify them didn't exist when they shipped. The repo's method is
*measure, then fit* — and never refit on a sample the change itself produced.
So: let the games run, hit **📋 Copy my record data** (AI Picks → Model Report
Card), and read the numbers below before changing any weight.

**Earliest useful re-read: ~14 September 2026** (two weeks of games after the
v171 fixes shipped on 30 Aug). Sooner than that and every split is noise.
Each row's full reasoning is in the version entry it names — this table is the
index, not the argument.

> **This is already scheduled — nobody has to remember it.** A one-shot Routine
> (`trig_01MpcJyXPQSzJcTiDYL1j9Ns`, "Sports-Hub: re-read the model record
> (v171 fixes)") fires **14 Sep 2026 13:00 UTC** into a fresh session, with
> push + email notification. It carries this checklist in its prompt and knows
> to ask the owner for the export first. **The record lives in localStorage on
> the owner's phone, so no session can read it unaided** — the export button is
> the only way it ever gets off the device. If you re-run this analysis
> earlier, cancel or re-date that Routine so it doesn't ask twice.

| # | What to read | Where | Ships as fixed? | What "it worked" looks like |
|---|---|---|---|---|
| 1 | **Model total vs the book** | Report Card → Totals (the *all priced games* row, not the picks-only one) | v171 `MLB_SP_ERA` 4.10→4.30 | near **0.00 runs**. Still ~+0.3 → the anchor needs more. |
| 2 | **OVER / UNDER split** | same section | same fix | moves off **74% OVER** toward even. It was 73% at v159 and 74% at v170 — park factors did NOT fix it. |
| 3 | **50–54% bucket, home vs away** | export, split by side | v171 `HR_GAP` + `homeEdge` 0.12→0.24 | away picks stop going **6-14 (30%)**. This is what pointed at both v171 bugs. |
| 4 | **Overall calibration gap** | Report Card → By confidence | v171 | better than **−6.1** at n=109, and the buckets become *ordered* (they are not today: 50–54 wins 27.8%, 55–59 wins 75%). |
| 5 | **Record by tier** | Backtesting → Record by tier | v164 stored `gp`/`tr` | reads a real W-L instead of "collecting". **Do not touch `EDGE_BAR` before this has ~20 graded picks.** |
| 6 | **ATS record** | Backtesting → by sport | v171 fixed grading (`:s` was never stripped, so ATS never graded at all) | any non-zero number. `PD_SD` (13.5/16.5) and `ATS_EDGE_MIN` (2/3) are guesses and are the first things to re-fit. |
| 7 | **Sharp money split** | Report Card → 💰 Sharp money | v160 stored `sh` | 20+ graded picks. At the v170 export there were **3**. Nothing to conclude until then. |

**Known and deliberately NOT fixed:**
- **`MIN_EDGE_GAP`** — edges are **18-21 (46.2%)** all-time, under the 52.4%
  break-even, and that is now two independent samples (v159: 44.7%). Still not
  enough to move the bar on: the fix is to find out *why*, not to raise the
  threshold and hope.
- **CFB carries the same shrink mismatch v171 fixed for MLB** — `homeEdge` 0.42
  × `MODEL_SHRINK.cfb` 0.8 = an effective **58.3%**, not the ~60% its comment
  claims. Left alone because there are **zero graded CFB results**. Fix it the
  same way MLB's was — from a sample, not from the comment.
- **7 soccer entries** (World Cup, league removed in v125) still count toward
  the all-time headline record.


- **🚨 Desktop layout — AI Picks was scattering itself across columns (v173)** —
  the owner sent a photo of the app on a PC: a narrow strip of content with
  three columns of whitespace beside it. Root cause: **`#ai-picks` carried
  `class="games-grid"`** (`repeat(auto-fill, minmax(250px, 1fr))`), a grid built
  for game cards. That was fine when the tab WAS a grid of cards, but v164 made
  it a ladder — heading, note, cards, panel, read top to bottom — and a
  multi-column grid drops those into whatever cell comes next. A section
  heading landed in column 2 while its cards landed in column 4.
  - `#ai-picks` is now `.ai-flow`: a plain block on phones, and on **≥860px** a
    two-column grid where **only `.brd-card` sits in a column** — everything
    else (`grid-column: 1 / -1`) spans, so a heading can never be separated
    from the cards it introduces. `#home-board` gets the same treatment, which
    turns The Board into an actual two-across board instead of full-width
    strips with one line of text in each.
  - `.bt-wrap` becomes `auto-fit, minmax(300px, 1fr)` on desktop, so the three
    backtest cards sit side by side rather than stacking as wide thin bands.
  - Long prose (`.brd-note`, `.ai-note`) is capped at **760px** — a 940px line
    of body text is past comfortable reading length.
  - **Phone layout is untouched** — every rule is behind `min-width: 860px`,
    and the suite asserts cards stay full width at 390px.
  - ⚠️ **The test that matters checks the LEFT EDGE, not the width.** The first
    version asserted every non-card element was as wide as the container, which
    failed on the deliberately capped prose. What actually indicates the bug is
    an element *parked in a second column*, i.e. offset from the container's
    left edge.
  - Verified — **32 checks** at 1440/1024/760/420/390px: no heading or note
    offset into a column, cards two-across on desktop and full width on a
    phone, the first heading preceding the first card, `#ai-picks` no longer
    carrying `games-grid`, plus the existing desktop-nav checks.

- **Collapse-all + desktop nav (v172)** — two usability gaps the owner hit:
  - **⌄ Expand all / ⌃ Collapse all on AI Picks.** The tab is a long ladder and
    v166 folds most of it by default, so opening (or closing) it a section at a
    time was tedious. `wireSectionToggle(panel)` runs from `applySections`, so
    the label is derived from the CURRENT open/closed count on every render —
    the AI tab rebuilds its sections constantly (async trends, a sport change),
    and a remembered label would go stale. The action is whatever is not
    already true of every section, so one tap always changes something and a
    half-open tab has an unambiguous next step. Each section is set with
    `persist:true`, so a bulk choice survives exactly like an individual tap.
    **A tab opts in just by having a `.sec-all` button in its markup** — there
    is no list to keep in sync. Hidden below 2 sections.
  - **🚨 On a PC the tab rail was partly unreachable.** v163 made it a
    one-line horizontal scroller with `scrollbar-width: none` — fine on a phone
    (swipe), broken with a mouse: no sideways gesture, no visible scrollbar, so
    Fantasy/Labs/About simply could not be reached. Two fixes: **above 700px
    the rail wraps** (`flex-wrap: wrap`, no overflow) so nothing is ever
    off-screen — wrapping rather than a wider single line means it can't cut
    off whatever the labels or font do — and **`wheelScrollsSideways()`**
    translates a vertical wheel into horizontal scrolling on `.tabs`,
    `.live-rail` and `.rail-leagues` for narrow desktop windows. It only claims
    the gesture while the rail actually overflows AND the scroll actually
    moved, so a trackpad's real horizontal swipe still works and the page keeps
    scrolling once the rail hits its end.
  - Verified — **33 checks**: the toggle (expand → collapse → expand, the label
    flipping, aria-expanded, persistence across a tab switch and a reload, the
    half-open case, and no stray control on other tabs) and desktop nav at
    1280/1024/760px (no overflow, no tab cut off, the LAST tab clickable) plus
    a 420px window where the wheel scrolls the rail and is not swallowed at
    the end.

- **🚨 Two model bugs found by measuring, not guessing (v171)** — the owner
  asked to fix the totals OVER bias and to work out why low-confidence picks
  lose. Both traced to concrete errors, neither to a weight that needed taste:
  - **`MLB_AVG_ERA` was a starter anchor set to the LEAGUE figure.** The comment
    said "league-average starter ERA"; the value 4.10 is the league-wide ERA,
    which includes relievers and runs lower than starters'. So every game got a
    spurious `(0.2 + 0.2) × 0.6 = +0.24` runs. Renamed **`MLB_SP_ERA = 4.30`**.
    Sizing check from the export: 32 of 43 totals picks OVER is **p = 0.0019**
    against 50/50, and inverting that split for a normal proj−line error gives
    a bias of **+0.28 to +0.40 runs** at sd 1.0–1.25 — the same order this
    error produces.
  - **🚨 Home field was broken twice over, and the second one is the lesson.**
    (a) Once both teams had 10+ home/road games `shrink` hit 1 and the generic
    home edge was **dropped entirely**, leaving only `w.split × (homeWP −
    roadWP)`. But that raw difference IS the league's own home/road gap for an
    average pair, so it delivered **51.0%** where MLB home teams win ~53%.
    Fixed with **`HR_GAP`** (mlb 0.06): the split is centred on the typical gap
    so it measures the pairing's deviation, and the home edge always applies.
    (b) The test then showed **51.5%, not 53%** — because **`MODEL_SHRINK.mlb`
    (0.5, v138) multiplies the whole factor sum**, halving a `homeEdge` that
    v126 had calibrated to exactly 53% *before the shrink existed*. Two changes,
    each right on its own, silently cancelling across sessions. `homeEdge` is
    now **0.24** so the POST-shrink figure is the intended 53%.
    **Every weight in `MODEL_W` is a pre-shrink coefficient — a note now says
    so in both places.** CFB has the same mismatch (0.42 → an effective 58.3%,
    not the ~60% its comment claims) and is deliberately left alone: no graded
    CFB results yet.
  - **What the record showed:** in the 50–54% bucket, AWAY picks went **6-14
    (30%)** while home picks went 7-6. That is the signature of an
    under-weighted home edge, and it is what pointed at both bugs.
  - **🚨 ATS picks never graded (v164 regression, mine).** `gradePending`
    stripped only `:t`, so a `:s` ATS entry looked up a game id that doesn't
    exist, silently failed, and was purged at the 14-day cutoff. The live path
    in `renderPredictions` graded them fine, which is exactly why the tests
    missed it — they exercised the wrong path. Now strips `/:(t|s)$/`.
  - **🚨 The bias instrument was measuring the threshold, not the model.**
    v159's `pt` is stored only on graded totals PICKS, and a pick exists only
    when |proj − line| already cleared `TOT_EDGE_MIN` — a truncated sample that
    overstates the skew by construction. New **`recordTotalBias`** samples every
    priced MLB game (one per game id, 30-day purge, `sportshub:totbias`) and
    `totalBiasStats()` feeds an honest row in the report card, with the old
    picks-only figure relabelled beside it. **Next session: read that number to
    see whether `MLB_SP_ERA` fixed it.**
  - Verified — **10 checks**: two identical average teams pricing at 53.0% (the
    quantitative assertion that caught the shrink interaction), the home-field
    factor surviving a full sample, the bias recorder deduping by game and
    ignoring junk, and both market suffixes stripping to a game id.

- **🚨 Record re-read at n=433 — the v159 calibration conclusion did NOT hold
  (v170)** — the owner exported the live tally again. What it says, and the
  correction it forces:
  - **v159 recorded that post-v138 picks were nearly calibrated** (gap −2.2,
    Brier .2311 beating a .2400 base-rate baseline) on **n=80**. At **n=109**
    that is gone: post-v138 MLB is **56.0% actual vs 62.0% claimed (−6.1)**,
    Brier **.2435** against an always-56% baseline of **.2464** — statistically
    indistinguishable from quoting a constant. **The shrink helped (pre-v127
    was −24.6) but the model is still overconfident, and v159's read was an
    artefact of a smaller sample.** Do not cite it.
  - **Confidence is not ordered.** Post-v138, by bucket: 50–54% wins **27.8%**
    (5-13), 55–59% wins **75%**, 60–64% wins **45.5%**, 65–72% wins **68.4%**.
    Higher confidence does not mean more likely to win. Per-bucket n is 18–38 so
    individual rows are noisy, but the least-confident bucket losing 5-13 is a
    real signal that near-even games carry a systematic bias worth finding.
  - **Headline vs reality:** all-time reads 241-149 (61.8%), but **130 of those
    are unlabelled legacy entries** that went 94-36 (72.3%) under the old leaky
    `teamProfile`. The honest MLB number is **143-111 (56.3%)**.
  - **Edges: 18-21 (46.2%)**, still under the 52.4% break-even, consistent with
    v159's 44.7% at a larger n. `MIN_EDGE_GAP` still should not be touched on
    this evidence — but it is now two independent samples saying the same thing.
  - **🚨 The OVER bias is UNFIXED.** Totals are 20-23 with **74% of picks OVER**
    (32 of 43) — essentially unchanged from v159's 73%, so v138's `MLB_PARK`
    did not solve it. The standing hypothesis remains the best lead:
    `MLB_AVG_ERA` is a hardcoded 4.10 league anchor, but the ERAs compared
    against it are STARTERS' ERAs, whose population mean sits above league
    average — so `matchupFactor` adds runs on average instead of centring.
  - **Sharp money: 3 graded picks.** Nothing to conclude; the factor is still
    unmeasured.
  - **NFL: ZERO entries in the whole record**, which is why `clearNflPreseason`
    is preventive rather than corrective — it removes nothing today.
  - **7 soccer entries** still count toward the all-time headline even though
    the league was removed in v125.

- **🏈 NFL preseason cleared from the record (v170)** — owner ask: make sure
  preseason doesn't count before Week 1. Audit first, because most of it was
  already right:
  - **The model was already clean.** `teamProfile` drops preseason games
    (`isPreseasonEv`, v145), AI Picks refuses to pick them, the game modal sits
    them out (v146), and every core stats/leaders URL is `/types/2/` — regular
    season only. Nothing needed fixing there.
  - **The stored RECORD was not.** `sportshub:aitally` still held NFL entries
    from before those guards existed. **`clearNflPreseason()`** drops NFL
    entries — graded and pending, moneyline/ATS/totals alike — dated in the
    **July 1 → kickoff window**, on every load.
  - **Last season is KEPT — the owner's explicit call.** The first cut wiped
    everything before kickoff so the season would open 0-0; asked whether to
    keep prior seasons, the answer was keep. Worth knowing when reading that
    record: every NFL pick in it predates the v138 look-ahead fix and the v83
    confidence meta, which is why `CONF_CAP.nfl` is a flat **85** guess rather
    than a fitted number. It is history, not calibration data.
  - **Surgical and idempotent:** only entries inside that window are ever
    removed, so it can run every load and can never touch an in-season result,
    last season's playoffs, or any other sport. MLB's 400+ graded picks — the
    data the model was actually tuned on — and CFB are untouched.
  - The window is derived from `NFL_KICKOFF`, a hand-maintained constant, so
    each new season clears that season's preseason once the date moves forward.
  - ⚠️ **Test fixtures must seed NFL history IN season.** This runs at boot and
    rewrites localStorage, so a suite seeding NFL results in August watches its
    own fixture disappear — which is exactly what happened while writing it.
  - Verified — **16 checks**: preseason moneyline/ATS/pending entries dropped,
    last season and Week 1 kept, February playoffs and a June stray kept, MLB
    and CFB untouched, the by-sport records reflecting the survivors, and
    idempotency.

- **🔪 Sharp Action — moves per side (v167, backend `b12-move-history`)** — the
  owner sent a screenshot of a paid product showing *"Under: 6 sharp moves ·
  Over: 0"* and asked for the same read. **We cannot reproduce that**: it is
  steam detection across a dozen sportsbooks polled continuously, and this app
  has neither the feed nor the uptime. Two weaker-but-real reads ship instead,
  each labelled for exactly what it is:
  - **Count the moves we actually saw.** `trackLines` already recorded a line
    change per game — but only `first` and `last`, which cannot answer "how many
    times". It now keeps a bounded **`hist`** (`HIST_MAX` 40) of every observed
    change, and **`countMoves(hist)`** tallies direction: total down = toward
    the Under, a shortening moneyline = money on that side, spread by sign.
    Rendered as the per-side bars the screenshot showed.
  - **🚨 Moneylines move in PAIRS**, so reading both sides scored every move
    twice (caught by test: 4/2 where 2/1 was right). `countMoves` counts a
    moneyline move **once**, from the home price, falling back to the away
    price only when ESPN sent no home number — routine on MLB, whose
    scoreboard often carries no raw moneylines at all.
  - **Read the books against each other** (`bookLines`/`bookConsensus`). ESPN's
    summary carries **`pickcenter`, an ARRAY of providers** — the app was taking
    the first entry and discarding the rest. Where 2+ books are listed it now
    reports how many moved each way (when per-book `open` exists) and otherwise
    how the books are split across numbers right now. One book is not a
    consensus, so it returns null and the card falls back to the move counter.
  - **Backend `b12`:** the daemon already kept 50 snapshots per game, but
    `/api/betting/{sport}/report` only exposed `first`/`last`/`n` — the history
    was thrown away at the API boundary. It now sends a trimmed **`hist`**
    (`MOVE_HIST_MAX` 24) plus the numeric **`sp`** spread on each snapshot.
  - **Why the device history matters more than the backend's:** Render's free
    tier stops the container after ~15 min idle and `_LINES` is in-memory, so
    the poller only runs while someone is using the app and every cold start
    wipes it. The device record is the one that persists, and both sources feed
    the same counter via `moveHistory()`.
  - **🚨 Backfill from `first`+`last` (v167.1).** The first cut required
    `hist.length > 1`, and `hist` only starts filling on the NEXT change after
    the upgrade — so a game the app had watched move all day (the owner's
    screenshot: `BOS -116 → -141`, recorded under v166) counted as **zero
    moves**. `moveHistory` now synthesizes a two-point history when a record
    carries only `first`/`last` and they differ, which also covers the backend
    until `b12` is actually deployed. `snapsDiffer` compares a field only when
    **both** snapshots carry it, so a value appearing for the first time (a
    v166 record has no `sp`, a v167 one does) is the app learning something,
    not the line moving.
  - **🚨 PRE-GAME ONLY (v169 / `b13`).** Once a game starts the book posts LIVE
    in-game prices that track the score — that is the game happening, not money
    moving on it, and appending them would bury the pre-game read entirely (a
    late blowout drags the price hundreds of points). Both recorders now stop
    at first pitch: `trackLines` skips anything not `scheduled`, and
    `_snap_lines_once` skips any event whose status state isn't `pre`. What was
    already stored **stays**, so the pre-game history is still there to look at
    during and after the game, and the card says so.
  - **The favourite is now derivable from the details string** (v169). MLB
    often ships no raw moneylines AND no `favorite` flag, leaving `favName`
    null — which silently darkens the de-vigged market probability, the edge
    sizing that keys off it, and the move counter. `normOdds` falls back to the
    abbreviation in the details text ("BOS -141" → BOS is favoured), and
    `moveHistory`'s enricher fills a missing side as well as a missing price.
  - **Honest by construction:** the card says "this undercounts" and names its
    source (server snapshots vs this device). It renders nothing at all when
    neither source has anything.
  - **🚨 The counter was blind on all of MLB (v169).** The reported card read
    *"No line changes seen yet across 2 checks"* directly under the app's own
    `📈 BOS -116 → BOS -141`. Cause: ESPN's MLB scoreboard sends **no raw
    moneylines** — `hML`/`aML` are null and the price exists only inside the
    `details` string. `countMoves` read only `hML`/`aML`/`ou`/`sp`, so the one
    market MLB actually publishes was never examined. Snapshots now store
    **`dML`** (the favourite's price, already dug out by `normOdds`) and
    **`fh`** (which side is favoured), and `countMoves` reads them: a shorter
    price = money on the favourite. A snapshot pair where the favourite
    **flipped** is skipped — the two numbers describe different teams.
    `moveHistory` also **parses `details` at read time** for pre-v169 records
    and for everything the backend sends, using the game object to map the
    abbreviation to a side, so existing records count immediately.
  - **`pickcenter` ANSWERED for MLB (v168/v169): exactly ONE book.** The
    multi-book comparison therefore never renders there, and the v168 note
    saying so was dropped — true once, noise on every card after. The code is
    **kept**: football quotes far more books and whether `pickcenter` carries
    several for NFL/CFB is still unverified. Worth checking in season.
  - ⚠️ **`pickcenter`'s shape beyond MLB is UNVERIFIED** — the sandbox can't reach
    ESPN, so provider count and open/current sub-objects were coded defensively
    against several plausible shapes but never confirmed. **On-device check: set
    localStorage `sportshub:debugbooks` to `'1'` and open any game** — the
    console prints the raw providers and what got parsed out. If ESPN sends one
    provider with no opener, the multi-book half silently doesn't render.
  - Verified in headless Chromium — **40 checks**: the direction counter (both
    ways on all three markets, the pair-counting fix, empty and single-entry
    histories), the consensus reader (moves with openers, the split-across-books
    fallback, single book, absent `pickcenter`, junk providers), the device
    history accumulating, the pre-v167 first+last backfill counting its move,
    a newly-populated field NOT counting as one, the MLB details-only path
    (both directions plus a flipped favourite being skipped), live prices NOT
    being recorded while the pre-game history stays visible mid-game, the card
    naming its source, and the card being absent entirely with no data. No
    console errors.

- **The rail became the slate · league filters · collapse-by-default (v166)** —
  three owner asks in one change, and one of them needed a decision:
  - **🚨 "Remove Today's Games from Home — they're all at the top now."** They
    weren't. The v163 rail was **live games only**, so deleting the Home slate
    would have meant that at 10am, with nothing in progress, the app showed no
    games anywhere. So the rail was widened to carry the **whole day**: live
    first (your teams ahead of the rest), then upcoming by start time, then
    finals — the same live → upcoming → finished order the Home slate used, so
    the reading order didn't change when it moved up. Cards are state-aware
    (`.lrc-live` / `.lrc-scheduled` / `.lrc-final`): live keeps its gamecast,
    upcoming shows start time + TV + the posted line, finals show the result
    with the winner highlighted. The rail now hides only when the day is
    genuinely empty. `RAIL_SPORT_CAP` (30) keeps a college Saturday bounded.
  - **⛳ Golf survived the removal.** It was rendered *inside*
    `renderHomeByLeague`, so deleting that function would have silently removed
    golf from the entire app. A leaderboard has no score line and nothing to
    tap, so it never belonged in a rail of scores — it's now its own
    `#home-golf` section (`renderGolfHome`). `renderHomeByLeague` and
    `addGolfHomeSection` are gone.
  - **🔵 League filter bubbles** (`#rail-leagues`, `paintRailLeagues`) — one
    small pill per league with games today, directly under the rail, with a
    game count. Filled = showing, hollow = hidden; state in
    `sportshub:railoff`, storing only the OFF leagues so a league you've never
    touched is on by default. The row **only appears with 2+ leagues playing**
    (with one league it'd just be a button that hides everything). Turning all
    of them off says *"All leagues hidden — tap a league above"* rather than
    going blank, and the row stays put so it's undoable. **Tab pips ignore the
    filter** — hiding a league from the rail is a display choice and shouldn't
    make a live game invisible everywhere.
  - **Collapse-by-default** — `SEC_OPEN_DEFAULT` is now **1** for every tab (was
    2 for the team tabs, Infinity elsewhere): each tab opens its top section as
    the quick view and folds the rest. Sections that ARE the summary carry
    `acc-open` and stay open wherever they sit: **My Teams**, **🎲 The Board**,
    **🔥 Best Bets**.
  - **🚨 Section state now stores BOTH open and closed** (`setSecState`, 1/0).
    v165 stored only "closed", which was fine while everything defaulted open —
    but now that most sections default *closed*, "the owner opened this one" is
    a choice that has to persist too. An absent key still means "use the tab's
    default".
  - Verified in headless Chromium at 390px in both themes — **53 checks**: the
    full-day rail (counts per state, live → upcoming → final ordering, favorite
    first, `–` for unplayed, winner highlighted on finals), the filter bubbles
    (one per league, counts, size, hollow/filled, aria-pressed, games actually
    disappearing, surviving a reload, refilling, the all-off message), Today's
    Games gone with The Board and golf intact, and the new collapse defaults
    plus open-state persistence across a reload. The v165 section suite (44)
    and the v164 market suite (98) still pass. No console errors.

- **Every section folds, and remembers (v165)** — the owner noticed the Fantasy
  tab had no way to collapse anything. `makeAccordion` had existed since v60-odd
  but was only ever called on four tabs (Eagles, Red Sox, NFL, CFB); Fantasy —
  the longest tab in the app — plus Home, AI Picks and the trends sections were
  never wired up. Now a single **`applySections(tab)`** runs after every tab
  render (from `showTab`), so nothing can be missed, over `.section-title`,
  `.lad-sec` and `.ai-section-head`.
  - **State persists** (`sportshub:secs`). Fantasy's sections finish rendering
    asynchronously and repaint constantly, so a collapse that pops back open on
    the next repaint isn't a collapse. Only **collapsed** sections are stored,
    so untouched sections follow the tab default and newly added sections
    appear open.
  - **The key is the heading's TEXT, not its id** — `injectJumpNav` assigns
    *positional* ids (`fantasy-sec-3`) to headings that lack one, and those
    shift whenever an async section lands earlier or later, which would
    reattach a saved state to a different section. A real id from the markup is
    used when there is one (`AUTO_ID` tells them apart).
  - **The content walk stops at any sibling that contains its own heading.**
    Several sections render into their own wrapper (`#home-board`,
    `#fantasy-waivers`, `#fantasy-strength`…) — without this, collapsing "My
    Teams" would have taken 🎲 The Board down with it.
  - **Clicks on controls inside a heading don't fold the section** (the League
    heading carries a Standings/Power toggle). The chevron is now a real
    `<button>` with `aria-expanded`, so sections are keyboard-reachable; the
    heading itself stays a heading, because `role="button"` on an element that
    contains a button would be invalid.
  - **`.no-acc`** marks a page title that is not a section: "Fantasy Tracker"
    (its "body" is the sport chip row) and "🤖 AI Picks — Today" (the record
    line). Folding either would hide a control, not content.
  - **Defaults are unchanged** — `SEC_OPEN_DEFAULT` keeps Eagles/Red Sox/NFL/CFB
    at "first two open", and every other tab starts fully expanded, so turning
    this on hides nothing the owner was used to seeing. Labs and About are a
    single short card each with no `.section-title` at all; there is nothing
    there to fold and a chevron on a five-line card is noise.
  - Verified in headless Chromium at 390px — **43 checks**: chevrons on every
    tab that has sections, collapse → persists across a tab switch **and** a
    full reload → re-expanding clears the stored override, the nested-control
    guard, heading-text clicks still toggling, the Eagles default preserved,
    the jump nav surviving collapsed sections, and Labs/About correctly having
    nothing to collapse. No console errors.

- **📐 Three markets, tracked apart — ML · spread · totals (v164)** — the owner
  asked for an against-the-spread record for NFL and CFB ("spread matters a lot
  more in football than it did in baseball"), then for totals to be a first-class
  citizen everywhere too. The model now plays and grades **three separate
  markets**, and they are never blended:
  - **Moneyline** — unchanged. Same pick, same confidence, same `probHome`.
  - **📐 Against the spread** (`atsCall`, football only via `ATS_SPORTS`). The
    projected margin is derived from the model's OWN win probability rather than
    rebuilt from scoring rates — `margin = PD_SD[sport] × Φ⁻¹(pHome)` via
    `projMarginFor`/`invNorm` (Acklam) — **so the ATS call can never contradict
    the moneyline call**. `PD_SD` (nfl **13.5** / cfb **16.5**) and
    `ATS_EDGE_MIN` (nfl **2** / cfb **3**) are the only new assumptions and are
    the first things to re-fit once there's a sample. Stored `:s` / `a:1`,
    graded by `atsResult` (home covers when `homeMargin + homeSpread > 0`; an
    exact push is dropped ungraded).
  - **🎯 Totals** — now tiered on the same ladder as the moneyline, in units of
    the sport's own floor (2× floor = best bet, 1× = edge), rendered as full
    cards instead of one-line text rows, and split **per sport** in the report.
  - `normOdds` gained a numeric, **home-oriented `spread`** (negative = home
    favored), from ESPN's own `spread` field or parsed out of the details string
    and flipped by abbreviation. Magnitude-gated so an MLB moneyline details
    string ("SEA -231") is never mistaken for a spread.
  - `tallyStats` returns `aw/al/an` (ATS) beside `tw/tl/tn` (totals);
    `tallyDetails` adds `atsBySport` and `totalsBySport`. The AI stat bar is
    **five tiles** (Moneyline · vs the line · Spread · Totals · Plays today) and
    the header line reads `ML … · vs line … · ATS … · totals …`.
  - **Why kept apart:** a model can pick winners well and still lose to the
    number. One blended figure hides exactly which half works.

- **🎲 The Board on Home + the conviction ladder (v164)** — the owner wanted the
  model's plays against the book on the front page, with the deeper read behind
  the AI tab. The model used to emit a **binary** — `isEdge` (disagrees with the
  book AND the de-vigged gap clears 5 points) or nothing — so a 4-point
  disagreement was computed and thrown away. Same math, now graded into tiers:
  - **`EDGE_BAR`** = best **10+** / edge **5–9** / lean **2–5**; `pickTier()`
    returns null when the model is with the book or inside the noise band.
    `MIN_EDGE_GAP` still equals the edge bar, so **the vs-line record means
    exactly what it always meant** — leans are picks but are not edges.
  - **`buildBoard(sport, games, opts)`** is the single shared computation. Home
    and AI Picks both render from it, so the two views can never disagree about
    what the model said for the same game. It is **pure** — renders nothing,
    records nothing. `recordPick` stays in `renderPredictions`, so a pick is
    stored exactly once, by the caller that waited the full sharp-money leash.
  - **Home `#home-board`** (`renderHomeBoard`, cross-sport — AI Picks is
    per-sport by design and a board that only showed MLB wouldn't be a board):
    up to 4 moneyline plays, 2 spreads, 2 totals, then a footer with the lean
    and pass counts linking to the tab. Not awaited, so the slate paints first.
  - **`SHARP_WAIT.board` = 3000** (vs `picks` 8000). The v157 rule applied to
    the front page: a Render cold start is 30–60s so 8s wouldn't catch one
    either — the only case the longer wait wins is a warm-but-slow backend, and
    8s of "crunching…" on the home screen is a bad trade. Home and AI can
    therefore differ on the sharp factor in a narrow window; `reportDownUntil`
    makes that rare, and the tab that *records* is the one that waits longest.
  - **The board states its own record in its header** (`boardNote()`): edges are
    the model's least validated output (44.7% all-time as of v159, under the
    52.4% break-even). Promoting picks to the front page without that number
    would be the app lying to its owner.
  - **AI Picks** is now a ladder: Best Bets → Edges → 👀 Leans (folded) → 📐 ATS
    → 🎯 Totals → ✅ Passes (folded, count only) → 📊 Backtesting → report card
    → trends.
  - **`backtestPanel(det)`** — the visual history: a **calibration chart**
    (claimed vs actual per bucket, the overconfident bar turning red with a
    "discount anything above N%" line), **record by tier**, and **by sport ×
    three markets**.
  - **🚨 Plumbing that makes the ladder measurable:** graded picks used to store
    only a yes/no edge flag, so "did gap-10 picks beat gap-5 picks?" was
    unanswerable about games already played. Picks now store **`gp`** (the gap)
    and **`tr`** (the tier) — through `recordPick` → pending → both grading
    paths → the tally. The by-tier row therefore reads **"collecting"** until
    new picks grade; it is deliberately **never back-filled** from a gap that
    was never saved. **Next session: read that split before touching
    `EDGE_BAR`** — measure, then fit, per the v126/v138/v159 method.

- **📱 Layout: live rail + one-line tab rail (v163)** — the owner's nav was
  "too big": nine `flex-wrap`ped 44px buttons cost **~150px** of chrome on a
  390px phone, three rows deep, before a single score.
  - **`.tabs` is now ONE line that scrolls sideways** (`flex-wrap: nowrap` +
    `overflow-x: auto`), icon over label, ~56px tall. Deliberately **no "More"
    sheet** — the option that inspired this buried Red Sox, AI Picks, Fantasy,
    Labs and About two taps deep, and Red Sox is a favorite team. One swipe
    beats two taps. Buttons now wrap `<span class="ic">`/`<span class="lb">`,
    so the click handler resolves `e.target.closest('button[data-tab]')` — a tap
    lands on the span, not the button.
  - **`#live-rail`** (`renderLiveRail`, above the masthead, chrome not a tab):
    one card per in-progress game across every in-season team sport, your teams
    first. Left half is the score; the right half is that sport's **own
    gamecast** — `mgcBaseball` (bases diamond + count + outs), `mgcFootball`
    (field strip with the ball spot, possession + down & distance, red-zone
    band on the attacking half), `mgcGeneric` (period + clock). Taps open the
    game modal. Refreshes every **60s**, paused while the page is hidden.
  - **It hides ENTIRELY when nothing is live** (element stays `hidden`). A
    permanent 0–0 strip is worse than no strip: chrome is ~186px with live
    games and **~102px without**, vs ~208px before.
  - **🔴 pips** on tabs whose sport has a live game (`paintLivePips`); Eagles
    and Red Sox pip only for THEIR game (`liveFavSports`), Home never pips.
  - Masthead trimmed 58px → ~46px.
  - Verified in headless Chromium at 390px in **both themes** with ESPN and the
    backend fully stubbed — **98 checks**: rail gamecasts (bases lit, count,
    outs, ball yard line, red-zone side, down & distance), rail hidden + chrome
    budget with nothing live, tab pips, one-row/scrollable/height of the tab
    rail, tapping a label span, the Home board in both themes (tiers, ATS card,
    totals card, honest note, no horizontal overflow), the AI ladder, the
    five-tile stat bar, the backtest panel (red overconfidence bar, per-tier
    record, all three markets per sport), and the ATS unit math (cover, push,
    dog covers, spread orientation, MLB moneyline not read as a spread, floor,
    non-ATS sports). No console errors.

- **🚨 The Top-25 gate could have orphaned graded CFB picks (v162)** — found
  while answering "does the model track college football the same way?". It
  does — `recordPick`/`recordResult`/`gradePending`/`tallyDetails` are all
  sport-generic, so a 🎓 CFB row, its confidence buckets, its O/U split, the
  `sh` sharp-money split and the export all worked from day one with no CFB
  code. But **grading went through `getGames`, which applies v161's Top-25
  filter**, and that filter reads the CURRENT poll.
  - **The failure:** you pick #22 Wake Forest on Saturday. They lose (or just
    slide) and the Sunday poll drops them. `gradePending` re-fetches Saturday's
    board on Monday, `onlyRanked` re-filters it against the NEW poll, the game
    is no longer there, and the pick sits unmatched until the 14-day cutoff
    purges it. Silent, and biased: it eats precisely the bubble-team and upset
    picks a calibration sample most needs.
  - Whether it actually fires depends on something unverifiable from here —
    whether ESPN's historical scoreboard keeps `curatedRank` as of kickoff or
    re-stamps it to today's rank. Rather than bet on the answer, the rule is
    now explicit: **the filter decides what to SHOW and what to PICK; it must
    never decide what gets GRADED.** `getGames` takes `opts.allRanks`, and
    `gradePending` — the only caller that passes it — grades against the
    unfiltered board.
  - `renderPredictions` still grades finals inline off the filtered slate, which
    is fine: that's same-day, when the poll can't have moved yet, and anything
    it misses `gradePending` now catches later regardless.
  - Verified with a fixture built to trigger exactly this: a finished game whose
    ranked team is *absent from the current poll* still grades, keeping `cf`,
    `sh`, the edge flag and the sport stamp, and lands in the Report Card's
    by-sport, bucket, totals and sharp-money sections (19 checks). Nothing about
    the pick-side behaviour changed — the earlier 101 checks still pass.

  **What this means for tuning through the season:** CFB accumulates a graded
  record with the same meta every other sport stores, so the v126/v138/v159
  method applies unchanged — let it run, hit **📋 Copy my record data**, and
  read the CFB slice before touching `MODEL_W.cfb`. The constants that will
  want attention first are `CONF_CAP.cfb` (90 is a guess), `MODEL_SHRINK.cfb`
  (0.8, chosen blind) and `TOT_EDGE_MIN.cfb` (6). **Measure, then fit — do not
  refit on a sample the shrink itself produced.**


- **🎓 College Football (Top 25) + NFL flipped to live (v161)** — two owner asks
  in one change: score college football "like the other sports, just the top 25,
  with all the information we have," and get the NFL's stats and gambling data
  off its offseason settings before the regular season starts.

  **The Top-25 gate is one line of config, enforced in one place.** `LEAGUES.cfb`
  (`football/college-football`, emoji 🎓) carries two flags nothing else has:
  `top25: true` and `sbQuery: 'groups=80&limit=300'`. The query matters — ESPN's
  bare CFB scoreboard returns a small curated subset, so without it most of
  Saturday never loads. The filter itself lives in **`getGames`**, which is the
  single door every consumer already goes through, so Home, AI Picks, the trends
  section, line tracking and the betting board are all ranked-only for free and
  can never drift apart. Ranks come from **two independent sources** so one
  failing never empties the slate: the scoreboard's own `curatedRank` (already
  fetched, 99 = unranked → null, stamped onto `teamObj.rank`) and, as backfill,
  the `/rankings` feed. Verified: with the rankings endpoint returning 500, the
  ranked slate still builds correctly from `curatedRank` alone.
  - **Ordering:** `rankScore` puts ranked-vs-ranked games first, then by best
    rank — so the marquee game leads the slate instead of whatever ESPN sent
    first.
  - **`trackLines` runs AFTER the filter.** It used to see the raw list; on a
    college Saturday that would have written ~70 games into the day's
    localStorage key for games the app never shows.
  - **`rankHTML`** puts a gold `#3` chip on every game card. It's generic (reads
    `team.rank`), and the pro leagues never send that field, so nothing else
    changes.

  **The CFB tab** mirrors the NFL tab's shape: hero (season phase + week, and a
  plain statement of the Top-25 rule), **Ranked Games This Week** grouped by day,
  a **Betting Board**, the **Top 25** table (poll name, record, first-place
  votes, and weekly movement computed from each team's `previous` rank), the
  **Playoff Field**, and league headlines with the standard in-app summary popup.
  - **Playoff Field is labelled honestly and is not a bracket.** The 12-team
    field reserves five spots for conference champions, which no free feed
    resolves, so it renders the poll's top 12 with a dashed cut and says exactly
    that. `cfbRankings()` prefers the **CFP committee rankings** when they exist
    (~November) and falls back to the **AP poll**, and the card's wording changes
    to match which one it's reading.

  **📊 Betting Board (new, shared by the NFL and CFB tabs, `renderBettingBoard`)**
  — the "gambling info" half of the ask. Everything on it already existed
  *per-game* inside the modal's Game Report; this puts the same three numbers —
  the book's line, the model's price and gap vs the market, and where the money
  is — side by side for a whole slate, so a week reads in one scan. It obeys the
  **v157 rule**: the Render backend is raced under `SHARP_WAIT.picks` and the
  board renders without it, so a sleeping backend costs the 💰 row and nothing
  else. Measured with the backend hanging forever: the slate still painted in
  **1.8s**, and the board came back with lines + model prices and an explicit
  "splits feed asleep or unreachable" note. Capped at `BB_MAX_GAMES` (16) so a
  full college Saturday can't fire 60 profile fetches; finals are excluded
  (their closing numbers are in the modal), and the "showing top N" note only
  appears when the board actually truncated.

  **CFB model constants — principled, NOT fitted, and guarded accordingly.**
  There is zero graded CFB history in this app, so every number is a documented
  first pass: `PD_SCALE.cfb` **14** (double the NFL's 7 — ranked teams routinely
  win by 30, so the same differential gap means much less), `MODEL_W.cfb` with
  **record 1.3** (no parity mechanism; the talent gap is enormous and
  persistent) and **homeEdge 0.42** (CFB home teams really do win ~57-60%, vs
  the NFL's ~55%), `MODEL_SHRINK.cfb` **0.8** and `CONF_CAP.cfb` **90**,
  `TOT_EDGE_MIN.cfb` **6** and `TOTALS.cfb` `[46.5, 62.5]` (college totals sit
  near 55 with far more spread than the NFL's ~45). The shrink is the cheap
  precaution the MLB lesson bought: it is monotonic, so it changes **no pick**,
  only the stated confidence and the edge sizing that keys off `probHome`.
  - ⚠️ **Worth knowing before tuning `homeEdge`:** `predictGame` damps the
    empirical home/road split by `min(homeGP, roadGP)/10` and hands the
    remainder to the generic home edge. A 12-game college season gives a team
    only ~6 home games, so that shrink **maxes out around 0.6** and the generic
    edge always contributes — unlike MLB, where it vanishes by May. Measured on
    two identical teams with matching home and road records: CFB lands at
    **53.4%** vs the NFL's 52.8%. Re-measure from graded results before
    touching any of this.
  - Sharp money (v160) reaches CFB picks like any other sport — verified it
    moves an even game 53% → 58% and that a sub-deadband split is ignored.

  **Backend `b11-cfb-betting`** — `BETTING_SPORTS` gains `cfb`, plus two small
  maps beside it: **`SB_QUERY`** (the same `groups=80&limit=300` the frontend
  needs, so the line-movement daemon snapshots the real board rather than a
  handful of games) and **`VSIN_SLUG`** (VSiN files college football under
  **`ncaaf`**, not `cfb`). Verified the mlb/nfl/nba URLs come out byte-identical
  to before. ⚠️ **The VSiN `ncaaf` path is unverified live** — the sandbox is
  egress-blocked from vsin.com, same as always. **First on-device check:
  `/api/betting/cfb/report?debug=1` → `attempts` + `source`.** The scrape
  already degrades to "unavailable + reason" rather than wrong numbers.

  **NFL flipped to live.** `STAT_SEASON` was **hardcoded to 2025**, which meant
  that on kickoff weekend the Eagles tab and Team Research would still have been
  serving last season's numbers. It is now computed (`footballSeason()` — rolls
  over in July), and every core-stats read goes through new **`fbSeasonData()`**,
  which asks for the live season FIRST and falls back to the last completed one,
  **returning which season answered** so the UI can say so. The Eagles stats
  header now reads `(2026)` when real data exists and `(2025 — last season)`
  when it doesn't — no code change needed on kickoff weekend. `SCHEDULE_SEASON`
  and its `(2026-27)` label are computed too, as are the Power Board's
  prior-season fallback and its three hardcoded "2026"/"2025" strings.
  - The NFL tab also gained the Betting Board (nav chip + section), and
    `renderNFLWeek` now reads the shared `scoreboard()` helper so the board
    reuses the same slate rather than fetching it twice.
  - **Deliberately unchanged:** the AI Picks and game-modal **preseason skips**
    stay. Backups play; those results predict nothing. They self-resolve on
    Sep 10.

  Verified in headless Chromium at 390px in **both themes** with ESPN and the
  backend fully stubbed — **101 checks** across three suites: the Top-25 gate
  (Home, tab, betting board and AI Picks all drop an unranked-vs-unranked game
  while keeping both ranked ones), rank badges, the poll table (movement,
  first-place votes, others receiving votes), the playoff cut line, the betting
  board (line, total, model price, market gap, 💰 row, splits-coverage note, no
  bogus truncation note), the game modal, and four degradation states (rankings
  feed down, backend hanging, every feed down, and both NFL stat-season
  branches). No console errors.


- **💰 Sharp money is now a model input, not just a display (v160)** — the owner
  pointed at the Game Report's Big Money card (COL 45% of dollars on 25% of
  bets) and asked for it to feed the picks. It now does. DraftKings publishes
  bets% (share of TICKETS) and handle% (share of DOLLARS); when dollars run
  ahead of tickets on one side, the average wager there is much larger — a few
  big bettors against a crowd of small ones — and that divergence is the one
  market fact the posted price hasn't necessarily absorbed. Shipped:
  - **`sharpSplit(sp)`** (in the model constants, next to `MODEL_SHRINK`) folds
    a game's DK moneyline splits into a single number oriented toward HOME.
    Deadband **`SHARP_MIN_DIV` = 7** (matches the threshold `sharpSignals` has
    used since v88 — inside it, it's noise), scale `SHARP_DIV_SCALE` = 20 pts
    per unit, clamp `SHARP_MAX_UNITS` = 1.5. Both sides are averaged (each
    column sums to ~100, so they mirror; averaging cancels the scrape's per-cell
    rounding) and a row reporting only one side still works.
  - **A normal `Sharp money` factor in `predictGame`**, weight `MODEL_W.*.sharp`
    (**mlb 0.30 / default 0.20**), added to `z` *before* `MODEL_SHRINK` — a
    signal with no graded history should be shrunk like everything else, not
    exempted, and going in as an ordinary factor keeps the breakdown
    attribution exact. `predictGame` gained an optional 3rd arg
    `opts.splits`; **every caller must work without it.** Measured effect: a
    20-point divergence (the owner's screenshot) moves the pick **2.4 pts in
    MLB / 3.2 in NFL**; the clamp ceiling is 5.6 / 7.5 at a 40-point split,
    which is rare. `pred.sharp` carries `{side, abbr, handle, bets, d, pts,
    agree, flipped}` — `flipped` is true when the nudge changed which side the
    model took, and says so in the notes.
  - **Instrumented before it's trusted** (the v159 method): every pick stores
    `sh` = the points the factor moved it, signed toward the side taken —
    through `recordPick` → `sportshub:pending` → `recordResult`/`gradePending`
    → the tally. `tallyDetails` splits the record into **big money on our side
    / big money the other way**, and the Report Card renders it as its own
    section that says "too thin to tune on" under 20 picks. **Next session:
    re-export and read that split before touching the weight.**
  - **Where the splits come from without blocking anything.** They ride the
    same Render backend as the Game Report, which cold-starts up to 45s — and
    v157's rule (never let that leash gate a render) still holds. So both
    callers use **`raceReport(p, ms)`**, a hard-capped race that takes `null` on
    timeout: `SHARP_WAIT.picks` = 8s on the AI Picks tab (already a "crunching
    the numbers…" wait), `SHARP_WAIT.modal` = **1.2s** in the game modal, run
    concurrently with the ESPN summary fetch. The promise isn't cancelled, so
    the full report still injects into `#md-report` whenever it lands. Measured:
    modal paints in **3 ms** warm, **1201 ms** with a backend that never
    answers (and `reportDownUntil` makes that the first tap only).
    **Why the modal races at all instead of skipping the signal:** the modal and
    the AI Picks tab must show the SAME confidence for the same game.
  - **Visible, not silent.** The AI Picks tab says how many picks the signal
    reached ("folded into N of M") or that it's unavailable and the picks are
    model-only; each edge card shows the dollars-vs-bets line, green when the
    sharp side agrees with the model; the Game Report's Big Money card now ends
    with where the signal went ("+2.4 points toward …").
  - **NOT done, deliberately:** reverse line movement is still display-only.
    `sharpSignals` already computes it, but shipping two new unproven inputs at
    once makes neither measurable. It's the next candidate once `sh` has a
    sample.
  - Verified in headless Chromium at 390px in BOTH themes with the network
    fully blocked — 54 checks on the signal (deadband, orientation, one-sided
    rows, clamp, junk input, factor labeling, MLB-vs-NFL magnitude, VSiN row
    matching, tab + card + report-card rendering, `sh` persistence, the
    backend-asleep path) plus 6 on the modal (pick identical to the tab's,
    warm/cold paint times, preseason still sits it out). No console errors.

- **Totals instrumentation + O/U split in the Report Card (v159)** — the owner
  exported the graded tally again (**402 entries**, up from v138's 289) and asked
  how the model is doing. Analysis of that export, and the one change it
  justified:
  - ⚠️ **SUPERSEDED at n=433 — see the v170 re-read above.** The conclusion
    below was drawn on n=80 and did not survive a larger sample.
  - **The v138 calibration fix worked.** Splitting the record by era (the
    export's `d` dates vs the v127/v138 ship dates): pre-v127 picks claimed
    **73.4%** and won **54.3%** (gap **−19.1**), with a Brier of **.2792** —
    *worse* than the .2481 you'd get by saying "54%" every game, i.e. the
    confidence number carried negative information. Post-v138 picks (8/4+, n=80)
    claim **62.2%** and win **60.0%** (gap **−2.2**), Brier **.2311** vs a
    .2400 base-rate baseline — it now **beats** always-quoting the base rate.
    Discrimination improved too: win/loss AUC on confidence went **.558 →
    .623**. The shrink + look-ahead fix are doing what they were meant to.
  - **The headline record is still inflated and that's expected.** All-time
    sides read 228-133 (63.2%), but **143 of those entries pre-date the v83
    meta** and went 101-42 (70.6%) — they were graded under the leaky
    `teamProfile`. The labeled sample is 127-91 (58.3%). The card already says
    this; it's repeated here because the two numbers will keep diverging.
  - **Edges are still the weak spot: 17-21 (44.7%) all-time, 6-8 since v138** —
    under the 52.4% break-even. v138 predicted far fewer edges (it got them) but
    not yet better ones. n=14 post-fix is too thin to act on; leave `MIN_EDGE_GAP`
    alone and re-measure.
  - **🚨 Totals are directionally broken, and park factors did NOT fix it.**
    All-time **20-21 (48.8%)**, but **30 of 41 picks are OVER (73%)** — under an
    unbiased projection with a symmetric ±`TOT_EDGE_MIN` threshold that split
    should be ~50/50, and 30-of-41 has **p = 0.0022**. v138 added `MLB_PARK` to
    kill exactly this skew; since then it's **still 8 of 11 OVER** and 4-7. So
    the projected total sits systematically **above** the book's, and park
    blindness was not the (only) cause. A likely mechanism worth checking first:
    `MLB_AVG_ERA` is a hardcoded **4.10** anchor, but the ERAs fed against it are
    *starters'* ERAs, whose population mean runs above the overall league ERA —
    so the `matchupFactor` nudge adds runs on average rather than centering.
  - **What shipped (deliberately NOT a refit).** The bias could only be seen,
    never **sized**, because a graded totals entry stored the side and line
    (`p: "OVER 8.5"`) and **never the model's projected total** — so no export
    can say how many runs high the projection runs. Fixed: `recordTotalPick`
    now carries `proj`, and both grading paths (live in `renderPredictions`,
    deferred in `gradePending`) write **`pt`** onto the tally entry. The Report
    Card's Totals section gained an **OVER / UNDER split row**, a gold warning
    when either side takes ≥65% of picks (fires today at 73% OVER), and a
    **"Model total vs the book: ±N runs"** row that populates as `pt`-carrying
    picks grade. **Next session: re-export, read that number, and de-bias
    `projTotal` (or re-anchor `MLB_AVG_ERA`) against it** — measure, then fit,
    the same order v126's export button established. No model math changed in
    v159.
  - Also observed, not yet acted on: post-v138 the model picks **home 60%** of
    the time and those go **32-16 (66.7%)** while away picks go **16-16 (50%)** —
    consistent with `w.homeEdge` (0.12) being *under*-weighted now, but n=80 and
    the split is confounded with which teams were good. Flagged for the next
    export, not tuned blind.
  - Verified in headless Chromium at 390px in both themes with the network fully
    blocked, driving `tallyDetails`/`reportCard` off the owner's real 402-entry
    export: totals read 20-21 with OVER 15-15 of 30 and UNDER 5-6 of 11 (matching
    the offline analysis exactly), the 73% lean warning renders, the bias row
    correctly stays hidden (no existing entry has `pt`), and no console errors.

- **Player modal → draft board: "Draft Plans" card (v158)** — the owner was
  looking at Kyle Monangai in Team Research and wanted to add him to their draft
  plans right there instead of scrolling down to My Draft Board and retyping the
  name. `openPlayerModal` now renders a **Draft Plans** card (`#pl-draft`,
  between 2026 Outlook and Latest News) writing to the SAME on-device board
  (`sportshub:fantasy:nflboard`) the Fantasy → Football view edits:
  - **Not on the board** → a tier `<select>` + **⭐ Add to my draft board**.
    Default tier comes from **`planTierFor(name)`** — if he's already a
    Draft-Turn Plan / sleeper target, his group's tier, so this button and
    "⭐ Add these targets to my board" agree; otherwise T3.
  - **Already on the board** → "✅ On your draft board" + a live tier select
    (re-tiers in place) + **Remove**.
  - **Kept by a league team** (`keptEntry`) → no add button at all, just a red
    "🔒 Kept by X — costs round R{n}, so he never enters the draft" notice.
    Same refusal the ⭐ turn-target merge does, made visible at the player.
  - The card also shows **`pickAngles`** pills (💰 just paid / 🔥 contract year /
    🎯 Plan target · R{n}), so the reason he's interesting is right there.
  - Position maps through **`BOARD_POS`/`boardPosFor`** (HB/FB→RB, PK→K,
    DEF→DST, anything unrecognized → FLEX) so a non-skill player can't land on
    the board with a junk position. Card is inline-styled (v74 lesson) and
    repaints itself in place (`paintPlan`, guarded by `body.dataset.aid`) so the
    modal doesn't jump; `sync()` re-renders the prep view underneath — but ONLY
    when `#bd-wrap` is actually mounted, so it can never paint the prep view
    over the live-league view.
  - Verified in headless Chromium with the network blocked (both themes): add →
    localStorage row with the chosen tier, re-tier, remove, kept-player refusal,
    plan-target tier/pill, FLEX fallback, board count 0 → 1 behind the open
    modal, `fanState.bdOpen` held true, no console errors.

- **Game modal stuck on "Loading live stats…" (v157)** — the owner tapped a
  preseason card on the NFL tab and the modal sat on the loading line. Not a
  hang and not ESPN: `openGameDetail`'s `Promise.all` awaited
  **`getBettingReport(sport)`** alongside the ESPN calls, and that one goes to
  the **Render backend**, which `fetchJSON` deliberately gives a **45s** leash
  for its free-tier cold start (ESPN stays at 9s). So a sleeping (or dead)
  backend held the ENTIRE modal — score, odds, box score, everything — hostage
  for up to 45 seconds even though the ESPN summary had landed in ~1s. Fixed by
  making the report **non-blocking**: it's kicked off before the `await`, the
  modal renders as soon as the ESPN data is in with a `<div id="md-report">`
  placeholder ("📊 Loading betting report…") in the report's slot, and the
  report is injected into that host when it lands (`makeAccordion` re-run on the
  host alone, so the surrounding sections aren't re-wired). A module-level
  **`detailToken`**, bumped per open, drops a late report into the void if the
  user closed the modal or opened a different game meanwhile. Also added
  **`reportDownUntil`** in `getBettingReport` — a failed/timed-out fetch is
  remembered for 3 minutes, so during an outage every subsequent card returns
  null immediately instead of opening its own 45s request. When the report is
  null `gameReportHTML` already degrades (model grades + device-local line
  movement, or `''` if there's nothing to show), so the slot just empties.
  Verified in headless Chromium with the network stubbed across three backend
  states (never answers / errors immediately / answers after 1.5s): the modal
  painted in **26–51 ms** in all three, the report appeared with a working
  accordion when it arrived, and the slot cleared cleanly when it didn't. **The
  general lesson: never `await` a `FANTASY_API` call in the same `Promise.all`
  as the ESPN calls — the 45s cold-start budget becomes the render time.**

- **📰 Fantasy Advice was showing MLB articles (backend `b10`)** — the owner's
  screenshot of the NFL prep view led with "Fantasy Baseball Closer Rankings"
  and "MLB DFS Picks". **Frontend-clean — this was entirely `/api/articles/nfl`.**
  Two bugs, both fixed server-side (no `APP_VERSION` bump: no frontend file
  changed; confirm the deploy via `/api/health` → `version`):
  - **Wrong sport.** `_parse_feed` accepted **every `<item>`** in whatever feed
    answered, with no sport filter at all — while `_parse_jsonld` and
    `_parse_links` both filtered through `cfg["pattern"]`. FantasyPros is a
    multi-sport site, so when the sport-specific feed guesses 404'd and the
    **site-wide** `/feed/` answered, its baseball/NBA/college posts sailed
    straight through. (Tell-tale in the screenshot: every row's category read
    "Articles" — the generic site-wide tag.) Fixed with **`_sport_ok(item, cfg)`**,
    now applied to **all three** parsers' output. It's a **deny-list**, not an
    allow-list, and deliberately so: FantasyPros permalinks are often
    **date-based** (`/2026/08/slug/`) and carry no sport, so a `/nfl/`-only
    allow-list would have emptied the section. Order: `urlNo` (other-sport path)
    rejects → `urlYes` (`/nfl/`) accepts outright → `textNo` on **title +
    category only** rejects → otherwise keep. Summaries are NOT matched — an NFL
    article can mention baseball in passing; its headline almost never does.
    **College fantasy football is treated as off-sport** (different game from
    the owner's NFL league) — flip `college-fantasy-football`/`college fantasy`
    out of `urlNo`/`textNo` to let it back in.
  - **Raw HTML entities** (`read more &#187;`, `We&#8217;re`) — `_strip_tags`
    hand-decoded seven named entities and missed every **numeric** one. Now uses
    `html.unescape` (feed descriptions are HTML-escaped *inside* XML, so a
    decode pass is still needed after ElementTree's own), re-strips in case a
    tag was itself escaped, and drops the WordPress "… read more »" excerpt tail
    via `_READMORE_RE`. Output is still `esc()`d frontend-side, so decoding here
    can't inject markup.
  - **Candidate selection no longer trusts first-answer.** The loop used to
    `break` on the first URL that parsed anything; a site-wide feed arriving
    first therefore won permanently. It now filters each candidate, **keeps the
    richest surviving list**, and only stops early once one clears
    **`ARTICLES_MIN_ITEMS`** (3) — so an all-baseball feed can't lock in a bad
    or empty result. Happy path is unchanged (a good NFL feed is first in
    `urls`, wins immediately, later URLs are never fetched). `?debug=1` now also
    reports **`offSport`** per attempt = how many items the filter dropped.
  - Verified against fixtures built from the exact headlines in the screenshot:
    all three off-sport rows dropped, the two football rows kept, entities
    decoded (`Don't reach for these guys…`), plus five loop scenarios
    (site-wide-only, NFL-feed-wins, all-baseball-keeps-walking, thin-loses-to-
    richer, everything-down-fails-honestly). ⚠️ Still **unverified live** — the
    sandbox is egress-blocked from both fantasypros.com and onrender.com, so
    which candidate URL actually answers is still unknown. **On-device check:
    `/api/articles/nfl?debug=1` → `source` + `parser` + `offSport`.**

- **Board audit closed + plan re-measured against real ADP (v156)** — the owner
  asked for all three open items from v154/v155 at once. Web search works in this
  session (WebFetch/curl are egress-blocked from *every* fantasy site — fantasypros,
  rotowire, draftsharks, pff, even Sleeper's key-less API — so this was done from
  search snippets, the v141 method).
  - **5 stale team labels fixed in `MOCK_POOL_RAW`** — real 2026 moves the pool had
    missed, each web-verified: **Jaylen Waddle MIA → DEN** (traded Mar 17; Tyreek
    Hill was released and is still a free agent, so Miami's WR room is now
    Tolbert/Washington — note Waddle is one of Christel's keepers), **Isaiah Likely
    BAL → NYG** (3yr/$40M, day 1 of FA, following Harbaugh), **David Njoku CLE →
    LAC** (1yr/$8M, listed a co-starter), **Michael Pittman Jr. IND → PIT** (traded
    + 3yr/$59M), **Adonai Mitchell IND → NYJ**. Nothing keys off the team string
    mechanically, but a wrong team makes the board lie to you on draft day.
  - **Coverage gaps CLOSED — pool 204 → 227.** Added the verified 2026 starters
    the audit was missing: **7 QBs** (Brissett ARI, Shedeur Sanders CLE — still an
    open Watson competition, Goff DET, Daniel Jones IND, Shough NO, Dart NYG,
    Rodgers PIT), **10 TEs** (Kelce KC — still atop the chart at 37, Gesicki CIN,
    Schultz HOU, Strange JAX, T.Ferguson LAR, Dulcich MIA, Juwan Johnson NO,
    Arroyo SEA, Tremble CAR, Okonkwo TEN; NYG + LAC were fixed by the Likely/Njoku
    relabels), and **6 WRs** (Pickens DAL, M.Wilson ARI, Bateman BAL, Boston CLE,
    Washington + Tolbert MIA). **Every team now has a QB, TE, RB and ≥2 WR** — the
    v154 audit is closed. Verified: 300 full 12×15 sims → 54,000 picks, **0
    duplicates, 0 filler**, all 21 keepers still resolve.
  - **Top-of-board re-ranked to measured ADP:** Gibbs → #1 (ADP **1.0**; he was
    pool #6) and Saquon → ~#13 (ADP **~14**; he was pool #5). Only the two moves
    the ADP quotes directly support. This materially changes R1 — Saquon went from
    "unreachable elite" to **55% available at your #10**.
  - **Draft-Turn Plan R1–R6 rewritten from 300 measured sims** of the real keeper
    board, with the percentages quoted in each round's note so the owner can see
    they're modeled. Headlines: R1 is Love (79%) / Saquon (55%) / Henry (99%) —
    **Jeanty is only 25%**, so he moved to the "rare fall" tier; R2 is the WR
    value pocket (McLaurin/MHJ/**Pickens** 100%, Nabers 99%, Kyren 93%); **Breece
    Hall was dropped from R3 entirely (6%)**.
  - **⚠️ The R5 Jadarian Price question — answered, and the plan moved.** National
    ADP is **57.8 (Underdog) – 63.3**, which looks like it validates the old #58
    window. It doesn't, because national ADP doesn't know this league: **8 RBs are
    kept** (Achane, Chase Brown, Skattebo, Hubbard, Javonte, Judkins, Tuten,
    White), so the surviving backs go earlier. Measured: Price is available at
    **#39 in 100%** of sims but at **#58 in only 12%**. So **R4 is now "the
    Jadarian Price pick — HERE, not R5"** and R5 was rebuilt around what actually
    survives (Montgomery 90%, Meyers 86%, Pollard 78%). The v153 "~7% at #58"
    figure was right; the conclusion drawn from it was the thing that was wrong.
  - **Still true and worth repeating:** these percentages come from the app's own
    sample board + CPU model, not live ADP — directionally useful, not gospel. And
    the pool is still **hand-maintained**: `/api/fantasy/football/rankings` returns
    name/pos/tier with **no team abbreviation**, so nothing can auto-fill it.

- **📰 Fantasy Advice — FantasyPros articles (v155, backend `b9-fparticles`)** —
  the owner sent `https://www.fantasypros.com/nfl/articles/`, so the Fantasy →
  Football prep view now leads with a **📰 Fantasy Advice** section (`#pp-articles`,
  right under the hero, above Team Research) listing FantasyPros' latest draft /
  waiver / sleeper articles — title, category · author · age, a summary line when
  the feed carries one, first 6 shown with the rest behind a "+N more" `<details>`.
  Rows open on FantasyPros (`target="_blank"`); there's **no in-app summary popup**
  like ESPN news gets, because we can't fetch their article bodies from the browser.
  - **Why it needs the backend:** fantasypros.com sends **no CORS headers** (same
    wall as API-Sports/Reddit), so this is the VSiN-scrape pattern, not a
    browser-direct read. New endpoint **`/api/articles/{sport}`** (`nfl` only for
    now; `ARTICLE_SOURCES` is the table to extend) walks a list of candidate URLs —
    RSS/Atom feeds first (they carry author/date/summary), the HTML article index
    last — and tries **three parsers per page**: `_parse_feed` (RSS `<item>` /
    Atom `<entry>`, namespace-agnostic), `_parse_jsonld` (schema.org
    Article/ItemList blocks), then `_parse_links` (anchors matching
    `/nfl/articles/…`, which survives most redesigns but yields title+URL only).
    Results are deduped by URL+title and sorted newest-first **only when every
    item has a parseable date** (otherwise source order is the site's own
    ordering and re-sorting would scramble it). Cached `ARTICLES_TTL_SECONDS`
    (30m); `/api/refresh` clears it. Never raises — always returns
    `ok/error/attempts`, and **`?debug=1`** reveals per-URL status/bytes and
    which parser hit.
  - ⚠️ **The candidate URLs are UNVERIFIED.** The sandbox is egress-blocked from
    fantasypros.com (WebFetch *and* curl), so the exact feed path could not be
    confirmed — `https://www.fantasypros.com/rss/nfl-articles.php`,
    `/nfl/articles/feed/`, `/nfl/articles/rss/`, `/feed/` and the plain
    `/nfl/articles/` page are tried in that order. The HTML index is the
    backstop and should work even if every feed guess is wrong; if FantasyPros
    blocks the scrape outright (Cloudflare), the card says so honestly. **First
    on-device check: `/api/articles/nfl?debug=1` → look at `parser` + `attempts`.**
  - **Degradation:** the last good payload is cached on-device
    (`sportshub:fparticles`) and painted instantly, so the section survives a
    Render cold start and shows something offline. Backend unreachable vs.
    reachable-but-scrape-empty are reported as **different** messages, and either
    way the card hands over a direct FantasyPros link rather than inventing
    content. Verified end-to-end in headless Chromium (both themes) across all
    four states — live, backend-down, stale-cache, and no-cache — plus a
    fixture-driven test of the three parsers (RSS, Atom, JSON-LD, anchors,
    dedupe/sort, malformed input).

- **Keeper-vs-board guard + board audit (v154)** — the owner asked how Kyle Pitts
  could have been missing from `MOCK_POOL_RAW` at all, and who else is.
  - **Why it was silent (the actual root cause):** a keeper name that isn't in
    `MOCK_POOL` does NOT error. `mockStart` falls through to
    `pl = { name, pos, team: '', rank: 900 }` and schedules the stub, so the sim
    runs clean while the player shows with no pro team, sorts to the bottom of
    the board, and is undraftable in any sim with keepers toggled off. (⚠️ An
    earlier note in this session said the sim "could not pull him off the board"
    — that was wrong; verified by test that the stub path handles it.) New
    **`keepersMissingFromPool()`** (next to `keptEntry`) surfaces exactly that
    case as a red ⚠️ row inside the 🔒 League Keepers card, naming the players
    and saying to add them to `MOCK_POOL_RAW`. It's a function, not a const,
    because `MOCK_POOL` is defined further down the file.
  - **Fixed: Washington was spelled two ways** in `MOCK_POOL_RAW` — four rows
    `|WAS` (McLaurin, Daniels, Brian Robinson Jr., Deebo) vs two `|WSH` (Ekeler,
    Ertz). Normalized to **WSH** (ESPN's code). Cosmetic only — nothing keys off
    the mock pool's team string — but it also made per-team audits misreport.
  - **The audit, and what it means.** `MOCK_POOL_RAW` is a **hand-maintained
    SAMPLE board sized so the draft never runs out** (204 names ≥ 180 picks +
    buffer), NOT a complete player universe — completeness was never its design
    goal, which is how Pitts was absent. It only became a correctness concern
    once `LEAGUE_KEEPERS` started naming real players. Per-position team
    coverage as of v154: **7 teams have no QB** (ARI, CLE, DET, IND, NO, NYG,
    PIT), **12 have no TE** (CAR, CIN, HOU, JAX, KC, LAC, LAR, MIA, NO, NYG,
    SEA, TEN), **6 have fewer than 2 WR** (ARI, BAL, CLE, DAL, MIA, NYJ). Counts
    per position are still sufficient for a 12×15 draft (26 QB / 23 TE), so
    nothing breaks — these are realism gaps, not failures.
  - **Why this can't just be automated:** the backend
    `/api/fantasy/football/rankings` gives real ESPN draft ranks but returns
    **name/pos/tier with NO team abbreviation**, which is precisely why the mock
    pool is hand-maintained (see v150). Filling the gaps by name needs a source
    the sandbox can't reach — ESPN is blocked and `WebFetch` is 403'd; web
    *search* works but returned contradictory/stale 2026 depth-chart snippets,
    so no names were guessed in. **Next step if the owner wants it: verify
    starters on device, then append to `MOCK_POOL_RAW`.**

- **🔒 Keeper board COMPLETE — all 12 teams + R1/R2 replan (v153)** — the owner
  sent the commissioner's updated keeper sheet. `LEAGUE_KEEPERS` went **16 → 21
  players** and, with `LEAGUE_ORDER` filled in, the league is now **fully
  reported** for the first time. Changes:
  - **4 new teams mapped to their slots** (the owner confirmed the manager ↔
    team-name pairs): **Samrizz = Riz (slot 2)** · **Cummish = Hurd (slot 3)** ·
    **Cheeky Clapz = Hyman (slot 4)** · **Goff Hits Women = Zach (slot 8)**.
  - **New keepers:** Justin Jefferson (Samrizz, R8) · Kyle Pitts (Cheeky Clapz,
    R9) · Seahawks D/ST (Cheeky Clapz, R15) · Bhayshul Tuten (Goff Hits Women,
    R10) · Rachaad White (Goff Hits Women, R11). **Cummish reported ZERO
    keepers** — that's an answer, not a gap, so it has no `LEAGUE_KEEPERS` rows
    but still carries a `team` in `LEAGUE_ORDER`. That distinction is why
    **`LEAGUE_TEAMS_IN` now counts `LEAGUE_ORDER` entries with a team** instead
    of distinct teams in `LEAGUE_KEEPERS` (the old math would have filed a
    zero-keeper team as still-outstanding), and why the keepers-card header's
    hardcoded "(4 still to report)" is now driven by `LEAGUE_TEAMS_OUT`.
  - **Round corrections:** Chuba Hubbard R8 → **R7**, Quinshon Judkins R6 → **R5**.
  - **`Kyle Pitts|TE|ATL` added to `MOCK_POOL_RAW`** (~rank 107, right after
    Dalton Kincaid — consistent with an R9 keep). He wasn't in the pool at all,
    so the sim could not have pulled him off the board. Contract web-verified:
    3yr/$54M with Atlanta, signed June 2026.
  - **⚠️ R1/R2 of the Draft-Turn Plan replanned, and this time against measured
    data.** Justin Jefferson was a headline R1 tier-1 target and is now
    undraftable. Rather than guess, the board was measured by running **200 full
    12×15 sims** and recording what was actually available at the owner's picks.
    Two findings forced real changes: (a) the old tier-2 group **"Elite RB — the
    default here" (Saquon/Gibbs/JT/CMC) reaches #10 in under 10% of drafts** — it
    was never a plan, it was a wish; (b) **Love and Jeanty are on the board at
    #10 in ~60–75% of sims but survive to the 2.15 in under 5%**, which inverts
    the old advice (R2 used to be the "near-mandatory RB" round). So R1 is now
    "🎯 take your RB1 HERE, not at 2.15" with an honest rare-fall tier, and R2 is
    "the RB tier has broken — take the value that fell" built around **Kyren
    Williams (~95% available at #15, back in the pool since the v142 Maye swap)**,
    Bucky Irving, Josh Jacobs, Garrett Wilson, Tee Higgins. The percentages are
    quoted in the card notes so the owner can see they're modeled, not asserted.
    ⚠️ These come from the app's **own sample board + CPU model**, NOT live ADP —
    directionally useful, not gospel. R3–R6 were left alone (their groups only
    contain already-kept names that render struck-through, the documented
    treatment); one known rough edge left in place: **R5 is still headlined "the
    Jadarian Price window" but the sim has Price available at #58 only ~7% of the
    time** — worth a look before draft day.
  - Verified by a scripted harness (`node` + DOM stubs, run against the real
    `app.js`): 3 full 12×15 sims → **180/180 picks, 0 duplicates, 0 filler**, and
    **all 21 keepers land at the correct manager AND round** (Jefferson → slot 2
    R8, Pitts → slot 4 R9, Seahawks D/ST → slot 4 R15, Tuten → slot 8 R10, White
    → slot 8 R11). The 10-team path still ignores the league board.

- **Draft recap footnotes + collapsible Draft Board (v152)** — two owner asks:
  - **"Why These Picks" footnotes** on the mock-draft completion screen. The
    +/- value column only compares a pick to its board rank, which says nothing
    about *why* a player was worth taking. New **`pickAngles(name)`** (defined
    right after `CONTRACT_WATCH`) cross-references each pick against three
    existing data sources and returns tag objects `{icon,color,kind,note}`:
    **💰 Just paid** / **🔥 Contract year** (from `CONTRACT_WATCH`, carrying the
    verified deal blurb) and **🎯 Plan target · R{n}** / **Sleeper-pool target**
    (from `TURN_ROUNDS`/`TURN_SLEEPERS`, carrying the tier-group label; first
    match wins). A player can carry both (e.g. Kenneth Walker III = 💰 paid +
    🎯 R2 target). Each pick row gets inline pill badges, and a **Why These
    Picks** card below the list spells out the note per tagged pick. Uses
    `keepNorm` for name matching, so punctuation/case differences don't miss.
    Verified against a full sim (8 of 15 picks tagged) and by direct lookups of
    every `CONTRACT_WATCH` name.
  - **Draft Board is collapsible** (Fantasy → Football). The board had grown
    long enough to bury the sections under it, so it's now wrapped in a native
    `<details class="tp-r" id="bd-wrap">` (same pattern as the Draft-Turn Plan
    rows) with a summary showing the player count. ⚠️ Every board mutation
    (add / remove / re-tier / filter / auto-fill) calls `renderFantasyFootball()`,
    which would rebuild the `<details>` **collapsed** and yank the UI shut
    mid-edit — so the open state is held in **`fanState.bdOpen`**, set by a
    `toggle` listener and forced `true` by each mutation handler. Keep that in
    mind when adding new board controls.

- **Mock draft room reordered for phone drafting (v151)** — owner request: while
  drafting they want the actions and their roster visible at the top, not below
  a 40-row player board. The war-room markup in `renderMockDraft` now reads:
  clock → **Auto-pick / Sim rest / Exit** → **Your Team** → **Recent Picks** →
  new **"Best Available"** heading → position filter + search → `#mk-list`.
  Pure markup reorder (same ids/handlers, all wiring is by id so nothing else
  moved); the new heading was added so the board still has a visible label now
  that it's no longer the first thing under the clock.
  Also: **your keepers now show in Your Team from pick 1.** Previously a keeper
  only appeared once its round arrived (they're placed by `m.keeperAt`), so for
  the first six rounds the panel gave no hint that TE and QB were already spoken
  for. Pending keepers now render in their position group, dimmed, labelled
  "🔒 keeper, lands R7" — and flip to the normal "🔒 kept" line once placed.
  Verified in a scripted draft: both keepers listed at the 1.10, McBride moves
  onto the roster at R7 while Maye stays pending until R11.

- **Mock draft ran out of real players — board deepened 129 → 203 (v150)** —
  the owner reported the sim "running out of players". Cause: `MOCK_POOL_RAW`
  held **129** names but the default draft (12 teams × 15 rounds) needs **180**
  picks, so ~51 picks — roughly **the last 4.3 rounds** — fell through to the
  generic `Depth WR 1` / `Best Available N` padding. **K and DST were the worst
  offenders** (only 4 K and 5 DST for 12 teams, so most teams got filler at
  those spots). Added **74 real players** — 10 QB, 18 RB, 20 WR, 10 TE, 8 K,
  8 DST — inserted before the K/DST block so `rank` (= line order) stays
  sensible. New totals: WR 68 · RB 62 · QB 26 · TE 22 · DST 13 · K 12 = **203**,
  enough for 180 picks plus buffer. Verified: a full 12×15 sim now produces
  **0 filler picks and 0 duplicate names**, and round 15 reads like a real
  draft (kickers + deep RBs). ⚠️ Still a **SAMPLE board, not live ADP** — the
  deep-board team labels are consensus/offseason-approximate since the sandbox
  can't reach ESPN; the backend `/api/fantasy/football/rankings` remains the
  live-ranks source for the separate auto-filled Draft Board (it returns
  name/pos/tier but **no team abbreviation**, which is why the mock pool is
  still hand-maintained).
  Also fixed a realism bug the deep-sim testing exposed: **pending keepers now
  count toward positional need** (`mockPendingKeepers`, folded into
  `mockCpuChoose`'s counts). Previously a keeper only joined the roster when its
  round arrived, so the sim would hand the owner a round-3 QB despite Maye being
  locked for R11. Measured over 200 sims: drafts wasting an early (R1–6) pick on
  an already-kept position went **97% → 0%**. Applies to rivals too.

- **Mock draft models the FULL league keeper board (v149)** — v148 only pulled
  rivals' keepers out of the pool, which was half the story: in a
  keep-the-round league a rival who keeps a player in R6 **does not pick in
  R6**, so letting the CPUs draft every round drained the board faster than the
  real draft would. `mockStart` now builds **`m.leagueKeeperAt`** (overall pick
  → `{teamIdx, player}`) for every reported rival by mapping `LEAGUE_ORDER[i]`
  → team index `i`, and `mockAdvance`/`mockSimRest` fill those slots with the
  kept player (flagged `keeper:true`, so it shows "🔒 kept" and is excluded
  from the value grade) instead of making a pick. New helper
  **`mockOverallFor(m, teamIdx, round)`** generalizes the old user-only
  `mockUserOverallInRound` (which now delegates to it). Guards: league keepers
  apply **only when `m.teams === LEAGUE_TEAMS_TOTAL` (12)** — a 10-team sim is
  a different league and gets the plain board; the user's own index is skipped
  (their side is driven by `m.keepers`, which the setup toggle can disable, and
  rival entries dedupe against it so a player can't be assigned twice).
  Verified by running full sims in-sandbox: 180/180 picks, all 16 keepers land
  at the correct manager AND round (McBride R7 #82, Maye R11 #130 — matching
  the Draft-Turn Plan's pick numbers), zero duplicate players, keepers-off and
  10-team paths behave, and the interactive `mockAdvance` stops exactly at
  overall #10 (the owner's 1.10).
  Also fixed a **pre-existing filler-name collision**: the pad loop numbered by
  `i / fillPos.length`, so the two WR (and two RB) slots in each group of six
  reused a number and the draft log showed two different players both named
  "Depth WR 1". Filler is now numbered per position.

- **🔒 League keepers + real draft order (v148)** — the owner sent the
  commissioner's keeper sheet (PDF) and the 2026 draft order for their 12-team
  keep-the-round league ("Nectars Bologna"). Two new consts near `TURN_ROUNDS`
  are now the single source of truth:
  - **`LEAGUE_ORDER`** — slots 1–12 with the manager ↔ team-name mapping
    (Gotch=Thurgood Marshall, Riz, Hurd, Hyman, Christel, Slemp=Slob On My Cobb,
    Woods=Morning Woods, Zach, CC, **McD=Current Champ = the owner, slot 10**,
    Buley=GMDD, Jew(=Wolff)=Future champ). `team: null` = keepers not reported.
    **(v153 filled the four blanks: Riz=Samrizz, Hurd=Cummish, Hyman=Cheeky
    Clapz, Zach=Goff Hits Women — no `null` entries remain.)**
  - **`LEAGUE_KEEPERS`** — 16 kept players across 8 reported teams, each
    `{team, n, p, r}` (+`you` for the owner's). ⚠️ PARTIAL — Riz, Hurd, Hyman
    and Zach hadn't reported. **(Superseded by v153: all 12 teams have now
    reported, 21 keepers.)** The league's 1st/2nd/final-keep bookkeeping is deliberately NOT
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
  Sport paths: `football/nfl`, `football/college-football`, `baseball/mlb`,
  `basketball/nba`, `golf/pga`. College football also uses `/rankings` (AP /
  Coaches / CFP polls) and needs `?groups=80&limit=300` on its scoreboard —
  see `LEAGUES.cfb.sbQuery`; the bare call returns a small curated subset.
  (Soccer / FIFA World Cup was removed in v125 once the 2026 Cup ended — the app
  no longer tracks any soccer competition.)
- `fetchJSON(url, ttl)` — in-memory cache by URL with TTL; 9s abort. All data goes through it.
- `LEAGUES` — per-sport config (label, emoji, espnPath, `fav` favorite teams, type).
  **Favorites are Eagles + Red Sox only** (NOT Phillies/Sixers).
- Tabs: Home, Eagles, **🏈 NFL** (league-wide lens, v145), **🎓 CFB** (college
  football, Top 25 only, v161), **Red Sox**, AI Picks, Fantasy, **Labs**, About. `showTab()` +
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

- **Home** — the app's front door. The day's scores are NOT on this tab any
  more (v166): they live in the **rail** pinned above the masthead, with the
  league filter bubbles under it. Order: My Teams → **🎲 The Board** (v164: the
  model's best plays against the book across every in-season sport — moneyline,
  spread and totals — with its own record stated in the header) → ⛳ Golf →
  Top Headlines. Top Headlines
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
- **🎓 CFB tab** (v161) — college football, **Top 25 only**. `renderCFB` +
  `renderCFBWeek`/`renderCFBRankings`/`renderCFBPlayoff`/`renderCFBNews`, ids
  `#cfb-*`, curated nav so `injectJumpNav` skips it, hero watermark 🎓. Sections:
  **Ranked Games This Week** (grouped by day, standard tappable `gameCard` with
  odds + the new `#N` rank chip), **📊 Betting Board**, **🏆 Top 25** (poll name,
  record, first-place votes, weekly movement from each team's `previous` rank,
  others-receiving-votes footer), **Playoff Field** (poll top 12 + dashed cut,
  explicitly NOT a bracket — see the v161 note) and **league headlines**. The
  Top-25 gate itself is NOT in this tab: it lives in `getGames`, so Home, AI
  Picks, trends and line tracking are ranked-only too, from one flag
  (`LEAGUES.cfb.top25`). Ranks come from the scoreboard's `curatedRank` with the
  `/rankings` feed as backfill, so either source alone keeps the slate working.
- **📊 Betting Board** (v161, `renderBettingBoard`) — shared by the NFL and CFB
  tabs: for every non-final game on the slate, the book's line + total + TV, the
  model's pick/confidence/projected total, its gap vs the de-vigged market (⚡ at
  5+ points), and the DK sharp-money row when splits match. Races the backend
  under `SHARP_WAIT.picks` and renders without it (v157 rule), capped at
  `BB_MAX_GAMES` (16). The header line always states what the board is standing
  on — including "splits feed asleep or unreachable" when it is.
- **AI Picks** — a multi-factor logistic model (`predictGame`): record, scoring
  margin, recent form, home/road split, rest, plus matchup factors (MLB starter
  ERA/WHIP, team OPS). **As of v164 it is a conviction ladder** — Best Bets
  (gap 10+) → Edges (5–9) → Leans (2–5, folded) → 📐 ATS → 🎯 Totals → ✅ passes
  (folded) → 📊 backtesting → report card → trends. The top of that ladder is
  mirrored on Home's 🎲 Board via the shared `buildBoard`. Stat bar tracks **all-time model record** and **vs-the-line
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
  - **v160: the money-vs-tickets divergence also feeds `predictGame`** as a
    small, shrunk `Sharp money` factor (see the v160 note above) — the Big
    Money card is no longer display-only. RLM still is.
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
    tips. Section order (v155): **📰 Fantasy Advice** → Team Research → League
    Keepers → Draft-Turn Plan → Contract Angle → My Draft Board → Prep Tips →
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
    athlete object), a **Draft Plans** card that adds/re-tiers/removes him on My
    Draft Board (v158), and a "Full profile & stats on ESPN ↗" link. **Backups show
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

- `sportshub:aitally` — graded pick results (all-time + vs-line record). Three
  markets share the store, keyed apart and counted apart: moneyline (`{gameId}`),
  totals (`{gameId}:t`, `t:1`) and ATS (`{gameId}:s`, `a:1`). v83+:
  entries also carry `{s, d, cf, p, m}` (sport, date, confidence, pick,
  matchup) for the Report Card; older `{c,e}`-only entries remain valid.
  v159+ totals entries carry `pt` (the model's projected total); v160+ side
  entries carry `sh` (points the sharp-money factor moved the pick, signed
  toward the side taken — absent when there was no qualifying split); v164+
  entries carry `gp` (model-vs-market gap) and `tr` (ladder tier), and ATS
  entries carry `pm` (the model's projected margin).
- `sportshub:pending` — ungraded picks awaiting results (v83+ includes `conf`;
  v160+ includes `sh`; v164+ includes `gp`/`tr`, plus `:s` ATS rows carrying
  `hsp` (the home-oriented spread) so they can be graded without re-fetching odds).
- `sportshub:mlbidx` — cached MLB player→team index for fantasy auto-detect.
- `sportshub:lines:{YYYYMMDD}` — device-local line tracking for today's games:
  first-seen, latest, and (v167) a bounded **`hist`** of every observed change
  with the numeric spread, which is what the 🔪 Sharp Action move counts are
  built from. Only today's key is kept; older days are purged on write.
- `sportshub:debugbooks` — set to `'1'` to log ESPN's raw `pickcenter` payload
  to the console when a game opens (v167; the multi-book shape is unverified).
- `sportshub:fantasy:{sport}` — the saved fantasy roster, one per sport
  (`fanKey(sport)`, e.g. `sportshub:fantasy:baseball`).
- `sportshub:fparticles` — last good FantasyPros article list (`{at, items}`), so
  the 📰 Fantasy Advice section paints instantly and still shows something when
  the backend is asleep.
- `sportshub:secs` — per-section collapse state (`{"<tab>|<heading>": 1|0}`,
  1 = open). Both states are stored since v166, because most sections now
  default closed; an absent key means "use the tab's default".
- `sportshub:railoff` — leagues the user has filtered OUT of the top rail
  (array of sport keys). Only the hidden ones are stored, so a league you've
  never touched — including one whose season starts next week — shows by default.
- `sportshub:theme` — chosen color theme (`'light'` | `'dark'`). Absent = follow the
  OS `prefers-color-scheme`. Read by the inline `<head>` script and by `applyTheme`.
- Note: localStorage is **per browser/device** — the home-screen PWA and Safari
  keep separate tallies/rosters.

## Things we tried that DON'T work (don't re-attempt without a backend)

- **API-Sports** — blocks browser CORS. (Why we use ESPN at all.)
- **X / Twitter embeds** — widgets hang/throttle, especially in PWAs; removed.
- **Reddit "Buzz" feeds** — Reddit sends no CORS header; even free CORS proxies
  (allorigins, corsproxy.io) didn't pull through reliably. Removed in v60.
- **FantasyPros (and fantasy-advice sites generally)** — no CORS header, so the
  browser can't read their article pages or feeds. Going through the backend
  scrape is the only route (v155's `/api/articles/nfl`), and even server-side the
  exact feed URL is a guess until it's checked on device.
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

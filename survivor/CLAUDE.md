# CLAUDE.md — 🏈 Family Survivor League (`survivor/`)

> # ⛔ THIS IS NOT SPORTS-HUB
> `survivor/` is a **separate application** that happens to live in the
> Sports-Hub repository so the owner can test it on his phone. It shares **no
> code, no CSS, no service worker, no storage keys and no release ritual** with
> the app in the parent directory. **It is meant to move to its own repo before
> the family links go out** — see "Why it must move" below.
>
> **If you are working in `survivor/`, this file is your instructions.** The
> root `CLAUDE.md` describes a different app; do not apply its rules here.
> If you are working on Sports-Hub, nothing in this file applies to you.

> ## 🥇 THE GOLD IS NOT TO BE CHANGED
> The owner, unprompted: *"Don't change the gold I love the gold."* It is the
> app's whole identity — the tabs, the pick card, the buttons, the bars.
>
> **`--ac`, `--ac6`, `--wm`, `--on-ac`, `--grad` and `--glow` are frozen in
> both palettes.** They have been touched exactly once, in the commit that
> created the app, and that is how it stays.
> - **`survivor/tests/gold.js` pins all twelve values** and fails loudly if any
>   of them moves. ⚠️ **If it fails, the change is wrong — do NOT update the
>   expectations to match it.** Ask him.
> - Adding a NEW colour beside the gold is fine and has been done: v35's
>   `--grad-pos` / `--grad-neg` / `--grad-tie` copy its *construction* (a
>   five-stop plate with a double highlight) without touching the gold itself.
>   **Copy the recipe, never the tokens.**
> - ⚠️ Accent fills take **dark** ink (`--on-ac`). White on gold measures about
>   1.9:1 and is unreadable. That rule is part of why the gold works.

> ## 🧪 The tests live in `survivor/tests/` — run them
> `node survivor/tests/run.js` runs every suite (it starts its own server);
> `node survivor/tests/run.js a11y ios` runs just those. **808 checks across
> 34 suites, all driving the real app in headless Chromium.**
> - They used to live in `/tmp` and were lost at the end of every session,
>   which meant each change re-proved the same ground by hand. They are in the
>   repo now. **Add to them rather than starting over.**
> - `survivor/tests/README.md` lists what each suite holds down, the sandbox
>   facts that look like bugs and are not, and the five ways a test in this
>   app has previously managed to pass while measuring nothing.

## The two apps, side by side

|  | **Sports-Hub** (repo root) | **Family Survivor** (`survivor/`) |
|---|---|---|
| Who uses it | the owner, alone | ~20 relatives, incl. a 95-year-old |
| What it is | betting model, fantasy, scores | one NFL survivor pool |
| Version constant | `APP_VERSION` in `app.js` | `APP_V` in **`survivor.js` AND `survivor/sw.js`** |
| Release ritual | bump `APP_VERSION` + `?v=` on `styles.css`/`app.js` in `index.html` | bump `APP_V` in **both** `survivor.js` and `sw.js` **and** both `?v=` in `survivor/index.html` — all four are pinned to each other by `tests/update.js` |
| Delivery | root `sw.js`, cache keyed to `APP_VERSION` | **its own** `survivor/sw.js`, network-first, self-reloading |
| Styling | `styles.css` (6 layers, palettes) | **`survivor/survivor.css`, standalone** |
| Storage prefix | `sportshub:` | `survivor:` |
| Shared state | none — localStorage + read-only backends | **Supabase** (the only real database in the repo) |
| Design floor | none stated | **18px base, ≥56px targets, ≥16px inputs** |
| Tests | `node --check` only | 34 suites, 808 checks (33 headless-Chromium + a Postgres-parser one) |

⚠️ **The traps that come from them sharing a repo today**, all of which the
move to a separate repo removes:
1. **One origin, one localStorage bucket.** Both apps are served from
   `mcdermottj639.github.io`, and localStorage is per-ORIGIN, not per-path — so
   they share one quota (~5 MB in Safari). The `sportshub:` / `survivor:`
   prefixes stop collisions, not competition for space. Sports-Hub's
   `sportshub:aitally` is the one that grows without bound.
2. **Service-worker scope.** The root `sw.js` is scoped to `/Sports-Hub/`,
   which contains `/Sports-Hub/survivor/`. Survivor's own worker is more
   specific and wins, but the root cache is keyed to `APP_VERSION`, so every
   Sports-Hub release churns the cache covering grandma's page.
3. **Path deletion.** From `/Sports-Hub/survivor/` any relative can delete a
   path segment and land on the owner's betting model and fantasy team.

## Why it must move (and it is the LAST step before links go out)

Reasons 1–3 above, in that order of severity. Nothing else is blocking it: the
app is finished and verified. The move needs a new repo, Pages enabled on it,
and the two Supabase constants carried across.

## What it is

`survivor/` — **🏈 Family Survivor League**, a standalone mini-app for the
owner's family pool (`index.html` / `survivor.css` / `survivor.js` /
`schema.sql` / `README.md`). **It is NOT part of Sports-Hub**: no shared code,
no shared service worker, no shared localStorage keys, and it does **not**
participate in the `APP_VERSION`/`?v=` ritual. It is in this repo only so the
owner can test it on his phone; **it is meant to move to its own repo before
the family links go out**, so that deleting a path segment from the URL
doesn't land 20 relatives in the betting model. See `survivor/README.md`.
- **The league is non-elimination**: you are never knocked out, you just can
  never pick the same team twice. Six house rules, settled 2 Sep 2026 and
  written at the top of `survivor.js`: a missed week costs nothing (no loss,
  no points, no team burned) · per-GAME deadline (pick or change until that
  game kicks off) · picks hidden until their game starts, then public ·
  regular season only, weeks 1–18 · standings sort on wins with cumulative
  point margin as the tiebreak · a tie is neither a win nor a loss.
- ⚠️ **The no-repeat rule is a `UNIQUE` CONSTRAINT, not a UI check**
  (`never_reuse_a_team` in `schema.sql`). Two open tabs or a stale phone page
  would otherwise produce a duplicate that the commissioner has to adjudicate
  by text message. Anything new that writes a pick must go through
  `submit_pick`/`admin_set_pick`, never straight at the table.
- **🔄 Updates reach every phone by themselves — `survivor/sw.js`.** The
  owner: *"if I update the survivor app it needs to update for all the
  family."* It does, but only because of this worker. **The `?v=N` ritual
  had already failed silently: `survivor.js` changed 16 times while
  `index.html` still asked for `?v=1`**, so a returning phone could have
  served a months-old copy of the CSS and JS. Its own **network-first**
  worker now fetches every same-origin file with `cache: 'no-store'`,
  bypassing both the browser cache and GitHub Pages' ~10-minute one; the
  Cache API copy is only the offline fallback. That is the opposite of
  normal PWA advice and is deliberate — being CURRENT matters far more than
  being fast here, and the files are a few KB.
  - ⚠️ **Cross-origin is never intercepted** (`url.origin !== self.location.origin`),
    so ESPN scores and Supabase picks always come from the network. A stale
    score or a stale pick would be worse than none.
  - **🔄 It reloads itself, and the detection no longer depends on anyone
    remembering a version number (v24).** The worker only helps a COLD
    open; on a phone the app is never really closed — a Home Screen icon
    resumes the SAME page for days — so a change could sit on the server
    all week unseen. The page watches for one and reloads.
    - ⚠️ **v23 replaced the self-reload with an "Update now" button and the
      owner rejected it: *"that was stupid change by me. Auto reload is
      better."*** He is right, and the reason is this league specifically:
      the whole promise is that twenty relatives do NOTHING but tap a link.
      A bar asking them to approve an update is a chore handed to people
      with no way to judge whether it matters, and the ones who ignore it
      are exactly the ones you needed to update. **Reverted in v24.**
    - **Two independent signals, because each alone has a hole.** (1) A
      **HEAD on `survivor.js`** comparing ETag/Last-Modified/length against
      the copy booted with (`fileStamp`/`checkForUpdate`) — needs **no
      version bookkeeping at all**, which is the point: a number somebody
      must remember to bump is a number that eventually lies, and that is
      precisely how `?v=1` survived sixteen releases here. (2) The worker
      taking over — free, but it only fires when **`sw.js` itself changed
      byte-wise**, which is why `sw.js` carries its own `APP_V` marker that
      nothing reads. Forgetting that marker costs only signal 2.
    - Checked at boot, on `visibilitychange`/`focus`, and every 15 min,
      throttled to one check per 30s. **The first read is the baseline and
      can never itself count as a change** — otherwise every fresh page
      would reload once on boot.
    - ⚠️ **`applyUpdate` waits out a pick being made** (`S.confirming` /
      the new `S.saving`, retrying every 4s). That is the one moment a
      silent reload destroys something rather than just being abrupt.
      Everything else on screen is re-derived on the way back up.
  - `APP_V` shows in the footer, so the commissioner can ask "what does
    yours say?" and know at once whether somebody is on an old copy. It is
    the **build number** — one per shipped change to `survivor/` — so a
    bigger number is always newer. ⚠️ **Bump it on every ship — in BOTH
    `survivor.js` and `sw.js`.** It does not
    affect delivery (the worker does that), but a version that lies is worse
    than none, which is exactly how `?v=1` sat unchanged for sixteen
    releases. It was briefly `v1` for one commit, which read as "brand new
    app" when it was build 17.
    - **🔒 All THREE numbers are now pinned to each other by test** — `APP_V`
      in `survivor.js`, `APP_V` in `sw.js`, and the `?v=` on both assets in
      `index.html` (`tests/update.js`). They had drifted again: at build 43
      the page was still asking for `?v=18` and `?v=22`. The query string no
      longer *delivers* anything — the worker does that, and the same suite
      proves it — but three numbers that all claim to say "this is build N"
      must not be free to disagree, which is precisely the failure this app
      already had once. **Bump `APP_V` in both files and the two `?v=` in
      `index.html` together, or the suite fails and names which is lying.**
  - ⚠️ Survivor sits under the Sports-Hub worker's `/Sports-Hub/` scope
    today; its own worker is more specific and wins, and it is what
    survives the move to a separate repo.
- **🔗 ONE league link, and each person taps their own NAME.** The owner's
  rule: *"For them on the other end there can be no required work. Just click
  link, add name and pick as we go."* So the commissioner texts a single
  address to the family group; each person opens it, taps their own name
  once, and that phone remembers them forever (`signInWith` writes the token
  to localStorage AND to the address bar via `location.search`, so a
  bookmark or Home Screen icon captures it).
  - `players.claimed_at` marks a name as taken; `claim_player(id)` hands out
    that player's token and is the ONLY way the token can reach them, since
    `players_public` deliberately omits it. A claimed name disappears from
    the list, so two people can never share one entry.
  - `join_league(name)` covers anyone the commissioner forgot — they type a
    name instead. It refuses duplicates case-insensitively and **never grants
    admin, however it is called.**
  - ⚠️ **Tapping the wrong name is confirmed AND self-undoable.** Choosing
    who you are is a bigger commitment than a pick — it takes a name off the
    list for everybody else — so `askName` asks "Are you Nana?" first, with
    the safe answer holding focus. And **before their first pick** the Pick
    screen carries a "Not Nana? Tap here to pick a different name" escape
    (`#notme` → `release_me`), so a mis-tap is fixed in two taps without
    texting the commissioner. Once picks exist the escape disappears and
    `release_me` refuses — untangling that is a real decision and belongs
    with the commissioner via `admin_unclaim`.
  - `admin_unclaim` puts a name back when somebody taps the wrong one.
  - ⚠️ **Pre-add everyone's names.** Tapping beats typing for the people this
    league exists for; the type-your-name path is the fallback, not the plan.
  - This replaced "mint 20 personal links and text them individually".
    Individual links still exist in Admin as a rarely-needed escape hatch.
- **Identity is a personal URL** (`?u=nana`), saved to localStorage on first
  visit. No password, no account, no install — that is the only design that
  a 95-year-old can actually use, and it is a trust model rather than a
  security model on purpose. Tokens are NOT readable by the anon key: the app
  reads a `players_public` VIEW that omits the column.
- **🚨 PICKS ARE THE ONLY THING STORED.** Records, margins and standings are
  computed live from ESPN's free NFL scoreboard on every render. That deletes
  a whole subsystem — no results table, no cron, no scraper, no write path a
  viewer could poison — and it makes the standings tick live on a Sunday.
  Do NOT add a results table; it would immediately be a second source of
  truth that can drift.
- ⚠️ **The app ships NOT SHARED, and that is the last step before the family
  gets links.** `SUPABASE_URL`/`KEY` are empty, so `pickStore()` returns
  `LocalStore` and every person would get their own isolated copy. The
  footgun was that **"Copy everyone's links" worked anyway** — 20 relatives
  could each be texted a link that opens an empty app on their own phone.
  `linkWarnOK()` now guards every path that hands a link to another human,
  the Admin screen leads with a red `.warnbox` instead of a mild note, and
  the setup steps are numbered in-app including the SQL-editor commissioner
  seed the audit called for. `isShared()` is the one predicate for "picks
  actually travel between devices".
- 🚨 **THE CONFIG MUST BE IN THE FILE, NOT IN localStorage.** `pickStore()`
  reads `survivor:sb` from the device and falls back to the module constants.
  So pasting the Supabase URL/key into the Admin panel configures **only the
  commissioner's own phone** — every relative opens the same web address with
  nothing saved and silently gets `LocalStore`. Measured: device A `cloud`,
  device B `local`. **The two constants at the top of `survivor.js` are the
  real switch**; the paste box is a tester's override. Admin now says so in a
  warning box and has a **"Copy the 2 lines for the deployed app"** button
  that emits exactly the two `let SUPABASE_URL/KEY` lines.
- 🚨 **A stranded personal link used to offer "Start the league".** Anyone
  arriving on `?u=…` before the league was switched on was shown the
  first-run setup screen — so Nana could have created her own empty league
  and become its commissioner. `renderPicker` now branches on whether the URL
  carried a token: a failed token gets "This link isn't working · ask
  {LEAGUE_ADMIN_NAME} · nothing is wrong with your phone" and **no way to
  create anything**. Setup is only offered when there is no token at all.
- **Storage is pluggable**: `LocalStore` (localStorage, this device only) and
  `SupaStore` (Supabase free tier, plain `fetch` against PostgREST, no SDK
  and no build step). `pickStore()` picks one; nothing else in the file knows
  which is live. Config goes in `survivor:sb` on the device OR hardcoded at
  the top of `survivor.js`.
- **Demo mode is not a toy, it is the only way to test the app before
  10 Sep 2026** — with no completed games there is nothing to grade and the
  standings and history screens cannot be exercised at all. `demoGames()`
  builds a deterministic season off a circle-method round robin (16 games,
  all 32 teams, nobody twice). It is a FULL season in progress, sized to the
  real league, and every state the app can be in is present on purpose:
  - `DEMO_WEEK` **10** — nine weeks played, week 10 underway: one game final
    since Thursday, **three live right now** (`state: 'in'`), the rest ahead.
  - **18 relatives** (`DEMO_FAMILY`), of whom `DEMO_UNCLAIMED` (4) have not
    tapped their name yet and hold no picks — so the join screen has real
    names to offer and the first-run welcome can be seen.
  - `DEMO_MISSED` gives Nana weeks 2 and 7 off, `DEMO_NO_PICK_THIS_WEEK`
    leaves two people off the current week (the chase list), `DEMO_TIE`
    forces one real tie, and `DEMO_BYES` rests teams from week 5 on.
  - ⚠️ **Kickoff INSTANTS are relative to `Date.now()`, never a fixed clock
    time.** They were pinned to 1pm, so opening the demo after lunch made
    every upcoming game already-kicked-off and refused EVERY pick. Anything
    added here must stay relative.
  - **But the LABEL is a real NFL slot (v27).** The owner: *"The times are
    not realistic in the demo and it's making it hard for me to do it… nfl
    are set times. Everybody is east coast, so order these games logically
    like the nfl does."* Relative instants produced 5:00 AM kickoffs, which
    is not a thing. **The two jobs are now separate fields**: `date` is the
    deadline and stays relative; **`whenLabel`** is what the game shows, and
    it comes from `DEMO_SLOTS` — Thu 8:15, Sun 1:00, 4:05, 4:25, 8:20, Mon
    8:15, Eastern, because everyone in the league is. Every game the app
    renders now formats through **`kickWhen(g)`**, which returns the label
    when a fixture supplies one and `fmtKick(g.date)` otherwise, so real
    ESPN games are untouched.
    - `demoSlotFor(i, n)` keeps the SHAPE of a real week at any slate size
      (bye weeks change the game count): one Thursday game, the bulk at
      1:00, ~30% in the late-afternoon window, then SNF and MNF.
    - The anchor is **20 minutes past the Sunday 1:00 kickoff**, so the demo
      always opens on a genuine mid-week state — Thursday final, the early
      window live, and five games still pickable — at any real hour.
    - `demoSunday(week)` dates each week off Sunday 13 Sep 2026, so the
      labels carry real dates (week 10 is Sun 11/15). Display only.
    - Live scores scale at **0.2**, not 0.6: twenty minutes in is the first
      quarter, and 22 points beside a "1Q" clock is what made the old
      fixture read as fake. Broadcasts match their slot (Prime / NBC / ESPN).
    - ⚠️ Ordering needed no code — the app already sorts by `date`, and the
      slot offsets are monotonic. **If you add a slot, keep `at` in real
      chronological order or the slate will sort against its own labels.**
  - ⚠️ **The seeder writes straight to the store and threads the admin token
    through `addPlayer`** — the first add bootstraps the commissioner and
    every later call must carry that token, or `addPlayer` correctly refuses
    as "not an admin" and only one player is ever created.
  - The Admin screen carries a "what's loaded and what to look at" guide
    (`.demo-guide`), and the suites derive week/player counts from these
    constants rather than hardcoding them.
- **"Lost by 7 — 19-26" read as one run of numbers (v24).** The owner:
  *"can u see how the dashes are confusing. Make a distinction between lost
  by and the score total."* An em dash and a hyphen sat side by side, so
  the margin ran straight into the score. The verdict and the score are
  separate elements on separate lines now (`.lk-res` / `.lk-score`), and
  the score **names both teams** — "Lost by 28" over "Final score: Jaguars
  10, Ravens 38". The distinction is structural, not a matter of reading
  punctuation correctly, which is the right call for the reader this app
  exists for.
  - **And in v25 the WHOLE card is the result.** The owner, looking back
    through the demo: *"change the card to green for a win or red for a
    lose so it's clear too."* Right — v24 kept the card gold and left the
    distinction to the words, because coloured TEXT on gold is unreadable.
    Recolouring the fill itself solves the same problem the other way, and
    a season's history now reads at arm's length without parsing a word.
    - **Gold is now reserved for "still your pick"** — the current week,
      and a game still being played. A colour means something is settled.
    - **🥇 PLATED, like the gold (v35).** The owner: *"The golds are beautiful
      but the reds and greens are cheap and stale. How can we strengthen those
      colors like the gold plated is."* Right, and the reason is structural:
      the gold was a five-stop metal with a DOUBLE highlight while green and
      red were single flat hexes — two design languages on one card.
      `--grad-pos` / `--grad-neg` / `--grad-tie` mirror `--grad`'s exact
      construction now, with `--glow-pos` / `--glow-neg` to match, and the
      crowd bars and season-grid swatches pick up the same treatment.
      - ⚠️ **The highlight goes the OTHER WAY from gold.** Gold carries dark
        type, so its bright stop can be very light. These carry WHITE type, so
        the shine is *the lightest stop white can still survive* — every stop
        is measured at 4.5:1 under white at .88 alpha, and the first attempt
        failed on exactly that (a #22855c highlight measured 3.92 and had to
        come down to #1d7350).
      - The semantic TEXT tokens were deepened with them — Champagne `--pos`
        #1d7a52 → **#116b48** and `--neg` #b0332a → **#a52a1e**; Onyx `--pos`
        #4fb383 → **#43c793** and `--neg` #e8635a → **#f26a5c** — each
        re-measured on both the card and the page ground.
    - ⚠️ **The fills are NOT `--pos`/`--neg`.** Those are tuned to be read
      AS text against the page ground, so they are far too light to sit
      under white type (Onyx's `--pos` #4fb383 measures ~2:1). The card
      uses deep dedicated fills — `#17694a` / `#9d2b23` / `#4a4636` for
      the tie — one pair serving both palettes, and `.lk-k`/`.lk-score`
      lift from .75/.72 to .92/.88 because white at low alpha over a
      colour is a grey, where over gold it was only a shade.
    - Measured, not eyeballed: every line on all three cards in both
      palettes, against EVERY STOP of the plate — 4.90:1 at worst.
    - 🚨 **A plated fill breaks a naive contrast harness.** A gradient is a
      background-IMAGE, so `backgroundColor` is transparent and a parent-walk
      measures the text against the PAGE — which reported 18.59:1 (white on
      black) and a bogus "a win looks like a loss", because both fills read as
      `rgba(0,0,0,0)`. The harness reads the gradient's own stops now and
      takes the WORST, which is the honest question anyway: the type sits over
      all of them. **Any new check comparing fills must compare
      `backgroundImage`, not `backgroundColor`.**
- **📋 Once your own game kicks off, the rest of the week folds into a list
  (v26).** Mocked first and approved before a line changed — the owner:
  *"Show me a screenshot of what that would look like before u change a
  thing."* Worth repeating as a habit for anything that changes what a
  screen IS rather than what it says.
  - **The trigger is `locked`** — you have a pick and its game has started.
    Until then every card stays full, because you can still change your
    mind and a list is a worse thing to choose from.
  - Order is **Playing now → Final → Still to play** (the owner's call:
    *"Put final scores above upcoming games"*), with still-to-play split by
    DAY, or Friday's 5:00 AM reads as today's. Each row is one 56px button
    carrying the same `data-info` the ⓘ did, so **dropping that button is
    where the width for full team names came from** — nothing truncates.
  - Measured on the demo's week 10: **2,863px of scrolling → 1,491px**.
  - **Nothing is removed.** "Show the full matchups" restores the cards and
    "Back to the short list" returns. The state is **`S.fullWeek`, a WEEK
    NUMBER rather than a boolean**, so walking to another week starts
    condensed again with no extra bookkeeping.
  - ⚠️ **A live game's score had to move onto the locked card**, because
    the "Already started" list was the only place it existed and this folds
    that away — the one game you care most about would have been the one
    game with no score.
  - ⚠️ **Every size in `.cg*` sits above the app's 15.5px type floor on
    purpose.** A condensed view that shrinks the type is just a smaller
    problem, and this league's whole reason for existing is a reader with
    aging eyes.
  - ⚠️ **Two suites went QUIET rather than red** when this shipped: they
    reach for `.pk` team buttons on the Pick screen, which a locked pick no
    longer draws, and a `querySelector` that finds nothing measured nothing
    and printed nothing. `a11y.js` silently lost both of its "team record"
    contrast checks — 18 passed, still 0 failed. **A check that vanishes is
    worse than one that fails**; it now asserts the buttons are there before
    measuring them.
- 🚨 **OPEN RULES QUESTION this surfaced, NOT a bug I introduced:
  `submitPick` still lets you replace a pick whose game has already
  finished.** Its only deadline test is on the NEW team's kickoff, so
  picking the Broncos on Thursday, watching them lose, and switching to a
  Sunday team erases the loss and its margin. The UI has always called that
  week "LOCKED IN" while the store would have accepted the change, and
  v26's fold hides the path without closing it — "Show the full matchups"
  still gives you working buttons. **Ask the owner before changing it**: it
  is a reading of house rule 2 ("per-GAME deadline"), not an implementation
  detail, and closing it means refusing a change once YOUR OWN pick has
  kicked off, in both stores and `submit_pick`.
- ⚠️ **Two layout traps found while building it, both worth remembering:**
  (a) `.tabs { display: grid }` **out-specifies the browser's `[hidden]`
  rule**, so `el.hidden = true` silently stopped working and the tab bar
  showed on the sign-in screen — there is now an explicit
  `[hidden] { display: none !important }`. (b) In a flex row, a long italic
  label ("picked — hidden until kickoff") shrank the NAME column to a single
  letter; the pick rows are a grid with a `minmax(84px, 1fr)` name column now.
- **🚨 BYE WEEKS — the hole was the ADMIN path, not the pick screen.** The
  pick screen renders from that week's scoreboard, so a team on bye simply
  has no button and was always safe. But the commissioner's "enter a pick for
  someone" dropdown listed **all 32 teams every week** with no schedule check
  — and that is the "Nana texted me her pick" path, i.e. the single most
  likely way a bye team ever gets picked. The outcome was silent and bad:
  `gradePick` returns `nogame`, `tallyFor` scores it as nothing, but
  `usedTeams` still counts it — so **the team was burned for nothing**, which
  house rule 1 makes strictly worse than not picking at all.
  - Fixed in depth: `byeTeams(week)`/`gameFor(week, team)` derive byes from
    the schedule (ESPN lists 13 games ⇒ the other 6 teams are on bye); the
    admin dropdown offers only teams that play and names the byes; BOTH
    stores refuse a pick carrying no kickoff; and `submit_pick` /
    `admin_set_pick` in `schema.sql` reject a null `p_kickoff` as the
    backstop. A stray legacy bye pick now renders ⚠️ in history instead of
    scoring silently.
  - ⚠️ **A no-kickoff pick IS a bye pick.** That equivalence is what lets the
    database enforce the rule without knowing the NFL schedule, and it is why
    `p_kickoff` is now required rather than optional.
  - ⚠️ **The demo season played all 32 teams every week** (a 32-team circle
    round robin is 16 games), so bye handling was **untestable** — which is
    exactly how this survived the first test pass. `DEMO_BYES` now drops
    games from weeks 3 and 4. **A fixture that cannot express the failure
    cannot test the fix.**
  - ⚠️ **A subagent reported this area as "already correct".** It had checked
    only the pick screen. The owner pushed back, and he was right. Verify a
    clean bill of health across EVERY write path before accepting it.
- **📱 iPhone layer** (bottom of `survivor.css`, appended last so it wins).
  The league runs on phones and the user who matters most opens it from a
  Home Screen icon, where Safari's chrome is gone:
  - ⚠️ **An `apple-touch-icon` MUST be a PNG.** iOS silently ignores an SVG
    one and substitutes a screenshot of the page — which was the previous
    state, i.e. grandma's icon would have been a picture of a sign-in
    screen. `icon-180/192/512.png` are real files now, plus a manifest.
  - `viewport-fit=cover` means the page runs UNDER the Dynamic Island and
    the home indicator, so every edge takes `env(safe-area-inset-*)` — the
    header, tabs, screens, footer and the sheet. Without it content is
    physically unreachable on any notched phone.
  - `dvh` on the sheet (with `vh` as fallback): Safari's toolbar grows and
    shrinks while you scroll, so `vh` is a moving target.
  - ⚠️ **iOS ignores `overflow:hidden` on `<body>`**, so the page scrolled
    behind the open matchup sheet. `openSheet` pins the body with
    `position:fixed` + a negative `top` and `closeSheet` restores the
    offset — that is the only lock that actually holds.
  - `-webkit-tap-highlight-color: transparent` (no grey flash) and
    `-webkit-touch-callout: none` on buttons — a shaky hand rests on a
    button longer, and the iOS copy/share bubble popping up over the team
    you are trying to pick is alarming. ⚠️ **Chromium implements neither
    property**, so the callout rule cannot be verified in the sandbox; the
    suite asserts the shipped source and proves the block is live via
    `user-select`, which Chromium does support.
  - `theme-color` and `apple-mobile-web-app-status-bar-style` are updated by
    `setThemeColor()` on every palette change AND in the inline `<head>`
    script, or the notch stays light while the app is dark.
  - Verified across **iPhone SE / 13 mini / 15 / 15 Pro Max** — 60 checks:
    no sideways scroll on any of the four screens, every input ≥16px, every
    tap target ≥44px, the scroll lock and its restore, the sheet clearing
    the home indicator, and the status bar tracking the palette.
- **🔍 Three-agent audit (accessibility · deep stats · adversarial correctness).
  Findings acted on, and the two that are ARCHITECTURAL rather than bugs:**
  - 🚨 **`tallyFor` sums all 18 weeks but only loaded weeks have games**, so a
    week never fetched in THIS session graded as `nogame` and silently
    vanished from that player's record — two people could see different
    standings at the same moment. `weeksInPlay()` + an `ensureWeeks` on entry
    to Standings/History closes it.
  - 🚨 **The admin path had a bye guard but NO deadline guard**, so the
    commissioner could enter a pick on a game that had already finished — a
    pick made with hindsight. Exactly the same shape as the bye hole. Fixed
    in the dropdown (`state === 'pre'` only), both stores and `admin_set_pick`.
  - 🚨 **`if (S.games[week])` is truthy for `[]`**, so ONE failed ESPN fetch
    pinned that week to "no games" for the life of the page. Now tests
    `.length`, which is safe because a real NFL week is never empty.
  - 🚨 **The 60s live refresh gated on the STALE snapshot** (`some(state==='in')`),
    so it could never discover the first kickoff of the day — a tab opened at
    9am never updated. Now refreshes whenever the week is unfinished, and
    re-derives `currentWeek()` so a long-lived tab crosses week boundaries.
  - 🚨 **Tokens were the slugified NAME** — `?u=nana`, `?u=jack` — so anyone
    could guess a relative's link, and guessing the commissioner's got them
    admin. Now `name-xxxxxx` with a random tail (`randTail`, and
    `gen_random_bytes` in SQL).
  - The per-week localStorage cache was permanent and nothing cleared it (not
    even "Erase everything"), so one bad ESPN snapshot was stuck forever.
    `clearWeekCache()` + an admin "Re-fetch all results" button.
  - ⚠️ **NOT FIXED, and it cannot be fixed client-side: "picks are hidden
    until kickoff" is a UI convention, not a security boundary.** The client
    computes standings itself, so it must read every pick, so `picks` is
    readable by anyone with the anon key — which is in the public JS. Anyone
    who opens dev tools can see this week's picks early. Written into
    `schema.sql`'s header so nobody promises the family otherwise. Closing it
    properly means storing kickoff times server-side and gating reads behind
    a function.
  - ⚠️ **Seed the commissioner in the Supabase SQL editor, NOT in the app.**
    `admin_add_player` lets the first caller become admin while `players` is
    empty, and the anon key is public the moment the site deploys.
  - ⚠️ **`em` compounds.** `.gcell` is `.78em`, so a `.9em` child rendered at
    **12.6px**, not 16.2px. Root sizing moved to `:root` (and `[data-big]`
    with it) so `rem` is a true anchor; small labels now use `rem`.
  - 🚨 **The margin in the season grid lived only in a `title` attribute**,
    and the legend told people to "tap and hold" — a gesture **iOS Safari
    does not support on non-image elements**, so the app promised something
    it could never deliver. The margin is printed in the cell now, which
    also removes the app's only colour-only win/loss cue.
  - `setScreen` scrolled to the top on EVERY render, so making a pick threw
    you back up the page. Only a real screen change scrolls now.
  - Contrast, measured: **`--mu` failed AA in Champagne (3.37:1)** and is now
    `#726a5a` (4.74:1); `--mu2` fails in BOTH palettes and must never carry
    text — the two places that did now use `--gy`.
  - ⚠️ **Two test bugs cost real time and are worth remembering.** A contrast
    harness initialised `'rgba(0,0,0,0)'` but compared `'rgba(0, 0, 0, 0)'`,
    so the parent-walk never ran and EVERY ratio was measured against black —
    three "failures" against correct CSS. And the demo seeder wrote through
    `adminSetPick`, so the new deadline guard correctly refused its
    backfilled weeks 1-3 and the fixture silently lost them; the seeder now
    writes straight to the store, because fixture generation must not
    impersonate a commissioner.
  - Verified: **390 checks** across sixteen suites (behaviour, matchup/grid,
    byes, four iPhone sizes, accessibility, audit fixes, the not-shared-yet
    guards, the deployment/stranded-link path, and the zero-touch relative
    experience).
- **The relatives do NOTHING but tap a link — verified, not assumed.** With
  the two constants baked into the deployed file, a phone that has never
  opened the app and has nothing in its localStorage lands in `cloud` mode
  with: no password field, no sign-up, no install prompt, no setup screen and
  **zero dialogs**. The config comes from the FILE, which is the whole reason
  it must live there (see the `pickStore()` note above). The only person who
  ever touches Supabase is the commissioner, once.
- **First-run welcome** (`.welcome`, `survivor:welcomed`) — someone opening a
  link from a text message has no idea what they are looking at. One short
  dismissible card names them, says "pick one team you think will win",
  states the two rules that make this pool unusual (never knocked out, never
  the same team twice) and promises nothing to install. It shows ONLY before
  a player's first pick and only on the Pick screen, so it can never sit
  between a returning player and the game list.
- **✅ Every pick goes through a confirmation step** (`askConfirm` →
  `#confirm`, `savePick`). Owner's ask: *"there should be a confirmation pop
  up... that should help if people accidentally click a team."* A tap on a
  team NEVER writes — it opens a full-screen panel naming the team, the
  opponent and the kickoff, and (when replacing) the team being dropped. A
  pick spends a team for the whole season, and a shaky hand, a pocket or a
  scroll all produce accidental taps, so this is error prevention, not
  ceremony.
  - **The SAFE option takes focus, and both answers are the same size** (66px).
    A cancel that is harder to hit than a commit is not a real cancel.
  - **It names the CHANNEL (v28)** — owner's ask. The panel already carried
    the opponent and the kickoff, so where to watch it is the last thing you
    would otherwise go looking for. Its own line (`.cf-tv`), not another
    clause on a line already holding a venue and a time; absent entirely
    when ESPN lists no broadcast rather than an empty 📺.
    - ⚠️ **`normGame` was only reading `broadcasts`.** ESPN publishes the
      channel in TWO shapes and which one it uses varies by sport and week —
      `geoBroadcasts[].media.shortName/callLetters` is the richer one. The
      main app's `tvFor()` has read both for many versions; survivor now
      does too, deduped. Reading only one would have shown a blank channel
      on live NFL games while every demo game showed one.
  - Backing out via the button, Escape, or the backdrop all leave the
    existing pick untouched.
  - ⚠️ **`pinBody`/`unpinBody` replaced the inline body-pinning in
    `openSheet`.** Two overlays can now be involved (pick from the matchup
    card → confirm), and the old code would have unpinned on the first close
    and left the page scroll-locked. It refcounts; `askConfirm` also closes
    the matchup sheet first so the two never actually stack.
  - ⚠️ **Any test that taps a team must now also click `#cf-yes`** — five
    suites asserted the old direct-save behaviour and failed against
    perfectly correct code.
- **🐑 "With the crowd, or against it" REPLACED head to head (v34).** The
  owner: *"I don't like the head to head part of stats. Anything else we could
  use there?"* He was right to bin it — two dropdowns, two taps, and a duel at
  n=8 that is mostly noise. Given four options he picked this one.
  - `crowdStats()` finds, for each settled week, the single team the family
    piled onto, and grades it. The card then states **the crowd's own record**
    ("has won 0 of 3 weeks, and tied 2") and lists each person by **how often
    they were on it**, with their W-L on the weeks they were not.
  - **Sorted most-contrarian first**, because that is the interesting end.
  - ⚠️ **A COUNT ("1 of 5"), never a percentage (v37).** The owner read "0%"
    beside a "4-1" record and asked *"Just so I get it like 4-1 is 0%?"* —
    which is exactly the confusion two adjacent numbers of different KINDS
    create. At five weeks a percentage is false precision anyway, the same
    reason head to head was always a count. **The two columns are labelled
    now** ("Went with them" / "On your own"), because a footnote at the bottom
    of the card does not reach the eye that is reading row six.
  - ⚠️ **A tie is a real outcome (house rule 6)**, so wins + losses does NOT
    equal the week count and the card names the tied weeks separately. A test
    asserting W+L === weeks fails against correct code.
  - ⚠️ **Weeks with no single most-picked team are skipped entirely** (a tie
    for most-picked, fewer than three graded picks, or nobody doubling up).
    There is no crowd to be with or against, and inventing one would be worse
    than showing less.
  - ⚠️ **Every read goes through `pickVisible()`** — the rule for anything
    touching more than one player's picks. Without it this card would be a
    side channel for a hidden Thursday pick.
  - ⚠️ **Do NOT reuse `.st-n` here.** It is 14.76px, which is fine inside the
    matchup SHEET (the owner asked for tiny footnotes there and a test pins
    them under 15px) but breaks the 15.5px floor that applies in a TAB. The
    card has its own `.cw-n` at .88rem.
  - The old `headToHead`, `paintH2H`, their change handler and their CSS were
    all removed **by name, not by line range** — the mistake this file records
    twice already.
- **📊 Stats tab — the deep layer, built from the research spec.** Owner's
  rule was *visible for all but never in the way*, so it is a fifth tab and
  nothing about it touches the Pick screen. Per player: a headline **bench
  strength** ("how strong are the teams you have NOT spent"), which is the
  number that actually carries a non-elimination season — nobody is
  eliminated, so *what have you got left* is the real tension. Tapping a row
  opens their full numbers in the matchup sheet: luck vs judgement (actual
  wins minus the market's expected wins), style (backs-favourites rate,
  underdog wins, how contrarian), and form (streaks, average win/loss margin,
  biggest win, worst beat). Plus league-wide: **week winners**, **head to
  head**, and **most-picked teams**.
  - **Every number carries a SHORT footnote** (`statRow` → `.st-n`), not a
    paragraph. A stat nobody can read is worse than no stat, but the first
    cut explained each one in two or three sentences and the sheet ran to
    ~4600px; the owner: *"Don't take up so much space explaining. Small
    footnotes. I like the colors and visuals u had."* So it is back to the
    compact `.sh-t` tables with coloured values and a ≤40-character line
    under each — and the full definitions live in a **folded "What do these
    mean?"** accordion for anyone who wants them. Measured **1554px**.
    ⚠️ The footnote is `text-align: left` inside a right-aligned cell: a
    wrapped footnote reads far better ragged-right than ragged-left.
    Tests assert every row has a footnote, that the longest stays ≤60
    chars and under 15px, that the accordion exists and starts closed,
    that the sheet stays under 3400px, and that no statistical jargon
    (variance, regression, EV, de-vig…) appears anywhere.
  - ⚠️ **Verb agreement matters here.** The copy is generated for "you" OR a
    named person, so `vb()` adds the -s: "you take coin flips" but "Patti
    takes coin flips". Without it every sentence about somebody else read as
    broken English. ⚠️ The test for this needs a lookbehind — "Did Patti
    win" is correct (auxiliary + bare infinitive) and a naive regex flags it.
  - ⚠️ **Two rules this screen may never break.** (1) Anything reading MORE
    THAN ONE player's picks goes through `pickVisible()` — otherwise a stats
    page becomes a side channel for reading a hidden Thursday pick. (2)
    Market-derived numbers state their `n` and say they use the **closing**
    line, not the line at pick time: ESPN only ever serves a finished game's
    last posted odds. Storing odds at pick time was considered and rejected —
    it breaks "picks are the only thing stored" for a family-fun stat.
  - Head-to-head is a **count** ("Jack 5 — 3 Nana"), never a percentage;
    at n=8 a percentage is noise wearing a confident face.
  - 🚨 **`[object Promise]` bug worth remembering.** The insertion anchored on
    `function renderAdmin` while the file had `async function renderAdmin`,
    so the `async` was welded onto the new block's first line — `pctStr`
    became async and every percentage rendered as `[object Promise]`, while
    every heading assertion still passed. **Assert rendered VALUES, not just
    labels**; the suite now checks for `[object ` and for real digits.
- **☀️ Opens in light mode always.** It used to follow the OS, so half the
  family would get a dark app they never chose, and dark is the harder read
  for aging eyes. A deliberate tap of the theme button is still remembered
  per device (`survivor:palette`).
- **↩︎ A way back to the current week.** Someone who taps ‹ a few times to
  look at earlier weeks has no obvious route home, and being stranded in
  week 4 wondering why they cannot pick is exactly the kind of stuck this
  app cannot afford. `S.liveWeek` tracks the week the NFL is actually on
  (separately from `S.week`, which is the week being LOOKED at), and the
  week nav renders **"↩︎ Back to this week (Week 10)"** whenever they differ
  — naming the destination rather than just saying "back". The label also
  gains a red "not this week". Tapping it clears `weekPinned`, so the app
  resumes following the season on its own. Shown on both the Pick and
  Standings navs; absent entirely when you are already on the current week.
- 🚨 **"View as" was a ONE-WAY TRIP.** It overwrote `survivor:me` with the
  other player's token and navigated, so the commissioner became that person
  — losing the Admin tab and any route home short of knowing his own link.
  Now the admin token is stashed in `survivor:viewas` first, and a red
  `.viewbar` rides above the tabs on **every** screen: "👀 You're viewing as
  Nana · Back to my account". Impersonation is a state you must never be
  able to forget you are in.
  - ⚠️ Hopping straight from one person to another keeps the ORIGINAL admin
    token (`if (!lsGet('survivor:viewas'))`), or the way home would be lost
    on the second hop.
  - The bar survives a reload, and a stale stash (already back on your own
    account) clears itself rather than nagging.
- **The admin roster is one collapsed row per person.** Four actions plus a
  name on one flex line crushed the name to ~40px — "Cousin Dave" rendered
  as "C... D...". Each person is now a `<details>`: the name is the summary
  (56px tap target), the four actions open underneath. For 18 people that is
  **1457px instead of ~6100px**, and nothing truncates at any width.
  - **Per-person private links are GONE**, along with the bulk "copy every
    link" — both were from the superseded mint-and-text-20-links design.
    The one case they covered (new phone, name already claimed so it is no
    longer on the join list) is covered better by **Put back on list**,
    which uses the flow everybody already knows. ⚠️ It does NOT disturb a
    phone that is already signed in: `whoami` ignores `claimed_at`, so the
    old device keeps working and a second device can claim the same name.
  - Three actions remain, named for what they DO — **Put back on list**
    (was the jargony "Release"), **View as**, **Remove** — with a folded
    "What do these buttons do?" explaining each, including that Remove
    deletes their picks and Put back on list does not.
  - ⚠️ Any test clicking `[data-unclaim]`/`[data-view]` must open the
    containing `<details>` first.
  - ⚠️ **Deleting dead code by line range bit twice here.** Removing the
    `data-copy` handler swallowed `ad-copyjoin` (which sat between it and
    `data-view`), and removing `linkFor` swallowed `isShared`/`linkWarnOK`.
    Both were caught by tests. Cut by NAME, not by "everything up to the
    next function".
- **The pick card carries the FIXTURE, and every team button its chance
  (v29).** Two owner asks in a row, and they are the same instinct: put the
  thing you would otherwise go hunting for on the screen you are already on.
  - The "you can still change it" card now reads **team → who they play and
    when → 📺 channel → the instruction**, in that order, because the
    instruction is what you already know by the second week. A live card
    gains the channel too, which is the moment you most want it.
  - `matchupLine(g, team)` is the ONE description of a fixture, used by the
    card and the confirmation alike, so they can never word it differently.
  - Every team button shows **"68% to win"** — `matchupRead`'s own number, so
    it can never disagree with the ⓘ card, and absent entirely when no line
    is posted or the game has already started. It is the MARKET's view, said
    once under the heading rather than on thirty-two buttons.
- **🪖 The helmets survive a bad moment now (v30).** The owner: *"Bring back
  the helmet logos i liked that."* They were never removed — but they are
  fetched from `a.espncdn.com` and were wired `onerror="this.remove()"`,
  which is **permanent**: one failed load (a tunnel, a dead spot, an ESPN
  hiccup) deleted that logo for the life of the render, and because a whole
  slate loads at once a single bad moment could strip every helmet on the
  page. That is almost certainly what he saw.
  - `logoHTML`/`logoFail` retry once after 700ms and, only if that also
    fails, leave the team's **abbreviation in a badge occupying the exact
    same 34px box** (76px in the confirmation). There is always something,
    the hole never appears, and nothing on the page shifts.
  - ⚠️ **A sandbox screenshot can never show these** — egress to
    `a.espncdn.com` is blocked, so every helmet fails here and always will.
    Route-fulfil them in the test (`ctx.route('https://a.espncdn.com/**')`)
    rather than concluding anything from a blank card.
- ⚠️ **Type floors are deliberate and must not be lowered**: 18px base, ≥56px
  tap targets, and every `input` at ≥16px (the iOS focus-zoom rule the workout
  lab documents). A "Bigger text" toggle takes the base to 22px.
  - 🚨 **They were being broken in seven places, and the check could not see
    it (v29).** `.lk-score` (15.05px, since v24), `.lk-k`, `.game-at`,
    `.h-opp`, `.ibtn-l` (**13.28px** — the spread pill), `.ibtn-i` and
    `.byebar b` all used `em` inside a parent that had already shrunk, so
    they computed under 15.5px. Every one is `rem` now.
  - ⚠️ **The reason it went unnoticed is the lesson.** `a11y.js` swept for
    small text on *whichever screen the previous section happened to leave
    it on* — the standings — so nothing on the Pick or My Picks screen was
    ever measured. It now walks all five screens. Same shape as the two
    suites that went quiet in v26: **a check that never looks is worse than
    one that fails.**
  - The commissioner's own Admin panel is exempt where it renders keys and
    SQL in monospace — that screen is one person, not the family — and
    `.ibtn` (the little ⓘ) is deliberately 44px, the iOS floor, asserted
    separately so the exemption is visible rather than waived.
- Verified by driving the real page in headless Chromium at 390px in both
  palettes — **86 checks across two suites**: all six house rules (including the store refusing
  a reused team and refusing a pick on a kicked-off game), no duplicate teams
  across a seeded season, other players' picks not leaking onto the standings
  screen, a missed week not counting as a loss, running point totals adding up
  to the season total, sorting, the personal link signing someone in with no
  password and NOT granting them admin, zero horizontal overflow at 320/390px,
  the 44px tap-target floor on all four screens, and no console errors —
  plus 14 bye-week checks and 60 iPhone checks across four device sizes —
  plus the matchup card (its three projection sources incl. both fallbacks,
  the favourite carrying the shorter moneyline, a used team offering no pick
  button, a final leading with its score) and the grid (one row per player,
  one column per played week, no hidden pick leaking, agreeing with the
  table, scrolling in its own box rather than moving the page).
- **ⓘ Matchup card** (`matchupRead`/`matchupBlurb`/`matchupHTML`, the `#sheet`
  bottom sheet) on every game: projected winner with a win-probability bar,
  a short written read, the Vegas line (spread · O/U · moneyline), and both
  teams' overall/home/away records — plus a pick button, and a warning when
  a side is already used. ⚠️ **The "projected winner" is THE MARKET'S view,
  not a model of our own**, and the copy says so. Porting Sports-Hub's model
  would drag half of `app.js` into a page twenty relatives can open, and the
  de-vigged moneyline is both a better forecaster and honestly stateable.
  - 🚨 **The PERCENTAGE comes from the de-vigged MONEYLINE and nothing else
    (v39).** The owner: *"The win percentage should be based on money line not
    the spread as well... but still show the spread in the little information
    widget."* It used to fall back to converting the spread through
    `ncdf(-s/13.5)`, which is a **rule of thumb, not a market price** — it
    assumes every game carries the same scoring variance and it invents a
    precision the book never quoted. On screen the two were indistinguishable
    while only one of them was actually somebody's money.
  - **The spread is untouched as INFORMATION**: it still shows in the ⓘ pill,
    still fills the Vegas-line table, and still names the favourite when no
    moneyline is posted. It just never becomes a percentage.
  - With a spread but no moneyline the card shows the projected winner with
    **no number**, and the read says *"No moneyline is posted, so there is no
    percentage to quote."* Records remain the last resort for naming a
    favourite, labelled as such. With neither it says so rather than guessing.
  - ⚠️ `NFL_SD` and `ncdf` survive — the DEMO prices its fixtures with them —
    so grepping for `ncdf` still hits `matchupRead`'s comment, which names the
    conversion it deliberately does not do. **A test asserting its absence
    must strip comments first**, or the explanation reads as the offence.
- **"What does LEFT mean here?" → the column is GONE (v31 → v32).** It was
  `32 - used`, how many NFL teams you still have available. v31 renamed it
  "Teams left" and explained it in the note; the owner's answer was better:
  *"Remove that from the standings everyone's gonna have the same teams left
  mainly."* He is right — everybody plays the same weeks, so the column read
  22 / 22 / 23 / 22 down the page. **A column whose values are all the same
  is not information, it is width**, and it was taking width from the names.
  - **The count still lives where it is ABOUT you**: the "Teams left" tile
    and the used-team chips on My Picks, and the Stats tab. `tallyFor`'s
    `used` field stays for them.
  - 🚨 **It surfaced that the table was truncating NAMES** — "Grandpa J…" is
    in the owner's own screenshot from BEFORE any of this. Same fault the
    admin roster had ("Cousin Dave" → "C... D..."), and a person's name is
    the one thing in a table that must never be cut. The name column wraps
    instead of ellipsing; **that fix stays**, and with the column gone every
    name now fits on one line anyway.
- **▲▼ Rank movement in the standings (v33).** Owner: *"put a trend arrow to
  show the rising and falling each week."* `trendMap` ranks the league twice —
  as it stands now, and as it stood at the end of the week before the last
  graded one — and stacks the difference under the rank number.
  - **Stacked under the rank, not given a column.** A fifth column is what
    crowded the names in the first place (see the "Teams left" entry); this
    costs the name column nothing.
  - **`tallyFor` gained an optional `uptoWeek`.** Every other caller omits it
    and is unchanged; it exists only so the league can be ranked as of a past
    week.
  - **The baseline is the last COMPLETE week (v37).** It used to be the last
    week with any graded pick — which mid-week is the week in progress, so the
    arrows measured a half-played week: empty all Sunday morning, then
    appearing one at a time as games ended. The owner: *"The trend should
    still be live from the week before... just make it show the trend that we
    have and then when final game in finished we update standings for the
    new."* `lastCompleteWeek` requires every game in the week to be final, and
    both sides of the comparison are settled weeks, so the arrows are **stable
    all week** and roll over only when the next week is genuinely done. The
    note names the week they belong to ("when week 9 was played").
  - ⚠️ **Nobody who has not moved carries a mark (v36).** v33 drew a dash on
    every unchanged row, which mid-week is EVERY row — and under a rank number
    a dash reads as a stray mark, or worse as a minus sign attached to the
    rank. Absence is the cleaner way to say "no change", and the note under
    the table already explains what ▲▼ mean and names the baseline ("since
    the end of week 9"). Mid-week the column is simply empty, which is both
    truthful and quiet.
  - ⚠️ **Ranks are NOT a permutation**: tied players share a rank and the next
    is skipped, so the moves do **not** have to sum to zero. A test asserting
    that fails against correct code — assert instead that the table starts at
    1, never goes backwards, and that each arrow equals a re-derived
    `was - now`.
  - 🚨 **Caught by test, invisible to the eye:** the first cut passed
    `renderStandings`'s local `games` (THIS week's slate) where `trendMap`
    wanted `S.games` (the whole season, week -> games). It threw nothing and
    rendered nothing at all.
- 🚨 **The sticky name column must be OPAQUE on every row (v40).** The owner
  sent a screenshot of the week-by-week grid with earlier weeks' cells sliding
  over his own name. Cause: `.gr tr.you .gnm` highlighted your row with
  `--pos-bg`, which is an **rgba tint at .12 alpha** — so it replaced the
  column's opaque `var(--sf)` and the cells scrolling underneath showed
  straight through. It is the tint layered over an opaque surface now
  (`linear-gradient(--pos-bg, --pos-bg), var(--sf)`): identical colour,
  nothing visible behind it.
  - The scrolling `td`s may stay translucent — they sit on the card and have
    nothing passing under them.
  - ⚠️ **The general rule: a `position: sticky` cell can never take a
    translucent background.** Anything highlighting a row in this grid has to
    composite over `var(--sf)`.
  - The test asserts every name cell's computed `background-color` is alpha 1
    in both palettes, and — the real proof — scrolls the grid to the end and
    uses `elementFromPoint` at the name's centre to confirm the NAME is what
    is painted on top while cells are physically underneath it.
- **Standings has two views** (`S.stView`): the W-L-T table (default) and a
  **week-by-week grid** (`seasonGridHTML`) — player rows × week columns,
  colour-coded win/loss/tie/no-pick, modelled on the pool app the family
  already used. Both read the SAME `tallyFor`, so they cannot disagree; a
  test asserts they list the same players, order and records. The grid
  auto-scrolls to the newest week (otherwise it opens on week 1 with the
  live column off the right edge) and **honours the hidden-pick rule**, so
  an unstarted pick shows 🔒 rather than the team.
- **🕓 The week turns over on TUESDAY at 4 AM EASTERN (v38).** The owner's
  rule. `weekFromClock` decides the week from the clock alone; `currentWeek`
  is now just that plus the demo override, and **makes no network call**.
  - ⚠️ **It used to read ESPN's `week.number`,** which flips on ESPN's own
    schedule — often Tuesday afternoon, sometimes Wednesday. The app could sit
    on a finished week for a day and a half, still offering picks on games
    that had already been played. **The clock decides the week now; ESPN is
    asked only for scores.**
  - **4 AM, not midnight**, for the same reason Sports-Hub's `sportsDate()`
    uses it: a west-coast Monday-night game can run past midnight Eastern, and
    somebody opening the app right afterwards should still see that week.
  - **Eastern, because everybody in the league is** — and via `Intl` with a
    real time zone, NOT a fixed UTC offset. 4 AM Eastern is 08:00 UTC in
    September and 09:00 UTC in December; hardcoding either slips the rollover
    by an hour for half the season. There is a test for exactly that boundary.
  - ⚠️ **`WEEK2_TUESDAY` is the ONE date to change each season**, and it must
    be a Tuesday: the first rollover, i.e. the Tuesday after week 1's Monday
    night game. Everything else is derived. Weeks clamp to 1–18, so the
    off-season can never produce week 0 or week 40.
- **🧪 THE OVERNIGHT STRESS TEST (v41–v43).** The owner, going to bed:
  *"deploy some sub sonnet agents to stress test this app. Use tons of real
  scenarios and things that could go wrong structurally visually or anything
  in between."* Five agents attacked from different directions — house rules,
  security, failure modes, visual/layout, and a relative's journey. **Four
  correctness blockers and one visual blocker came back.** They are worth
  reading as a set, because every one of them is a thing the existing ~600
  checks could not see, and each failure mode has a general shape.
  - 🚨 **A DECIDED WEEK COULD BE RE-PICKED — the open question from v26,
    answered.** Take the Broncos on Thursday, watch them lose, then switch to
    a Sunday team: **the loss vanished AND the spent team came back.** A pick
    is one row per player per week, so a change overwrites rather than adds —
    which is right before kickoff and catastrophic after it. It breaks "never
    the same team twice", which is not a matter of interpretation, so it was
    closed rather than asked about.
    - **The pick row stores its own `kickoff` now.** That is the whole fix:
      the guard needs to know when YOUR pick's game starts, and previously
      only the NEW team's kickoff was ever checked. So `submit_pick` in
      `schema.sql` can enforce it without knowing the NFL schedule — the same
      trick that lets the database enforce the bye rule.
    - Held in **four places**: both stores, `submit_pick`, and
      `admin_set_pick`. **The commissioner is not exempt** — "helping Nana
      with her late pick" would erase the result she already has.
    - Changing a pick whose game has NOT started works exactly as before, and
      still frees the team you moved away from.
  - 🚨 **The Stats tab leaked hidden picks.** "Teams left" and "best left"
    counted a player's secret pick, so mid-week their count dropped by one and
    a team disappeared from their best-left list. Since the sensible play is
    usually your best remaining team, **the name that vanished often WAS the
    pick** — a subtraction is a side channel exactly like a list is.
    `usedTeamsVisible` withholds other people's unstarted picks; your own
    still count against your own bench, because you already know them.
    - ⚠️ **This is the second time this rule has been broken by a screen that
      never displays a pick.** `pickVisible` is not a rendering helper — it
      gates anything that READS more than one player's picks, including a
      count, a maximum, or a difference.
  - 🚨 **A scoreless "final" froze the week forever.** ESPN can report a game
    `post` with one score still `null` at the whistle. The week cached to the
    device permanently: the result never counted, the week was never
    re-fetched, and **two relatives could see different standings for the same
    finished game all season**. A week only freezes now when every game is
    final AND both scores are real numbers, and a bad copy already on a phone
    is dropped on sight. ⚠️ `state === 'post'` is not the same claim as "this
    game has a result".
  - 🚨 **A dead browser store stranded people permanently.** Safari private
    mode, or iOS evicting storage from an app opened once a week, produced
    "This link isn't working — ask Jack" **with no way out**, because the
    token lives in the URL and could not be written down. `storageWorks()` is
    a canary write that tells the two cases apart and names the real cause.
    ⚠️ The wrong diagnosis is worse than none: it sends the one person who
    could fix it to the one person who cannot.
  - 🚨 **THE ADMIN TAB WAS OFF-SCREEN — for the commissioner, on his own
    phone (v43).** `.tabs` was `grid-auto-columns: 1fr` with `nowrap` labels,
    so the row's intrinsic width was the sum of five labels: on a 320px phone
    the **whole page** became 376px and the Admin tab rendered entirely
    outside the viewport, with no scrollbar and nothing hinting the page could
    move sideways. In **Bigger Text** — the grandmother-facing accommodation —
    it happened at 375, 390 and 430 too, i.e. every phone size this app tests.
    - **A relative sees four tabs and they fit.** That is why every prior
      layout pass missed it: they were all run signed in as a relative.
      `tests/fit.js` signs in as the **commissioner** and is the only suite
      that does.
    - It is `flex-wrap` now. Whatever does not fit moves to a second row, at
      full size — a wrapping bar cannot hide a control, and shrinking the type
      to make five fit would have broken the floor this app exists for.
  - **Three more of the same bug, and the shape is worth naming.** A CSS grid
    track that cannot shrink does not clip locally — it **pushes the DOCUMENT
    wider than the phone**, and the overflow is then only reachable by
    scrolling the entire app sideways, which nothing advertises. It cost:
    - **Week winners lost the result.** "Buccaneers +20" painted past the right
      edge, so most rows read as a team name and nothing — the answer to the
      question the section exists to answer, silently gone. ⚠️ **Shrinking the
      tracks was not enough**: at 22px Bigger Text the single word
      "Buccaneers" is wider than any share of 320px it can be given, so the
      result **wraps to its own line** instead.
    - **Most-picked teams printed the name over its own bar** — a hard 62px
      column could not hold "Commanders", at *every* width, with stock data.
    - **My Picks** rows crowded their running total against the card edge.
  - 🚨 **The week-by-week grid truncated names — the one rule this app has
    already learned twice.** `.gr .gnm` still had `text-overflow: ellipsis`,
    so "Grandpa Bartholomew" rendered as "Grandpa Bar…" in the one screen
    built for everybody to find their own row. **A person's name is the one
    thing in a table that must never be cut**; the standings table and the
    admin roster were both fixed for this and the grid was never brought
    along. Fixed here and in `.wp-nm`, `.cw-nm` and `.plrow .pn` at the same
    time — grep for `text-overflow` before adding another.
  - **`--mu2` carried text for a third time**, on `.cg-go` — the `›` that is
    the ONLY cue a condensed row is tappable, at **2.56:1** in the default
    palette. It is `--gy` now. That token must never carry text; it has now
    been caught three times.
  - **Also fixed:** the week never advanced on a page left open (the refresh
    gate went false forever once a week finished — the clock is re-read every
    tick now, and only the score re-fetch stays gated); admin proxy-picks
    overwrote silently and never showed what was already there; a raw
    `submit_pick failed (409)` could reach a relative's screen; `claim_player`
    could hand two people the same identity (TOCTOU — it is a conditional
    `update … where claimed_at is null returning *` now); a failed save
    reported success (the verification read back the value it had just failed
    to write); an unreadable kickoff **failed open**; a slow submit had no
    timeout and no "saving…"; names had no length cap; and an unreachable
    branch that read a token with no admin check is gone. Matchup-sheet
    labels sitting at 13.3–14.0px were lifted and moved to `rem`.
  - **New suites: `locked` (14), `leak` (9), `resilience` (11), `fit` (116).**
    ⚠️ **`fit` is the durable half of the visual fix** — it checks the thing
    the user experiences ("is any of it off the edge of my phone") rather than
    any one selector, **as the commissioner**, on all five screens, at
    320/375/390/430, with Bigger Text on and off. A selector-level assertion
    would have passed on all four of these bugs.
  - ⚠️ **One regression this found in my own tests:** `confirm.js` cleared the
    current week with `adminSetPick(…, null)` to get a clean slate, which the
    new locked-week guard correctly refuses — so the SETUP failed silently and
    every assertion below it then ran against a locked slate with no buttons
    to measure. It walks to a pickable week now and **asserts the slate has
    pickable games before measuring anything.** Same lesson as v26 and v29: a
    check that measures nothing is worse than one that fails.
  - ⚠️ **An agent's contrast harness produced ~4,970 false positives** by
    reading a gradient's stops without accounting for **alpha** — the v40
    sticky-name fix layers a .12 tint over an opaque surface, which it read as
    solid green. Same family as the trap this file already documents for
    plated fills. Verify a "failure" against the composite before believing it.
  - ⚠️ **Still unverified:** `schema.sql`'s new guards have never met a live
    Postgres — the sandbox has none — so they are written carefully and must
    be confirmed when the project is created.

- **🗄️ `schema.sql` is no longer unverified — `tests/schema.js` (45 checks).**
  It was the only component with zero coverage and it is the one that will
  actually run in production. There is no Postgres SERVER in the sandbox, so
  behaviour still cannot be proved — but the two things that would otherwise
  fail *silently on the family's phones* now are:
  - **It parses, PL/pgSQL function bodies included**, under **libpg_query**
    (`pip install pglast`) — the same parser Postgres itself uses. A syntax
    error inside a `$$ … $$` body is opaque to the outer parser and invisible
    to any amount of reading; it would have surfaced only when the
    commissioner pasted the file into the SQL editor and the league failed to
    exist. All 35 statements and all 10 plpgsql bodies parse.
  - **Every RPC the app calls exists, with EXACTLY the argument names it
    sends.** ⚠️ **PostgREST resolves a function by its NAMED arguments**, so
    one renamed parameter is not a type error anywhere in the JS — it is a
    404 at the moment a relative taps a team, and no browser suite can ever
    see it because the sandbox never reaches Supabase. The suite reads the
    call sites out of `survivor.js` and the signatures out of the SQL and
    compares them both ways, so an argument the app stops sending is caught
    as well as one the database stops accepting.
  - It also pins: every RPC granted to `anon` (a missing grant is a 403),
    `picks` revoked at the table so a write can only go through
    `submit_pick`, `players_public` never selecting the token column,
    `SECURITY DEFINER` on the four functions that touch rows anon cannot, and
    that the v41 guards (`p_kickoff is null`, `now()` in both `submit_pick`
    and `admin_set_pick`, the `UNIQUE` no-repeat constraint) are really in
    the file rather than only in the changelog.
  - ⚠️ **Without `pglast` it SKIPS and says so, rather than passing.** A suite
    that quietly measures nothing is the failure mode this repo has recorded
    three times.
- ⚠️ **Unverified live:** the sandbox reaches neither ESPN nor Supabase, so
  the real week-scoreboard shape
  (`?dates=2026&seasontype=2&week=N`), `currentWeek()`'s read of
  `season.type`/`week.number`, and what each `schema.sql` function DOES with
  a real row are coded defensively but must be confirmed on device. (That the
  file installs, and that the app calls it correctly, is now covered — see
  above.)

## How it came about

**🏈 Family Survivor League built (2 Sep 2026 — no `APP_VERSION` bump)** — the
owner's family has run a non-elimination survivor pool for years, built around
keeping his 95-year-old grandmother involved, and no off-the-shelf app models
it. Now `survivor/`, a standalone four-file mini-app; see **Files** for the
rules, the architecture and the traps. Three things worth carrying forward:
- **The hard part was never the UI, it was shared state.** Every previous
  feature in this repo is either `localStorage` (per device) or a read-only
  backend. Twenty people picking against each other needs a real shared
  database, which is why this is the first thing here to use one (Supabase
  free tier). **The Render backend cannot do this job** — its free tier is
  in-memory with no disk, so the picks would vanish on every redeploy, and a
  30–60s cold start is fatal for the one user the league exists for.
- **A separate repo is the plan, and the reason is not tidiness.** From
  `/Sports-Hub/survivor/` any relative can delete a path segment and land on
  the owner's betting model and fantasy team. It also sits under `sw.js`'s
  scope, whose cache is keyed to `APP_VERSION`, so every Sports-Hub release
  would invalidate grandma's page. It lives here for now ONLY so it can be
  tested on a phone; move it before the links go out.
- **The six house rules were settled BEFORE any code was written**, because
  each one changes what gets built — "a missed week is not a loss" in
  particular is why `tallyFor` counts only graded picks and why a week with
  no pick burns no team.

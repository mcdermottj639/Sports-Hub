# 🏈 Family Survivor League

A small, standalone web app for a family's season-long NFL survivor pool.
Pure static HTML/CSS/JS — no build step, no framework, no install. Everyone
opens one link, taps their own name once, and picks a team each week.

**Live:** https://mcdermottj639.github.io/family-survivor/

Built for ~20 relatives including a 95-year-old, which is the constraint that
shaped every decision in it: 18px base type, ≥56px tap targets, no password,
no account, no app store, and a confirmation before anything that costs you a
team for the season.

## The house rules it implements

| # | Rule |
|---|------|
| 1 | **A missed week costs nothing.** No loss, no points, and your team is not used up. |
| 2 | **Per-game deadline.** You can pick or change until *that* game kicks off. |
| 3 | **Picks are secret** until their game starts, then public. |
| 4 | **Regular season only**, weeks 1–18. Nobody is ever eliminated. |
| 5 | **Standings = wins first**, cumulative point margin as the tiebreak. |
| 6 | **A tie is neither a win nor a loss.** 0 points, team still used. |

And the one that makes it a survivor pool: **you can never pick the same team
twice.** That is a `UNIQUE` constraint in the database, not a UI check, so two
open tabs or a stale phone page cannot get around it.

A decided week is decided: once *your* game has kicked off you cannot change
that week, which is enforced in both storage back ends and in `schema.sql`.
Otherwise you could pick a Thursday team, watch it lose, and switch away — and
the loss and the spent team would both vanish.

## How people use it

The commissioner texts **one link** to the family group. Each person opens it,
taps their own name once, and that phone remembers them forever. On an iPhone,
"Add to Home Screen" turns it into an icon that opens straight to their pick
screen.

Five screens: **Pick**, **Standings**, **My Picks**, **Stats**, and an
**Admin** tab that only the commissioner sees.

## Files

| File | What it is |
|---|---|
| `index.html` | The shell. Sets palette + big-text before first paint. |
| `survivor.css` | All styling. Base type is 18px and every tap target is ≥56px — that floor is deliberate and must not be lowered. |
| `survivor.js` | All logic: storage, ESPN, scoring, screens. |
| `sw.js` | Network-first service worker. It is why a change reaches every phone by itself. |
| `schema.sql` | Paste into the Supabase SQL editor once. |
| `tests/` | 35 suites, 856 checks. `node tests/run.js`. |

## Where the data lives

**Picks are the only thing stored.** Records, margins and standings are computed
live from ESPN's free public NFL scoreboard on every render. That is why there
is no results table, no cron job, and no way for a viewer to poison a score —
and it means the standings tick live on a Sunday afternoon.

Two storage back ends sit behind one interface:

- **On-device** (the default when nothing is configured) — `localStorage`.
  Nobody else sees it. Fine for trying it out, useless for a real league.
- **Supabase** — a free Postgres project. This is the real one.

## Turning on the shared league

1. Make a free project at [supabase.com](https://supabase.com).
2. SQL Editor → paste all of `schema.sql` → Run.
3. In the same SQL editor, seed yourself as commissioner (**not** in the app —
   the anon key is public the moment the site deploys, and the in-app path lets
   the first caller claim admin while the table is empty).
4. Settings → API → copy the **Project URL** and the **anon / publishable key**.
5. 🚨 **Put them in `survivor.js`, at the top.** The Admin panel's paste box
   writes to `localStorage`, which configures *your phone only* — every
   relative would open the same address with nothing saved and silently get
   the on-device store. Admin has a button that emits the exact two lines.
6. Admin → add everyone's names, so they tap rather than type.

### Is the anon key safe in a public file?

Yes, *here*, because of how `schema.sql` is written:

- The `players` table holds everyone's token and has **no read policy**, so the
  anon key cannot read it. The app reads `players_public`, a view without the
  token column. Nobody can scrape the roster and pick as somebody else.
- `picks` is revoked at the table, so **every write goes through a
  `SECURITY DEFINER` function** that checks the token, the kickoff and the
  no-repeat rule first.

The honest limit, written into `schema.sql`'s own header: "picks are hidden
until kickoff" is a **UI convention, not a security boundary**. The client
computes the standings itself, so it must be able to read every pick — anyone
who opens dev tools can see this week's picks early. Closing that properly
means gating reads behind a function that knows the kickoff times.

## Demo mode

The season starts **10 Sep**, so until then there are no finished games and
nothing to grade — the standings and history screens cannot be exercised at
all. **Admin → Demo season** builds a deterministic season in progress: week 10
of 18, one game final since Thursday, three live right now, the rest ahead, and
18 relatives of whom four have not tapped their name yet. Every state the app
can be in is present on purpose. Turn it off to go live.

## Shipping a change

There is no build step. `sw.js` is network-first with `cache: 'no-store'`, so a
push reaches every phone on its next open, and the page also watches for a new
build and reloads itself. The manual step:

**Bump `APP_V` in `survivor.js` AND in `sw.js`, and both `?v=` in
`index.html`.** All four are pinned to each other by `tests/update.js`. The
version does not affect delivery — the worker does that — but it shows in the
footer so the commissioner can ask "what does yours say?", and a version that
lies is worse than none. That is precisely how `?v=1` sat unchanged through
sixteen releases.

## Testing

`node tests/run.js` — **35 suites, 856 checks**, driving the real app in
headless Chromium. `node tests/run.js a11y ios` runs just those. See
`tests/README.md` for what each suite holds down, the sandbox facts that look
like bugs and are not, and the several ways a test in this app has previously
managed to pass while measuring nothing.

Needs `playwright-core` and a Chromium; `tests/schema.js` needs `pglast`
(`pip install pglast`) and skips loudly without it.

---

## For anyone (or any Claude session) working on this

**Read `CLAUDE.md` first.** It holds the six house rules, the architecture, and
every trap already found and paid for — including the ones that look like
reasonable changes and are not.

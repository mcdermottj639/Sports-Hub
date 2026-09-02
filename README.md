# 🏈 Family Survivor League

A tiny, standalone web app for the family's season-long survivor pool. It is
**not** part of Sports-Hub — it shares no code, no service worker and no data
with it, and it is meant to move to its own repo before the links go out.

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

## How people use it

Everybody gets a personal link — `.../?u=nana` — and that link **is** their
login. No password, no account, no app to install. On an iPhone, "Add to Home
Screen" turns it into an icon that opens them straight to their own pick screen.

Three screens: **Pick**, **Standings**, **My Picks**. The commissioner also gets
an **Admin** tab.

## Files

| File | What it is |
|---|---|
| `index.html` | The shell. Sets palette + big-text before first paint. |
| `survivor.css` | All styling. Base type is 18px and every tap target is ≥56px — that floor is deliberate and must not be lowered. |
| `survivor.js` | All logic: storage, ESPN, scoring, screens. |
| `schema.sql` | Paste into the Supabase SQL editor once. |

## Where the data lives

**Picks are the only thing stored.** Records, margins and standings are computed
live from ESPN's free public NFL scoreboard on every render. That is why there
is no results table, no cron job, and no way for a viewer to poison a score —
and it means the standings tick live on a Sunday afternoon.

Two storage back ends sit behind one interface:

- **On-device** (default) — `localStorage`. Nobody else sees it. Fine for trying
  it out, useless for a real league.
- **Supabase** — a free Postgres project. This is the real one.

## Turning on the shared league

1. Make a free project at [supabase.com](https://supabase.com).
2. SQL Editor → paste all of `schema.sql` → Run.
3. Settings → API → copy the **Project URL** and the **anon / publishable key**.
4. Open the app → **Admin** → *Shared database* → paste both → Save & reload.
   (Or hardcode them at the top of `survivor.js` if you prefer.)
5. Admin → add yourself first (the first person added becomes commissioner),
   then everyone else. **Copy everyone's links** puts the whole list on your
   clipboard for the group text.

### Is the anon key safe in a public file?

Yes, *here*, because of how `schema.sql` is written:

- The `players` table holds everyone's token and has **no read policy**, so the
  anon key cannot read it. The app reads `players_public`, a view without the
  token column. Nobody can scrape the roster and pick as somebody else.
- There are **no insert/update/delete policies on any table**. Every write goes
  through a `SECURITY DEFINER` function that checks the token first.

The honest limit: the kickoff time is passed in from the browser, so a
determined family member could spoof a late pick. The deterrent is social — every
pick is timestamped and becomes public at kickoff. The no-repeat rule is *not*
spoofable; it is a database constraint.

## Demo mode

The 2026 season starts **10 Sep**, so until then there are no finished games and
nothing to grade. **Admin → Demo season** invents three completed weeks plus a
live week 4 (with one game already final, so the locking and the hidden-pick
reveal are both visible) and a demo family of eight. Turn it off to go live.

## Moving it to its own repo

It is four self-contained files. Copy the folder, enable GitHub Pages, done.
This should happen **before** the family gets their links, so that deleting a
path segment from the URL doesn't land them in Sports-Hub.

## Testing

No build step and no test runner. `node --check survivor.js` is the syntax gate;
the behaviour was verified by driving the real page in headless Chromium at
390px in both palettes — 43 checks covering all six house rules, the no-repeat
constraint, pick visibility, layout at 320/390px and the 44px tap-target floor.

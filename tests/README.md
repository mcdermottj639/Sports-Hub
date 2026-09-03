# Family Survivor — test suites

Every suite drives the **real app** in headless Chromium against the demo
season. There is no mocking of the app itself: a check that passes here is a
check that passed in a browser.

```
node survivor/tests/run.js              # all of them
node survivor/tests/run.js a11y ios     # just these
```

The runner starts a static server on :8099 if nothing is listening, and stops
it again afterwards.

**What they need:** `playwright-core` (1.62 here) resolved from
`survivor/node_modules/`, and a Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Both are provided by
this environment and `node_modules/` is deliberately not committed, so on a
fresh clone install playwright-core and point the two paths at whatever
browser you have — they are the first two lines of every suite.

`schema` is the exception: it drives no browser at all and needs the python
package **`pglast`** (`pip install pglast`) instead. Without it that one suite
prints why and skips, rather than passing while measuring nothing.

## Sandbox facts that look like bugs and are not
- **No ESPN and no Supabase.** The demo season (`survivor:demo`) is the only
  fixture. Anything asserting live data must stub it with `ctx.route()`.
- **`a.espncdn.com` is blocked**, so team helmets never load here. A blank logo
  in a screenshot is the network. Route-fulfil them if a test needs images.
- **Chromium implements neither `-webkit-touch-callout` nor
  `-webkit-tap-highlight-color`.** Those are asserted against the shipped CSS
  source instead, with `user-select` used to prove the rule block is live.

## Things a new suite must get right
- **Assert rendered VALUES, not just labels.** A heading check passed while
  every percentage on the screen rendered as `[object Promise]`.
- **A check that silently measures nothing is worse than one that fails.**
  Two suites went quiet when a locked pick stopped drawing team buttons, and
  the accessibility sweep only ever looked at whichever screen the previous
  section happened to leave it on. Assert the thing you are about to measure
  actually exists.
- **Section headings are uppercased by CSS**, and `innerText` reflects
  `text-transform` — compare case-insensitively.
- **A plated fill is a background-IMAGE.** Its `backgroundColor` is
  transparent, so a contrast walker that only reads `backgroundColor` measures
  the text against the page and reports nonsense. Read the gradient's stops.
- **Ranks are not a permutation** — tied players share a rank and the next is
  skipped, so rank movements do not sum to zero.
- **The current week's pick is locked in the demo**, which folds the slate into
  a list. Click `#cg-more` before reaching for `.pk` team buttons.

## The suites
| Suite | What it holds down |
|---|---|
| `a11y` | contrast, the 15.5px type floor across ALL five screens, tap targets, focus, scroll position |
| `audit` | the fixes from the three-agent audit — week loading, admin deadline, live refresh |
| `backnow` | the "back to this week" jump and week pinning |
| `cftv` | the channel on the confirm panel, and ESPN's two broadcast shapes |
| `condense` | the slate folding once your own game starts, and both toggles |
| `confirm` | the confirmation step before any pick is written |
| `crowd` | "With the crowd, or against it" — counts, labels, hidden-pick safety |
| `deploy` | the not-shared-yet guards and the setup steps |
| `gold` | 🥇 **pins the gold.** If this fails the change is wrong — ask the owner |
| `gridstick` | the sticky name column staying opaque while weeks scroll under it |
| `helmet` | logo load, one retry, and the lettered fallback |
| `ios` | four iPhone sizes: safe areas, scroll lock, 16px inputs, 44px targets |
| `join` | claiming a name, the join fallback, duplicate refusal |
| `left` | the standings columns and names never truncating |
| `lockcolor` | the plated win/loss/tie card, measured against every gradient stop |
| `mlonly` | the win % coming from the moneyline and nothing else |
| `nfltime` | the demo playing on real NFL slots, in real order |
| `pickcard` | the pick card's fixture line, channel and wording |
| `rollover` | Tuesday 4 AM Eastern, including the DST change |
| `share` | device-only mode refusing to hand out links |
| `stats` | the Stats tab end to end |
| `trend` | ▲▼ rank movement, and that it holds steady mid-week |
| `update` | the network-first worker and offline fallback |
| `updbar` | update detection and the auto-reload guards |
| `viewas` | commissioner impersonation, and always having a way back |
| `welcome` | the first-run card |
| `winpct` | the per-team win chance on the pick buttons |
| `wrongname` | tapping the wrong name, and undoing it |
| `nana` | prints a report, not a tally: what a first-time relative faces |

## Added by the overnight stress test (v41–v43)
| Suite | The bug it holds down |
|---|---|
| `locked` | a decided week cannot be re-picked — the loss stays, the team stays spent |
| `leak` | "teams left" and "best left" never count somebody else's hidden pick |
| `resilience` | a scoreless "final" is never cached; a dead browser store is named, not blamed on the link; a failed save is never reported as success; an unreadable kickoff fails closed |
| `sortodds` | the Pick screen's two orders: kickoff stays the default, "Best chance" ranks the teams you can STILL pick and leaves the spent ones out, every percentage equals `matchupRead`'s, unpriced teams move rather than vanish, a tap still confirms, and a decided week offers neither the control nor a live button |
| `fit` | **nothing is off the edge of the phone — signed in as the COMMISSIONER.** Five tabs, not four, on all five screens, at 320/375/390/430, with Bigger Text on and off. Every earlier layout pass ran as a relative, who sees four tabs and no overflow, which is exactly how the Admin tab came to render off-screen. It asserts the *page* is never wider than the viewport rather than checking any one selector — a selector-level test would have passed on all four of the overflow bugs it now pins. Also: no player name is ever truncated, and no team name prints over its bar. |

⚠️ **`confirm` needs a PICKABLE week.** It used to clear the current one with
`adminSetPick(…, null)`; the v41 locked-week guard correctly refuses that, the
setup then failed silently, and every assertion below it measured a locked
slate with no buttons on it. It walks forward to a week with unstarted games
and asserts they are there before measuring anything.

## `schema` — the one component with no browser coverage
The sandbox has no Postgres SERVER, so `schema.sql` can never be *run* here.
It can still be checked for the two things that would otherwise fail silently
on the family's phones, and this suite does both:
- **It parses, PL/pgSQL bodies included**, under libpg_query — the same parser
  Postgres itself uses. A syntax error inside a function body is invisible to
  any amount of reading; it would surface only when the commissioner pasted
  the file into the SQL editor.
- **Every RPC the app calls exists, with exactly the argument names it sends.**
  PostgREST resolves a function by its *named* arguments, so one renamed
  parameter is not a type error anywhere — it is a 404 at the moment a
  relative taps a team, and no browser suite can see it because the sandbox
  never reaches Supabase.

It also pins the grants (anon can reach every RPC and nothing else), that
`picks` is revoked at the table so writes can only go through `submit_pick`,
that `players_public` does not `select *` over the token column, and that the
guards the v41 fixes depend on are really in the SQL.

⚠️ **This still is not proof of behaviour.** It proves the file will install
and that the app is calling it correctly. What each function DOES with a real
row is confirmed the first time the project exists.

⚠️ **`_pickable.js` is a helper, not a suite** (`run.js` skips `_`-prefixed
files). Call it first in anything that needs to MAKE a pick: the demo opens on
week 10, whose pick has already kicked off, and since v41 a decided week is
decided — so every team button there is disabled and there is nothing to tap.
Three suites broke on that at once. It throws if it lands on a week with no
live buttons, rather than letting the assertions below it measure nothing.

⚠️ **A lazy image is not a rendered image.** The logos are `loading="lazy"`,
so one below the fold is never requested, never fails, and never falls back.
`helmet.js` counted badges across the whole page and passed for months purely
because everything fitted; a ~56px control on the Pick screen pushed two past
the threshold and it "failed" against correct markup. It scrolls first now.

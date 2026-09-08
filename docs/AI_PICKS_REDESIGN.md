# AI Picks tab — redesign plan (review only, nothing built)

**Status:** plan for an implementing session (Opus). Written 8 Sep 2026 against
**v212** after reading `renderPredictions`, `reportCard`, `backtestPanel`,
`tallyDetails`, `tallyStats`, `pendingSummary`, `aiRoute` and the model
constants. **No code was changed for this plan.**

**The owner's ask, verbatim intent:** "Too hard to see the records and analysis
and back testing. I want it sorted by sport — when you click each sport it goes
to only the stats for that sport, so I can see how the AI model has done, what
the model is computing, the records, the research, the back-tested numbers.
One AI Picks overview like a homepage — everything together, cumulative — and
then each sport tab inside really explains what the model is for that sport,
then records, research and backtesting. **I like all the stuff we have, so
don't lose anything.** Just make it easier to see and grasp."

---

## 1. What is wrong today (the review)

The tab is **one long column** that mixes three different questions —
*what does the model say today*, *how has it done*, and *what is the model* —
and answers the third one nowhere. Specifically:

1. **The history is buried under the slate.** Order today is: stat bar → notes
   → 🚨/🔥/⚡ ladder → 👀 Leans → 📐 ATS → 🎯 Totals → ✅ Passes → 📋 Finished
   → **📜 Backtesting** (three cards) → **Model Report Card** (one collapsed
   button hiding nine sub-sections) → trends. On a college Saturday the record
   is 20+ cards down, and then still behind a tap.

2. **"By sport" is a row, not a view.** Tapping a sport chip changes the
   *ladder* only. Every number in the stat bar, the calibration chart, the
   record-by-tier card, the sharp-money split, the confidence buckets and the
   totals/ATS bias rows is **all-sport**. `tallyDetails()` / `tallyStats()` /
   `pendingSummary()` take no sport argument. Only two things are per-sport:
   the "By sport" rows and the *sort* of Recent results (v201). So the owner
   cannot answer "how is the MLB model calibrated" — the MLB chart doesn't exist.

3. **"What the model is" exists only in code and CLAUDE.md.** `MODEL_W`,
   `MODEL_SHRINK`, `CONF_CAP`, `PD_SD`, `ATS_EDGE_MIN`, `TOT_EDGE_MIN`,
   `TOT_MAX_DIFF`, `CFB_TIER_PTS`, the sharp-money factor, the park factors,
   the ERA shrink, which markets a sport plays, what is fitted vs guessed —
   none of it is rendered. `aiFactors` explains one *game*; nothing explains
   the *model*. The owner asked for exactly this.

4. **The Report Card is a wall of `rep-row`s** with the pending queue, the
   calibration buckets, by-sport, totals, ATS, sharp money and recent results
   stacked in one scroll behind one button. Each piece is right; the container
   is the problem.

5. **Everything is fetched and rebuilt on every chip tap** (`renderPredictions`
   restarts from "Crunching the numbers…"). The record/backtest/model views
   read only localStorage, so they should switch instantly and work on a
   no-game day and offline.

What is **right** and must not change: the model math, `buildBoard`,
`commitRow` and every recording/grading rule (look-back slates read-only, the
sharp leash, first-write-wins), the ladder's tiers and sort, the honesty
copy (thin-sample tags, the moneyline-sweep caveat, the "no phantom 0-0"
rule, the "logged vs no finished games" distinction), the export button, and
the v186 rule that every in-season sport gets a row even with nothing graded.

---

## 2. The target shape

```
🤖 AI Picks
┌─ view chips ──────────────────────────────────────────────┐
│ [🌐 Overview] [⚾ MLB] [🏈 NFL] [🎓 CFB] (🏀 NBA in season) │   ← existing #ai-sport chips + one new "Overview" chip
├─ sub-tabs (pills, per view) ──────────────────────────────┤
│ [📋 Board] [📈 Record] [🧪 Backtesting] [🧠 Model]         │   ← new; state.aiSub, default Board
└───────────────────────────────────────────────────────────┘
```

Two levels only. Level 1 = **which sport** (Overview = all). Level 2 = **which
question**. Same four sub-tabs in every view so the muscle memory is one thing.

### Overview view (`state.aiSport === 'all'`)

| Sub-tab | Contents (all existing pieces, re-homed) |
|---|---|
| **Board** | The day's plays across every in-season sport: the ladder merged cross-sport (cards carry the sport emoji), then a per-sport strip "⚾ MLB · 9 games · 2 plays →" that jumps to that sport's Board. This is Home's 🎲 Board, uncapped, plus the leans/passes counts it already links here for. |
| **Record** | The 4+1 stat tiles (Moneyline · vs the line · Spread · Totals · Plays today) — all-sport, as now. Then the **By sport — three markets** card (from `backtestPanel`) with each league row tappable → that sport's Record. Then 📥 Logged, awaiting results (per-sport counts + coverage row). Then Recent results, all leagues, game-grouped (v202 sort). This-week line stays in the header. |
| **Backtesting** | Calibration chart (all-sport), Record by tier, 💰 Sharp money (agree/against + the v200 coverage rows), Totals (O/U split, bias rows), 📐 ATS + the per-sport margin-vs-book instrument, the legacy-entries note, **📋 Copy my record data**. |
| **Model** | "How the model works" — generic: the factor list and the logistic, the three markets, the tier ladder (`EDGE_BAR`, `ALERT_DOG_ML`) and what the vs-line record means, the honesty rules (thin = under 10, look-back is read-only, a sweep of favourites is not skill). Then one row per sport: "⚾ MLB — 6 factors · shrink 0.5 · cap 72% · plays ML + totals · last fitted v171 →" linking to that sport's Model tab. |

### Sport view (e.g. `state.aiSport === 'mlb'`)

| Sub-tab | Contents |
|---|---|
| **Board** | Exactly today's ladder for that sport, unchanged: notes (sharp folded / unavailable, look-back banner) → 🚨 Red Alert → 🔥 Best Bets → ⚡ Edges → 👀 Leans → 📐 ATS → 🎯 Totals → ✅ Passes → 📋 Finished → 📈 Team Trends → 🎯 Player Props. Plus the empty-state jump chips and the 📅 last-slate button (v199). **This is the only sub-tab that records anything.** |
| **Record** | Stat tiles **filtered to the sport** (ML · vs line · Spread · Totals · this week · Plays today). Then By confidence buckets **for this sport**. Then 📥 awaiting (this sport, named rows). Then Recent results **for this sport only** — no "Other leagues" divider here (that lives in Overview). The v201 empty-league sentence ("no finished NFL games yet — 5 logged…") stays. |
| **Backtesting** | Calibration chart **for this sport**; Record by tier for this sport; then the sport's own instruments only: MLB → Totals O/U split + "model total vs the book" (`totalBiasStats`) + broken-projection count; NFL/CFB → ATS record + "margin vs the book" + dog-side % (`marginBiasStats`) + the PD_SD/ATS_EDGE_MIN "measure, don't tune" note; every sport → 💰 sharp money agree/against + coverage. Export button here too (it exports everything; say so). |
| **Model** | A **model card generated from the constants** (see §4). Factors and weights, shrink and cap, markets and thresholds, data sources, what is fitted vs a guess and when, the open measurement for this sport. CFB additionally states which rating source is live (FPI vs conference tier) — it already knows (`cfbFpi`). |

Landing rule: **`aiRoute()` keeps choosing the sport**, so the tab still opens
on a league with games (v199) — on its **Board** sub-tab. A chip tap pins the
sport as today. "Overview" is one tap away, never the forced landing, because
the owner opens this tab to see today's plays first.

---

## 3. Inventory — every existing element and where it goes

"Don't lose anything" means this table is the acceptance test. Every row must
be findable in the new layout; the implementing session should tick it off.

| Today | Function / markup | New home |
|---|---|---|
| Sport chips | `buildChips($('#ai-sport'))` | Level-1 chips, plus `all` |
| `#ai-head` date label, `#ai-score` line | `renderTally` | Header, all views (line shows the view's scope) |
| Stat bar 4+1 tiles | `statBar()` | Record sub-tab (Overview = all-sport; sport = filtered) |
| Look-back banner + read-only rule | `!isToday` note, `commitRow(..., {record:false})` | Sport Board — unchanged |
| Sharp folded / unavailable notes | two `ai-note`s | Sport Board |
| `boardNote()` edges record line | `brd-note` | Sport Board above the ladder; Overview Board too |
| 🚨 / 🔥 / ⚡ sections + `boardCard` | `section(key, list)` | Sport Board; merged in Overview Board |
| 👀 Leans fold | `lad-fold` | Sport Board |
| 📐 ATS cards + record note | `atsCard` | Sport Board (cards); record → Sport Record/Backtesting |
| 🎯 Totals cards + O/U lean note | `totalsCard`, `det0OverLean` | Sport Board (cards); lean note → Backtesting |
| ✅ Passes fold | `lad-fold` | Sport Board |
| 📋 Finished (ML · spread · totals) | finals fold | Sport Board (open on look-back, as now) |
| 📜 Backtesting heading | `lad-sec` | Becomes the Backtesting sub-tab |
| Calibration chart + worst-bucket warning | `backtestPanel` card 1 | Backtesting (both views; sport-filtered in sport view) |
| Record by tier | `backtestPanel` card 2 | Backtesting (both) |
| By sport — three markets | `backtestPanel` card 3 | Overview Record (rows link to sport views) |
| Report Card header (week · awaiting) | `.ai-report-head` | Dissolved: week → header line; awaiting → Record |
| 📥 Logged, awaiting results (+ coverage) | `pendingSummary` | Record (both views) |
| By confidence rows | `calRow` | Record (sport view); Overview keeps the chart in Backtesting |
| Legacy-entries note | `det.legacy` | Overview Backtesting |
| By sport rows incl. "logged · awaiting first result" | `sRows` | Overview Record (merge with the three-markets card — one card, not two) |
| Totals section (record, O/U split, lean warning, bias rows) | `tRow` | MLB Backtesting (+ Overview Backtesting) |
| 📐 ATS section + margin-vs-book instrument | `aRow`, `marginBiasStats` | NFL/CFB Backtesting (+ Overview) |
| 💰 Sharp money + coverage + "dead weight" note | `shRow`, `shCov`, `shWhy` | Backtesting (both) |
| Recent results (league-first, game-grouped, sweep caveat, empty-league line) | `recent` | Record (sport = that league only; Overview = all) |
| 📋 Copy my record data + textarea fallback | `.rep-export` | Backtesting (both) |
| 📈 Team Trends · 🎯 Player Props | `renderAiTrends` | Sport Board, bottom |
| Empty-state jump chips + 📅 last slate | `ai-jump` | Sport Board empty state |
| Collapse-all button, jump rail, scroll-spy | `applySections`, `injectJumpNav` | Per sub-tab (rebuild after each sub-tab render) |
| Home → AI Picks links (Board footer, `#botbar`) | `showTab('predictions')` | Board footer → sport Board; botbar → Overview Board |

Nothing in this table is deleted. Two things are *merged*: the two "by sport"
cards (report card `sRows` + backtest card 3) become one, and the Report Card
button disappears because its contents are now tabs.

---

## 4. The Model card — the one genuinely new thing

Generate it from the constants so it can never drift from the code. A
hand-written paragraph would be wrong by v215. Suggested shape, per sport:

```
🧠 The ⚾ MLB model
What it plays      Moneyline · Totals (no spread — not an ATS sport)
How it picks       Logistic on a weighted factor sum, shrunk ×0.5 before the
                   probability, confidence capped at 72%.
Factors (weight)   Record 0.6 · Scoring margin 0.9 (scale 2.2 runs) · Recent form 0.4
                   · Home/road split 0.7 (centred on the .06 home gap) · Home field 0.24
                   · Rest 0.05/day · Starting pitcher 0.42 (ERA shrunk toward 4.30 by IP)
                   · SP form 0.18 · Lineup OPS 0.20 · Sharp money 0.30 (7-pt deadband)
Totals             Team scoring rates + park factor (×0.7) + starter ERA nudge;
                   play at 1.5+ runs off the O/U; refused past 4 (data hole).
Plays vs the book  Lean 2–5 · Edge 5–9 · Best 10+ · Red Alert = +150 dog picked outright
Data               ESPN scoreboard/schedule/probables/leaders; DraftKings splits via VSiN.
Fitted vs guessed  Shrink and cap FITTED (v138, 119 picks) · SP anchor fitted (v171)
                   · park factors static public · sharp weight UNMEASURED (needs 20 live picks)
Open measurement   Totals bias vs the book — target 0.00 runs; last read +0.3 (v170).
```

Mechanics: a small `MODEL_CARD[sport]` table for the parts that are prose
(what is fitted, when, the open measurement — lifted from CLAUDE.md's
"⏳ Open measurements" table) and everything numeric read live from
`MODEL_W`, `MODEL_SHRINK`, `CONF_CAP`, `PD_SCALE`, `HR_GAP`, `MLB_SP_ERA`,
`SP_ERA_PRIOR_IP`, `PARK_WEIGHT`, `SHARP_MIN_DIV`/`SCALE`/`MAX_UNITS`,
`EDGE_BAR`, `ALERT_DOG_ML`, `TOT_EDGE_MIN`, `TOT_MAX_DIFF`, `ATS_EDGE_MIN`,
`PD_SD`, `CFB_TIER_PTS`, `CFB_MARGIN_K`, `CFB_HFA`, `CFB_FORM_K`,
`CFB_SHARP_PTS`. CFB's card also reports the live rating source (the same
answer `pred.notes` gives per game since v206). NFL's card must say plainly
that it has **no calibration shrink and no fitted constants yet** (the open
decision in CLAUDE.md) — the card is where that honesty belongs.

The matchup-factor weights (0.42 / 0.18 / 0.20) are literals inside
`matchupFactor` today; either hoist them into a named const or read them
from the card table — do not duplicate them as prose.

---

## 5. Implementation notes for the build session

Ordered so each step is shippable and testable on its own.

1. **Sport-filtered stats (data layer, no UI).** Add an optional `sport`
   argument to `tallyDetails(sport)`, `tallyStats(sport)` and
   `pendingSummary(sport)`: filter `entries` on `r.s === sport` (pending on
   `e.sport`). Entries with no `s` (pre-v83 legacy) count only in the
   all-sport view — say so in the legacy note. Keep the all-sport call sites
   working with no argument. `totalBiasStats()` is MLB-only already;
   `marginBiasStats()` is keyed by sport already.
2. **Split `reportCard` into pieces** that each return a node:
   `recordPanel(det, pend, sport)` (tiles, buckets, awaiting, recent),
   `backtestPanel(det, sport)` (existing three cards + totals/ATS/sharp
   sections moved in from the report card + export). Keep every string.
   The by-sport rows and the by-sport three-markets card become one card.
3. **`modelCard(sport)`** per §4, plus `modelOverview()`.
4. **The view/sub-tab shell in `renderPredictions`.** `state.aiSport` gains
   the value `'all'`; add `state.aiSub` (`board|record|backtest|model`,
   default `board`). Render the chip rows once, then a `#ai-view` host.
   Record / Backtesting / Model render synchronously from localStorage —
   **zero network**, so they must not restart with "Crunching the numbers…".
   Cache the Board's computed `{rows, playable, report}` per `sport+date` in
   `state.aiBoardCache` so sub-tab switching never refetches or re-records;
   invalidate on a chip tap or a date change.
5. **Overview Board.** Build from `buildBoard` per in-season sport with the
   short leash (`SHARP_WAIT.board`, 3 s — the Home rule) and render with
   `commitRow(r, date, { record: false })`. **It must not record**: Home's
   `recordSlate` already logs every game at the full leash, and a second
   writer at a short leash would re-create the v200 blind-write problem. The
   sport Board keeps recording exactly as today.
6. **Wire the links.** Home Board footer and `#botbar` set `state.aiSport` /
   `state.aiSub` before `showTab('predictions')`; league rows in Overview
   Record jump to that sport's Record.
7. **CSS**: a `.ai-sub` pill row (reuse `.chip` + `.here` for the active
   pill), `.ai-view` container. Append to the END of `styles.css` under
   `:root[data-palette]` — layers 3–5 win only because they come last.
   Tokens only, no hex. The stat tiles already exist (`.ai-statbar`).
8. **Ritual**: `APP_VERSION` v213, `?v=` bumps on both files, `sw.js` CACHE,
   `node --check`, CLAUDE.md (Features built → AI Picks rewritten in place;
   changelog entry; `⚠️ SUPERSEDED in v213` markers on the v164 "AI Picks is
   a ladder → backtesting → report card → trends" description and on v201's
   "sorted, not filtered" recent-results rule, which now applies to the
   Overview only — the sport view filters).

**Do not touch:** `predictGame`, `buildBoard`, `commitRow`, `recordSlate`,
`gradePending`, any constant, any threshold, the sort orders inside the
ladder, or the read-only look-back rule. This is a re-homing, not a remodel.

---

## 6. Verification the build must run (headless Chromium, both palettes, 390 + 1280)

- **Inventory check**: for each row of §3, the element renders somewhere in
  the new layout with a seeded record (use MLB seeds — an NFL fixture before
  kickoff deletes itself, v200 note).
- Per-sport filtering: with seeds across MLB/CFB, the MLB Record tiles equal
  the MLB share and Overview tiles equal the sum; MLB Backtesting shows no
  ATS/margin rows; CFB Backtesting shows no totals-bias row for MLB.
- Sub-tab switching makes **zero network requests** and re-runs no model
  (count `fetch` calls and `predictGame` via a spy).
- After rendering Overview Board, `sportshub:aitally` and `sportshub:pending`
  are byte-identical to before (it must not record).
- Sport Board still records today's pregame picks and still refuses to record
  a look-back slate (both assertions exist in the v199/v183 suites — re-run).
- Model card values equal the constants (read `MODEL_W.mlb.record` etc. off
  `window` where exposed; module consts are NOT on `window` — expose a
  read-only getter or assert against the rendered text of a known constant).
- The "Overview" chip is never the auto-routed landing; a chip tap pins.
- No overflow, nothing spilling the column, no console errors.
- Harness traps to remember: `.lad-sec` / `.rep-sec` are uppercased by CSS so
  compare `innerText` case-insensitively; `state` is not on `window` — drive
  the real chips; `.rep-l`/`.rep-v` concatenate with no space in `innerText`.

---

## 7. Optional, after the above lands (only if the owner wants it)

- **Era toggle on Backtesting** — All-time · since v205 (5 Sep) · since v184
  (2 Sep) · last 30 days — because CLAUDE.md says every calibration read must
  split at those ship dates and today the owner has to do that by hand off
  the export. Cheap: one `sinceDate` filter in `tallyDetails`.
- A cumulative record sparkline per market on the Record tab.
- A "🎓 rating source" live chip on the CFB Board header (FPI vs tier).

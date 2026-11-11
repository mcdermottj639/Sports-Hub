# DraftKings evidence and Matchup Lab

The Matchup Lab is available from Today, Research, NFL/NBA Research, and NFL/NBA
game reports. Today opens the dedicated `#/matchup-lab` route: only the lab is
visible, with a Today return button, NFL/NBA filters, Upcoming/Completed/All
game periods, and a matchup dropdown. The full-screen route is matchup-only:
our first saved score projection, the actual saved ML / Spread / Total picks,
ESPN market quotes, source context and DraftKings team comparison. Completed
games use large team-aligned scores, a winner highlight, final margin/total and
saved pick results. Model check and Score audit remain in embedded Research.
Controls stay mounted during data updates; phones stack the comparison, with
extra model inputs and earlier games in disclosures.

`matchup-context.js` reads the exact ESPN event summary and its saved cloud rows.
Identity requires the same sport, oriented teams and exact start. Without a
saved event ID, use the Eastern-date scoreboard and require one exact match.
Only the current model’s pregame, non-void rows appear as official picks; one
immutable observation per market, ML / Spread / Total order. Each market’s
saved selection and forecast remains its own observation; the summary uses the
first saved full forecast. Pick and price capture timestamps are separate when
prices were filled later. A source refresh never records or recalculates a pick.

Upcoming comparisons label ESPN’s provider and retrieval time; a missing quote
update time is explicit. A model-versus-line gap is descriptive, not a new saved
pick or a calibrated betting edge. ESPN predictor percentages are separately
labeled (not sportsbook probabilities). Records, injury listings, venue and
weather appear only when supplied. Completed games show available ESPN final
team stats, with current records labeled; current injury/predictor/market
information is not passed off as historical pregame evidence. Source failures
leave saved model picks and DraftKings evidence visible. Cached and in-flight
reads are bounded by game identity; late responses cannot overwrite a newly
selected game. Model Check / Score Audit calculations remain unchanged.

It supplements ESPN with dated DraftKings team profiles and game
results. ESPN remains the live source, including provider-labeled odds already used by
the app. DraftKings connector data contains no sportsbook account access or
odds/prop feed. There is no bet execution, new paid service or new backend.

## What ships

- Rank bars, recent-five W/L/T and scoring-margin charts, rest-day context.
- A deliberately simple recent-form baseline alongside the frozen official
  forecast: home score = (home last-five points scored + away last-five points
  allowed)/2; away is symmetric. Require five prior games on each side.
- Per-game final-score comparison and a cross-game score audit.
- Matched model-versus-book absolute errors, signed forecast bias, recent-form
  replay comparisons and agreement/opposition winner records.
- Explicit missing-line sample counts, stale-snapshot badges, source timestamps
  and research leads. No automatic correction is applied to a live model.

## Evidence rules

`sports-evidence-core.js` is pure and used by the browser and tests. Aliases are
league-scoped. Matching requires the same home/away teams AND exact kickoff
instant. Ambiguous identity and reschedules stay unmatched. Count each game
once, but compare every saved scored market; any discrepancy with DraftKings
excludes that game from the diagnostics. Pending scores are not zero. Voids,
wrong model versions and captures at/after kickoff are excluded.

Use the earliest eligible official capture for the full margin/total forecast.
Compare to the odds in that same capture only. Do not borrow later odds to
inflate coverage. Margin = home minus away; book margin = negative home spread.
Absolute error and signed bias are points, not betting returns. Comparisons
with the book and with recent form each use their own identical paired games;
their sample counts can differ. Winner records exclude actual ties and flat
forecast/baseline margins. Markets are not counted as independent games.

The recent-form replay uses only final games on earlier Eastern calendar dates.
This avoids the target/future game and same-day overlap. Calendar-day gaps use
America/New_York across daylight saving time. A long gap is not called a bye.
No season-level statistic retrieved today is inserted into an old forecast.
Historical finals were retrieved now: these comparisons are retrospective,
not prospective validation, and include no injuries, opponent-strength or home
advantage adjustment. Do not select/re-fit a correction on these games and then
claim the same sample as validation. Original forecasts, prices, probabilities,
settlements, model IDs and Supabase collectors are unchanged.

## Refresh contract

`data/draftkings-evidence.json` is a public normalized snapshot, not a live API.
The connected DraftKings tools run in ChatGPT; GitHub Pages cannot invoke them.
A scheduled agent refreshes the file. Refresh in the UI reloads the published
snapshot and refreshes the selected full-screen game’s ESPN context. Show its date at all times; after 36h mark it stale. A failed
refresh preserves the last published evidence and its original timestamps.

1. Read current main, this document and the current snapshot. Use the connected
   DraftKings tools, never scrape an undocumented endpoint or extract auth.
2. Fetch NFL/NBA games for the last 7 days through the current instant, and from
   now through 8 days ahead, in <=7-day slices, limit 100. For a first capture,
   backfill the active season in <=7-day slices. Inspect success/errors/warnings;
   split any RESULTS_LIMITED interval before using it. Dates have explicit
   Eastern offsets; the current clock determines the now boundary.
3. Keep prior historical games; replace observed competition IDs with the new
   observations (including explicit score corrections/reschedules). Never
   interpret an absent result as a cancellation or delete old finals. Maintain
   league-scoped IDs and request provenance. Do not include other leagues.
4. Fetch season statistics for every existing supported NFL/NBA team: 32/30.
   Discover new team identities from actual games, not the configurations list
   alone: that endpoint also includes retired, national and other-league teams.
   Require the response's team abbreviation to agree (known aliases allowed).
5. Normalize to schema 1 exactly as the current file: source `DraftKings Sports
   connector`, kind `dated-snapshot`, capturedAt actual assembly time; queries
   with league/start/end/observedAt/count/requestId; leagues.nfl/nba each contain
   teams and games. Team fields: abbr, name, id, logo, color, observedAt, stats
   (label/value/rank/percent/isPercentage). Game fields: id string, start,
   status, observedAt, home/away (abbr/name/score), stats (label/home/away).
   Scores from unfinished games never count as finals. All timestamps come
   from successful source responses; no placeholder zeroes or invented ranks.
6. Save the candidate outside the tracked data file. Run:
   `node scripts/refresh-sports-evidence.js /absolute/candidate.json --write`.
   It validates, rejects older snapshots and retains immutable team-profile
   observations in `data/evidence-observations/<capture-time>.json` for future
   prospective feature research. The timestamped archive is not proof of a
   validated model. Never overwrite an existing observation with different data.
7. Run `node --test tests/sports-evidence.test.js`, the full repository test
   suite and `git diff --check`. Publish only the snapshot and new observation
   files to current main, reconciling concurrent changes. Data-only refreshes
   need no app-version bump, frontend source change, PR or Edge deployment.
   Verify remote files and GitHub Pages success. Honor actual permission blocks.

If any source fails or coverage is incomplete, keep the last good snapshot
without resetting its date. Record the concrete failure. Do not touch model
constants, saved official rows, odds sources, college props, PR #8, other repos
or hosting. No routine timestamp-only handoff spam.

## Initial read, November 11, 2026

84 NFL and 160 NBA completed games match saved final scores; zero discrepancies.
Current official models only. NFL evidence spans Oct 4–Nov 9 ET; NBA Oct 20–Nov 10.
NFL signed margin bias +2.525 points (84); NBA signed total bias +4.7093 (160).
These identify future tests, not approved production corrections.

On identical recent-form eligible games: NFL margin MAE 10.109 official versus
9.791 form (55), total 11.178 versus 11.555. NBA margin 11.635 versus 12.766
(82), total 15.192 versus 14.839. Mixed, retrospective results do not justify
replacing the official models. Test frozen hypotheses on future games.

NBA book coverage in the earliest capture is only 25 margin / 26 total games
of 160; the UI explicitly shows missing comparable lines. It must not silently
substitute today's or a later line. Audit this coverage separately from skill.

## Verification and rollback

Tests cover aliases, identity, reschedules, missing scores, DST, leakage,
five-game minimum, per-game dedupe, multi-market discrepancies, paired metrics,
staleness, real snapshot validation and rendering. Check Research, NFL/NBA
switches, game selection, tabs, a completed game report, and 390px layout.
Reverting the new UI integration removes the feature without touching saved
predictions, research decisions or settlements. Retain dated observations.

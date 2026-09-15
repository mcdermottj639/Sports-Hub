# AI Picks v232: CFB, MLB and shared reliability

## Outcome and limits

This release fixes reproducible prediction/recording defects and clarifies the
interface. It does **not** establish a higher win rate or profitable betting
strategy. CFB and MLB coefficients are unchanged. Their historical exports lack
the immutable prices and feature timestamps needed for an unbiased ROI backtest.
The v231 NFL historical experiment remains separate; v232 cap and neutral-site
guards have not been re-estimated on an untouched NFL season.

## Verified before/after behavior

| Area | Before | v232 |
| --- | --- | --- |
| CFB neutral site | Automatic +3 home points | Zero home-field boost; location split omitted |
| CFB missing conference | Missing row inferred FCS | Unknown classification, no qualified signal |
| CFB mixed ratings | FPI and tier scales could generate a signal | Read visible, signal blocked pending validation |
| Displayed probability | Capped label but uncapped price math | Same bounded probability for display, gaps and snapshots |
| MLB innings | `12.2` treated as 12.2; decisions used as innings proxy | 12⅔ innings; absent sample uses prior |
| MLB stat parsing | Blank could be zero; IP could match WHIP | Missing stays null; short keys match exactly |
| MLB pitcher coverage | Scoreboard often contains ERA but no IP/WHIP | Cached ESPN season pitching-stat enrichment supplies real samples; scoreboard fallback retained |
| MLB missing starters | Could qualify a total without both starter ERAs | Forecast visible, signals blocked |
| One-sided odds | Favorite implied probability complemented into other side | No invented opposite price/no-vig probability |
| Moneyline tiers | Gap alone could qualify a negative-return price | Actual quoted price must also have positive model EV |
| Pick-em | Zero spread discarded | Zero is a valid line |
| Live/final records | Live first writes; same-day final recomputation could grade | State plus kickoff-time gate; finals only display saved results |
| Pending snapshots | Late splits could overwrite first forecast | First observation immutable; late feed is display-only |
| Push | Removed ungraded | Preserved as `pu:1, c:null`, excluded from W–L |
| Slow grading | Old pending snapshot could overwrite new picks | Merge only processed removals into current queue |
| Old unresolved games | Purged after 14 days | Retained for review; automated retry window unchanged |

## Interface

Picks / Results / Calibration / How it works replace ambiguous navigation.
Three market panels explain winner, handicap and combined score separately.
Shared-scale SVG comparisons retain exact model/book values and text labels.
Both moneyline prices expose model probability, required break-even rate and
hypothetical EV, including below-50% underdogs. The opposite-side comparison is
not a second tracked pick or an automatically qualified recommendation.

One card per game on the league board prevents duplicated market cards.
Watch-only games retain full comparisons. Advanced reports, factors, line moves,
splits, trends, historical charts and export remain available. A qualified gap is
called an experimental signal, not proof of an advantage. Legacy W–L history is
preserved, not relabeled as clean validation.

## New evidence schema

`q` on pending and graded entries stores `v` (model cohort; v234 keeps this at
v232 through UI-only releases), `app` (observing UI build, v234+), `at` (observation
time), `start`, `market`, `home`, exact available `price`, `provider`, `prob`
(moneyline only), `marketProb` (home no-vig probability), `line` (home-oriented
for spreads), `proj`, normalized `odds`, `neutral`, `quality`, `sharpMode`.
Moneyline snapshots additionally keep team/pitcher `features` and CFB `rating`.
Grading adds final home and away scores without changing the forecast.

The current-version evidence panel excludes older/unverifiable snapshots. Paper
ROI risks one unit at each saved price, with pushes returning the stake. It is
shown only for the priced subset and is not actual account profit. Brier/log loss
use saved probabilities. Spread/total probability scores and CLV are unavailable;
no cover probabilities, closing quotes or synthetic −110 prices are invented.
Moneyline snapshots include all winner forecasts, not only qualified edges.
Missing-feature forecasts remain identifiable in `q.quality`.

## Validation and remaining work

Run `node --test tests/*.test.js` and syntax checks for all changed JS.
Regression tests execute production functions, not copies of their formulas.
`tests/responsive.html` embeds the production page at 390px and 1024px for
interactive smoke testing. Local browser navigation was blocked in this session;
published-page checks are recorded separately after release.

Future validation must group correlated markets by event, split chronologically
by model version, and reserve a later untouched period. Do not optimize thresholds
on the same games used to evaluate them. Remaining model limitations include CFB
schedule strength/roster turnover and MLB bullpen, weather, confirmed lineups,
unverified pitcher innings, and unvalidated sharp-money weights. A quote observation
is not an execution, and cached source data may predate its observation timestamp.
No legacy records were deleted or guessed into new sport labels.

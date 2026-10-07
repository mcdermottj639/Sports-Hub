# Player prop model and tracking

Version `props-v1`, launched 7 October 2026. NFL, Top-25 CFB, NBA and MLB
share an independent player-prop model and record. Existing game predictions
and their validation are unchanged.

## What is selected

The collector reads the public ESPN game-odds page's posted player lines and
American prices, plus ESPN athlete metadata and completed game logs. It never
executes page scripts. Event ID, start time, provider and pregame state must
match the scheduled game. Suspended quotes and unsupported markets are skipped.
All quoted athletes in supported markets must finish their data fetch before
ranking; partial scans are retried. The first issued selections are permanent.

Supported markets:

| League | Player markets |
|---|---|
| NFL / Top-25 CFB | Passing yards, attempts, completions, passing TDs; rushing yards/attempts; receiving yards/receptions |
| NBA | Points, rebounds, assists, made threes, and P+R+A / P+R / P+A / R+A |
| MLB | Hits, total bases, RBIs, runs, H+R+RBI; probable starting pitcher strikeouts/outs |

Only markets actually supplied by the feed can produce a selection. No made-up
lines, milestone prices or preseason picks are generated. NBA/CFB coverage
depends on the provider posting supported lines; the page shows coverage status
for each discovered game. Collection uses today's/tomorrow's NBA and MLB slates
and the current open football week.

## Frozen baseline

For each player/market, use at most the last 20 completed regular/postseason
games with the player's current team, within 730 days and strictly before the
capture time. Require 8 games for football, NBA and starting pitchers, or 15
for MLB hitters. The projection is the arithmetic mean. Last 5/10 averages,
median, sample SD, recent hit counts, workload and opponent history are saved
as evidence. Opponent history does not alter the projection.

Out/doubtful/inactive players are excluded. NBA requires positive minutes,
MLB hitters positive at-bats, pitchers positive outs and a current probable
starter designation. NBA minutes / hitter at-bats / pitcher outs are used for
a coarse role-change gate: exclude when the last-three workload mean is below
60% of the earlier sample. Pitchers also require a last-three mean of at least
9 outs. These gates and the window are fixed launch assumptions, not fitted
or validated optimal thresholds. Football has no comparable workload gate.

At the exact posted line, count wins `w`, losses `l`, pushes `p` in `n` games.
Use `P(win)=(w+1)/(n+2)`, `P(loss)=(l+1)/(n+2)`, `P(push)=p/(n+2)`. A win returns
`price/100` units for positive American odds, or `100/abs(price)` for negative
odds. Estimated net return is `P(win)*win_return-P(loss)`. Rank by this estimate,
then sample size and stable athlete/market keys. Save up to two **different
players** per game. Negative estimates are shown as leans, with that limitation
on the card. Different players are not statistically independent selections.

This is an experimental empirical baseline. No probability calibration or
profitable betting edge has been established. Injury severity, confirmed
lineups, detailed usage, rest, pace, weather and opponent defensive matchups
are not fully modeled. Small samples and choosing the maximum estimate across
many markets can exaggerate apparent value. No stake sizing or bet execution
is implemented.

## Capture and grading

`sports-hub-props` is a JWT-protected Edge function. Discovery runs every 15
minutes; two independent workers run each minute and atomically lease one due
game each. This isolates player/HTML work from the existing game-model jobs.
Workers use the same identifying `Sports-Hub/1.0` header as the existing public
data collectors. Missing quotes retry every 15 minutes within one day of the
game and hourly further out. Saved games return for grading two hours after
start, then every 15 minutes until final statistics resolve.

`prop_games` stores queue/coverage; `prop_picks` holds immutable selections,
observed prices, projections, probabilities and exact supporting game history;
`prop_runs` audits operations. A database trigger rejects post-start capture,
stale quote capture, future-game evidence and changes to any original pick
field. Anonymous/authenticated clients have SELECT only; writes and the claim
RPC require the service role. Write credentials stay server-side.

Only a confirmed final and exact event/player statistic grades a pick. Missing
statistics stay pending. Explicit DNP, cancellation or rescheduling voids the
paper pick; integer-line equality is a push. These are stated paper-tracking
rules and may differ from a sportsbook's participation/settlement rules.
Record = W/L excluding pushes/voids. Paper profit uses one unit per pick at the
captured price. ROI denominator includes win/loss/push stakes, excluding voids.
No historical picks are manufactured to seed this record.

## Reproducible checks and limits

Run `node --test tests/player-props.test.js` for parsing, identity, timing,
sample/workload gates, units, ranking, grading, ROI and route checks.
Run `node scripts/validate-props.js data/prop-validation-history.json` to
reproduce `data/prop-validation.json`. Saved source URLs and retrieval date
are included with the normalized game logs.

The replay uses a convenience sample of 20 players, with 18 meeting eligibility
in the evaluation period. Samples came from six NFL and six MLB prop athletes
and four NBA/CFB game-summary leaders. Evaluate 2026 games (NBA: 2025–26), using
only earlier games to produce each forecast. Multiple stats from one player
game are correlated. The replay checks chronological projection behavior, not
league-wide accuracy, model improvement or selection quality.

| Example market | Forecasts | Mean absolute error |
|---|---:|---:|
| NFL receiving yards | 29 | 29.08 yards |
| CFB passing yards | 5 | 46.85 yards |
| NBA points | 238 | 4.64 points |
| MLB hits | 832 | 0.70 hits |

There are no archived prop quotes in this sample. Dummy lines in the replay
exercise the projection path only; probabilities, pick rankings and ROI are
not evaluated. The sample does not validate NFL passing or MLB pitcher markets.
The first real prospective cohort starts at launch. Review coverage, player
stat errors, calibration, price-specific ROI and uncertainty on that cohort
before promoting this model or changing its constants; never refit and report
performance on the same observations.

## Display and release

`player-props.js` / `.css` render `#/models/{all|nfl|cfb|nba|mlb}/props`, game
report cards, league slate summaries and a separate performance/history view.
Detailed saved inputs load on expansion. No extra localStorage history is used.
Unavailable feeds remain explicit, without guessed props or zero-filled stats.
Deploy the shared core with the Edge function, apply migrations, install
`supabase/schedule-player-props.sql`, and verify real pregame capture before
publishing the frontend through the existing GitHub Pages release process.

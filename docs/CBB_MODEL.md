# Men's Division I college basketball

Sports Hub covers games involving a Top 25 team and all Division I tournament
games identified by ESPN, including unranked teams. The CBB board has combined,
Top 25 and tournament filters, date navigation, game reports and saved results.
Tournament coverage includes early-season events, conference tournaments, the
NCAA tournament / First Four and other D1 postseason events. A neutral court
alone does not make a game a tournament. Rankings select the slate; they do not
determine team strength.

## Forecast

One shared engine serves the browser, scheduled collector and historical replay.
It estimates opponent-adjusted scoring margin and each team's contribution to
the scoring environment from completed D1 results. The forecast is the difference
between team ratings, plus a three-point home advantage unless the court is
neutral. The total combines the scoring environment and both team effects.
Winner probability uses a normal residual distribution fitted on the earlier
season. These are score-based ratings, not possession-adjusted efficiency ratings.

Structural parameters were fixed before the replay: four prior-game equivalents,
65% retention of previous-season ratings, ridge penalties of 2 (margin) and 6
(total), and 32 damped fitting iterations. Only residual scale was fitted on
2024–25; it is 11.607 points. No existing sport's coefficients were changed.

The reduced previous-season prior supplies early-season evidence. A team needs
at least three current-season games or fifteen previous-season games. Missing
history, an incorrect season, evidence older than 36 hours, cancelled/postponed
games, or an already-started game withholds a new forecast. A conservative
six-hour interval after a historical start time prevents using an unconfirmed
same-day final in replay. Saved forecasts and their original lines remain frozen.

## Evidence and refresh

Public ESPN men's college basketball endpoints supply the Division I directory
(`groups=50`), scoreboards, ranks, tournament metadata, scores and available odds.
`scripts/cbb-data.py` collects one day at a time, keeps only completed games
between D1 directory teams, rejects duplicate/invalid results, and fails without
publishing if any requested date fails. `data/cbb-history.json` contains 11,998
finals at launch: 5,730 from season 2025, 5,722 from 2026 and 546 from 2027.

The GitHub Actions refresh runs at 10:17, 16:17 and 22:17 UTC in November–April,
rechecking the latest seven days for corrections. It publishes only evidence;
it does not refit the model. The existing JWT-protected collector runs at :07
and :37 each hour and captures CBB alongside the other sports. Up to 30 new
CBB games are forecast per run, earliest first; the next run takes deferred
games. Existing NBA budgets and CFB protections remain unchanged.

Moneyline forecasts and available spread/total comparisons are saved before
tipoff and graded after confirmed finals, including tournament teams no longer
ranked when grading runs. No college player props are produced. All CBB rows
are research forecasts with no betting tier; they cannot enter qualifying-bet
profit figures. Spread/total probabilities are withheld rather than borrowed
from another sport's calibration.

## Chronological validation

`node scripts/validate-cbb.js` performs expanding-window daily replays. Residual
scale uses 5,113 forecasts from 2024–25. The untouched 2025–26 holdout uses only
results available before each day's forecast cutoff, plus the earlier season.

| 2025–26 holdout | Games | Winner accuracy | Margin MAE | Total MAE |
|---|---:|---:|---:|---:|
| All D1 forecasts | 5,719 | 71.7% | 9.39 pts | 13.89 pts |
| Top 25 or tournament | 1,310 | 74.9% | 9.87 pts | 13.57 pts |
| Top 25 | 774 | 81.7% | 10.70 pts | 12.95 pts |
| Tournaments | 699 | 67.2% | 9.05 pts | 13.95 pts |

Top 25 and tournament subsets overlap. Always picking the home-designated team
won 64.5% in the requested coverage. The model's Brier score was 0.1610 for winner
probabilities. These are historical winner results, not betting returns; no
historical odds or ROI have been invented. Full metrics and signed biases are
in `data/cbb-validation.json`.

Important limitations: ESPN data is a retrospective snapshot, so publication-time
revisions cannot be reconstructed. Current D1 membership is applied to historical
scores. Player availability, transfers, coaching changes and possession-adjusted
pace are not directly modeled. Historical Top 25 margins underpredict the
home-designated team's margin by 3.50 points on average; tournament totals run
2.38 points high. Do not tune against this same holdout. Collect prospective
results and inspect calibration, neutral/home splits, early-season priors and
margin/total bias before promoting any betting signal or changing coefficients.

## Maintenance

Run `node --test tests/*.test.js`, `node scripts/check-cbb-data.js`, and syntax
checks on touched files. Refresh the dataset with `python scripts/cbb-data.py`;
an output path with no existing file rebuilds the full archive. Preserve original
forecast timestamps, odds, model version and research status in grading and UI.
The database migration only extends the allowed sport list; RLS, grants and
immutability constraints remain intact. Deploy the collector using a shim pinned
to the tested Git commit after publishing source. This service is independent
of Jarvis and does not change portfolio, Apex or agentic trading workflows.

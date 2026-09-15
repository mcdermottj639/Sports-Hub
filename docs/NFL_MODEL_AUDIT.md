# NFL model audit — v231 candidate

Status: implemented and tested on local branch `audit/nfl-model-v1`; not pushed.

## Executive finding

The previous NFL model was useful as a team-strength ranking, but it was not a
calibrated betting model. It pushed one hand-weighted logit through moneyline,
spread and totals, quoted much more confidence than its results supported, and
only promoted a moneyline value when it picked the sportsbook underdog to win.
That last gate discarded normal value favorites entirely.

The v231 candidate keeps the UI unchanged but gives NFL moneyline, spread and
total separate fitted paths. It also makes sharp-money data monitor-only until
coverage and results can validate it.

## Data and validation design

- Source: completed ESPN NFL regular-season and postseason scores.
- Features reproduce the production app and use only games completed before
  the predicted kickoff.
- Early-season prior reproduces the app's damped previous-season blend.
- Training: 2017–2023, 1,922 games.
- Model selection only: 2024, 286 games.
- Final untouched test: 2025, 285 games.
- Additional directional check: the 16 completed 2026 games available on
  15 September. This tiny sample did not select or fit any coefficient.
- Archived sportsbook odds and closing lines are unavailable in this dataset.
  Therefore this audit validates forecast quality, not ROI or closing-line value.

## Untouched 2025 results

| Measure | Previous model | v231 candidate | Change |
|---|---:|---:|---:|
| Moneyline accuracy | 66.32% | 65.96% | −0.35 pp |
| Brier score | 0.2336 | 0.2178 | 6.8% better |
| Log loss | 0.7126 | 0.6245 | 12.4% better |
| Mean quoted confidence | 77.78% | 62.62% | materially less inflated |
| Accuracy minus confidence | −11.47 pp | +3.35 pp | calibration repaired |
| Spread-margin MAE | 12.48 pts | 10.17 pts | 18.4% better |
| Spread-margin RMSE | 16.01 pts | 12.97 pts | 19.0% better |
| Total MAE | 11.21 pts | 11.09 pts | 1.1% better |
| Total RMSE | 15.22 pts | 14.51 pts | 4.7% better |

The important result is not a higher winner rate. Accuracy is effectively flat.
The improvement is that the probability and margin are substantially more
honest, which is necessary before comparing them with a market price.

The result repeated on the 2024 selection season: Brier improved from 0.2366 to
0.2158, margin MAE from 12.68 to 10.18, and margin RMSE from 16.02 to 13.14.

## 2026 directional check

On the first 16 completed games, the reproduced previous engine was 7–9 with a
0.2793 Brier score and 14.47-point margin MAE. The candidate was 8–8 with a
0.2503 Brier score and 12.69-point margin MAE. Sixteen games are far too few to
claim a new edge; this is only a check that the historical improvement did not
immediately reverse.

The owner's exported betting record is a different, market-selected sample:
5–9 ATS and 0–4 totals in the visible NFL rows. Those records describe wager
selection, while the 16-game score backtest evaluates every game it could price.

## Root causes found

1. **Moneyline gate selected only upset calls.** `pickTier` returned `null`
   whenever the model and sportsbook agreed on the likely winner. A favorite
   rated 60% by the model and 53% by the market is ordinary positive model value,
   but it was discarded. The candidate tiers any positive pick-side gap and
   reserves Red Alert for a +150-or-longer underdog picked outright. It also
   includes Red Alerts in the board's play count; that count previously omitted
   the highest tier.
2. **Confidence was inflated.** The previous model averaged 77.8% confidence on
   an untouched season where it was right 66.3%. Most picks (183 of 285) landed
   at 70%+, a sign the weights were stretching probabilities rather than
   separating games reliably.
3. **Recent form was overweighted.** The fitted moneyline coefficient is −0.027
   versus the old +0.4. In this feature definition, last-five margin adds almost
   no stable forward signal after season strength is already present.
4. **Home/road split was overweighted and replaced home field.** The fitted
   split coefficient is 0.120 rather than 1.0, while a stable home intercept
   remains. Small and noisy split samples should not erase normal home field.
5. **One answer was forced across three markets.** The previous projected margin
   was reverse-engineered from the moneyline probability, and totals were an
   uncalibrated scoring average. The candidate separates the targets while
   sharing the same pregame feature snapshot.
6. **Sharp money was not testable.** The supplied sample showed the splits feed
   live for 0 of 15 graded NFL predictions. A feature with no measured coverage
   or out-of-sample result cannot justify moving a pick. Coverage remains logged,
   but its NFL prediction weight is zero.
7. **Profitability cannot be measured from the stored record.** A win/loss flag
   without the exact wager price cannot compute units or ROI. Closing-line value
   also needs a timestamped closing price.
8. **There was no automated test suite.** The candidate adds Node tests against
   the exact dependency-free arithmetic loaded by the browser.

## Candidate architecture

- Moneyline: regularized logistic regression, producing home win probability.
- Spread: regularized linear margin model in points.
- Total: calibrated shrink of the two teams' combined scoring-rate estimate.
- Recommendation tier: model pick-side probability minus de-vigged market
  probability, whether the selected team is favorite or underdog.
- Sharp splits: observed and logged, but no NFL predictive weight yet.
- Existing visual design, cards, storage, grading and navigation are preserved.

## Required next measurement

Do not call v231 profitable yet. After deployment, store the sportsbook, exact
odds/price, prediction timestamp, model version, closing line and closing price
for each market. Evaluate ROI, CLV, Brier score and calibration by model version
chronologically. Do not change a coefficient from the first few weeks of wins
or losses.

## Verification

- `node --check nfl-model.js`
- `node --check app.js`
- `node --check sw.js`
- `node --test tests/*.test.js` — 10 passed, 0 failed
- `git diff --check`

Headless browser QA could not run in the current workspace because the
Playwright package is present without a browser binary. No browser was
downloaded or added to the repository.

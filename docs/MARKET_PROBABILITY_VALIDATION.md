# Spread and total probabilities — residual-t-v1

Status: experimental estimates shipped for pregame qualified forecasts. **Not calibrated betting edges.** Original margin/total projections, selection rules, ranking and stakes are unchanged.

## Evidence and reproducibility

Source: immutable model-v239 pregame rows from Sports Hub `public.ai_predictions`, extracted September 30, 2026. `data/market-probability-sample.json` contains the bounded reproducible sample (sport/event/market, original projection/line, timestamps, final score). One row per sport/event/market; voids, pending games and post-start captures excluded. These are **selected qualifying forecasts**, not every game or an independent sample of teams.

Run `node scripts/fit-market-probability.js`. It writes the frozen runtime config and `data/market-probability-validation.json`, including sample hash, every held-out prediction, bins and metrics. No coefficients or validation thresholds were selected from test outcomes. Runtime arithmetic is exactly the same shared module used in this script and the tests.

The probability layer measures actual score minus saved projected score separately for each sport and market. It estimates error mean and sample standard deviation. A Student-t predictive distribution uses n−1 degrees of freedom and scale `s * sqrt(1 + 1/n)`; five observations is a numerical availability minimum, **not proof of reliability**. Integer score continuity correction assigns win, loss and push probabilities; half-point lines cannot push. Totals are truncated at zero score. Displayed/saved `model_probability` is win probability **conditional on no push**, consistent with Brier/log-loss scoring that excludes pushes. Unconditional win/loss/push probabilities are also saved.

Statistical reference: https://itl.nist.gov/div898/software/dataplot/refman1/auxillar/predlimi.htm (single future observation). This construction assumes comparable, approximately normal independent errors; sports results may violate those assumptions. It does not separately model NFL key-score masses. Formula correctness does not establish sports calibration.

## Strict chronological test

For each held-out forecast, fit only on **other results graded before its original capture timestamp**. Results known after that timestamp never enter its training, even if kickoff was later. At least five eligible training rows are required. Pushes are excluded from binary scores. Final production config is then fit on the complete currently settled sample for genuinely future observations; the test evaluates the predeclared fitting procedure, not the exact final coefficients.

| Market | Final fit n | Held-out n | Brier (lower better) | 50/50 baseline | Avg probability | Actual hit rate |
|---|---:|---:|---:|---:|---:|---:|
| NFL spread | 22 | 11 | 0.243 | 0.250 | 56.0% | 63.6% |
| CFB spread | 29 | 16 | 0.233 | 0.250 | 68.4% | 56.3% |
| NFL total | 11 | 6 | 0.392 | 0.250 | 67.5% | 16.7% |
| CFB total | 6 | 0 | unavailable | unavailable | unavailable | unavailable |
| MLB total | 43 | 35 | 0.262 | 0.250 | 56.9% | 51.4% |

Spread results are small directional tests, not sufficient validation. NFL and MLB totals fail the simple 50/50 baseline. CFB totals have no eligible held-out sample. None is called calibrated; estimates must not drive ranking, staking or a profitability claim. No historical ROI is inferred from missing prices. No held-out betting-price comparison is reported because this sample lacks historical payout odds.

## Production safeguards

- Frozen point-forecast version stays v239. Probability version is separate in `snapshot.probability`.
- New qualified spread/total rows save probability, error-sample n, training cutoff, method version and timestamp before kickoff.
- Existing pending rows may receive a newly timestamped estimate at their original projection and line. Capture time, selection, line, price and result are not rewritten. The probability's training cutoff must precede its own observation time, which must precede kickoff.
- Existing CFB forecasts continue to be observed after teams drop out of the current Top 25.
- Settled rows never receive retrospective probabilities. Historical tests remain separate from the official live record.
- Results show upcoming probabilities immediately. Brier/log loss and average saved probability accumulate automatically as those new observations settle. Older unscored rows remain in win/loss and ROI counts with their coverage shown.
- Browser and collector share config and arithmetic. Unsupported sports, missing inputs, inadequate history, invalid uncertainty and future-trained configurations return no estimate.
- Config does not silently refit in the scheduled job. Future model changes require a new version and the same chronological validation; do not tune on a final test sample and continue calling it held out.

## Release checks

`node --test tests/*.test.js`; `node --check app.js`; `git diff --check`. Student-t CDF cross-checked independently against SciPy across 63 df/x pairs (maximum absolute difference < 2e-15). Tests cover push semantics, side complements, leakage, invalid data and pregame-only enrichment. Deploy the two new shared files with `sports-hub-ai`; verify live pending rows contain valid probability timestamps without changing completed history.

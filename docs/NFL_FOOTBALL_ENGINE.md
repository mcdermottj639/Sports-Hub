# NFL football challenger — v275

The official v239 winner, spread and total paths remain unchanged. The new
`football-research-nfl-v4` cohort records an independently fitted challenger at
the existing immutable early/near capture windows. No stakes or automatic
promotion are enabled. Existing v3/v2 observations remain in the database.

## What is implemented

- Public nflverse play-by-play aggregates, identity mapping and three daily
  refreshes through `.github/workflows/nfl-football-data.yml`. The server reads
  the small raw GitHub snapshot; the phone downloads only saved game evidence.
- Separate opponent-adjusted passing/rushing EPA, observable garbage-time
  filtering, two-year history with time decay and small-sample shrinkage.
- QB efficiency, accuracy over expectation, sack/scramble information and an
  adjustment relative to the QBs represented in the measured team history.
  One jointly fitted feature model avoids stacking independent talent bonuses.
- Protection/sack matchups, success and explosive-play rates, expected drives,
  rest and neutral-site handling. Features use the exact same shared JavaScript
  in historical replay and collection.
- Current ESPN depth charts and injury reports, starter/backup scenarios,
  first/second-depth personnel restrictions and offensive-line injury clusters.
- Timestamped ESPN weather context; unavailable wind remains null. Historical
  weather observations are not substituted for historical pregame forecasts.
- Coaching tendencies, fourth-down attempts, late-close execution and cold
  rush-defense samples are visible evidence, with **zero additional weight**.
  These are team-context summaries, not isolated coach or clutch causal effects.
- Dated scouting notebook with source URL, fact/opinion tag, immutable notes,
  expiration no later than kickoff and JSON export. Notes are browser-local and
  never silently change the engine. A reported fact remains unverified until
  independently checked; source links do not prove correctness.
- Experimental outcome ranges and conditional backup forecasts. Unknown QBs,
  stale/partial feeds and important unresolved personnel/conditions withhold
  the challenger. No arbitrary probability is assigned to a questionable QB.
- Compact game explanation: three grouped contributions relative to training
  averages and one uncertainty; deeper evidence is collapsed by default.
- Prospective same-game validation, baseline/market/fixed 50/50 market blend,
  exact-price paper returns, and per-market promotion review gates. One latest
  window per game; a withheld near observation cannot fall back to early.

## Historical evaluation

Training uses 2018–2023 (1,657 eligible games), selection uses 2024 (285), and
the chronological holdout uses 2025 (285, including one tie). Three fixed feature
families and three regularization settings were selected only on 2024. Weights
are frozen and the refresh workflow **never refits them**.

| 2025 measure | Current reproduced baseline | Challenger |
|---|---:|---:|
| Margin MAE | 10.143 | 10.239 |
| Total MAE | 10.873 | 10.589 |
| Winner Brier score | 0.218 | 0.225 |
| Winner log loss | 0.624 | 0.642 |

Lower is better. Totals improved modestly; margin and winner results do not
justify replacing the current model. This is a replay of corrected historical
data, not an archive of what each source actually published before kickoff.
Expected historical QBs use the prior game's passer, not hindsight knowledge
of the actual starter. Changed-lineup scenarios need prospective validation.
2025 was used in prior engine research; it is not an untouched organizational
test. Historical book odds are deliberately excluded because their observation
times are not established. No historical ROI or CLV is claimed.

`data/nfl-football-validation.json` records family selection and exact metrics.
The prospective gate needs at least 150 unique settled games per market and a
negative upper 95% bound on paired forecast-loss difference before identifying
a review candidate. That is a review threshold, not proof of betting advantage
and not automatic promotion. Pricing, source coverage and calibration still
need review. All-game paper returns are explicitly distinct from a bet strategy.

## Reproduce

```bash
python3 scripts/nfl-data.py --start 2017 --end 2026 --output /tmp/nfl-history.json
node scripts/nfl-features.js /tmp/nfl-history.json /tmp/nfl-features.json
python3 -m pip install -r scripts/nfl-training-requirements.txt
python3 scripts/fit-nfl-football.py /tmp/nfl-features.json
node scripts/validate-nfl-prospective.js saved-research-rows.json
```

The first script uses only Python's standard library. Training additionally
uses numpy and scikit-learn. The entire history need not be committed; the
release includes only the last three seasons of aggregates needed live. Current
data refresh requires 90% of completed current-season games, atomically replacing
the previous snapshot only after validation. A snapshot more than three days
old withholds new challenger projections. Already saved forecasts stay frozen.

## Release and operation

Deploy the updated `sports-hub-ai` Edge Function with JWT verification enabled,
including all relative dependencies. Its existing 7/37-minute cron persists
v4 observations and grades them with the existing final-score path. No new table,
RLS policy, public write permission, secret or paid data subscription is needed.
GitHub Actions uses its repository-scoped token solely to update the evidence
JSON. A failed refresh keeps the previous snapshot; stale evidence fails closed.

Sources: https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html,
https://github.com/nflverse/nflverse-data,
https://github.com/nflverse/nfldata, and ESPN public NFL feeds.

# NBA model and capture

The NBA page and scheduled collector use the same frozen `nba-v1` engine.
The winner is a logistic model; margin and total use separate linear fits.
Coefficients are visible in NBA → Model info and generated in
`supabase/functions/_shared/nba-model-config.js`.

## Inputs and timing

- ESPN completed NBA season-type 2 games, including the NBA Cup championship
  games ESPN classifies in that phase. No preseason, future results, or playoffs
  are used in these features. The page can still display all game phases.
- Current-season points scored/allowed, margin and win rate, blended with 15
  games of prior-season weight when at least 20 prior games are available.
- Recent form and scoring environment use the latest 10 current-season games.
  No current games means no recent-form deviation.
- Home court (zero for neutral sites), calendar rest days in America/New_York,
  and back-to-backs. Rest is capped at three full days.
- A missing current-season response is a failure, not permission to silently
  substitute old data. Fewer than five current games and 20 prior games yields
  no forecast. History is cut off at the earlier of observation time and tipoff.
- NBA's ESPN season year is the ending year: October 2026 and January 2027
  both use season 2027, with 2026 as the prior.

Player availability, trades, starting lineups, opponent-adjusted strength and
possession-based pace are not included. Prior-season rosters can differ greatly
from the opening-night team. Playoff forecasts use this same regular-season
formula without a separate playoff validation claim.

## Reproduce the historical check

Python dependencies: NumPy and SciPy. JavaScript requires Node with Intl.

```sh
python scripts/nba-data.py
python scripts/fit-nba.py
node --test tests/nba-model.test.js
```

The checked-in `data/nba-history.json` contains 6,153 distinct games from five
ESPN seasons. Every team's schedule is fetched, then duplicates are reconciled
by event ID; inconsistent duplicates and incomplete season counts fail the
collector. ESPN's NBA scoreboard does not accept the month-long date ranges
used by some other sports, so this script uses team schedules.

Season ending 2022 supplies prior history. Seasons ending 2023 and 2024 are
training (2,461 games). Season ending 2025 selects ridge strength separately for
each market from 0, 10, 100 and 1,000 (1,231 games). The chosen coefficients are
refitted on training plus selection years. Season ending 2026 is a single
untouched holdout (1,231 games). Each replay forms features before adding that
game's final result. The frozen model is not refitted on the holdout.

| Held-out metric | NBA model | Simple training-period baseline |
| --- | ---: | ---: |
| Winner accuracy | 68.4% | 55.5% always-home accuracy |
| Winner Brier score | 0.2061 | 0.2470 constant home probability |
| Margin mean absolute error | 11.42 points | 13.09 points |
| Total mean absolute error | 15.29 points | 15.93 points |

These compare forecasts with simple baselines, not betting markets. No historical
odds are attached, and no ROI, edge, CLV, or profitability claim is supported.
Spread/total probabilities are deliberately unavailable until a separate error
calibration is built and evaluated. The 3-point spread and 6-point total filters
are unvalidated display thresholds; they do not filter official forecast capture.

## Live data flow

The existing JWT-protected `sports-hub-ai` Edge Function includes NBA today and
tomorrow in its twice-hourly run. It skips preseason, cancelled/postponed games,
and games already started. Every available forecast gets an immutable winner row
containing the full margin, total, feature inputs and available odds. Posted
spread/total lines create their own rows even below the display threshold.
Existing duplicate protection is `(event_id, market, model_version)`.

NBA uses a separate `nba-v1` cohort; historical device fallback records are not
promoted into its official record. The migration extends only the existing sport
check constraint. It does not change rows, RLS, grants, schedules or other models.
The browser reads NBA rows with NFL/CFB/MLB history; all NBA reports can recover
saved original projections and evidence after tipoff. No postgame prediction is
manufactured. Pending games are graded with the existing actual-final-score path.

The league page includes date browsing, scores, model reads, standings, headlines,
model coefficients, Results and Saved games. Leagues replaces Fantasy in the
mobile dock. Fantasy remains in More and the sidebar. NFL, CFB and NBA offer
direct league switching; MLB opens its existing model board.

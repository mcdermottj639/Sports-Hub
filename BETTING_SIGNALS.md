# Betting signals — NFL observation pilot (v244)

This is prospective research inside Sports Hub's existing Picks, Game Report and Results screens. Labs links to the same Results view. No historical performance is manufactured, model constants/tier thresholds are unchanged, and no rule raises confidence.

## Data and operation

- Supabase `sports-hub-ai` keeps its 7/37 minute schedule and model cohort v239. The additive hook captures normalized prices before forecasting, obtains current-season raw prior-game dates and divisions, and stores current rule evidence. The original `ai_predictions` table remains separate.
- `sports-hub-odds` is a lightweight collector polled by cron every five minutes. Durable `next_poll_at` limits actual source polling to hourly outside 24 hours, every 15 minutes inside 24 hours, and every five minutes in the final two hours. The existing AI job also captures a quote when it runs. Cron is not an exact-time guarantee.
- Only future, pregame NFL quotes are stored. Markets: moneyline, home-oriented spread, and total. ESPN legacy and nested market representations are supported; actual prices must belong to the same line. First seen is not opening; last observed is not certified closing. Source timestamps remain unknown when the feed does not supply them.
- `betting_quote_snapshots` and `betting_system_decisions` reject updates and deletes. Retry keys avoid duplicate run observations and duplicate rule decisions. `betting_system_settlements` holds corrections separately, with audit history. Rescheduling voids an old decision and creates a distinct schedule opportunity.
- Source rules: road underdog +3 through +7, at least three extra New York calendar rest days, regular season, non-neutral; and under in a verified same-division regular-season game. Versions remain separate.
- Freeze at the first successful scheduled observation 30–60 minutes before kickoff, rechecking capture and write clocks. Missing inputs/prices are frozen as missing, not retried for a better outcome. A missed window cannot be reconstructed. No assumed −110.
- Current summaries recalculate the shared rules against latest comparable stored prices using fresh rule inputs. Saved decisions do not change. Data older than 45 minutes is labeled cached and current claims are withheld.
- Results are fully paginated within a selected range (maximum 370 days), grouped by rule/version, decision policy, provider policy/book, model engine and source freshness. One unit is risked per priced settled entry; pushes are in the ROI denominator, voids excluded. Correlated systems are not combined into a fake independent sample.
- Filters: dates, market, rule, provider, model cohort, favorite/underdog (priced spread side) model agreement, observed line movement and minimum model gap in points. Movement and model-gap filters use only frozen entry-time values; unavailable inputs remain unavailable. A point gap is not a probability or expected return. Arbitrary optimized systems and historical backtests are not claimed.

## Hosting and cost

The accepted expansion uses existing Supabase, not a new Railway subscription. GitHub Pages and Render fantasy stay in place. No feed purchase or fantasy migration was made. Database/functions consume existing allowances; measure a full NFL week before judging usage or changing hosting. Strategy validation takes much longer.

## Controls and recovery

`betting_signals_config` row 1 contains independent `capture_enabled` and `ui_enabled` switches. Disable capture to stop new writes, or UI to hide evidence. Keep the historical tables. `betting_capture_runs` reports odds-job status; AI job details contain a separate `signals` block. Neither substitutes for the other's health. Source failures retain old data and timestamps.

Public roles have normalized SELECT access only and no INSERT/UPDATE/DELETE grants. Operational locks are private. Only Edge workers use service-role credentials. Vault-backed cron SQL is in `supabase/schedule-betting-signals.sql`; never place secret values in git.

Retain pilot quotes through the season plus 30 days; retain decisions and settlement audit indefinitely. There is no automatic destructive cleanup. Monitor table size using `pg_total_relation_size` and daily rows; review storage before adding sports. Correction reconciliation revisits seven recent days and unresolved matches, fetching at most fourteen source dates per run. Very old unresolved reschedules remain visible for review.

## Validation

Run `node --test tests/*.test.js` plus syntax checks on edited JavaScript. Tests cover current ESPN prices, pairing, invalid and missing prices, DST rest, collection clocks, idempotence, immutable freeze, reschedule/correction settlement, ROI, pagination and stale UI. Production verification must include successful background observations and current evidence, anonymous read-only privileges, then enable UI. Use real collecting states; fixtures belong only in tests.

One full NFL week of collection, shared cross-device history and usage measurement is the pilot acceptance period. It cannot be completed on deployment day. Forward outcomes begin after saved entries and actual final games.

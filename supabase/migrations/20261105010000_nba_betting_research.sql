-- v352: NBA joins the betting research tables (market sides + situations; no fixed rules).
-- Only the sport CHECK constraints change. Existing rows, grants and RLS are untouched.
alter table public.betting_quote_snapshots drop constraint if exists betting_quote_snapshots_sport_check;
alter table public.betting_quote_snapshots add constraint betting_quote_snapshots_sport_check check (sport = any (array['nfl'::text,'cfb'::text,'nba'::text]));
alter table public.betting_system_decisions drop constraint if exists betting_system_decisions_sport_check;
alter table public.betting_system_decisions add constraint betting_system_decisions_sport_check check (sport = any (array['nfl'::text,'cfb'::text,'nba'::text]));
alter table public.betting_signal_current drop constraint if exists betting_signal_current_sport_check;
alter table public.betting_signal_current add constraint betting_signal_current_sport_check check (sport = any (array['nfl'::text,'cfb'::text,'nba'::text]));

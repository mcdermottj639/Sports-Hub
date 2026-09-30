-- Extend only sport checks; preserve immutable history, existing rows, RLS and grants.
alter table public.betting_quote_snapshots drop constraint betting_quote_snapshots_sport_check;
alter table public.betting_quote_snapshots add constraint betting_quote_snapshots_sport_check check(sport in ('nfl','cfb'));
alter table public.betting_system_decisions drop constraint betting_system_decisions_sport_check;
alter table public.betting_system_decisions add constraint betting_system_decisions_sport_check check(sport in ('nfl','cfb'));
alter table public.betting_signal_current drop constraint betting_signal_current_sport_check;
alter table public.betting_signal_current add constraint betting_signal_current_sport_check check(sport in ('nfl','cfb'));

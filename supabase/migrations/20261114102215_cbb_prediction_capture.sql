-- Add CBB to the existing immutable prediction ledger; grants and RLS unchanged.
alter table public.ai_predictions drop constraint ai_predictions_sport_check;
alter table public.ai_predictions add constraint ai_predictions_sport_check check (sport in ('nfl','cfb','mlb','nba','cbb'));

-- Additive NFL observation pilot. Public clients can only read normalized application data.
create table public.betting_signals_config(id integer primary key check(id=1),capture_enabled boolean not null default false,ui_enabled boolean not null default false);
insert into public.betting_signals_config(id) values(1);
create table public.betting_capture_locks(slot text primary key,claimed_at timestamptz not null default now());
create table public.betting_capture_runs(id text primary key,started_at timestamptz not null,finished_at timestamptz,status text not null check(status in ('running','ok','partial','error','disabled')),written integer not null default 0,evaluated integer not null default 0,missed integer not null default 0,unpriced integer not null default 0,error_category text,last_observed_at timestamptz,next_poll_at timestamptz);
create table public.betting_quote_snapshots(
 id bigint generated always as identity primary key,sport text not null check(sport='nfl'),event_id text not null,schedule_instance text not null,scheduled_start_at timestamptz not null,observed_at timestamptz not null,source_updated_at timestamptz,source text not null default 'espn',provider_id text not null,provider_name text,market text not null check(market in ('moneyline','spread','total')),line numeric,home_price integer,away_price integer,over_price integer,under_price integer,quality_flags text[] not null default '{}',raw_payload_hash text not null,collector_version text not null,capture_run_id text not null,
 unique(capture_run_id,sport,event_id,provider_id,market),check(observed_at<scheduled_start_at),check(home_price is null or abs(home_price)>=100),check(away_price is null or abs(away_price)>=100),check(over_price is null or abs(over_price)>=100),check(under_price is null or abs(under_price)>=100));
create index betting_quote_event_idx on public.betting_quote_snapshots(sport,event_id,provider_id,market,observed_at);
create index betting_quote_date_idx on public.betting_quote_snapshots(sport,observed_at);
create table public.betting_system_decisions(
 id bigint generated always as identity primary key,sport text not null check(sport='nfl'),event_id text not null,schedule_instance text not null,rule_id text not null,rule_version text not null,decision_policy text not null,decided_at timestamptz not null,observed_at timestamptz,scheduled_start_at timestamptz not null,quote_snapshot_id bigint references public.betting_quote_snapshots(id),status text not null check(status in ('matched','not_matched','insufficient_data','unpriced_match','missed_window')),selection_side text,market text not null,selection_line numeric,selected_price integer,inputs jsonb not null default '{}',condition_results jsonb not null default '[]',quality_flags text[] not null default '{}',engine_version text not null,model_context jsonb not null default '{}',
 unique(sport,event_id,schedule_instance,rule_id,rule_version,decision_policy),check(selected_price is null or abs(selected_price)>=100),check(status='missed_window' or (decided_at<scheduled_start_at and observed_at<scheduled_start_at)));
create index betting_decision_quote_idx on public.betting_system_decisions(quote_snapshot_id);
create index betting_decision_date_idx on public.betting_system_decisions(sport,scheduled_start_at,rule_id,rule_version);
create table public.betting_system_settlements(decision_id bigint primary key references public.betting_system_decisions(id),result text not null check(result in ('pending','win','loss','push','void')),final_home_score numeric,final_away_score numeric,graded_at timestamptz not null,grading_version text not null,correction_reason text,audit_trail jsonb not null default '[]');
create table public.betting_signal_current(sport text not null check(sport='nfl'),event_id text not null,schedule_instance text not null,scheduled_start_at timestamptz not null,observed_at timestamptz not null,inputs jsonb not null default '{}',rule_evaluations jsonb not null default '[]',model_context jsonb not null default '{}',quality_flags text[] not null default '{}',primary key(sport,event_id));
-- Freeze observations and decisions even for accidental service-role UPDATEs.
create function public.betting_reject_mutation() returns trigger language plpgsql set search_path=pg_catalog as $$begin raise exception 'Betting observations and decisions are immutable';end$$;
revoke all on function public.betting_reject_mutation() from public,anon,authenticated;
create trigger betting_quotes_immutable before update or delete on public.betting_quote_snapshots for each row execute function public.betting_reject_mutation();
create trigger betting_decisions_immutable before update or delete on public.betting_system_decisions for each row execute function public.betting_reject_mutation();
do $$declare t text;begin
 foreach t in array array['betting_signals_config','betting_capture_runs','betting_quote_snapshots','betting_system_decisions','betting_system_settlements','betting_signal_current'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy "Public normalized read" on public.%I for select to anon,authenticated using(true)',t);
 end loop;
end$$;
alter table public.betting_capture_locks enable row level security;
revoke all on public.betting_capture_locks from anon,authenticated;
grant all on public.betting_capture_locks to service_role;
revoke all on sequence public.betting_quote_snapshots_id_seq,public.betting_system_decisions_id_seq from anon,authenticated;
grant usage,select on sequence public.betting_quote_snapshots_id_seq,public.betting_system_decisions_id_seq to service_role;
comment on table public.betting_quote_snapshots is 'ESPN normalized first/latest observations, not certified opening/closing prices. NFL pilot retain through season plus 30 days; audit decisions indefinite.';

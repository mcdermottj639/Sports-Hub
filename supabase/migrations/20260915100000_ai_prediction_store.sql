create table if not exists public.ai_predictions (
  id bigint generated always as identity primary key,
  event_id text not null,
  sport text not null check (sport in ('nfl', 'cfb', 'mlb')),
  market text not null check (market in ('moneyline', 'spread', 'total')),
  model_version text not null,
  app_version text not null,
  matchup text not null,
  slate_date date not null,
  starts_at timestamptz not null,
  captured_at timestamptz not null default now(),
  selection text not null,
  selection_home boolean,
  confidence numeric(5,2),
  tier text check (tier is null or tier in ('alert', 'best', 'edge', 'lean')),
  price integer,
  line numeric(7,2),
  projection numeric(7,2),
  model_probability numeric(8,6),
  market_probability numeric(8,6),
  provider text,
  quality text[] not null default '{}',
  snapshot jsonb not null default '{}'::jsonb,
  result text not null default 'pending'
    check (result in ('pending', 'win', 'loss', 'push', 'void')),
  final_home_score numeric(7,2),
  final_away_score numeric(7,2),
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, market, model_version),
  check (captured_at < starts_at),
  check (model_probability is null or model_probability between 0 and 1),
  check (market_probability is null or market_probability between 0 and 1)
);

create index if not exists ai_predictions_sport_start_idx
  on public.ai_predictions (sport, starts_at desc);
create index if not exists ai_predictions_result_start_idx
  on public.ai_predictions (result, starts_at);

create table if not exists public.ai_job_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'ok', 'partial', 'error')),
  sports text[] not null default '{}',
  captured integer not null default 0,
  graded integer not null default 0,
  skipped integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb
);

alter table public.ai_predictions enable row level security;
alter table public.ai_job_runs enable row level security;

drop policy if exists "Public read AI predictions" on public.ai_predictions;
create policy "Public read AI predictions"
  on public.ai_predictions for select to anon, authenticated
  using (true);

drop policy if exists "Public read AI job status" on public.ai_job_runs;
create policy "Public read AI job status"
  on public.ai_job_runs for select to anon, authenticated
  using (true);

grant usage on schema public to anon, authenticated;
grant select on public.ai_predictions, public.ai_job_runs to anon, authenticated;
revoke insert, update, delete on public.ai_predictions, public.ai_job_runs from anon, authenticated;
revoke usage, select on sequence public.ai_predictions_id_seq from anon, authenticated;
revoke usage, select on sequence public.ai_job_runs_id_seq from anon, authenticated;

comment on table public.ai_predictions is
  'Immutable first pregame AI Picks observations. Only the server-side scheduler writes or grades rows.';
comment on table public.ai_job_runs is
  'Audit trail for automatic ESPN capture and grading jobs.';

-- Independent player-prop history. Existing game-market records are untouched.
create table public.prop_games (
 sport text not null check (sport in ('nfl','cfb','nba','mlb')),
 event_id text not null,
 starts_at timestamptz not null,
 matchup text not null,
 game jsonb not null,
 state text not null default 'pre',
 coverage_status text not null default 'queued',
 coverage_note text not null default 'Waiting for the first prop scan',
 quote_count integer not null default 0,
 modeled_count integer not null default 0,
 pick_count integer not null default 0,
 checked_at timestamptz,
 next_poll_at timestamptz default now(),
 lease_until timestamptz,
 primary key (sport,event_id)
);
create index prop_games_due on public.prop_games(next_poll_at) where next_poll_at is not null;
create table public.prop_picks (
 id bigint generated always as identity primary key,
 sport text not null,
 event_id text not null,
 model_version text not null default 'props-v1',
 rank integer not null check(rank in (1,2)),
 starts_at timestamptz not null,
 captured_at timestamptz not null default now(),
 quote_at timestamptz not null,
 athlete_id text not null,
 athlete_name text not null,
 team_id text not null,
 team_abbr text not null,
 market text not null,
 market_label text not null,
 side text not null check(side in ('over','under')),
 line numeric not null check(line>=0),
 price numeric not null check(abs(price)>=100),
 provider text not null,
 projection numeric not null,
 model_probability numeric not null check(model_probability between 0 and 1),
 push_probability numeric not null check(push_probability between 0 and 1),
 expected_return numeric not null,
 features jsonb not null,
 result text not null default 'pending' check(result in ('pending','win','loss','push','void')),
 actual numeric,
 settled_at timestamptz,
 settlement_note text,
 constraint prop_pregame_capture check(captured_at<starts_at and quote_at<=captured_at and quote_at<starts_at),
 foreign key(sport,event_id) references public.prop_games(sport,event_id),
 unique(sport,event_id,model_version,rank),
 unique(sport,event_id,model_version,athlete_id)
);
create index prop_picks_history on public.prop_picks(sport,starts_at desc,id);
create index prop_picks_pending on public.prop_picks(sport,event_id) where result='pending';
create table public.prop_runs (
 id text primary key,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text not null default 'running',
 details jsonb not null default '{}'::jsonb
);
alter table public.prop_games enable row level security;
alter table public.prop_picks enable row level security;
alter table public.prop_runs enable row level security;
create policy prop_games_read on public.prop_games for select to anon,authenticated using(true);
create policy prop_picks_read on public.prop_picks for select to anon,authenticated using(true);
create policy prop_runs_read on public.prop_runs for select to anon,authenticated using(true);
revoke all on public.prop_games,public.prop_picks,public.prop_runs from anon,authenticated;
grant select on public.prop_games,public.prop_picks,public.prop_runs to anon,authenticated;
grant all on public.prop_games,public.prop_picks,public.prop_runs to service_role;
grant usage,select on sequence public.prop_picks_id_seq to service_role;

create function public.protect_prop_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.starts_at<=clock_timestamp() or new.captured_at>clock_timestamp()+interval '5 seconds'
     or new.captured_at-new.quote_at>interval '15 minutes' then
    raise exception 'Prop capture must use a fresh pregame observation';
  end if;
  if exists(select 1 from jsonb_array_elements(new.features->'history') r
       where (r->>'date')::timestamptz>=new.captured_at) then
    raise exception 'Prop inputs cannot include future games';
  end if;
 elsif (to_jsonb(new)-array['result','actual','settled_at','settlement_note'])
       is distinct from (to_jsonb(old)-array['result','actual','settled_at','settlement_note']) then
   raise exception 'Original prop selections and evidence are immutable';
 end if;
 return new;
end $$;
create trigger prop_snapshot_guard before insert or update on public.prop_picks
 for each row execute function public.protect_prop_snapshot();
revoke all on function public.protect_prop_snapshot() from public,anon,authenticated;

-- A worker claims one game, keeping HTML parsing and player-log work within
-- an independent Edge request's CPU budget. No public write RPC is exposed.
create function public.claim_prop_game() returns setof public.prop_games
language sql volatile security invoker set search_path='' as $$
 update public.prop_games set lease_until=now()+interval '4 minutes'
 where (sport,event_id) in (
  select sport,event_id from public.prop_games
  where next_poll_at<=now() and (lease_until is null or lease_until<now())
  order by next_poll_at,starts_at for update skip locked limit 1
 ) returning *;
$$;
revoke all on function public.claim_prop_game() from public,anon,authenticated;
grant execute on function public.claim_prop_game() to service_role;

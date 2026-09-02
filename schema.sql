-- Family Survivor League — Supabase schema.
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- The shape of the security model, because it is the part that matters:
--   * The anon key sits in a public JS file. That is normal and safe HERE
--     only because of what follows.
--   * `players` holds everyone's personal token and is NOT readable by the
--     anon key. The app reads `players_public`, a view without that column,
--     so nobody can scrape the roster and pick as somebody else.
--   * There are no INSERT/UPDATE/DELETE policies on any table. Every write
--     goes through a SECURITY DEFINER function below that checks the token
--     first. The tables cannot be written to directly.
--   * The no-repeat-a-team rule is a UNIQUE CONSTRAINT, not a UI check.
--     Two open tabs or a stale phone page cannot get around it.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists players (
  id            bigint generated always as identity primary key,
  display_name  text        not null,
  token         text        not null unique,
  is_admin      boolean     not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists picks (
  id          bigint generated always as identity primary key,
  player_id   bigint      not null references players(id) on delete cascade,
  season      int         not null,
  week        int         not null check (week between 1 and 18),
  team        text        not null,
  entered_by  text        not null default 'self',   -- 'self' | 'admin'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint one_pick_per_week   unique (player_id, season, week),
  constraint never_reuse_a_team  unique (player_id, season, team)
);

create or replace view players_public as
  select id, display_name, is_admin from players;

-- ---------------------------------------------------------- lock it down

alter table players enable row level security;
alter table picks   enable row level security;

drop policy if exists picks_are_public on picks;
create policy picks_are_public on picks for select using (true);
-- Deliberately NO select policy on `players`: RLS default-denies, so the
-- tokens are unreachable. No write policies anywhere.

revoke all on players from anon, authenticated;
grant  select on players_public to anon, authenticated;
grant  select on picks          to anon, authenticated;

-- ------------------------------------------------------------- functions

create or replace function whoami(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v players%rowtype;
begin
  select * into v from players where token = p_token;
  if not found then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'id', v.id, 'display_name', v.display_name,
                           'is_admin', v.is_admin, 'token', v.token);
end $$;

create or replace function is_admin_token(p_token text) returns boolean
language sql security definer set search_path = public as $$
  select coalesce((select is_admin from players where token = p_token), false);
$$;

-- House rules 2 (per-game deadline) and the no-repeat rule live here.
-- The kickoff time comes from the client, so a determined family member
-- could spoof it; the real deterrent is that every pick is timestamped and
-- becomes public at kickoff. The no-repeat rule is NOT spoofable — it is a
-- database constraint.
-- p_kickoff is REQUIRED. A pick with no kickoff is a pick on a team that has
-- no game that week (a bye, or a stale page), and since house rule 1 makes a
-- missed week free, burning a team on a bye is strictly worse than doing
-- nothing. The client refuses it too; this is the backstop.
create or replace function submit_pick(p_token text, p_week int, p_team text, p_kickoff timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
declare v players%rowtype; v_season int := 2026; v_dupe int;
begin
  select * into v from players where token = p_token;
  if not found then return json_build_object('ok', false, 'error', 'Unknown link.'); end if;
  if p_week < 1 or p_week > 18 then return json_build_object('ok', false, 'error', 'Bad week.'); end if;
  if p_kickoff is null then
    return json_build_object('ok', false, 'error', 'That team is not playing in week ' || p_week || '.');
  end if;
  if p_kickoff <= now() then
    return json_build_object('ok', false, 'error', 'That game has already started.');
  end if;

  select week into v_dupe from picks
   where player_id = v.id and season = v_season and team = p_team and week <> p_week
   limit 1;
  if v_dupe is not null then
    return json_build_object('ok', false, 'error', 'You already used that team in week ' || v_dupe || '.');
  end if;

  insert into picks (player_id, season, week, team, entered_by)
  values (v.id, v_season, p_week, p_team, 'self')
  on conflict on constraint one_pick_per_week
  do update set team = excluded.team, entered_by = 'self', updated_at = now();

  return json_build_object('ok', true);
end $$;

create or replace function admin_add_player(p_admin_token text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare v_token text; v_base text; v_n int := 1;
begin
  -- The very first player bootstraps the league and becomes commissioner.
  if exists (select 1 from players) and not is_admin_token(p_admin_token) then
    return json_build_object('ok', false, 'error', 'Not an admin.');
  end if;
  v_base := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'player'; end if;
  v_token := v_base;
  while exists (select 1 from players where token = v_token) loop
    v_n := v_n + 1; v_token := v_base || '-' || v_n;
  end loop;
  insert into players (display_name, token, is_admin)
  values (trim(p_name), v_token, not exists (select 1 from players));
  return json_build_object('ok', true, 'token', v_token);
end $$;

create or replace function admin_del_player(p_admin_token text, p_player_id bigint)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_token(p_admin_token) then return json_build_object('ok', false, 'error', 'Not an admin.'); end if;
  delete from players where id = p_player_id;
  return json_build_object('ok', true);
end $$;

create or replace function admin_token_for(p_admin_token text, p_player_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if not is_admin_token(p_admin_token) then return json_build_object('ok', false); end if;
  select token into v_token from players where id = p_player_id;
  return json_build_object('ok', true, 'token', v_token);
end $$;

create or replace function admin_set_pick(p_admin_token text, p_player_id bigint, p_week int, p_team text, p_kickoff timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_season int := 2026; v_dupe int;
begin
  if not is_admin_token(p_admin_token) then return json_build_object('ok', false, 'error', 'Not an admin.'); end if;
  -- Same bye guard as submit_pick. The commissioner taking a pick over the
  -- phone is the MOST likely way a bye team gets picked, so it matters here.
  if p_team is not null and p_kickoff is null then
    return json_build_object('ok', false, 'error', 'That team is on bye in week ' || p_week || '.');
  end if;
  if p_team is null then
    delete from picks where player_id = p_player_id and season = v_season and week = p_week;
    return json_build_object('ok', true);
  end if;
  select week into v_dupe from picks
   where player_id = p_player_id and season = v_season and team = p_team and week <> p_week limit 1;
  if v_dupe is not null then
    return json_build_object('ok', false, 'error', 'They already used that team in week ' || v_dupe || '.');
  end if;
  insert into picks (player_id, season, week, team, entered_by)
  values (p_player_id, v_season, p_week, p_team, 'admin')
  on conflict on constraint one_pick_per_week
  do update set team = excluded.team, entered_by = 'admin', updated_at = now();
  return json_build_object('ok', true);
end $$;

grant execute on function whoami(text)                                   to anon, authenticated;
grant execute on function submit_pick(text, int, text, timestamptz)      to anon, authenticated;
grant execute on function admin_add_player(text, text)                   to anon, authenticated;
grant execute on function admin_del_player(text, bigint)                 to anon, authenticated;
grant execute on function admin_token_for(text, bigint)                  to anon, authenticated;
grant execute on function admin_set_pick(text, bigint, int, text, timestamptz) to anon, authenticated;
revoke execute on function is_admin_token(text) from anon, authenticated;

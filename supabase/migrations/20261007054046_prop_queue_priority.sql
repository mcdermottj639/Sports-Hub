-- Prioritize games starting soonest when multiple slates are due.
-- Leases and due times still prevent overlapping work or immediate retries.
create or replace function public.claim_prop_game() returns setof public.prop_games
language sql volatile security invoker set search_path='' as $$
 update public.prop_games set lease_until=now()+interval '4 minutes'
 where (sport,event_id) in (
  select sport,event_id from public.prop_games
  where next_poll_at<=now() and (lease_until is null or lease_until<now())
  order by starts_at,next_poll_at for update skip locked limit 1
 ) returning *;
$$;
revoke all on function public.claim_prop_game() from public,anon,authenticated;
grant execute on function public.claim_prop_game() to service_role;

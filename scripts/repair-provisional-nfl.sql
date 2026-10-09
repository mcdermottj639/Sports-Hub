-- Restore missing market records from already-saved pregame observations only.
-- Idempotent: never update an existing selection or use a later quote/projection.
with source as (
  select a.*, (snapshot->'forecast'->>'margin')::numeric as margin,
    (snapshot->'forecast'->>'total')::numeric as total,
    (snapshot->'odds'->>'spread')::numeric as spread,
    (snapshot->'odds'->>'ou')::numeric as ou
  from public.ai_predictions a
  where sport='nfl' and model_version='nfl-football-v1' and market='moneyline'
    and captured_at < starts_at
    and quality=array['Provisional forecast']::text[]
    and snapshot->'features'->'football'->'candidate'->>'provisional'='true'
    and jsonb_typeof(snapshot->'forecast'->'margin')='number'
    and jsonb_typeof(snapshot->'forecast'->'total')='number'
), missing as (
  select s.*, m.market as restored_market,
    case when m.market='spread' then margin+spread>0 else null end as home,
    case when m.market='spread' then spread else ou end as saved_line,
    case when m.market='spread' then margin else total end as saved_projection,
    case when m.market='spread' then split_part(matchup,' @ ',case when margin+spread>0 then 2 else 1 end)
      ||' '||case when (case when margin+spread>0 then spread else -spread end)>0 then '+' else '' end
      ||trim_scale(case when margin+spread>0 then spread else -spread end)::text
      else case when total-ou>0 then 'OVER ' else 'UNDER ' end||trim_scale(ou)::text end as saved_selection,
    case when m.market='spread' then (snapshot->'odds'->>case when margin+spread>0 then 'hSpreadPrice' else 'aSpreadPrice' end)::integer
      else (snapshot->'odds'->>case when total-ou>0 then 'overPrice' else 'underPrice' end)::integer end as saved_price,
    case when m.market='spread' then (snapshot->'odds'->>case when margin+spread>0 then 'aSpreadPrice' else 'hSpreadPrice' end)::integer
      else (snapshot->'odds'->>case when total-ou>0 then 'underPrice' else 'overPrice' end)::integer end as other_price
  from source s cross join (values ('spread'),('total')) m(market)
  where (case when m.market='spread' then spread else ou end) is not null
    and not exists(select 1 from public.ai_predictions b where b.event_id=s.event_id
      and b.model_version=s.model_version and b.market=m.market)
), priced as (
  select *, case when abs(saved_price)>=100 then case when saved_price<0
    then -saved_price::numeric/(100-saved_price) else 100::numeric/(100+saved_price) end end as selected_implied,
    case when abs(other_price)>=100 then case when other_price<0
    then -other_price::numeric/(100-other_price) else 100::numeric/(100+other_price) end end as other_implied,
    case when restored_market='spread' then final_home_score-final_away_score+saved_line
      else final_home_score+final_away_score-saved_line end as outcome
  from missing
)
insert into public.ai_predictions(event_id,sport,market,model_version,app_version,matchup,
  slate_date,starts_at,captured_at,selection,selection_home,confidence,tier,price,line,
  projection,model_probability,market_probability,provider,quality,snapshot,result,
  final_home_score,final_away_score,graded_at)
select event_id,sport,restored_market,model_version,app_version,matchup,
  slate_date,starts_at,captured_at,saved_selection,home,null,
  case when restored_market='total' then case when abs(total-ou)>=8 then 'best' else 'edge' end else null end,
  case when abs(saved_price)>=100 then saved_price else null end,saved_line,saved_projection,null,
  selected_implied/nullif(selected_implied+other_implied,0),provider,quality,
  snapshot||jsonb_build_object('marketRecovery',jsonb_build_object(
    'sourceRowId',id,'restoredAt',now(),'reason','v302 provisional market capture repair',
    'observationPolicy','Derived only from original saved pregame forecast and odds')),
  case when result='void' then 'void' when outcome is null then 'pending' when outcome=0 then 'push'
    when case when restored_market='spread' then case when home then outcome>0 else outcome<0 end
      else case when saved_selection like 'OVER %' then outcome>0 else outcome<0 end end then 'win' else 'loss' end,
  final_home_score,final_away_score,case when outcome is not null or result='void' then graded_at else null end
from priced
on conflict(event_id,market,model_version) do nothing
returning id,event_id,market,selection,price,result,captured_at,created_at;

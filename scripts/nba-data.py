"""Fetch every NBA team's regular-season schedule; deduplicate by ESPN event ID.
Run: python scripts/nba-data.py (writes data/nba-history.json).
"""
import concurrent.futures, datetime, json, pathlib, time, urllib.request, urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=ROOT/'.nba-cache'
CACHE.mkdir(exist_ok=True)
BASE='https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
def get(url):
    for attempt in range(3):
        try: return json.load(urllib.request.urlopen(url,timeout=40))
        except urllib.error.HTTPError as error:
            if error.code<500 or attempt==2: raise
        except Exception:
            if attempt==2: raise
        time.sleep(attempt+1)
def team_season(task):
    team,season=task;path=CACHE/f'team-{team}-{season}.json'
    if path.exists():return json.loads(path.read_text())
    data=get(f'{BASE}/teams/{team}/schedule?season={season}&seasontype=2')
    out=[]
    for e in data.get('events',[]):
        c=e['competitions'][0]
        if e.get('seasonType',{}).get('type')!=2 or not c.get('status',{}).get('type',{}).get('completed'):continue
        h=next(x for x in c['competitors'] if x['homeAway']=='home');a=next(x for x in c['competitors'] if x['homeAway']=='away')
        score=lambda t:float(t['score']['value'] if isinstance(t['score'],dict) else t['score'])
        out.append(dict(id=e['id'],date=e['date'],season=e.get('season',{}).get('year',season),home=h['team']['id'],away=a['team']['id'],hs=score(h),as_=score(a),neutral=c.get('neutralSite',False)))
    if len(out)<70:raise RuntimeError(f'Incomplete season: team {team}, {season}, {len(out)}')
    path.write_text(json.dumps(out));print(team,season,len(out),flush=True);return out
teams=get(BASE+'/teams?limit=100')['sports'][0]['leagues'][0]['teams']
tasks=[(x['team']['id'],season) for season in range(2022,2027) for x in teams]
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    rows=[r for result in pool.map(team_season,tasks) for r in result]
unique={}
for row in rows:
    if row['id'] in unique and unique[row['id']]!=row:raise RuntimeError('Conflicting game: '+row['id'])
    unique[row['id']]=row
rows=sorted(unique.values(),key=lambda r:r['date'])
for season in range(2022,2027):
    n=sum(r['season']==season for r in rows)
    if not 1230<=n<=1231:raise RuntimeError(f'Unexpected season coverage: {season}={n}')
out={'source':'ESPN regular-season team schedules, all 30 teams; deduplicated event IDs; only completed season-type 2 games, including NBA Cup championship games classified by ESPN as regular season','fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'games':rows}
(ROOT/'data/nba-history.json').write_text(json.dumps(out,separators=(',',':'))+'\n');print('TOTAL',len(rows),flush=True)

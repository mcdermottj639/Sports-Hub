#!/usr/bin/env python3
"""Download public nflverse data and emit small, auditable game aggregates.

No credentials or third-party Python dependencies. Historical source corrections
are retrospective; only future saved forecasts constitute prospective evidence.
"""
import argparse, csv, gzip, io, json, math, os, tempfile, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://github.com/nflverse/nflverse-data/releases/download'

def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None

def team_alias(team):
    return {'OAK':'LV','SD':'LAC','STL':'LA','LAR':'LA','WSH':'WAS'}.get(team,team)

def download(url, path, refresh=False):
    if path.exists() and not refresh:
        return path.read_bytes()
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Sports-Hub NFL research'}), timeout=90) as response:
        data = response.read()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_bytes(data)
    temp.replace(path)
    return data

def side(team):
    return {'team':team, 'passN':0, 'passEPA':0, 'rushN':0, 'rushEPA':0,
            'success':0, 'plays':0, 'sacks':0, 'hits':0, 'explosive':0,
            'lateN':0, 'lateEPA':0, 'fourthN':0, 'fourthGo':0,
            'fgN':0, 'fgMade':0, 'qbs':{}, '_drives':set()}

def aggregate(year, raw, schedules):
    games = {}
    reader = csv.DictReader(io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(raw)), encoding='utf-8'))
    for p in reader:
        gid = p.get('game_id'); schedule = schedules.get(gid)
        if not schedule or schedule.get('game_type') not in ('REG','WC','DIV','CON','SB') or number(schedule.get('home_score')) is None:
            continue
        if gid not in games:
            day, clock = schedule['gameday'], schedule.get('gametime') or '12:00'
            # NFL schedule kickoff clocks are America/New_York; UTC is explicit.
            from zoneinfo import ZoneInfo
            dt = datetime.fromisoformat(day+'T'+clock).replace(tzinfo=ZoneInfo('America/New_York'))
            games[gid] = {'id':gid, 'espn':schedule.get('espn'), 'season':year, 'week':int(schedule['week']),
                         'date':dt.astimezone(timezone.utc).isoformat(), 'home':schedule['home_team'], 'away':schedule['away_team'],
                         'homeScore':number(schedule['home_score']), 'awayScore':number(schedule['away_score']),
                         'neutral':schedule.get('location')=='Neutral', 'roof':schedule.get('roof'),
                         'temperature':number(schedule.get('temp')), 'wind':number(schedule.get('wind')),
                         'homeCoach':schedule.get('home_coach'), 'awayCoach':schedule.get('away_coach'),
                         'sides':{t:side(t) for t in (schedule['home_team'],schedule['away_team'])}}
        g = games[gid]; s = next((v for k,v in g['sides'].items() if team_alias(k)==team_alias(p.get('posteam'))),None)
        if s is None: continue
        drive = p.get('fixed_drive') or p.get('drive')
        if drive: s['_drives'].add(drive)
        if p.get('field_goal_attempt')=='1':
            s['fgN']+=1; s['fgMade']+=p.get('field_goal_result')=='made'
        if p.get('down')=='4':
            s['fourthN']+=1; s['fourthGo']+=p.get('play_type') in ('run','pass')
        epa=number(p.get('epa')); drop=p.get('qb_dropback')=='1'; rush=p.get('rush')=='1' and not drop
        if epa is None or not (drop or rush) or p.get('qb_kneel')=='1' or p.get('qb_spike')=='1' or p.get('play_deleted')=='1': continue
        late=(number(p.get('game_seconds_remaining')) or 9999)<=300 and abs(number(p.get('score_differential')) or 0)<=8
        if late: s['lateN']+=1; s['lateEPA']+=epa
        # Simple observable game-state filter; no sportsbook win-probability input.
        if (number(p.get('qtr')) or 0)>=4 and abs(number(p.get('score_differential')) or 0)>16: continue
        group='pass' if drop else 'rush'; s[group+'N']+=1; s[group+'EPA']+=epa
        s['plays']+=1; s['success']+=epa>0; s['sacks']+=p.get('sack')=='1'; s['hits']+=p.get('qb_hit')=='1'
        s['explosive']+=(number(p.get('yards_gained')) or 0)>=(20 if drop else 10)
        qid=(p.get('passer_player_id') or (p.get('rusher_player_id') if p.get('qb_scramble')=='1' else ''))
        if drop and qid:
            q=s['qbs'].setdefault(qid,{'id':qid,'name':p.get('passer_player_name') or p.get('rusher_player_name'), 'n':0,'epa':0,'cpoe':0,'cpoeN':0,'sacks':0,'rushN':0,'lateN':0,'lateEPA':0})
            q['n']+=1; q['epa']+=number(p.get('qb_epa')) if number(p.get('qb_epa')) is not None else epa
            cp=number(p.get('cpoe'))
            if cp is not None: q['cpoe']+=cp; q['cpoeN']+=1
            q['sacks']+=p.get('sack')=='1'; q['rushN']+=p.get('qb_scramble')=='1'
            if late:q['lateN']+=1; q['lateEPA']+=epa
    result=[]
    for g in games.values():
        for s in g['sides'].values():
            s['drives']=len(s.pop('_drives')); s['qbs']=list(s['qbs'].values())
            s['qbId']=max(s['qbs'],key=lambda q:q['n'])['id'] if s['qbs'] else None
            for k,v in s.items():
                if isinstance(v,float):s[k]=round(v,5)
        if all(s['plays']>=15 and s['passN']>0 and s['rushN']>0 for s in g['sides'].values()):result.append(g)
    return sorted(result,key=lambda g:g['date'])

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--start',type=int,default=2017);parser.add_argument('--end',type=int,default=datetime.now().year)
    parser.add_argument('--cache',default=str(Path(tempfile.gettempdir())/'sportshub-nfl-cache'))
    parser.add_argument('--output',default=str(ROOT/'data/nfl-football-history.json'));parser.add_argument('--live-only',action='store_true')
    args=parser.parse_args();cache=Path(args.cache); now=datetime.now(timezone.utc).isoformat()
    if args.live_only:
        args.start=args.end-2
        if args.output==str(ROOT/'data/nfl-football-history.json'):args.output=str(ROOT/'data/nfl-football-live.json')
    schedule_url='https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'
    schedules={r['game_id']:r for r in csv.DictReader(io.StringIO(download(schedule_url,cache/'games.csv',True).decode()))}
    def season(year):
        raw=download(f'{BASE}/pbp/play_by_play_{year}.csv.gz',cache/f'{year}.csv.gz',year==args.end)
        rows=aggregate(year,raw,schedules); print(f'{year}: {len(rows)} completed games',flush=True);return rows
    with ThreadPoolExecutor(max_workers=4) as pool: games=[g for rows in pool.map(season,range(args.start,args.end+1)) for g in rows]
    # Refuse a partial current season instead of replacing a working snapshot.
    completed={k for k,s in schedules.items() if int(s['season'])==args.end and s['game_type']!='PRE' and number(s['home_score']) is not None and s['gameday']<now[:10]}
    present={g['id'] for g in games if g['season']==args.end}
    if completed and len(present & completed)/len(completed)<.9:raise RuntimeError('Current-season play-by-play coverage below 90%; preserve previous snapshot')
    players=csv.DictReader(io.StringIO(download(f'{BASE}/players/players.csv',cache/'players.csv',True).decode()))
    identities={p['espn_id']:{'id':p['gsis_id'],'name':p['display_name']} for p in players if p.get('espn_id') and p.get('gsis_id') and p.get('position')=='QB'}
    output={'schema':1,'generatedAt':now,'source':'nflverse','sourceURLs':[f'{BASE}/pbp',schedule_url,f'{BASE}/players/players.csv'],
            'historicalMode':'retrospective corrected play-by-play; not archived pregame availability',
            'currentSeason':args.end,'coverage':{'expected':len(completed),'available':len(present & completed)},'qbIdentities':identities,'games':games}
    path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(output,separators=(',',':'),allow_nan=False)+'\n'); print(f'Wrote {path} ({path.stat().st_size} bytes)',flush=True)

if __name__=='__main__':main()

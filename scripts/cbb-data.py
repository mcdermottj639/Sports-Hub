#!/usr/bin/env python3
"""Refresh compact ESPN men's D1 finals; publish atomically only after full reads."""
import argparse, concurrent.futures, datetime as dt, json, os, pathlib, time, urllib.request
BASE='https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball'
UTC=dt.timezone.utc

def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Sports-Hub/1.0'}),timeout=40) as r: return json.load(r)
        except Exception:
            if attempt==2: raise
            time.sleep(attempt+1)

def parse(payload,day,ids):
    events=payload.get('events')
    if not isinstance(events,list) or len(events)>=1000: raise ValueError('Incomplete scoreboard: '+day)
    rows=[]
    for e in events:
        c=(e.get('competitions') or [{}])[0]; st=e.get('status',c.get('status',{})).get('type',{})
        if not st.get('completed') or st.get('state')!='post' or e.get('season',{}).get('type') not in (2,3):continue
        sides=c.get('competitors',[]); h=next((s for s in sides if s.get('homeAway')=='home'),{}); a=next((s for s in sides if s.get('homeAway')=='away'),{})
        hi=str(h.get('team',{}).get('id',''));ai=str(a.get('team',{}).get('id',''))
        if hi not in ids or ai not in ids or hi==ai:continue
        try:hs=float(h['score']);as_=float(a['score']);date=e['date'];year=int(e['season']['year'])
        except (KeyError,ValueError,TypeError):continue
        if not 0<hs<250 or not 0<as_<250 or hs==as_:continue
        label=' · '.join(n.get('headline','') for n in c.get('notes',[]))
        tournament=bool(c.get('tournamentId') or c.get('type',{}).get('abbreviation')=='TRNMNT' or e['season']['type']==3)
        rank=lambda s:s.get('curatedRank',{}).get('current',99)
        ranked=any(isinstance(rank(s),(int,float)) and 1<=rank(s)<=25 for s in (h,a))
        rows.append([str(e['id']),date,year,hi,ai,hs,as_,c.get('neutralSite') is True,tournament,ranked])
    return rows

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',default='data/cbb-history.json');p.add_argument('--start-season',type=int,default=2025);p.add_argument('--cache',default='/tmp/sportshub-cbb-source');args=p.parse_args()
    now=dt.datetime.now(UTC);today=now.date();year=today.year+(today.month>=7);path=pathlib.Path(args.output)
    old=json.loads(path.read_text()) if path.exists() else {};teams={}
    directory=fetch(BASE+'/teams?groups=50&limit=1000')
    for s in directory.get('sports',[]):
        for l in s.get('leagues',[]):
            for item in l.get('teams',[]):
                t=item['team'];teams[str(t['id'])]={'name':t['displayName'],'abbr':t.get('abbreviation','')}
    if len(teams)<350 or len(teams)>=1000:raise ValueError('Incomplete D1 directory')
    ids=set(teams);seen=set(old.get('checkedDates',[]));rows={str(g[0]):g for g in old.get('games',[])}
    days=[]
    for season in range(args.start_season,year+1):
        d=dt.date(season-1,11,1);end=min(today,dt.date(season,4,15))
        while d<=end:
            key=d.strftime('%Y%m%d')
            if key not in seen or (today-d).days<=7:days.append(key)
            d+=dt.timedelta(days=1)
    cache=pathlib.Path(args.cache);cache.mkdir(parents=True,exist_ok=True)
    def one(day):
        dest=cache/(day+'.json');fresh=(today-dt.datetime.strptime(day,'%Y%m%d').date()).days<=7
        if dest.exists() and not fresh:j=json.loads(dest.read_text())
        else:
            j=fetch(BASE+'/scoreboard?groups=50&limit=1000&dates='+day);dest.write_text(json.dumps(j))
        return day,parse(j,day,ids)
    errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures={pool.submit(one,d):d for d in days}
        for i,f in enumerate(concurrent.futures.as_completed(futures),1):
            try:
                day,gs=f.result();seen.add(day)
                # Replace all results for refreshed day, including withdrawn finals.
                for key,g in list(rows.items()):
                    gd=dt.datetime.fromisoformat(g[1].replace('Z','+00:00')).astimezone(__import__('zoneinfo').ZoneInfo('America/New_York')).strftime('%Y%m%d')
                    if gd==day:del rows[key]
                for g in gs:
                    if g[0] in rows and rows[g[0]]!=g:raise ValueError('Conflicting event '+g[0])
                    rows[g[0]]=g
            except Exception as e:errors.append(f'{futures[f]}: {e}')
            if i%25==0:print(f'{i}/{len(days)} days; {len(rows)} unique D1 finals',flush=True)
    if errors:raise RuntimeError('No publication; incomplete source reads: '+'; '.join(errors))
    games=sorted(rows.values(),key=lambda g:(g[1],g[0]));counts={str(y):sum(g[2]==y for g in games) for y in range(args.start_season,year+1)}
    for y,n in counts.items():
        if int(y)<year and n<4500:raise ValueError('Incomplete historical season '+y+': '+str(n))
    out={'schema':1,'generatedAt':dt.datetime.now(UTC).isoformat(),'season':year,'source':'ESPN mens-college-basketball; groups=50','columns':['id','date','season','homeId','awayId','homeScore','awayScore','neutral','tournament','top25'],'coverage':{'teams':len(teams),'seasonGames':counts,'through':today.isoformat()},'teams':teams,'checkedDates':sorted(seen),'games':games}
    path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(out,separators=(',',':'))+'\n');os.replace(tmp,path)
    print(json.dumps({'written':str(path),'games':counts,'teams':len(teams)}),flush=True)
if __name__=='__main__':main()

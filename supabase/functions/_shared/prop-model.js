/* Deterministic player-prop baseline, shared by capture, UI and replay. */
(function(root){
  'use strict';
  const VERSION='props-v1',SPORTS=['nfl','cfb','nba','mlb'];
  const path={nfl:'football/nfl',cfb:'football/college-football',nba:'basketball/nba',mlb:'baseball/mlb'};
  const definitions={
    passingYards:['Passing yards',['Passing Yards'],['nfl','cfb']],
    passingAttempts:['Pass attempts',['Passing Attempts'],['nfl','cfb']],
    completions:['Completions',['Passing Completions'],['nfl','cfb']],
    passingTouchdowns:['Passing TDs',['Passing Touchdowns'],['nfl','cfb']],
    rushingYards:['Rushing yards',['Rushing Yards'],['nfl','cfb']],
    rushingAttempts:['Rush attempts',['Total Carries (incl. overtime)','Rushing Attempts'],['nfl','cfb']],
    receivingYards:['Receiving yards',['Receiving Yards'],['nfl','cfb']],
    receptions:['Receptions',['Receptions'],['nfl','cfb']],
    points:['Points',['Points','Total Points'],['nba']],
    totalRebounds:['Rebounds',['Rebounds','Total Rebounds'],['nba']],
    assists:['Assists',['Assists','Total Assists'],['nba']],
    threes:['Made threes',['Three Pointers','3-Pointers Made','3pt Field Goals','3pt Field Goals Made','Three Point Field Goals Made'],['nba']],
    pra:['Points + rebounds + assists',['Points + Rebounds + Assists','Points/Rebounds/Assists'],['nba']],
    pointsRebounds:['Points + rebounds',['Points + Rebounds','Points/Rebounds'],['nba']],
    pointsAssists:['Points + assists',['Points + Assists','Points/Assists'],['nba']],
    reboundsAssists:['Rebounds + assists',['Rebounds + Assists','Rebounds/Assists'],['nba']],
    hits:['Hits',['Hits'],['mlb']],
    totalBases:['Total bases',['Total Bases'],['mlb']],
    RBIs:['RBIs',['RBIs','Runs Batted In'],['mlb']],
    runs:['Runs',['Runs'],['mlb']],
    hitsRunsRbis:['Hits + runs + RBIs',['Hits/Runs/RBIs','Hits + Runs + RBIs'],['mlb']],
    pitcherStrikeouts:['Pitcher strikeouts',['Strikeouts','Pitcher Strikeouts','Strikeouts (Pitcher)'],['mlb']],
    pitcherOuts:['Pitcher outs',['Outs Recorded','Pitcher Outs','Outs'],['mlb']]
  };
  const number=v=>v==null||String(v).trim()===''||!/^[-+]?\d+(?:\.\d+)?$/.test(String(v).replaceAll(',',''))?null:Number(String(v).replaceAll(',',''));
  const price=v=>{const n=number(v);return n!=null&&Math.abs(n)>=100?n:null;};
  const payout=p=>p>0?p/100:100/-p;
  const implied=p=>p>0?100/(p+100):-p/(100-p);
  const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
  // Parse JSON values from ESPN's public hydration data without executing scripts.
  function jsonField(text,key){
    const marker='"'+key+'":',start=text.indexOf(marker);if(start<0)return null;
    let i=start+marker.length;while(/\s/.test(text[i]||''))i++;
    const begin=i,open=text[i],close=open==='['?']':open==='{'?'}':null;if(!close)return null;
    let level=0,quoted=false,escaped=false;
    for(;i<text.length;i++){
      const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
      if(c==='"'){quoted=true;continue;}if(c===open)level++;if(c===close&&--level===0)return JSON.parse(text.slice(begin,i+1));
    }return null;
  }
  function packageFromHTML(text,eventId){
    const marker=text.indexOf("window['__espnfitt__']");if(marker<0)throw Error('Prop feed data unavailable');
    const pkg=jsonField(text.slice(marker),'gamepackage'),strip=pkg?.gmStrp;
    if(String(strip?.gid)!==String(eventId))throw Error('Prop feed event mismatch');
    return {gmStrp:strip,propBets:pkg.propBets||[],oddsProvider:pkg.oddsProvider};
  }
  function quotes(pkg,sport,eventId,observedAt){
    if(String(pkg.gmStrp?.gid)!==String(eventId)||pkg.gmStrp?.statusState!=='pre')return [];
    const provider=pkg.oddsProvider?.displayName;if(!provider)return [];
    const out=new Map();
    for(const group of pkg.propBets||[])for(const market of group.odds||[]){
      if(/milestone|game props|first|half|quarter/i.test(group.displayName||''))continue;
      const key=Object.keys(definitions).find(k=>definitions[k][2].includes(sport)&&definitions[k][1].some(n=>n.toLowerCase()===String(market.displayName||'').toLowerCase()));
      if(!key)continue;
      for(const a of market.athletes||[])for(const v of a.values||[]){
        const p=price(v.odds),line=number(String(v.line??'').replace(/^[ou]/i,'')),side=String(v.type||'').toLowerCase();
        if(v.suspended||!['over','under'].includes(side)||p==null||line==null||line<0||!/^\d+$/.test(String(a.id)))continue;
        const row={athlete_id:String(a.id),market:key,market_label:definitions[key][0],side,line,price:p,provider,quote_at:observedAt};
        out.set([a.id,key,side,line,provider].join(':'),row);
      }
    }return [...out.values()];
  }
  function statValues(names,values){
    const s={};names.forEach((key,i)=>{
      const raw=values?.[i],n=number(raw);if(n!=null)s[key]=n;
      if(key==='threePointFieldGoalsMade-threePointFieldGoalsAttempted'&&/^\d+-\d+$/.test(String(raw)))s.threes=Number(String(raw).split('-')[0]);
      if(key==='minutes'&&/^\d+:\d\d$/.test(String(raw)))s.minutes=Number(String(raw).split(':')[0])+Number(String(raw).split(':')[1])/60;
    });
    if(s.threePointFieldGoalsMade!=null)s.threes=s.threePointFieldGoalsMade;
    const sum=(key,parts)=>{if(parts.every(p=>s[p]!=null))s[key]=parts.reduce((n,p)=>n+s[p],0);};
    sum('pra',['points','totalRebounds','assists']);sum('pointsRebounds',['points','totalRebounds']);sum('pointsAssists',['points','assists']);sum('reboundsAssists',['totalRebounds','assists']);
    sum('hitsRunsRbis',['hits','runs','RBIs']);
    if(['hits','doubles','triples','homeRuns'].every(k=>s[k]!=null))s.totalBases=s.hits+s.doubles+2*s.triples+3*s.homeRuns;
    if(s.inningsPitched!=null){const ip=s.inningsPitched,w=Math.floor(ip),o=Math.round((ip-w)*10);if(o<=2){s.pitcherOuts=w*3+o;if(s.strikeouts!=null)s.pitcherStrikeouts=s.strikeouts;}}
    return s;
  }
  function logs(data){
    const out=new Map();
    for(const type of data?.seasonTypes||[]){
      if(!/regular|postseason|playoff|bowl/i.test(type.displayName||'')||/preseason|all.star/i.test(type.displayName||''))continue;
      for(const cat of type.categories||[])for(const row of cat.events||[]){
        const id=String(row.eventId||row.id||''),e=data.events?.[id];
        if(!e?.gameDate||!['W','L','T'].includes(e.gameResult)||!Number.isFinite(Date.parse(e.gameDate)))continue;
        const stats=statValues(data.names||[],row.stats),item={id,date:e.gameDate,team_id:String(e.team?.id||''),opponent_id:String(e.opponent?.id||''),stats};
        out.set(id,item);
      }
    }return [...out.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  }
  function unavailable(athlete,game){
    if(!athlete?.id||![String(game.home.id),String(game.away.id)].includes(String(athlete.team?.id)))return 'Player team could not be verified';
    const status=[athlete.status?.type,athlete.status?.name,...(athlete.injuries||[]).map(x=>x.status)].join(' ');
    if(athlete.active===false||/\bout\b|doubtful|inactive|injured reserve|suspend|disabled/i.test(status))return 'Player is unavailable';
    return null;
  }
  function project(quote,history,athlete,game,at=Date.now(),window=20){
    const sport=game.sport,quotedAt=Date.parse(quote.quote_at);
    if(!SPORTS.includes(sport)||!definitions[quote.market]?.[2].includes(sport)||unavailable(athlete,game)||String(athlete.id)!==String(quote.athlete_id))return null;
    if(!Number.isFinite(at)||!Number.isFinite(quotedAt)||!Number.isFinite(quote.line)||quote.line<0||price(quote.price)==null||!['over','under'].includes(quote.side))return null;
    if(!(Date.parse(game.date)>at)||game.seasonType===1||game.state!=='pre'||quotedAt>at||at-quotedAt>15*60000)return null;
    const pitcher=quote.market.startsWith('pitcher');
    if(pitcher&&!game.probables?.includes(quote.athlete_id))return null;
    const cut=Math.min(at,Date.parse(game.date)),seen=new Map();
    for(const r of history||[])if(Date.parse(r.date)<cut&&cut-Date.parse(r.date)<730*864e5&&String(r.team_id)===String(athlete.team.id)&&r.stats[quote.market]!=null&&Number.isFinite(r.stats[quote.market])){
      if(sport==='nba'&&!(r.stats.minutes>0))continue;
      if(sport==='mlb'&&!pitcher&&!(r.stats.atBats>0))continue;
      if(pitcher&&!(r.stats.pitcherOuts>0))continue;
      seen.set(r.id,r);
    }
    const rows=[...seen.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-window),min=sport==='mlb'&&!pitcher?15:8;
    if(rows.length<min)return null;
    const values=rows.map(r=>r.stats[quote.market]),n=values.length,avg=mean(values),recent=values.slice(-5),ordered=[...values].sort((a,b)=>a-b),median=(ordered[Math.floor((n-1)/2)]+ordered[Math.floor(n/2)])/2,sd=Math.sqrt(values.reduce((s,v)=>s+(v-avg)**2,0)/(n-1));
    const w=values.filter(x=>quote.side==='over'?x>quote.line:x<quote.line).length,push=values.filter(x=>x===quote.line).length,l=n-w-push;
    // One prior observation on each side; pushes retain their observed mass.
    const pWin=(w+1)/(n+2),pLoss=(l+1)/(n+2),pPush=push/(n+2),ev=pWin*payout(quote.price)-pLoss;
    const workloadKey=sport==='nba'?'minutes':sport==='mlb'?(pitcher?'pitcherOuts':'atBats'):null;
    const workload=workloadKey?rows.map(r=>r.stats[workloadKey]).filter(Number.isFinite):[];
    const warning=(athlete.injuries||[]).map(x=>x.status).filter(Boolean);
    if(workload.length>=8&&mean(workload.slice(-3))<.6*mean(workload.slice(0,-3)))return null;
    if(pitcher&&mean(workload.slice(-3))<9)return null;
    const matchup=rows.filter(r=>r.opponent_id===String(String(athlete.team.id)===String(game.home.id)?game.away.id:game.home.id));
    return {...quote,athlete_name:athlete.displayName||athlete.fullName,team_id:String(athlete.team.id),team_abbr:athlete.team.abbreviation||'',projection:avg,model_probability:pWin,push_probability:pPush,expected_return:ev,
      features:{sample_size:n,window,mean:avg,last5:mean(recent),last10:mean(values.slice(-10)),median,sd,hits:w,losses:l,pushes:push,recent_hits:recent.filter(x=>quote.side==='over'?x>quote.line:x<quote.line).length,
        workload:workload.length?{name:workloadKey,mean:mean(workload),last3:mean(workload.slice(-3))}:null,matchup:matchup.length?{n:matchup.length,mean:mean(matchup.map(r=>r.stats[quote.market]))}:null,
        warnings:warning,history:rows.map(r=>({event_id:r.id,date:r.date,value:r.stats[quote.market],opponent_id:r.opponent_id,workload:workloadKey?r.stats[workloadKey]??null:null})),method:'Empirical last-20 same-team games; one prior observation per side. Probabilities and returns are experimental.',athlete_checked_at:new Date(at).toISOString()}};
  }
  function select(candidates){
    const sorted=[...candidates].sort((a,b)=>b.expected_return-a.expected_return||b.features.sample_size-a.features.sample_size||String(a.athlete_id).localeCompare(String(b.athlete_id))||a.market.localeCompare(b.market));
    const athletes=new Set(),out=[];
    for(const x of sorted){if(athletes.has(x.athlete_id))continue;athletes.add(x.athlete_id);out.push({...x,rank:out.length+1});if(out.length===2)break;}return out;
  }
  function settle(pick,game,history,explicitDnp=false){
    if(/cancel|postpon/i.test(game.status||'')||Date.parse(pick.starts_at)!==Date.parse(game.date))return {result:'void',actual:null,reason:'Cancelled or rescheduled game; paper tracking rule'};
    if(game.state!=='post'||game.completed!==true)return null;
    if(explicitDnp)return {result:'void',actual:null,reason:'Did not play'};
    const row=history.find(r=>String(r.id)===String(pick.event_id)),value=row?.stats?.[pick.market];
    if(value==null||!Number.isFinite(value))return null;
    return {result:value===pick.line?'push':(pick.side==='over'?value>pick.line:value<pick.line)?'win':'loss',actual:value,reason:'Final player game log'};
  }
  function performance(rows){
    const selected=rows.filter(x=>x.model_version===VERSION&&Date.parse(x.captured_at)<Date.parse(x.starts_at)),settled=selected.filter(x=>['win','loss'].includes(x.result)),priced=selected.filter(x=>['win','loss','push'].includes(x.result)&&price(x.price)!=null);
    const wins=settled.filter(x=>x.result==='win').length,profit=priced.reduce((s,x)=>s+(x.result==='win'?payout(x.price):x.result==='loss'?-1:0),0);
    return {n:settled.length,wins,losses:settled.length-wins,pushes:selected.filter(x=>x.result==='push').length,voids:selected.filter(x=>x.result==='void').length,pending:selected.filter(x=>x.result==='pending').length,priced:priced.length,profit,roi:priced.length?profit/priced.length:null};
  }
  const api={VERSION,SPORTS,path,definitions,number,price,payout,implied,jsonField,packageFromHTML,quotes,statValues,logs,project,select,settle,performance};
  root.SportsHubPropsCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

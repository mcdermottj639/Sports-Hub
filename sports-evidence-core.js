/* Dated sports evidence. Pure, read-only: never writes predictions or settlements. */
(function (root) {
  'use strict';
  const ALIASES = {nfl:{WSH:'WAS',JAC:'JAX',LA:'LAR'},nba:{GS:'GSW',NY:'NYK',NO:'NOP',SA:'SAS',UTAH:'UTA',PHO:'PHX',WSH:'WAS',BRK:'BKN'}};
  const canonical = (sport, value) => { const v=String(value||'').toUpperCase().trim(); return ALIASES[sport]?.[v]||v; };
  const number = v => typeof v!=='boolean' && v!==null && v!==undefined && v!=='' && Number.isFinite(Number(v)) ? Number(v) : null;
  const mean = a => a.length ? a.reduce((s,n)=>s+n,0)/a.length : null;
  const stamp = value => Date.parse(value);
  const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  const dayCache=new Map();
  const day = value => { if(dayCache.has(value))return dayCache.get(value);const d=new Date(value),result=Number.isFinite(+d)?dayFormatter.format(d):'';if(dayCache.size>10000)dayCache.clear();dayCache.set(value,result);return result; };
  const dayGap = (earlier,later) => { const a=day(earlier),b=day(later); return a&&b ? Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000) : null; };
  const final = g => /^(ScoresOfficial|Final|Completed)$/i.test(g?.status||'') && number(g.home?.score)!==null && number(g.away?.score)!==null;
  const games = (s,sport) => s?.leagues?.[sport]?.games||[];
  function freshness(s,now=Date.now()) {
    const age=now-stamp(s?.capturedAt);
    return {available:s?.schemaVersion===1&&Number.isFinite(age)&&age>=-60000,stale:!Number.isFinite(age)||age>36*3600000||age< -60000,hours:Math.max(0,age/3600000)};
  }
  function team(s,sport,abbr) { return s?.leagues?.[sport]?.teams?.find(t=>canonical(sport,t.abbr)===canonical(sport,abbr))||null; }
  function findGame(s,sport,g) {
    const start=stamp(g?.date||g?.start);
    if (!Number.isFinite(start)) return null;
    const matches=games(s,sport).filter(x=>stamp(x.start)===start && canonical(sport,x.home.abbr)===canonical(sport,g.home?.abbr) && canonical(sport,x.away.abbr)===canonical(sport,g.away?.abbr));
    return matches.length===1 ? matches[0] : null;
  }
  function rowGame(s,r) {
    const sides=String(r.matchup||'').split(/\s+@\s+/);
    return sides.length===2 ? findGame(s,r.sport,{date:r.starts_at,away:{abbr:sides[0]},home:{abbr:sides[1]}}) : null;
  }
  function priorGames(s,sport,abbr,before) {
    const name=canonical(sport,abbr),date=day(before);
    // An earlier calendar day excludes the target itself and unfinished same-day games.
    return games(s,sport).filter(g=>final(g)&&day(g.start)<date&&stamp(g.start)<stamp(before)&&[g.home,g.away].some(t=>canonical(sport,t.abbr)===name))
      .sort((a,b)=>stamp(b.start)-stamp(a.start));
  }
  function form(s,sport,abbr,before,limit=5) {
    const name=canonical(sport,abbr);
    const rows=priorGames(s,sport,abbr,before).slice(0,limit).map(g=>{
      const home=canonical(sport,g.home.abbr)===name,own=home?g.home:g.away,opp=home?g.away:g.home;
      return {id:g.id,start:g.start,home,opponent:opp.abbr,for:number(own.score),against:number(opp.score),margin:number(own.score)-number(opp.score),result:number(own.score)>number(opp.score)?'W':number(own.score)<number(opp.score)?'L':'T'};
    }).reverse();
    return {rows,n:rows.length,wins:rows.filter(x=>x.result==='W').length,losses:rows.filter(x=>x.result==='L').length,ties:rows.filter(x=>x.result==='T').length,scored:mean(rows.map(x=>x.for)),allowed:mean(rows.map(x=>x.against)),margin:mean(rows.map(x=>x.margin)),daysSince:rows.length?dayGap(rows.at(-1).start,before):null};
  }
  function baseline(s,sport,g) {
    const home=form(s,sport,g.home.abbr,g.start||g.date),away=form(s,sport,g.away.abbr,g.start||g.date);
    if(home.n<5||away.n<5)return {available:false,home,away};
    const h=(home.scored+away.allowed)/2,a=(away.scored+home.allowed)/2;
    return {available:true,home,away,margin:h-a,total:h+a,homeScore:h,awayScore:a};
  }
  function forecast(r) {
    return {margin:number(r.snapshot?.forecast?.margin ?? (r.market==='spread'?r.projection:null)),total:number(r.snapshot?.forecast?.total ?? (r.market==='total'?r.projection:null))};
  }
  function audit(s,rows,sport,version) {
    const groups=new Map();
    for(const r of rows||[]) {
      if(r.sport!==sport||r.model_version!==version||r.result==='void'||!(stamp(r.captured_at)<stamp(r.starts_at)))continue;
      const key=String(r.event_id)+':'+r.starts_at;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
    }
    const out={matched:0,disputed:0,unmatched:0,awaiting:0,items:[]};
    for(const group of groups.values()) {
      group.sort((a,b)=>stamp(a.captured_at)-stamp(b.captured_at)||((a.market==='moneyline'?-1:0)-(b.market==='moneyline'?-1:0)));
      const row=group[0],g=rowGame(s,row);
      if(!g){out.unmatched++;continue;}
      const scoreRows=group.filter(r=>number(r.final_home_score)!==null&&number(r.final_away_score)!==null);
      let status='awaiting';
      if(final(g)&&scoreRows.length)status=scoreRows.every(r=>number(r.final_home_score)===number(g.home.score)&&number(r.final_away_score)===number(g.away.score))?'matched':'disputed';
      out[status]++;
      const f=forecast(row),b=baseline(s,sport,g);
      out.items.push({row,game:g,status,forecast:f,baseline:b,actual:{margin:number(g.home.score)-number(g.away.score),total:number(g.home.score)+number(g.away.score)}});
    }
    return out;
  }
  function diagnostics(a) {
    const checked=a.items.filter(i=>i.status==='matched');
    const metrics={};
    for(const metric of ['margin','total']) {
      const available=checked.filter(i=>number(i.forecast[metric])!==null);
      const errors=available.map(i=>i.forecast[metric]-i.actual[metric]);
      const bookValue=i=>metric==='margin'?(number(i.row.snapshot?.odds?.spread)===null?null:-number(i.row.snapshot.odds.spread)):number(i.row.snapshot?.odds?.ou);
      const paired=available.filter(i=>bookValue(i)!==null);
      const replay=available.filter(i=>i.baseline.available);
      metrics[metric]={n:available.length,mae:mean(errors.map(Math.abs)),bias:mean(errors),bookN:paired.length,pairedModelMAE:mean(paired.map(i=>Math.abs(i.forecast[metric]-i.actual[metric]))),bookMAE:mean(paired.map(i=>Math.abs(bookValue(i)-i.actual[metric]))),formN:replay.length,formModelMAE:mean(replay.map(i=>Math.abs(i.forecast[metric]-i.actual[metric]))),formMAE:mean(replay.map(i=>Math.abs(i.baseline[metric]-i.actual[metric])))};
    }
    const buckets=['agrees','opposes'].map(key=>{
      const list=checked.filter(i=>i.baseline.available&&number(i.forecast.margin)!==null&&i.forecast.margin!==0&&i.baseline.margin!==0&&i.actual.margin!==0&&((Math.sign(i.forecast.margin)===Math.sign(i.baseline.margin))===(key==='agrees')));
      return {key,n:list.length,wins:list.filter(i=>Math.sign(i.forecast.margin)===Math.sign(i.actual.margin)).length};
    });
    return {metrics,buckets};
  }
  function validate(s) {
    const errors=[];
    if(!freshness(s).available)errors.push('Invalid schema or capture time');
    if(!Array.isArray(s?.queries)||!s.queries.length)errors.push('Missing source queries');
    for(const sport of ['nfl','nba']) {
      const l=s?.leagues?.[sport];
      if(!l?.teams?.length||!l?.games?.length){errors.push('Missing '+sport+' coverage');continue;}
      const ids=new Set(),teams=new Set();
      for(const t of l.teams){if(!t.abbr||teams.has(t.abbr)||!Array.isArray(t.stats)||!t.stats.length)errors.push('Invalid/duplicate team '+sport+':'+t.abbr);teams.add(t.abbr);if(!Number.isFinite(stamp(t.observedAt)))errors.push('Missing team timestamp');}
      for(const g of l.games){if(!g.id||ids.has(g.id)||!Number.isFinite(stamp(g.start))||!Number.isFinite(stamp(g.observedAt))||g.home?.abbr===g.away?.abbr||!teams.has(g.home?.abbr)||!teams.has(g.away?.abbr))errors.push('Invalid game '+sport+':'+g.id);ids.add(g.id);if(/^(ScoresOfficial|Final|Completed)$/i.test(g.status)&&(!final(g)||number(g.home.score)<0||number(g.away.score)<0))errors.push('Missing final scores '+g.id);}
    }
    return errors;
  }
  const api={canonical,number,mean,day,dayGap,final,games,freshness,team,findGame,rowGame,priorGames,form,baseline,forecast,audit,diagnostics,validate};
  root.SportsHubEvidenceCore=Object.freeze(api);if(typeof module!=='undefined')module.exports=api;
})(globalThis);

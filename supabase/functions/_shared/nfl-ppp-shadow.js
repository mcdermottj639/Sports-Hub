/* Frozen prospective total-only experiment. Never routes official forecasts. */
(function(root){
 'use strict';
 const VERSION='football-research-nfl-ppp-v1',DAY=864e5;
 const POLICY=Object.freeze({window:16,priorGames:4,historyDays:730,leagueDays:365,blendWeight:.25,baselineVersion:'nfl-football-v1',minReviewGames:150});
 const finite=x=>typeof x==='number'&&Number.isFinite(x),alias=t=>({OAK:'LV',SD:'LAC',STL:'LA',LAR:'LA',WSH:'WAS'}[t]||t);
 function project(history,game,at){
  const now=Date.parse(at),start=Date.parse(game.date),stamp=Date.parse(history?.generatedAt);
  const fail=reason=>({available:false,version:VERSION,reason});
  if(!(now<start)||!Number.isFinite(stamp)||stamp>now||now-stamp>3*DAY||history?.schema!==1||history.currentSeason!==game.season||!(history.coverage?.expected>=0)||history.coverage.expected>0&&history.coverage.available/history.coverage.expected<.9)return fail('Missing, stale or incomplete source');
  const cut=now-6*3600000;
  const games=[...new Map((history.games||[]).filter(g=>Date.parse(g.date)<cut&&Date.parse(g.date)>cut-POLICY.historyDays*DAY).map(g=>[g.id,g])).values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  const rows=[];
  for(const g of games){
   const h=g.sides?.[g.home],a=g.sides?.[g.away];
   // A partially upgraded source is unavailable, not a shorter selective sample.
   if(!finite(h?.rawPlays)||!finite(a?.rawPlays)||h.rawPlays<=0||a.rawPlays<=0||!finite(g.homeScore)||!finite(g.awayScore))return fail('Raw play counts unavailable');
   rows.push({id:g.id,date:g.date,team:alias(g.home),pf:g.homeScore,pa:g.awayScore,plays:h.rawPlays,allowed:a.rawPlays},{id:g.id,date:g.date,team:alias(g.away),pf:g.awayScore,pa:g.homeScore,plays:a.rawPlays,allowed:h.rawPlays});
  }
  const keys=['pf','pa','plays','allowed'],league=rows.filter(g=>Date.parse(g.date)>cut-POLICY.leagueDays*DAY);
  if(!league.length)return fail('League history unavailable');
  const means=Object.fromEntries(keys.map(k=>[k,league.reduce((s,g)=>s+g[k],0)/league.length]));
  const profiles={};
  for(const side of ['home','away']){
   const sample=rows.filter(r=>r.team===alias(game[side])).slice(-POLICY.window);
   if(!sample.length)return fail('Team history unavailable');
   const p=Object.fromEntries(keys.map(k=>[k,(sample.reduce((s,g)=>s+g[k],0)+POLICY.priorGames*means[k])/(sample.length+POLICY.priorGames)]));
   profiles[side]={...p,games:sample.length,gameIds:sample.map(g=>g.id),lastGame:sample.at(-1).date,pointsPerPlay:p.pf/p.plays,allowedPointsPerPlay:p.pa/p.allowed};
  }
  const h=profiles.home,a=profiles.away;
  const homePlays=(h.plays+a.allowed)/2,awayPlays=(a.plays+h.allowed)/2;
  const homeRate=(h.pointsPerPlay+a.allowedPointsPerPlay)/2,awayRate=(a.pointsPerPlay+h.allowedPointsPerPlay)/2;
  const total=homePlays*homeRate+awayPlays*awayRate;
  if(!finite(total)||total<10||total>100)return fail('Invalid PPP projection');
  return {version:VERSION,available:true,total,at,sourceGeneratedAt:history.generatedAt,policy:POLICY,profiles,expectedPlays:{home:homePlays,away:awayPlays},matchupRate:{home:homeRate,away:awayRate},definition:'Scoreboard points per offensive run/pass snap; includes return scores, sacks, kneels and spikes; excludes deleted plays and two-point attempts'};
 }
 function rows(g,p,o,app,at=new Date().toISOString()){
  const e=p?.features?.football,ppp=e?.ppp,now=Date.parse(at),start=Date.parse(g.date);
  if(g.sport!=='nfl'||g.state!=='pre'||g.seasonType===1||/postpon|cancel|suspend|delay/i.test(g.status||g.statusText||'')||!(now<start)||p?.modelVersion!==POLICY.baselineVersion||!finite(p?.total)||!ppp?.available||ppp.version!==VERSION||!finite(ppp.total)||!finite(o?.ou)||!Number.isFinite(Date.parse(ppp.at))||Date.parse(ppp.at)>now||now-Date.parse(ppp.at)>5*60000)return [];
  const total=.75*p.total+.25*ppp.total,over=total>o.ou;
  return [{event_id:g.id,sport:'nfl',market:'total',model_version:VERSION,app_version:app,matchup:`${g.away.abbr} @ ${g.home.abbr}`,slate_date:new Date(g.date).toLocaleDateString('en-CA',{timeZone:'America/New_York'}),starts_at:g.date,captured_at:at,selection:`${over?'OVER':'UNDER'} ${o.ou}`,selection_home:null,line:o.ou,projection:Math.round(total*100)/100,price:over?o.overPrice??null:o.underPrice??null,confidence:null,tier:null,model_probability:null,market_probability:null,provider:o.provider||null,quality:p.quality||[],snapshot:{researchOnly:true,odds:o,pppShadow:{version:VERSION,policy:POLICY,baseline:{version:POLICY.baselineVersion,total:p.total,margin:p.margin,capturedAt:at},total,inputs:ppp,provisional:!!e.candidate?.provisional,assumptions:e.candidate?.assumptions||[],comparison:'Current engine recalculated at the same capture; not the earlier frozen official pick'}}}];
 }
 function evaluate(input){
  const unique=new Map();
  for(const r of [...input].sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at))){
   const s=r.snapshot?.pppShadow;
   if(r.model_version!==VERSION||r.market!=='total'||r.sport!=='nfl'||!s||s.version!==VERSION||!(Date.parse(r.captured_at)<Date.parse(r.starts_at))||s.baseline?.version!==POLICY.baselineVersion||Date.parse(s.baseline?.capturedAt)!==Date.parse(r.captured_at)||!finite(s.baseline?.total)||!finite(s.total)||!s.inputs?.available||!finite(s.inputs.total)||Math.abs(s.total-(.75*s.baseline.total+.25*s.inputs.total))>1e-8)continue;
   if(!unique.has(r.event_id))unique.set(r.event_id,r);
  }
  const all=[...unique.values()],settled=all.filter(r=>['win','loss','push'].includes(r.result)&&r.final_home_score!=null&&r.final_away_score!=null&&Number.isFinite(Number(r.final_home_score))&&Number.isFinite(Number(r.final_away_score)));
  const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null,base=[],shadow=[],deltas=[];
  for(const r of settled){const s=r.snapshot.pppShadow,y=Number(r.final_home_score)+Number(r.final_away_score);base.push(s.baseline.total-y);shadow.push(s.total-y);deltas.push(Math.abs(s.total-y)-Math.abs(s.baseline.total-y));}
  const stats=es=>({mae:avg(es.map(Math.abs)),rmse:es.length?Math.sqrt(avg(es.map(x=>x*x))):null});
  return {version:VERSION,policy:POLICY,captured:all.length,pending:all.filter(r=>r.result==='pending').length,void:all.filter(r=>r.result==='void').length,settled:settled.length,baseline:stats(base),shadow:stats(shadow),maeChange:avg(deltas),reviewReady:settled.length>=POLICY.minReviewGames,promoted:false,status:settled.length<POLICY.minReviewGames?`Collecting: ${settled.length}/${POLICY.minReviewGames} settled games`:'Ready for paired uncertainty review; no automatic promotion'};
 }
 const api={VERSION,POLICY,project,rows,evaluate};root.SportsHubNFLPPPShadow=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

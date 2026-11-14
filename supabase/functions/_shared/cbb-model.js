/* Men's Division I schedule model, shared by browser, collector and replay. */
(function(root){
 'use strict';
 const VERSION='cbb-v1', PATH='basketball/mens-college-basketball';
 const HISTORY_URL='https://raw.githubusercontent.com/mcdermottj639/Sports-Hub/main/data/cbb-history.json';
 const CONFIG={homeCourt:3,priorGames:4,rosterRetention:.65,ridge:2,totalRidge:6,iterations:32,marginSD:12};
 const num=v=>v==null||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
 const rank=v=>{const n=num(v);return n>=1&&n<=25?n:null;};
 function metadata(e){
  const c=e?.competitions?.[0]||{};
  const text=(c.notes||[]).map(n=>n.headline||'').filter(Boolean).join(' · ');
  return {tournamentId:c.tournamentId??null,tournamentType:c.type?.abbreviation||null,tournamentLabel:text,
   tournament:!!c.tournamentId||c.type?.abbreviation==='TRNMNT'||Number(e?.season?.type??e?.seasonType?.type)===3||/\b(tournament|NIT|March Madness|Final Four|first four|elite eight|sweet 16)\b/i.test(text)};
 }
 function coverage(g){
  if(!g||g.seasonType===1)return {included:false,top25:false,tournament:false,label:'Preseason'};
  const top25=!!(rank(g.home?.rank)||rank(g.away?.rank));
  const tournament=g.tournament===true||!!g.tournamentId||g.tournamentType==='TRNMNT'||g.seasonType===3;
  return {included:top25||tournament,top25,tournament,label:g.tournamentLabel||(tournament?'D1 tournament':top25?'Top 25':'Outside coverage')};
 }
 function select(games,scope='all'){return (games||[]).filter(g=>{const c=coverage(g);return c.included&&(scope==='top25'?c.top25:scope==='tournaments'?c.tournament:true);});}
 function clean(data,at){
  const cutoff=Date.parse(at),seen=new Set();
  return (data?.games||[]).filter(g=>{
   if(!Array.isArray(g)||seen.has(String(g[0]))||!Number.isFinite(Date.parse(g[1]))||Date.parse(g[1])+6*3600e3>cutoff||![g[5],g[6]].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<250)||g[5]===g[6]||String(g[3])===String(g[4]))return false;
   seen.add(String(g[0]));return true;
  });
 }
 function fit(rows,prior,config){
  const c=config,ids=new Set(rows.flatMap(g=>[String(g[3]),String(g[4])])),teams={};
  for(const id of Object.keys(prior?.teams||{}))ids.add(id);
  const mean=rows.length?rows.reduce((s,g)=>s+g[5]+g[6],0)/rows.length:prior?.mean;
  if(!Number.isFinite(mean))return null;
  // Prior-season scoring environment fades after the first 500 games.
  const baseline=prior?(rows.length*mean+500*prior.mean)/(rows.length+500):mean;
  for(const id of ids){const p=prior?.teams[id],pn=p?.n>=15?c.priorGames:0;teams[id]={r:pn?p.r*c.rosterRetention:0,t:pn?p.t*c.rosterRetention:0,n:0,priorN:p?.n||0,pn,pr:pn?p.r*c.rosterRetention:0,pt:pn?p.t*c.rosterRetention:0};}
  const adj={};for(const id of ids)adj[id]=[];
  for(const g of rows){const h=String(g[3]),a=String(g[4]),m=g[5]-g[6]-(g[7]?0:c.homeCourt),t=g[5]+g[6]-baseline;adj[h].push([a,m,t]);adj[a].push([h,-m,t]);teams[h].n++;teams[a].n++;}
  for(let k=0;k<c.iterations;k++){
   const next={};for(const id of ids){const p=teams[id];let r=p.pn*p.pr,t=p.pn*p.pt;for(const [op,m,total] of adj[id]){r+=m+teams[op].r;t+=total-teams[op].t;}
    next[id]={r:r/(p.n+p.pn+c.ridge),t:t/(p.n+p.pn+c.totalRidge)};}
   for(const id of ids){teams[id].r=(teams[id].r+next[id].r)/2;teams[id].t=(teams[id].t+next[id].t)/2;}
  }
  return {teams,mean:baseline,games:rows.length};
 }
 function build(data,season,at,config=CONFIG){
  const rows=clean(data,at),prior=fit(rows.filter(g=>g[2]===season-1),null,config),state=fit(rows.filter(g=>g[2]===season),prior,config);
  return state?{...state,season,at,config,sourceAt:data.generatedAt,priorGames:prior?.games||0}:null;
 }
 function cdf(x){const z=Math.abs(x),t=1/(1+.2316419*z),d=.3989422804014327*Math.exp(-z*z/2),p=1-d*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return x<0?1-p:p;}
 function predict(state,g){
  if(!state||Number(g.season)!==state.season)return null;
  const h=state.teams[String(g.home?.id)],a=state.teams[String(g.away?.id)];
  if(!h||!a||[h,a].some(t=>t.n<3&&t.priorN<15))return null;
  const homeCourt=(g.neutral??g.neutralSite)?0:state.config.homeCourt;
  const margin=h.r-a.r+homeCourt,total=state.mean+h.t+a.t;
  const p=Math.max(.02,Math.min(.98,cdf(margin/state.config.marginSD))),home=p>=.5;
  if(![margin,total,p].every(Number.isFinite)||total<=Math.abs(margin))return null;
  return {modelVersion:VERSION,home,p,conf:Math.round((home?p:1-p)*100),margin,total,quality:[],researchOnly:true,
   features:{home:{games:h.n,priorGames:h.priorN,rating:h.r,scoring:h.t},away:{games:a.n,priorGames:a.priorN,rating:a.r,scoring:a.t},homeCourt,baselineTotal:state.mean,historyAt:state.sourceAt,asOf:state.at,coverage:coverage(g),validation:'New model; prospective validation collecting',limitations:['No player availability or possession-adjusted pace','Roster turnover is approximated by shrinking prior-season ratings']},
   notes:[`${homeCourt?'Home court: +'+homeCourt+' points':'Neutral court: no home advantage'}.`,`Opponent-adjusted D1 results; ${h.n} and ${a.n} current-season games.`,h.n<5||a.n<5?'Early season: previous-season ratings contribute; roster changes are not fully modeled.':'Current-season results carry most of the weight.','Research forecast; betting profitability is unproven.']};
 }
 let dataPromise=null,loadedAt=0;const states=new Map();
 async function load(g,fetchJSON,at=new Date().toISOString()){
  const now=Date.parse(at);
  if(g.state!=='pre'||!coverage(g).included||!(Date.parse(g.date)>now)||/postpon|cancel|suspend|delay/i.test(g.statusText||g.status||''))return null;
  if(!dataPromise||now-loadedAt>15*60000){loadedAt=now;states.clear();dataPromise=fetchJSON(HISTORY_URL).catch(e=>{dataPromise=null;throw e;});}
  const data=await dataPromise;
  if(!data||data.season!==Number(g.season)||!Number.isFinite(Date.parse(data.generatedAt))||now-Date.parse(data.generatedAt)>36*3600e3||Date.parse(data.generatedAt)>now+60000)return null;
  const key=`${data.generatedAt}:${g.season}:${at.slice(0,13)}`;
  if(!states.has(key)){states.clear();states.set(key,build(data,Number(g.season),at,root.SportsHubCBBConfig||CONFIG));}
  return predict(states.get(key),g);
 }
 function browser(p,g){return p?{...p,winner:p.home?g.home:g.away,homePick:p.home,probHome:p.p,projMargin:p.margin,projTotal:p.total,marginSat:false,thin:false,blockedReasons:p.quality,breakdown:[],rating:null,sharp:null,evidence:'CBB research model · prospective results collecting'}:null;}
 const api={VERSION,PATH,HISTORY_URL,CONFIG,metadata,coverage,select,clean,fit,build,predict,load,browser};root.SportsHubCBB=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

/* One NBA engine for the browser, scheduled capture and chronological replay. */
(function(root) {
  'use strict';
  const VERSION='nba-v1';
  const marginKeys=['homeCourt','net','form','record','rest','b2b'];
  const totalKeys=['intercept','scoring','recentScoring','restTotal','b2bTotal'];
  const labels={homeCourt:'Home court',net:'Scoring-margin difference',form:'Last 10 margin vs season',record:'Win-rate difference',rest:'Rest-day difference',b2b:'Back-to-back advantage',intercept:'Scoring baseline',scoring:'Team scoring environment',recentScoring:'Last 10 scoring vs season',restTotal:'Combined rest days',b2bTotal:'Teams on back-to-backs'};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const num=v=>v==null||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
  const day=d=>Date.parse(new Date(d).toLocaleDateString('en-CA',{timeZone:'America/New_York'})+'T12:00:00Z')/864e5;
  function parse(payload,teamId,season) {
    return (payload?.events||[]).flatMap(e=>{
      const c=e.competitions?.[0], sides=c?.competitors||[], me=sides.find(t=>String(t.team?.id)===String(teamId)),op=sides.find(t=>String(t.team?.id)!==String(teamId));
      const type=Number(e.seasonType?.type??e.season?.type??c?.season?.type??payload?.season?.type);
      const pf=num(me?.score?.value??me?.score?.displayValue??me?.score),pa=num(op?.score?.value??op?.score?.displayValue??op?.score);
      if(!c?.status?.type?.completed||type!==2||!me||!op||pf==null||pa==null||!Number.isFinite(Date.parse(e.date)))return [];
      return [{id:String(e.id),date:e.date,season:Number(e.season?.year??payload?.season?.year??season),pf,pa,margin:pf-pa,win:pf>pa,home:me.homeAway==='home'}];
    });
  }
  function profile(rows,season,before) {
    const unique=[...new Map(rows.filter(g=>Date.parse(g.date)<Date.parse(before)).map(g=>[g.id,g])).values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
    const current=unique.filter(g=>g.season===season),prior=unique.filter(g=>g.season===season-1);
    if(current.length<5&&prior.length<20)return null;
    const avg=(list,k)=>list.reduce((s,g)=>s+(k==='win'?(g.win?1:0):g[k]),0)/list.length;
    const priorN=prior.length>=20?15:0,n=current.length,weight=priorN/(n+priorN);
    const mix=k=>n?(1-weight)*avg(current,k)+(weight?weight*avg(prior,k):0):avg(prior,k);
    const recent=current.slice(-10),base=recent.length?recent:prior.slice(-10);
    const ppg=mix('pf'),papg=mix('pa'),pdpg=mix('margin');
    return {gp:n,priorGP:prior.length,priorWeight:weight,ppg,papg,pdpg,winPct:mix('win'),
      form:recent.length?avg(recent,'margin')-pdpg:0,
      recentScoring:recent.length?avg(recent,'pf')+avg(recent,'pa')-ppg-papg:0,
      lastDate:base.at(-1)?.date||null};
  }
  function features(h,a,g) {
    if(!h||!a)return null;
    const rest=p=>p.lastDate?clamp(day(g.date)-day(p.lastDate)-1,0,3):3;
    const hr=rest(h),ar=rest(a),hb=hr===0?1:0,ab=ar===0?1:0;
    return {homeCourt:g.neutral||g.neutralSite?0:1,net:h.pdpg-a.pdpg,form:h.form-a.form,record:h.winPct-a.winPct,
      rest:hr-ar,b2b:ab-hb,intercept:1,scoring:(h.ppg+h.papg+a.ppg+a.papg)/2-228,
      recentScoring:(h.recentScoring+a.recentScoring)/2,restTotal:hr+ar,b2bTotal:hb+ab};
  }
  const dot=(keys,w,f)=>keys.reduce((s,k,i)=>s+w[i]*f[k],0);
  function predict(h,a,g,config=root.SportsHubNBAConfig) {
    const f=features(h,a,g);if(!f||!config)return null;
    const margin=dot(marginKeys,config.margin,f),total=dot(totalKeys,config.total,f);
    const p=clamp(1/(1+Math.exp(-dot(marginKeys,config.winner,f))),.02,.98),home=p>=.5;
    if(![p,margin,total].every(Number.isFinite)||total<=0)return null;
    const drivers=marginKeys.map((key,i)=>({key,label:labels[key],value:f[key],weight:config.margin[i],points:f[key]*config.margin[i]}));
    return {modelVersion:VERSION,home,p,conf:Math.round((home?p:1-p)*100),margin,total,quality:[],
      features:{home:h,away:a,nba:f,drivers,validation:config.validation,limitations:['No player availability or lineup adjustments','Team scoring is not possession-adjusted'],priorWeight:Math.max(h.priorWeight,a.priorWeight)},
      notes:[...drivers.filter(d=>Math.abs(d.points)>.1).sort((x,y)=>Math.abs(y.points)-Math.abs(x.points)).slice(0,4).map(d=>`${d.label}: ${d.points>0?'+':''}${d.points.toFixed(1)} points toward home`),
        ...(h.priorWeight>.5||a.priorWeight>.5?['Early season: previous-season results carry most of the weight.']:[]),
        'Player availability is not modeled; check lineups before using the forecast.']};
  }
  async function load(g,fetchJSON) {
    if(g.state!=='pre'||g.seasonType===1||Date.parse(g.date)<=Date.now()||/postpon|cancel|suspend|delay/i.test(g.statusText||g.status||''))return null;
    const year=Number(g.season)||new Date(g.date).getUTCFullYear()+(new Date(g.date).getUTCMonth()>=8?1:0);
    const before=new Date(Math.min(Date.parse(g.date),Date.now())).toISOString();
    const side=async t=>{
      const data=await Promise.all([year,year-1].map(y=>fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${t.id}/schedule?season=${y}&seasontype=2`).catch(()=>null)));
      if(!data[0])return null;
      return profile(data.flatMap((p,i)=>parse(p,t.id,year-i)),year,before);
    };
    const [h,a]=await Promise.all([side(g.home),side(g.away)]);return predict(h,a,g);
  }
  function browser(p,g) {
    return p?{...p,winner:p.home?g.home:g.away,homePick:p.home,probHome:p.p,projMargin:p.margin,projTotal:p.total,
      marginSat:false,thin:false,blockedReasons:p.quality,breakdown:[],rating:null,sharp:null,evidence:'NBA schedule model · historical holdout tested; live results collecting'}:null;
  }
  const api=Object.freeze({VERSION,marginKeys,totalKeys,labels,parse,profile,features,predict,load,browser});
  root.SportsHubNBA=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

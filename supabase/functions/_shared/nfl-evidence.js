/* Bounded football context from timestamped ESPN responses. Observations are
 * evidence, not automatically verified causal effects or point adjustments. */
(function(root){
  'use strict';
  const num=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const id=a=>String(a?.id||(a?.links||[]).map(l=>String(l.href||'').match(/\/id\/(\d+)/)?.[1]).find(Boolean)||'');
  const fresh=(data,year,at)=>Number(data?.season?.year)===Number(year)&&Date.parse(data?.timestamp)<=Date.parse(at)&&Date.parse(at)-Date.parse(data.timestamp)<2*864e5;
  function personnel(depths,injuries,teams,year,at){
    const ready=fresh(injuries,year,at),players=[],missing=[];
    for(const side of ['home','away']){
      const d=depths[side];if(!fresh(d,year,at)||String(d?.team?.id)!==String(teams[side])){missing.push(side);continue;}
      const roles=new Map();
      for(const chart of d.depthchart||[])for(const p of Object.values(chart.positions||{})){
        const pos=p.position?.abbreviation||'';
        (p.athletes||[]).slice(0,2).forEach((a,i)=>{const key=id(a);if(key&&(!roles.has(key)||roles.get(key).depth>i))roles.set(key,{position:pos,depth:i,name:a.displayName||a.fullName});});
      }
      if(ready)for(const report of (injuries.injuries||[]).find(t=>String(t.id)===String(teams[side]))?.injuries||[]){
        const key=id(report.athlete),role=roles.get(key),age=Date.parse(at)-Date.parse(report.date);
        if(!role||!Number.isFinite(age)||age<0||age>8*864e5||!/out|doubtful|questionable|reserve|suspend|pup/i.test(report.status||''))continue;
        players.push({side,athleteId:key,...role,status:report.status,reportedAt:report.date,source:report.athlete?.links?.find(l=>l.href?.startsWith('https://'))?.href||'https://www.espn.com/nfl/injuries',pointAdjustment:null});
      }
    }
    const restrictedLine=side=>players.filter(p=>p.side===side&&p.depth===0&&/^(LT|LG|C|RG|RT|OT|OG|G|T)$/.test(p.position));
    return {at,sourceUpdatedAt:injuries?.timestamp||null,missing:!ready||missing.length>0,players,lineCluster:['home','away'].some(s=>restrictedLine(s).length>=2),mode:'availability evidence; no invented player values'};
  }
  function weather(summary,eventId,at){
    const c=summary?.header?.competitions?.[0],w=summary?.gameInfo?.weather,venue=summary?.gameInfo?.venue;
    if(String(summary?.header?.id)!==String(eventId)||!w)return {at,available:false,temperature:null,windMph:null,mode:'missing, no numeric adjustment'};
    const wind=num(w.windSpeed),temperature=num(w.temperature),indoor=venue?.indoor===true;
    return {at,available:true,temperature,windMph:wind,precipitationChance:num(w.precipitation),indoor,
      highImpact:!indoor&&((wind!=null&&wind>=20)||(temperature!=null&&temperature<=20)),
      source:`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`,
      mode:'pregame forecast context; zero numeric weight until forecast-vintage validation'};
  }
  function coaching(state,home,away,current={}){
    const sides={};let changed=false;
    for(const [side,t] of [['home',home],['away',away]]){
      const p=state?.teams?.[t],now=current[side]||null,change=!!(now&&p?.coach&&now!==p.coach);changed ||= change;
      sides[side]={name:now||p?.coach||null,currentConfirmed:!!now,changed:change,games:p?.games||0,
        fourthDownAttempts:p?.fourthGo??null,fourthDownOpportunities:p?.fourthN??null,
        latePlays:p?.lateN??null,lateEPA:p?.lateN?p.lateEPA/p.lateN:null,
        coldDefensePlays:p?.coldRushN||0,coldRushEPAAllowed:p?.coldRushN?p.coldRushEPA/p.coldRushN:null};
    }
    return {changed,...sides,mode:'historical tendencies; no pedigree or clutch bonus; cold splits are unadjusted context'};
  }
  const api={personnel,weather,coaching};root.SportsHubNFLEvidence=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

/* Shared historical/live feature arithmetic. All observations precede the
 * forecast cutoff. Numeric weights live in the frozen, separately fitted config.
 * Evidence-only factors never add hand-written point bonuses. */
(function(root){
  'use strict';
  const VERSION='football-research-nfl-v4';
  const DAY=86400000, n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const round=v=>Math.round(v*10)/10;
  const alias=t=>({WSH:'WAS',OAK:'LV',SD:'LAC',STL:'LA',LAR:'LA'}[t]||t);
  const policy=Object.freeze({historyDays:730,halfLifeDays:180,priorPlays:120,qbPrior:160,minTeamPlays:200,maxSourceAgeDays:3});
  const FEATURE_GROUPS=Object.freeze({
    core:['home','passGap','rushGap','passSum','rushSum','restGap'],
    quarterback:['qbGap','qbSum','accuracyGap','accuracySum'],
    matchup:['sackGap','sackSum','successGap','successSum','pace','explosiveGap','explosiveSum'],
  });
  function build(history,at){
    const cut=Date.parse(at),all=(history?.games||[]).filter(g=>Number.isFinite(Date.parse(g.date))&&Date.parse(g.date)+6*3600000<cut&&cut-Date.parse(g.date)<policy.historyDays*DAY);
    const games=[...new Map(all.map(g=>[g.id,g])).values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
    const teams={},qbs={},obs=[],league={passN:0,passEPA:0,rushN:0,rushEPA:0,drives:0,games:0};
    const init=t=>teams[t]||=( {team:t,games:0,plays:0,weight:0,drives:0,passN:0,rushN:0,sacks:0,defSacks:0,defPassN:0,success:0,explosive:0,offPass:0,defPass:0,offRush:0,defRush:0,qbExposure:{},lateN:0,lateEPA:0,fourthN:0,fourthGo:0,fgN:0,fgMade:0,coldN:0,coldRushEPA:0,coldRushN:0} );
    for(const g of games){
      const weight=Math.exp(-Math.LN2*(cut-Date.parse(g.date))/(policy.halfLifeDays*DAY));
      for(const [raw,s] of Object.entries(g.sides||{})){
        const team=alias(raw),op=alias(raw===g.home?g.away:g.home),t=init(team),d=init(op);
        t.games++;t.weight+=weight;t.plays+=weight*s.plays;t.drives+=weight*s.drives;
        for(const key of ['passN','rushN','sacks','success','explosive'])t[key]+=weight*(s[key]||0);
        d.defSacks+=weight*(s.sacks||0);d.defPassN+=weight*s.passN;
        t.lastDate=g.date;t.lastQB=s.qbId;t.coach=raw===g.home?g.homeCoach:g.awayCoach;
        t.lateN+=s.lateN||0;t.lateEPA+=s.lateEPA||0;t.fourthN+=s.fourthN||0;t.fourthGo+=s.fourthGo||0;t.fgN+=s.fgN||0;t.fgMade+=s.fgMade||0;
        if(g.temperature!=null&&g.temperature<=40&&!/dome|closed/i.test(g.roof||'')){d.coldN++;d.coldRushEPA+=s.rushEPA;d.coldRushN+=s.rushN;}
        league.drives+=weight*s.drives;league.games+=weight;
        for(const kind of ['pass','rush']){
          const count=n(s[kind+'N']),epa=n(s[kind+'EPA']);
          if(count>0&&epa!=null){league[kind+'N']+=weight*count;league[kind+'EPA']+=weight*epa;obs.push({team,op,kind,count:weight*count,y:epa/count});}
        }
        for(const q of s.qbs||[]){
          const v=qbs[q.id]||={id:q.id,name:q.name,n:0,epa:0,cpoe:0,cpoeN:0,sacks:0,rushN:0,lateN:0,lateEPA:0};
          for(const key of ['n','epa','cpoe','cpoeN','sacks','rushN'])v[key]+=weight*(q[key]||0);
          v.lateN+=q.lateN||0;v.lateEPA+=q.lateEPA||0;
          t.qbExposure[q.id]=(t.qbExposure[q.id]||0)+weight*q.n;
        }
      }
    }
    const means={pass:league.passN?league.passEPA/league.passN:0,rush:league.rushN?league.rushEPA/league.rushN:0};
    const byTeam={},byOpponent={};for(const o of obs){(byTeam[o.team]||=[]).push(o);(byOpponent[o.op]||=[]).push(o);}
    for(let iteration=0;iteration<12;iteration++)for(const [id,t] of Object.entries(teams))for(const kind of ['pass','rush']){
      const suffix=kind==='pass'?'Pass':'Rush';let sum=0,count=0;
      for(const o of byTeam[id]||[])if(o.kind===kind){sum+=o.count*(o.y-means[kind]-teams[o.op]['def'+suffix]);count+=o.count;}
      t['off'+suffix]=sum/(count+policy.priorPlays);
      sum=0;count=0;for(const o of byOpponent[id]||[])if(o.kind===kind){sum+=o.count*(o.y-means[kind]-teams[o.team]['off'+suffix]);count+=o.count;}
      t['def'+suffix]=sum/(count+policy.priorPlays);
    }
    for(const q of Object.values(qbs)){
      q.rating=(q.epa+policy.qbPrior*means.pass)/(q.n+policy.qbPrior);
      q.accuracy=q.cpoe/(q.cpoeN+policy.qbPrior);
    }
    for(const t of Object.values(teams)){
      const entries=Object.entries(t.qbExposure),count=entries.reduce((s,[,v])=>s+v,0);
      t.qbBaseline=count?entries.reduce((s,[id,v])=>s+v*(qbs[id]?.rating??means.pass),0)/count:means.pass;
      t.sackRate=(t.sacks+8)/(t.passN+120);t.defSackRate=(t.defSacks+8)/(t.defPassN+120);
      t.successRate=(t.success+54)/(t.plays+120);t.explosiveRate=(t.explosive+12)/(t.plays+120);
      t.pace=(t.drives+3*(league.drives/(league.games||1)))/(t.weight+3);
    }
    return {at,teams,qbs,means,used:games.length,lastGame:games.at(-1)?.date||null,policy};
  }
  function features(state,game,qbIds={}){
    const h=state.teams[alias(game.home)],a=state.teams[alias(game.away)];if(!h||!a||h.plays<policy.minTeamPlays||a.plays<policy.minTeamPlays)return null;
    const hq=state.qbs[qbIds.home||h.lastQB],aq=state.qbs[qbIds.away||a.lastQB];
    const hr=hq?.rating??state.means.pass,ar=aq?.rating??state.means.pass;
    const hp=h.offPass+a.defPass,ap=a.offPass+h.defPass,hu=h.offRush+a.defRush,au=a.offRush+h.defRush;
    const rest=t=>clamp((Date.parse(game.date)-Date.parse(t.lastDate))/DAY,3,14);
    const hSack=(h.sackRate+a.defSackRate)/2,aSack=(a.sackRate+h.defSackRate)/2;
    return {home:game.neutral?0:1,passGap:hp-ap,rushGap:hu-au,passSum:hp+ap,rushSum:hu+au,restGap:rest(h)-rest(a),
      qbGap:(hr-h.qbBaseline)-(ar-a.qbBaseline),qbSum:(hr-h.qbBaseline)+(ar-a.qbBaseline),
      accuracyGap:(hq?.accuracy||0)-(aq?.accuracy||0),accuracySum:(hq?.accuracy||0)+(aq?.accuracy||0),
      sackGap:hSack-aSack,sackSum:hSack+aSack,successGap:h.successRate-a.successRate,successSum:h.successRate+a.successRate,
      pace:(h.pace+a.pace)/2,explosiveGap:h.explosiveRate-a.explosiveRate,explosiveSum:h.explosiveRate+a.explosiveRate};
  }
  function predict(f,config){
    if(!f||!config?.models)return null;
    const linear=m=>m.intercept+m.features.reduce((sum,k,i)=>sum+m.coefficients[i]*f[k],0);
    const margin=linear(config.models.margin),total=linear(config.models.total),p=1/(1+Math.exp(-linear(config.models.moneyline)));
    if(![margin,total,p].every(Number.isFinite)||Math.abs(margin)>60||total<10||total>100)return null;
    const quantile=(a,p)=>a?.length?a[Math.floor((a.length-1)*p)]:null;
    const interval=(target,value)=>{const e=config.residuals?.[target];return e?.length?[round(value+quantile(e,.1)),round(value+quantile(e,.9))]:null;};
    return {margin:round(margin),total:round(total),probHome:clamp(p,.02,.98),marginRange:interval('margin',margin),totalRange:interval('total',total)};
  }
  function sourceReady(history,at,season){
    const age=Date.parse(at)-Date.parse(history?.generatedAt);
    return history?.schema===1&&Number(history.currentSeason)===Number(season)&&Number.isFinite(age)&&age>=0&&age<=policy.maxSourceAgeDays*DAY&&history.coverage?.expected>=0&&(history.coverage.expected===0||history.coverage.available/history.coverage.expected>=.9);
  }
  function candidate(state,history,game,qb,config,context={}){
    const at=context.at||new Date().toISOString(),reasons=[],uncertainties=[],ids={},mapped={},scenarios=[],assumptions=[];
    if(!sourceReady(history,at,game.season))reasons.push('Play-by-play feed missing, stale or incomplete');
    if(!(Date.parse(at)<Date.parse(game.date)))reasons.push('Kickoff lock: no new forecast');
    if(!config?.models||!Number.isFinite(Date.parse(config.trainedThrough))||Date.parse(config.trainedThrough)>=Date.parse(at)||Date.parse(config.selectedThrough)>=Date.parse(at))reasons.push('Eligible frozen coefficients unavailable');
    for(const side of ['home','away']){
      const q=qb?.[side];
      const ruledOut=/^(out|reserve|suspend|pup|injured reserve)/i.test(q?.status||'');
      const useBackup=ruledOut&&q?.backupId&&/^No current restriction found/.test(q.backupStatus||'');
      const id=history?.qbIdentities?.[useBackup?q.backupId:q?.athleteId]?.id;ids[side]=id;mapped[side]=state?.qbs?.[id];
      if(ruledOut&&!useBackup)reasons.push(`${side}: ruled-out QB; usable backup evidence unavailable`);
      if(useBackup)assumptions.push({side,name:q.backupName||'Backup',backup:true,text:`${side}: assumes ${q.backupName||'backup'} starts; ${q.name||'listed QB'} ${q.status}`});
      else if(q?.status&&!/^No current restriction found/.test(q.status))assumptions.push({side,name:q.name||'Listed QB',backup:false,text:`${side}: assumes ${q.name||'listed QB'} starts (${q.status})`});
      if(!q?.athleteId||!id||/^unknown$/i.test(q.status||''))reasons.push(`${side}: current QB evidence unavailable`);
      if(!mapped[side]||mapped[side].n<25)reasons.push(`${side}: insufficient QB history`);
      if(q?.status&&!/^No current restriction found/.test(q.status))uncertainties.push(`${side}: ${q.name||'QB'} ${q.status}`);
    }
    const f=state&&features(state,game,ids),projection=ids.home&&ids.away?predict(f,config):null;
    if(!projection)reasons.push('Insufficient team history or invalid projection');
    // Scenarios are independent conditional forecasts, never an invented 50/50
    // probability that a questionable player participates.
    if(projection)for(const side of ['home','away']){
      const q=qb?.[side],replacement=history?.qbIdentities?.[q?.backupId]?.id;
      if(q?.status&&!/^No current restriction found/.test(q.status)&&replacement&&replacement!==ids[side]&&/^No current restriction found/.test(q.backupStatus||'')&&state.qbs[replacement]?.n>=25){
        const p=predict(features(state,game,{...ids,[side]:replacement}),config);
        if(p)scenarios.push({side,name:q.backupName||'Backup',condition:'If backup starts',...p});
      }
    }
    if(context.personnel?.missing)uncertainties.push('Current personnel report unavailable');
    if(context.personnel?.lineCluster)uncertainties.push('Multiple listed offensive linemen have restrictions');
    if(context.weather?.highImpact)uncertainties.push('Weather may materially change the matchup; effect not fitted');
    if(context.coaching?.changed)uncertainties.push('Coaching change: prior team performance may transfer less well');
    const reasonLabels={core:'Passing, rushing and home field',quarterback:'Expected QB versus the measured lineup',matchup:'Protection, explosive plays and pace'};
    const contributions=projection?Object.entries(FEATURE_GROUPS).map(([group,keys])=>({group,label:reasonLabels[group],marginPoints:round(config.models.margin.features.reduce((s,k,i)=>s+(keys.includes(k)?config.models.margin.coefficients[i]*(f[k]-(config.models.margin.centers?.[k]||0)):0),0))})).sort((a,b)=>Math.abs(b.marginPoints)-Math.abs(a.marginPoints)):[];
    const available=reasons.length===0;
    const provisional=available&&(uncertainties.length>0||assumptions.length>0);
    const ranges=projection?{
      margin:[projection,...scenarios].filter(p=>p.marginRange).flatMap(p=>p.marginRange),
      total:[projection,...scenarios].filter(p=>p.totalRange).flatMap(p=>p.totalRange)}:null;
    return {version:VERSION,available,provisional,availabilityPolicy:'provisional-v1',assumptions,warnings:uncertainties,blockingReasons:reasons,margin:available?projection.margin:null,total:available?projection.total:null,
      probHome:available?projection.probHome:null,conditional:projection,scenarios,features:f,reasons:[...reasons,...uncertainties],
      decision:reasons.length?'Insufficient evidence':provisional?'Provisional forecast':'Research forecast',
      uncertainty:ranges?{margin:ranges.margin.length?[Math.min(...ranges.margin),Math.max(...ranges.margin)]:null,total:ranges.total.length?[Math.min(...ranges.total),Math.max(...ranges.total)]:null,level:'80% historical residual range; experimental'}:null,
      drivers:contributions.slice(0,3),mainUncertainty:[...reasons,...assumptions.map(a=>a.text),...uncertainties][0]||'Experimental model; future performance is unproven',
      qb:Object.fromEntries(['home','away'].map(side=>[side,mapped[side]?{name:assumptions.find(a=>a.side===side&&a.backup)?.name||qb[side].name,weightedDropbacks:Math.round(mapped[side].n),epa:round(mapped[side].rating*100)/100,cpoe:round(mapped[side].accuracy),latePlays:mapped[side].lateN}:null])),
      factors:{clutch:{mode:'tracked, zero extra weight'},coaching:{mode:'tracked, zero extra weight'},weather:{mode:'scenario context, zero extra weight'},personnel:{mode:'QB adjustment fitted; other positions evidence only'}},
      source:{generatedAt:history?.generatedAt,lastGame:state?.lastGame,used:state?.used,coverage:history?.coverage},policy:'research-only',promotion:config?.promotion||null};
  }
  function observation(input,at,start){
    const text=String(input.text||'').trim(),url=String(input.source||''),expiry=Date.parse(input.expiresAt);
    if(!(Date.parse(at)<Date.parse(start))||!Number.isFinite(expiry)||expiry<=Date.parse(at)||expiry>Date.parse(start))throw Error('Evidence must expire no later than kickoff and be saved before it.');
    if(text.length<8||text.length>1200||!/^https:\/\//i.test(url)||!['fact','opinion'].includes(input.kind))throw Error('Enter a source URL, evidence type and a clear observation.');
    const categories=['QB','Line play','Personnel','Coaching','Weather','Clutch','Tempo'];
    if(!categories.includes(input.category))throw Error('Choose an evidence category.');
    return {text,source:url,kind:input.kind,category:input.category,at,expiresAt:new Date(expiry).toISOString(),numericWeight:0,verified:false};
  }
  const api={VERSION,policy,FEATURE_GROUPS,alias,build,features,predict,sourceReady,candidate,observation};root.SportsHubNFLFootball=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

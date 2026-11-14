/* Official NFL routing. The fitted v4 engine is promoted unchanged by owner
 * choice; the historical performance gate has not passed. No baseline blend. */
(function(root){
  'use strict';
  const VERSION='nfl-football-v1', BASELINE='v239';
  const ACTIVATED_AT='2026-10-03T04:48:39Z';
  const versionFor=sport=>sport==='nfl'?VERSION:sport==='nba'?'nba-v1':sport==='cbb'?'cbb-v1':BASELINE;
  const states=new Map();
  /* v342: owner QB override (data/nfl-qb-overrides.json). The owner follows
     lineups more closely than ESPN's depth chart; an unexpired entry for this
     season, team (and event, when given) replaces the listed starter as an
     owner-confirmed QB. It changes WHO starts, never a model weight: the same
     QB-history minimum still applies, so a thin-history starter withholds. */
  const OVERRIDE_SOURCE='Owner QB override';
  function override(q,list,team,year,eventId,at){
    const now=Date.parse(at);
    const o=(Array.isArray(list?.overrides)?list.overrides:[]).filter(x=>x&&Number(x.season)===Number(year)
      &&String(x.team||'').toUpperCase()===String(team||'').toUpperCase()&&(!x.eventId||String(x.eventId)===String(eventId))
      &&x.name&&x.athleteId&&Number.isFinite(Date.parse(x.setAt))&&Date.parse(x.setAt)<=now&&now<Date.parse(x.until))
      .sort((a,b)=>Date.parse(b.setAt)-Date.parse(a.setAt))[0];
    if(!o)return q;
    const id=String(o.athleteId),swap=q?.backupId&&String(q.backupId)===id;
    return {...q,source:OVERRIDE_SOURCE,name:o.name,athleteId:id,status:'No current restriction found; owner-confirmed starter',
      confirmedStarter:true,needsReview:false,
      backupId:swap?(q.athleteId||null):(q?.backupId??null),backupName:swap?(q.name||null):(q?.backupName??null),backupStatus:swap?(q.status||'unknown'):(q?.backupStatus??'unknown'),
      override:{setAt:o.setAt,until:o.until,note:o.note||null,listedName:q?.name||null,listedStatus:q?.status||null}};
  }
  function evidence(g,{homeDepth,awayDepth,injuries,history,summary,overrides},at=new Date().toISOString()){
    const F=root.SportsHubNFLFootball,C=root.SportsHubFootballResearch,E=root.SportsHubNFLEvidence;
    const year=Number(g.season)||Number(history?.currentSeason),key=`${history?.generatedAt}:${at.slice(0,13)}`;
    const qb={home:override(C.quarterback(homeDepth,injuries,g.home.id,year,at),overrides,g.home.abbr,year,g.id,at),
      away:override(C.quarterback(awayDepth,injuries,g.away.id,year,at),overrides,g.away.abbr,year,g.id,at)};
    let state=states.get(key);if(!state){state=F.build(history,at);states.clear();states.set(key,state);}
    const game={home:F.alias(g.home.abbr),away:F.alias(g.away.abbr),date:g.date,season:year,neutral:!!(g.neutral??g.neutralSite)};
    const context={at,personnel:E.personnel({home:homeDepth,away:awayDepth},injuries,{home:g.home.id,away:g.away.id},year,at),weather:E.weather(summary,g.id,at),coaching:E.coaching(state,game.home,game.away)};
    const candidate=F.candidate(state,history,game,qb,root.SportsHubNFLFootballConfig,context);
    return {at,sourceStatus:{homeDepth:homeDepth?._sourceStatus,awayDepth:awayDepth?._sourceStatus,injuries:injuries?._sourceStatus,playByPlay:history?._sourceStatus},qb,context,candidate,
      efficiency:{used:state.used,expected:history?.coverage?.expected,method:'opponent-adjusted-play-level-efficiency'},candidateMargin:candidate.margin,candidateTotal:candidate.total};
  }
  function projection(e,g,at=new Date().toISOString()){
    const c=e?.candidate;
    // Require fresh evidence for this pregame observation. Never substitute the
    // baseline when essential evidence is unavailable. Provisional forecasts retain
    // their explicit lineup assumptions in the saved football evidence.
    if(!c?.available||![c.margin,c.total,c.probHome].every(Number.isFinite)||c.probHome<=0||c.probHome>=1
      ||g.state!=='pre'||g.seasonType===1||/postpon|cancel|suspend|delay/i.test(g.statusText||g.status||'')
      ||!(Date.parse(at)<Date.parse(g.date))||!(Date.parse(e.at)<=Date.parse(at))||Date.parse(at)-Date.parse(e.at)>5*60000)return null;
    const home=c.probHome>=.5;
    return {modelVersion:VERSION,home,p:c.probHome,conf:Math.round((home?c.probHome:1-c.probHome)*100),margin:c.margin,total:c.total,quality:c.provisional?['Provisional forecast']:[],
      features:{nfl:c.features,football:e},football:e,promotion:{mode:'owner-selected',at:ACTIVATED_AT,statisticalGatePassed:false,baselineVersion:BASELINE}};
  }
  function browser(e,g,at){
    const p=projection(e,g,at);if(!p)return null;
    return {modelVersion:VERSION,winner:p.home?g.home:g.away,homePick:p.home,probHome:p.p,conf:p.conf,projMargin:p.margin,projTotal:p.total,
      provisional:!!e.candidate.provisional,marginSat:false,thin:false,blockedReasons:[],rating:null,sharp:null,breakdown:[],
      notes:['Live NFL football model · former v4 challenger',...e.candidate.drivers.map(d=>`${d.label}: ${d.marginPoints>0?'+':''}${d.marginPoints.toFixed(1)} points toward home`),e.candidate.mainUncertainty],
      features:p.features,football:e,promotion:p.promotion,evidence:'Owner-selected football model; prospective accuracy and profitability remain unproven'};
  }
  function current(row){return (row?.q?.v??row?.model_version)===versionFor(row?.s||row?.sport);}
  const api=Object.freeze({VERSION,BASELINE,ACTIVATED_AT,OVERRIDE_SOURCE,versionFor,override,evidence,projection,browser,current});
  root.SportsHubNFLLive=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

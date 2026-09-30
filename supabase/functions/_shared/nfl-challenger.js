/* NFL prospective challenger. Scoring per possession, NOT EPA or pure offensive PPD.
 * Team points include return scores. Fixed shrinkage is a research policy, not a
 * fitted improvement. Never changes v239 or produces recommended stakes. */
(function(root) {
  'use strict';
  const VERSION='football-research-nfl-v3';
  const POLICY=Object.freeze({priorDrives:30,minGames:3,minDrives:20,minCoverage:.9,homeMargin:1.595353});
  const num=v=>v!=null&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
  function game(data,year,at) {
    const h=data?.header,c=h?.competitions?.[0],ts=Date.parse(c?.date);
    if(Number(h?.season?.year)!==Number(year)||Number(h?.season?.type)!==2||!c?.status?.type?.completed||!Number.isFinite(ts)||ts+6*3600000>=Date.parse(at))return null;
    const sides=(c.competitors||[]).map(t=>{
      const team=(data.boxscore?.teams||[]).find(x=>String(x.team?.id)===String(t.id||t.team?.id));
      const stat=name=>{const s=team?.statistics?.find(x=>x.name===name);return num(s?.value)??num(s?.displayValue);};
      const pass=(data.boxscore?.players||[]).find(x=>String(x.team?.id)===String(t.id||t.team?.id))?.statistics?.find(x=>x.name==='passing');
      const ix=pass?.names?.indexOf('completions/passingAttempts')??-1;
      const qb=(pass?.athletes||[]).map(x=>({id:String(x.athlete?.id||''),attempts:Number(String(x.stats?.[ix>=0?ix:0]||'').split('/')[1])})).filter(x=>x.id&&Number.isFinite(x.attempts)).sort((a,b)=>b.attempts-a.attempts)[0];
      return {id:String(t.id||t.team?.id||''),home:t.homeAway==='home',points:num(t.score),drives:stat('totalDrives'),yardsPerPlay:stat('yardsPerPlay'),qbId:qb?.id||null};
    });
    if(sides.length!==2||sides.some(s=>!s.id||s.points==null||s.points<0||s.points>100||s.drives==null||s.drives<3||s.drives>30)||sides[0].id===sides[1].id)return null;
    return {id:String(h.id),date:c.date,neutral:!!c.neutralSite,sides};
  }
  function fit(games,expected,at) {
    // All observations were completed before the capture time. No future schedules,
    // current-season standings, final-season ratings or target-game results enter.
    const valid=[...new Map(games.filter(g=>g&&Date.parse(g.date)+6*3600000<Date.parse(at)).map(g=>[g.id,g])).values()];
    const teams={},obs=[];let points=0,drives=0;
    for(const g of valid)for(let i=0;i<2;i++){
      const t=g.sides[i],op=g.sides[1-i];
      const neutralPoints=t.points-(g.neutral?0:(t.home?1:-1)*POLICY.homeMargin/2);
      obs.push({id:t.id,op:op.id,n:t.drives,y:neutralPoints/t.drives});points+=neutralPoints;drives+=t.drives;
      const s=teams[t.id]||={games:0,drives:0,points:0,offense:0,allowed:0,ypp:[],lastDate:null,qbId:null};
      s.games++;s.drives+=t.drives;s.points+=t.points;if(t.yardsPerPlay!=null)s.ypp.push(t.yardsPerPlay);
      if(!s.lastDate||Date.parse(g.date)>Date.parse(s.lastDate)){s.lastDate=g.date;s.qbId=t.qbId;}
    }
    const mean=drives?points/drives:null,pace=valid.length?drives/(2*valid.length):null;
    if(mean!=null)for(let k=0;k<100;k++){
      for(const [id,s] of Object.entries(teams)){
        const attack=obs.filter(o=>o.id===id),defend=obs.filter(o=>o.op===id);
        s.offense=attack.reduce((sum,o)=>sum+o.n*(o.y-mean-teams[o.op].allowed),0)/(POLICY.priorDrives+attack.reduce((sum,o)=>sum+o.n,0));
        s.allowed=defend.reduce((sum,o)=>sum+o.n*(o.y-mean-teams[o.id].offense),0)/(POLICY.priorDrives+defend.reduce((sum,o)=>sum+o.n,0));
      }
    }
    return {method:'opponent-adjusted-team-points-per-drive-v1',at,expected,used:valid.length,coverage:expected?valid.length/expected:0,mean,pace,teams,policy:POLICY,gameIds:valid.map(g=>g.id),observations:valid};
  }
  function candidate(model,homeId,awayId,neutral,qb) {
    const h=model?.teams?.[homeId],a=model?.teams?.[awayId],reasons=[];
    if(!model||model.coverage<POLICY.minCoverage||model.mean==null)reasons.push('Insufficient league data coverage');
    for(const [side,t] of [['home',h],['away',a]]){
      if(!t||t.games<POLICY.minGames||t.drives<POLICY.minDrives)reasons.push(`${side}: insufficient completed games/drives`);
      const q=qb?.[side];
      if(!q?.athleteId||/unknown|unavailable/i.test(q.status||''))reasons.push(`${side}: QB evidence unavailable`);
      else if(!/^No current restriction found/.test(q.status||''))reasons.push(`${side}: listed QB ${q.status}`);
      if(t&&!t.qbId)reasons.push(`${side}: recent passer unavailable`);
      else if(t&&q?.athleteId&&t.qbId!==q.athleteId)reasons.push(`${side}: listed QB differs from recent passer`);
    }
    if(reasons.length)return {available:false,margin:null,total:null,reasons,home:h||null,away:a||null};
    const pace=(h.drives+a.drives+6*model.pace)/(h.games+a.games+6);
    const hp=(model.mean+h.offense+a.allowed)*pace+(neutral?0:POLICY.homeMargin/2);
    const ap=(model.mean+a.offense+h.allowed)*pace-(neutral?0:POLICY.homeMargin/2);
    if(hp<0||ap<0||hp+ap>100)return {available:false,margin:null,total:null,reasons:['Projection outside research bounds']};
    return {available:true,margin:+(hp-ap).toFixed(1),total:+(hp+ap).toFixed(1),pace:+pace.toFixed(2),reasons:[],home:h,away:a};
  }
  const api={VERSION,POLICY,game,fit,candidate};root.SportsHubNFLChallenger=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

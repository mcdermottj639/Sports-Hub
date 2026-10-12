/* Fresh pregame inputs for the same official engine used by scheduled capture. */
(function(root){
  'use strict';
  const sources=new Map(),games=new Map(),base='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
  async function source(url){
    const old=sources.get(url);if(old&&Date.now()-old.at<5*60000)return old.data;
    const data=(async()=>{try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});return {...(r.ok?await r.json():{}),_sourceStatus:r.status};}catch(_){return {_sourceStatus:'unavailable'};}})();
    sources.set(url,{at:Date.now(),data});return data;
  }
  async function load(g){
    const key=`${g.id}:${g.date}`,old=games.get(key);
    if(old&&Date.now()-old.at<4*60000)return old.data;
    const entry={at:Date.now(),data:null,evidence:null};
    entry.data=(async()=>{
      const [homeDepth,awayDepth,injuries,history,summary]=await Promise.all([
        source(`${base}/teams/${g.home.id}/depthcharts`),source(`${base}/teams/${g.away.id}/depthcharts`),source(`${base}/injuries`),
        source('data/nfl-football-live.json'),source(`${base}/summary?event=${g.id}`)]);
      entry.evidence=root.SportsHubNFLLive.evidence(g,{homeDepth,awayDepth,injuries,history,summary});
      return entry.evidence;
    })();games.set(key,entry);return entry.data;
  }
  async function predict(g){try{return root.SportsHubNFLLive.browser(await load(g),g);}catch(_){return null;}}
  function reason(g){
    const e=games.get(`${g.id}:${g.date}`)?.evidence;
    const reasons=e?.candidate?.reasons?.join('; ')||'Required football evidence unavailable';
    const restricted=Object.values(e?.qb||{}).some(q=>/out|doubtful|questionable|reserve|suspend|pup/i.test(q.status||''));
    const diag=diagnostic(g);
    return reasons+(diag?` · Source check: ${diag}`:'')+(restricted?' · Waiting for a starting-QB update. The depth chart has not resolved who will play; backup projections remain conditional.':'');
  }
  /* v309: say WHICH QB input failed. "Current QB evidence unavailable" covers
     three different faults — the ESPN request failed, ESPN's depth chart is
     older than the 2-day freshness rule, or no QB is listed — and each needs a
     different fix. Read straight off the evidence this device just built. */
  function diagnostic(g){
    const e=games.get(`${g.id}:${g.date}`)?.evidence;if(!e)return '';
    const age=t=>{const ms=Date.now()-Date.parse(t);if(!Number.isFinite(ms))return null;const d=Math.floor(ms/864e5);return d>=1?`${d}d old`:`${Math.max(1,Math.round(ms/36e5))}h old`;};
    const side=(abbr,status,q)=>{
      if(status!==200)return `${abbr} depth chart: request ${status==='unavailable'?'failed':`returned ${status}`}`;
      const a=q?.depthUpdatedAt?age(q.depthUpdatedAt):null;
      const stale=q?.depthUpdatedAt&&Date.now()-Date.parse(q.depthUpdatedAt)>=2*864e5;
      if(!q?.depthUpdatedAt)return `${abbr} depth chart: loaded, no timestamp`;
      if(stale)return `${abbr} depth chart: loaded but ${a} (needs under 2 days)`;
      return q?.name?`${abbr} QB: ${q.name} (chart ${a})`:`${abbr} depth chart: ${a}, no QB listed`;
    };
    const s=e.sourceStatus||{};
    return [side(g.away.abbr,s.awayDepth,e.qb?.away),side(g.home.abbr,s.homeDepth,e.qb?.home),`injury report: ${s.injuries===200?'loaded':s.injuries==='unavailable'?'request failed':`returned ${s.injuries}`}`].join(' · ');
  }
  root.SportsHubNFLLiveClient=Object.freeze({load,predict,reason,diagnostic});
})(globalThis);

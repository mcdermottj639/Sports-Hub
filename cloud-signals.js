/* Read-only signals adapter. Complete bounded reads; failed pages never become results. */
(function(root) {
  'use strict';
  const KEY='sportshub:signals:v2', PAGE=500, MAX_PAGES=200;
  const inflight=new Map();
  let memory={}, health={state:'idle',fetched_at:null,error:null};
  try { memory=JSON.parse(root.localStorage?.getItem(KEY)||'{}'); } catch (_) {}
  const cfg=()=>root.SPORTS_HUB_SUPABASE||{};
  const capabilities=Object.freeze({readOnly:true,historicalOdds:true,trueClosingLine:false,prospectiveOnly:true});
  const cached=(key)=>key ? memory[key]||null : memory;
  const status=()=>({...health,capabilities});
  function range(value={}) {
    const end=new Date(value.to||Date.now()), start=new Date(value.from||(+end-31*86400000));
    if(!Number.isFinite(+start)||!Number.isFinite(+end)||start>end||end-start>370*86400000) throw Error('Choose a valid date range of at most 370 days.');
    // Date-only end filters include that entire day.
    if(typeof value.to==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.to)) end.setUTCDate(end.getUTCDate()+1);
    return {from:start.toISOString(),to:end.toISOString()};
  }
  async function read(table,params) {
    const config=cfg();
    if(!config.url||!config.key) throw Error('Signals connection is not configured.');
    const rows=[];
    for(let page=0;page<MAX_PAGES;page++) {
      const query=new URLSearchParams({...params,limit:String(PAGE),offset:String(page*PAGE)});
      const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),15000);
      let response;
      try { response=await root.fetch(`${config.url}/rest/v1/${table}?${query}`,{headers:{apikey:config.key,Authorization:`Bearer ${config.key}`},cache:'no-store',signal:controller.signal}); }
      finally { clearTimeout(timeout); }
      if(!response.ok) throw Error(`Signals data unavailable (${response.status}).`);
      const batch=await response.json();
      if(!Array.isArray(batch)) throw Error('Signals response was not a row list.');
      rows.push(...batch);
      if(batch.length<PAGE) return rows;
    }
    throw Error('This range is too large to load completely. Choose a shorter date range.');
  }
  function run(key,task,ttl=60000) {
    if(inflight.has(key)) return inflight.get(key);
    if(memory[key]&&Date.now()-Date.parse(memory[key].fetched_at)<ttl) return Promise.resolve(memory[key]);
    const promise=perform(key,task).finally(()=>inflight.delete(key));inflight.set(key,promise);return promise;
  }
  async function perform(key,task) {
    health={...health,state:'loading',error:null};
    try {
      const result={...await task(),fetched_at:new Date().toISOString(),state:'ready',complete:true,capabilities};
      memory[key]=result;
      // Keep a small complete cache. Results are never truncated to fit storage.
      const keys=Object.keys(memory); while(keys.length>12) delete memory[keys.shift()];
      try { root.localStorage?.setItem(KEY,JSON.stringify(memory)); } catch (_) {}
      health={state:'ready',fetched_at:result.fetched_at,error:null};
      return result;
    } catch(err) {
      health={...health,state:'error',error:err.message};
      return {...(memory[key]||{}),state:'error',error:err.message,cached:!!memory[key],complete:!!memory[key],capabilities};
    }
  }
  const safeID=value=>{if(!/^[\w.:-]+$/.test(String(value))) throw Error('Invalid event or provider identifier.'); return String(value);};
  async function loadCurrent(sport,eventIds=[]) {
    if(sport!=='nfl') return {state:'unsupported',quotes:[],decisions:[]};
    const ids=[...new Set(eventIds.map(safeID))].sort();
    if(!ids.length) return {state:'ready',quotes:[],decisions:[],complete:true};
    if(ids.length>64) throw Error('Load at most 64 events at a time.');
    const key=`current:${ids.join(',')}`;
    return run(key,async()=>{
      const p={sport:'eq.nfl',event_id:`in.(${ids.join(',')})`,select:'*'};
      const [quotes,decisions,current,runs,config]=await Promise.all([
        read('betting_quote_snapshots',{...p,observed_at:`gte.${new Date(Date.now()-14*86400000).toISOString()}`,order:'observed_at.asc,id.asc'}),
        read('betting_system_decisions',{...p,order:'decided_at.asc,id.asc'}),
        read('betting_signal_current',{...p,order:'event_id.asc'}),
        read('betting_capture_runs',{select:'*',order:'started_at.desc',started_at:`gte.${new Date(Date.now()-86400000).toISOString()}`}),
        read('betting_signals_config',{id:'eq.1',select:'*',order:'id.asc'})]);
      return {quotes,decisions,current,run:runs[0]||null,config:config[0]||null};
    });
  }
  async function loadHistory(eventId,market,providerId,dateRange) {
    const dates=range(dateRange), id=safeID(eventId);
    if(!['moneyline','spread','total'].includes(market)) throw Error('Choose a supported market.');
    const key=`history:${id}:${market}:${providerId||''}:${dates.from}:${dates.to}`;
    return run(key,async()=>({quotes:await read('betting_quote_snapshots',{sport:'eq.nfl',event_id:`eq.${id}`,market:`eq.${market}`,...(providerId?{provider_id:`eq.${safeID(providerId)}`} : {}),and:`(observed_at.gte.${dates.from},observed_at.lt.${dates.to})`,select:'*',order:'observed_at.asc,id.asc'}),dateRange:dates}));
  }
  async function loadResults(ruleId,version,dateRange={},filters={}) {
    const dates=range(dateRange), key=`results:${JSON.stringify([ruleId,version,dates,filters])}`;
    return run(key,async()=>{
      let decisions=await read('betting_system_decisions',{sport:'eq.nfl',rule_id:filters.scope==='explore'?'like.nfl_research_*':ruleId?`eq.${safeID(ruleId)}`:'not.like.nfl_research_*',...(version?{rule_version:`eq.${safeID(version)}`} : {}),...(filters.market?{market:`eq.${safeID(filters.market)}`} : {}),and:`(scheduled_start_at.gte.${dates.from},scheduled_start_at.lt.${dates.to})`,select:'*',order:'decided_at.asc,id.asc'});
      const research=filters.scope==='explore';
      decisions=decisions.filter(d=>String(d.rule_id||'').startsWith('nfl_research_')===research);
      const cohorts=[...new Set(decisions.map(d=>d.model_context?.engine||d.model_context?.engine_version||'unavailable'))];
      const providers=[...new Set(decisions.map(d=>d.inputs?.provider_id||d.provider_id).filter(Boolean))];
      if(filters.provider) decisions=decisions.filter(d=>String(d.inputs?.provider_id||d.provider_id)===filters.provider);
      if(filters.cohort) decisions=decisions.filter(d=>(d.model_context?.engine||d.model_context?.engine_version||'unavailable')===filters.cohort);
      if(root.SportsHubSignalsCore) decisions=root.SportsHubSignalsCore.filterResearch(decisions,filters);
      if(filters.agreement) decisions=decisions.filter(d=>{const m=d.model_context,available=m?.availability==='available'&&m?.qualification?.[d.market]&&m?.selections?.[d.market];const value=!available?'unavailable':m.selections[d.market]===d.selection_side?'agrees':'disagrees';return value===filters.agreement;});
      if(filters.movement) decisions=decisions.filter(d=>{const v=d.inputs?.observed_line_movement;return filters.movement==='unavailable'?!Number.isFinite(v):Number.isFinite(v)&&(filters.movement==='up'?v>0:filters.movement==='down'?v<0:filters.movement==='unchanged'?v===0:false);});
      if(filters.minGap!==undefined&&filters.minGap!==null&&String(filters.minGap).trim()!=='') {
        const minGap=Number(filters.minGap);if(!Number.isFinite(minGap)||minGap<0) throw Error('Minimum model gap must be zero or greater.');
        decisions=decisions.filter(d=>Number.isFinite(d.model_context?.same_market_gap)&&d.model_context.same_market_gap>=minGap);
      }
      const settlements=[];
      for(let i=0;i<decisions.length;i+=100) settlements.push(...await read('betting_system_settlements',{decision_id:`in.(${decisions.slice(i,i+100).map(d=>safeID(d.id)).join(',')})`,select:'*',order:'decision_id.asc'}));
      const configs=await read('betting_signals_config',{id:'eq.1',select:'*',order:'id.asc'});
      return {decisions,settlements,providers,cohorts,dateRange:dates,filters,config:configs[0]||null};
    });
  }
  const api=Object.freeze({loadCurrent,loadHistory,loadResults,cached,status,capabilities});
  root.SportsHubCloudSignals=api;
  if(typeof module==='object'&&module.exports) module.exports=api;
})(globalThis);

/* Per-run work budget for the scheduled collector (sports-hub-ai).
 *
 * Why this exists: the Edge Function has a 2 s CPU cap. From 20 Oct 2026 the
 * NBA pass re-forecast every eligible game on every half-hourly run — four
 * full-season team schedules per game, ~80 downloads and ~90 MB of JSON for a
 * 20-game slate — although ai_predictions is first-write-wins, so the work
 * produced nothing new once a game was saved. Runs died at "CPU Time exceeded"
 * in the NBA pass (31 of 45 runs on 23 Oct).
 *
 * What this changes: WHICH NBA games get a forecast computed in a run, never
 * what a forecast is, when it is frozen, or how it is priced/graded.
 *  - a game whose needed markets are already saved is REUSED (no fetch, no model)
 *  - the remaining games are forecast soonest tip-off first, at most `cap` a run
 *  - the rest are DEFERRED to the next run (every 30 min, so a game saved a day
 *    ahead still gets its first pregame observation well before tip-off)
 * Price enrichment still runs for every eligible game in the caller.
 *
 * `pregameEligible` is the collector's eligibility predicate, extracted verbatim
 * so it is testable; it is unchanged.
 */
(function(root){
 'use strict';
 const DEFAULT_CAP=6;
 function pregameEligible(g,now){
  const t=typeof now==='number'?now:Date.now();
  return !(g.state!=='pre'||g.seasonType===1||!(Date.parse(g.date)>t)||/postpon|cancel|suspend|delay/i.test(String(g.status||'')));
 }
 // Markets this run could still write for a game, given the posted odds.
 // A moneyline is always written when a forecast exists; spread/total need a
 // posted line. A saved moneyline carrying quality flags means spread/total were
 // blocked and will never be written, so that game is complete too.
 function neededMarkets(o){
  const m=['moneyline'];
  if(o&&o.spread!=null)m.push('spread');
  if(o&&o.ou!=null)m.push('total');
  return m;
 }
 function savedIndex(rows){
  const idx=new Map();
  for(const r of rows||[]){
   const id=String(r.event_id);
   if(!idx.has(id))idx.set(id,{markets:new Set(),blocked:false});
   const e=idx.get(id);e.markets.add(r.market);
   if(r.market==='moneyline'&&Array.isArray(r.quality)&&r.quality.length)e.blocked=true;
  }
  return idx;
 }
 function isComplete(entry,o){
  if(!entry||!entry.markets.has('moneyline'))return false;
  if(entry.blocked)return true;
  return neededMarkets(o).every(m=>entry.markets.has(m));
 }
 /* plan(games, savedRows, {cap, now, oddsFor})
  *  games     — the slate (any state; ineligible games are ignored here)
  *  savedRows — rows for this model version: {event_id, market, quality}
  *  oddsFor   — g => normalized odds ({spread, ou}) or null
  * → {forecast:[g], reused:[g], deferred:[g], eligible:n}
  */
 function plan(games,savedRows,opts){
  const o=opts||{},cap=Number.isInteger(o.cap)&&o.cap>=0?o.cap:DEFAULT_CAP,now=typeof o.now==='number'?o.now:Date.now(),oddsFor=typeof o.oddsFor==='function'?o.oddsFor:()=>null;
  const idx=savedIndex(savedRows),reused=[],todo=[];
  let eligible=0;
  for(const g of games||[]){
   if(!pregameEligible(g,now))continue;
   eligible++;
   if(isComplete(idx.get(String(g.id)),oddsFor(g)))reused.push(g);else todo.push(g);
  }
  todo.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||String(a.id).localeCompare(String(b.id)));
  return {forecast:todo.slice(0,cap),deferred:todo.slice(cap),reused,eligible};
 }
 const api={DEFAULT_CAP,pregameEligible,neededMarkets,plan};
 root.SportsHubCollectorBudget=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

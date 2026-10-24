const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const B=require('../supabase/functions/_shared/collector-budget.js');
const now=Date.parse('2026-10-24T20:00:00Z');
const game=(id,hoursAhead,extra={})=>({id,sport:'nba',state:'pre',seasonType:2,status:'Scheduled',date:new Date(now+hoursAhead*3600e3).toISOString(),home:{abbr:'H'+id},away:{abbr:'A'+id},...extra});
const odds=()=>({spread:-3.5,ou:224.5});
const saved=(id,markets,quality=[])=>markets.map(m=>({event_id:id,market:m,quality}));

test('eligibility predicate matches the collector rule exactly',()=>{
 assert.equal(B.pregameEligible(game('a',2),now),true);
 assert.equal(B.pregameEligible(game('b',2,{state:'in'}),now),false);
 assert.equal(B.pregameEligible(game('c',2,{seasonType:1}),now),false);
 assert.equal(B.pregameEligible(game('d',-1),now),false);
 assert.equal(B.pregameEligible(game('e',2,{status:'Postponed'}),now),false);
 assert.equal(B.pregameEligible(game('f',2,{status:'Delayed'}),now),false);
 assert.equal(B.pregameEligible(game('g',2,{status:undefined}),now),true);
});

test('fully saved games are reused and never re-forecast',()=>{
 const games=[game('1',3),game('2',4)];
 const rows=[...saved('1',['moneyline','spread','total'])];
 const p=B.plan(games,rows,{now,oddsFor:odds});
 assert.deepEqual(p.reused.map(g=>g.id),['1']);
 assert.deepEqual(p.forecast.map(g=>g.id),['2']);
 assert.equal(p.deferred.length,0);assert.equal(p.eligible,2);
});

test('a game missing a market that is now posted is forecast again (first-write-wins protects the rest)',()=>{
 const p=B.plan([game('1',3)],saved('1',['moneyline']),{now,oddsFor:odds});
 assert.deepEqual(p.forecast.map(g=>g.id),['1']);
 const noLine=B.plan([game('1',3)],saved('1',['moneyline']),{now,oddsFor:()=>null});
 assert.deepEqual(noLine.reused.map(g=>g.id),['1'],'with no line posted the moneyline alone is complete');
});

test('a quality-blocked moneyline counts as complete because spread/total are never written',()=>{
 const p=B.plan([game('1',3)],saved('1',['moneyline'],['Incomplete team history']),{now,oddsFor:odds});
 assert.deepEqual(p.reused.map(g=>g.id),['1']);
});

test('cap applies soonest tip-off first and the rest defer',()=>{
 const games=[game('late',30),game('soon',1),game('mid',5),game('mid2',6),game('mid3',7),game('mid4',8),game('mid5',9),game('later',20)];
 const p=B.plan(games,[],{now,cap:6,oddsFor:odds});
 assert.deepEqual(p.forecast.map(g=>g.id),['soon','mid','mid2','mid3','mid4','mid5']);
 assert.deepEqual(p.deferred.map(g=>g.id),['later','late']);
 assert.equal(B.DEFAULT_CAP,6);
});

test('ineligible games are ignored, not deferred',()=>{
 const p=B.plan([game('final',-3,{state:'post'}),game('pre',2,{seasonType:1}),game('ok',2)],[],{now,oddsFor:odds});
 assert.equal(p.eligible,1);assert.deepEqual(p.forecast.map(g=>g.id),['ok']);assert.equal(p.deferred.length,0);
});

test('collector imports the budget, plans the NBA pass and skips non-planned games before predict',()=>{
 const src=fs.readFileSync(__dirname+'/../supabase/functions/sports-hub-ai/index.ts','utf8');
 assert.match(src,/import '\.\.\/_shared\/collector-budget\.js';/);
 assert.match(src,/BUDGET\.plan\(games,saved\|\|\[\],\{oddsFor/);
 const skip=src.indexOf("if(nbaForecast&&!nbaForecast.has(String(g.id))){await enrichPrices(g);continue;}"),pred=src.indexOf('const baseline=await predict(sport,g)');
 assert.ok(skip>0&&pred>skip,'non-planned NBA games must leave the loop before the forecast, after price enrichment');
 assert.match(src,/if\(!BUDGET\.pregameEligible\(g\)\)\{skipped\+\+;continue;\}/);
 assert.match(src,/reused:0,deferred:0,cap:BUDGET\.DEFAULT_CAP/);
});

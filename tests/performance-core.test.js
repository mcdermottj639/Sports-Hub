const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../performance-core.js'),D=require('../desk-core.js');
const base=(x={})=>({id:'one',event_id:'1',sport:'nfl',market:'spread',model_version:'current',starts_at:'2026-10-04T17:00:00Z',captured_at:'2026-10-04T16:00:00Z',result:'win',tier:'edge',selection:'Home -3',selection_home:true,line:-3,projection:7,price:-110,model_probability:.6,final_home_score:24,final_away_score:20,snapshot:{odds:{spread:-3,hSpreadPrice:-110,aSpreadPrice:-105,hML:-150,aML:130,ou:45,overPrice:-115,underPrice:-105},forecast:{margin:7,total:45}},...x});
test('all new routes round trip for every sport, with old links intact',()=>{
 for(const sport of ['all',...C.SPORTS])for(const sub of ['picks','results','trends','recent','method','calibration']){const path=`#/models/${sport}/${sub}`;assert.equal(D.hashFor(D.route(path)),path);}
});
test('one immutable selection per sport, game, market, version and start',()=>{
 const r=base();const rows=C.select([r,r,base({id:'late',captured_at:r.starts_at}),base({id:'old',model_version:'old'}),base({id:'mlb',sport:'mlb'})],{versionFor:()=> 'current'});
 assert.equal(rows.length,2);assert.equal(C.summary(rows).n,2);
});
test('settlement refresh replaces the same row without inflating totals',()=>{
 const pending=base({result:'pending'}),win=base({updated_at:'2026-10-05T00:00:00Z'});
 assert.equal(C.valid([pending,win]).length,1);assert.equal(C.summary(C.valid([pending,win])).w,1);
});
test('ROI excludes missing odds, voids, watch-only and CFB research totals; pushes keep stake denominator',()=>{
 const rows=[base(),base({result:'loss'}),base({result:'push'}),base({price:null}),base({result:'void'}),base({market:'moneyline',tier:'watch'}),base({sport:'cfb',market:'total'})];
 const s=C.summary(rows);assert.equal(s.n,4);assert.equal(s.priced,3);assert.equal(s.unpriced,1);assert.equal(s.pushes,1);assert.ok(Math.abs(s.units-(100/110-1))<1e-8);assert.equal(s.roi,s.units/3);
});
test('current and historical cohorts remain separately selectable',()=>{
 const rs=[base(),base({id:'old',model_version:'old'})];assert.equal(C.select(rs,{versionFor:()=> 'current'}).length,1);
 assert.equal(C.select(rs,{cohort:'nfl|old',versionFor:()=> 'current'})[0].model_version,'old');
});
test('profit accumulates by actual Eastern dates across gaps without phantom days',()=>{
 const rs=[base(),base({event_id:'2',starts_at:'2026-10-14T01:00:00Z',result:'loss'}),base({event_id:'3',price:null})];
 const s=C.series(rs);assert.deepEqual(s.map(x=>x.date),['2026-10-04','2026-10-13']);assert.equal(s.at(-1).n,2);assert.ok(Math.abs(s.at(-1).units-(100/110-1))<1e-8);assert.equal(C.weekly(rs).length,2);
});
test('baseline comparison uses exactly matched games and their two saved side prices',()=>{
 const r=base({selection_home:false,price:-105,result:'loss'});
 const b=C.benchmarks([r],'spread')[0];assert.equal(b.n,1);assert.equal(b.model.l,1);assert.equal(b.baseline.w,1);assert.equal(b.baseline.units,100/110);assert.equal(b.model.units,-1);
});
test('baselines reject missing prices, different lines, null scores and stale enrichment',()=>{
 const r=base();for(const bad of [base({snapshot:{odds:{...r.snapshot.odds,aSpreadPrice:null}}}),base({line:-4}),base({final_home_score:null}),base({price:-120})])assert.equal(C.benchmarks([bad],'spread')[0].n,0);
 const enriched=base({price:-120,snapshot:{...r.snapshot,pricedOdds:{...r.snapshot.odds,hSpreadPrice:-120},priceCapturedAt:r.starts_at}});assert.equal(C.benchmarks([enriched],'spread')[0].n,0);
 enriched.snapshot.priceCapturedAt='2026-10-04T16:30:00Z';assert.equal(C.benchmarks([enriched],'spread')[0].n,1);
});
test('total and moneyline baselines grade actual sides and odds',()=>{
 const tot=base({market:'total',selection:'OVER 45',line:45,projection:50,price:-115,result:'loss'});const b=C.benchmarks([tot],'total');assert.equal(b[0].baseline.l,1);assert.equal(b[1].baseline.w,1);assert.equal(b[1].baseline.units,100/105);
 const ml=base({market:'moneyline',price:-150});assert.equal(C.benchmarks([ml],'moneyline')[1].baseline.w,1);
});
test('forecast errors count each game once and do not turn missing scores into zero',()=>{
 const r=base();const result=C.forecastErrors([r,base({market:'moneyline'}),base({event_id:'2',final_home_score:null})]);
 assert.equal(result[0].n,1);assert.equal(result[0].mae,3);assert.equal(result[1].mae,1);
});
test('calibration validates timestamps, skips pushes and shows genuine probability buckets',()=>{
 const r=base();assert.equal(C.calibration([r,base({result:'loss'}),base({result:'push'})])[0].actual,.5);
 assert.equal(C.calibration([base({snapshot:{probability:{trainedThrough:'2026-10-05',at:r.captured_at}}})]).length,0);
});
test('research rendering pairs opposite sides without merging model cohorts',()=>{
 global.SportsHubSignalsCore=require('../supabase/functions/_shared/betting-signals-core.js');const UI=require('../betting-signals-ui.js');
 const g={rule_id:'nfl_explore_spread_home',engine:'scheduled-v239',provider_id:'1',wins:1,losses:0,pushes:0,units:1,roi:100};
 const html=UI.systemResultsHTML({state:'ready',filters:{scope:'explore'},groups:[g,{...g,rule_id:'nfl_explore_spread_away',wins:0,losses:1},{...g,engine:'scheduled-nfl-football-v1'}]});
 assert.equal((html.match(/side comparison<\/h4>/g)||[]).length,2);assert.match(html,/Our model trends/);assert.match(html,/Game history/);
});

test('game history shows newest played games before upcoming games in kickoff order',()=>{
 const now=Date.parse('2026-10-05T18:00:00Z');
 const rows=[base({event_id:'old',starts_at:'2026-10-01T17:00:00Z'}),base({event_id:'future2',starts_at:'2026-10-11T17:00:00Z'}),base({event_id:'recent',starts_at:'2026-10-04T17:00:00Z'}),base({event_id:'future1',starts_at:'2026-10-05T23:00:00Z'}),base({event_id:'live',starts_at:'2026-10-05T17:00:00Z'})];
 assert.deepEqual(C.games(rows,now).map(rs=>rs[0].event_id),['live','recent','old','future1','future2']);
});

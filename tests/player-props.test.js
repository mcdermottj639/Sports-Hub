'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../supabase/functions/_shared/prop-model.js'),R=require('../desk-core.js');
const now=Date.parse('2026-10-07T05:00:00Z'),g={id:'123',sport:'nfl',state:'pre',seasonType:2,date:'2026-10-09T00:15:00Z',home:{id:'6'},away:{id:'27'},probables:[]};
const athlete={id:'9',displayName:'Player',team:{id:'6',abbreviation:'DAL'},active:true};
const quote={athlete_id:'9',market:'rushingYards',market_label:'Rushing yards',line:50.5,price:-110,side:'over',quote_at:new Date(now).toISOString(),provider:'DraftKings'};
const history=Array.from({length:20},(_,i)=>({id:String(i),date:new Date(now-(21-i)*7*864e5).toISOString(),team_id:'6',opponent_id:'27',stats:{rushingYards:40+i*2}}));
test('prop parser reads hydration JSON without script evaluation and binds the exact game',()=>{
 const p={gmStrp:{gid:'123',statusState:'pre'},oddsProvider:{displayName:'DraftKings'},propBets:[{displayName:'Rushing Props',odds:[{displayName:'Rushing Yards',athletes:[{id:'9',values:[{line:'o50.5',odds:'-110',type:'over'},{line:'u50.5',odds:'-110',type:'under',suspended:true}]}]}]}]};
 const text=`window['__espnfitt__']={"headerscoreboard":{"gmStrp":{"gid":"wrong"}},"page":{"gamepackage":${JSON.stringify(p)}}};doNotRun();`;
 const parsed=C.packageFromHTML(text,'123');assert.equal(C.quotes(parsed,'nfl','123',quote.quote_at).length,1);
 assert.throws(()=>C.packageFromHTML(text,'456'),/mismatch/);assert.throws(()=>C.packageFromHTML('<html>no data</html>','123'),/unavailable/);
 assert.equal(C.quotes({...p,gmStrp:{gid:'123',statusState:'post'}},'nfl','123',quote.quote_at).length,0);
});
test('prop projections cannot see future games, duplicates, another team or unposted quotes',()=>{
 const p=C.project(quote,history,athlete,g,now);assert.equal(p.projection,59);assert.equal(p.features.sample_size,20);
 const extra=[...history,...history,{...history[0],id:'future',date:g.date,stats:{rushingYards:900}},{...history[0],id:'old-team',team_id:'2',stats:{rushingYards:900}}];
 assert.equal(C.project(quote,extra,athlete,g,now).projection,59);
 assert.equal(C.project({...quote,quote_at:new Date(now-16*60000).toISOString()},history,athlete,g,now),null);
 assert.equal(C.project(quote,history,athlete,{...g,date:new Date(now).toISOString()},now),null);
 assert.equal(C.project(quote,history.slice(0,7),athlete,g,now),null);
 assert.equal(C.project(quote,history,{...athlete,injuries:[{status:'Out'}]},g,now),null);
 assert.equal(C.project(quote,history,athlete,{...g,seasonType:1},now),null);
 for(const change of [{quote_at:'invalid'},{quote_at:new Date(now+1).toISOString()},{side:'yes'},{line:NaN},{price:0},{athlete_id:'different'}])assert.equal(C.project({...quote,...change},history,athlete,g,now),null);
 assert.equal(p.features.median,59);
});
test('history parser keeps completed regular/postseason games and distinguishes missing from zero',()=>{
 const data={names:['rushingYards','receivingYards'],events:{a:{gameDate:'2026-09-01',gameResult:'W',team:{id:'6'}},b:{gameDate:'2026-09-02',gameResult:'W',team:{id:'6'}},live:{gameDate:'2026-09-03',gameResult:'',team:{id:'6'}}},seasonTypes:[{displayName:'2026 Preseason',categories:[{events:[{eventId:'b',stats:['300','300']}]}]},{displayName:'2026 Regular Season',categories:[{events:[{eventId:'a',stats:['0','—']},{eventId:'live',stats:['30','20']}]}]}]};
 const rows=C.logs(data);assert.equal(rows.length,1);assert.equal(rows[0].stats.rushingYards,0);assert.equal(rows[0].stats.receivingYards,undefined);
});
test('NBA combined stats and MLB total bases/outs use exact units',()=>{
 const n=C.statValues(['minutes','points','totalRebounds','assists','threePointFieldGoalsMade-threePointFieldGoalsAttempted'],['32:30','25','7','8','4-9']);
 assert.equal(n.pra,40);assert.equal(n.threes,4);assert.equal(n.minutes,32.5);
 const m=C.statValues(['hits','doubles','triples','homeRuns','runs','RBIs','inningsPitched','strikeouts'],['3','1','0','1','2','2','5.2','7']);
 assert.equal(m.totalBases,7);assert.equal(m.hitsRunsRbis,7);assert.equal(m.pitcherOuts,17);assert.equal(m.pitcherStrikeouts,7);
 assert.equal(C.statValues(['strikeouts'],['3']).pitcherStrikeouts,undefined);
});
test('best-two ranking uses actual prices and selects different players',()=>{
 const p=C.project(quote,history,athlete,g,now),cheap=C.project({...quote,price:-1000,athlete_id:'10'},history,{...athlete,id:'10'},g,now);
 const chosen=C.select([p,{...p,market:'receivingYards',expected_return:p.expected_return+.01},{...cheap,athlete_id:'10'}]);
 assert.equal(chosen.length,2);assert.equal(chosen[0].athlete_id,'9');assert.equal(chosen[1].athlete_id,'10');assert.equal(new Set(chosen.map(x=>x.athlete_id)).size,2);
 assert.ok(p.expected_return>cheap.expected_return);
});
test('pitchers require a probable start and NBA/MLB reject missing or sharply reduced workloads',()=>{
 const game={...g,sport:'mlb',probables:['9']},q={...quote,market:'pitcherStrikeouts',line:5.5};
 const h=history.map(r=>({...r,stats:{pitcherStrikeouts:6,pitcherOuts:18}}));
 assert.equal(C.project(q,h,athlete,game,now).projection,6);
 assert.equal(C.project(q,h,athlete,{...game,probables:[]},now),null);
 assert.equal(C.project(q,h.map((r,i)=>i<17?r:{...r,stats:{pitcherStrikeouts:1,pitcherOuts:3}}),athlete,game,now),null);
 const nba={...g,sport:'nba'},nq={...quote,market:'points',line:19.5};
 assert.equal(C.project(nq,h.map(r=>({...r,stats:{points:20}})),athlete,nba,now),null);
 assert.equal(C.project(nq,h.map(r=>({...r,stats:{points:20,minutes:30}})),athlete,nba,now).projection,20);
 assert.equal(C.project({...quote,market:'hits',line:.5},h.slice(0,14).map(r=>({...r,stats:{hits:1,atBats:4}})),athlete,game,now),null);
});
test('push probabilities and paper ROI respect returned stakes',()=>{
 const p=C.project({...quote,line:50},history,athlete,g,now);assert.ok(Math.abs(p.model_probability+p.push_probability+(p.features.losses+1)/22-1)<1e-10);
 const base={model_version:C.VERSION,captured_at:new Date(now).toISOString(),starts_at:g.date};
 const r=C.performance([{...base,result:'win',price:150},{...base,result:'loss',price:-110},{...base,result:'push',price:-110},{...base,result:'void',price:-110},{...base,result:'pending',price:-110}]);
 assert.equal(r.profit,.5);assert.equal(r.priced,3);assert.equal(r.roi,1/6);assert.equal(r.n,2);assert.equal(r.pending,1);assert.equal(r.voids,1);
});
test('grading waits for final exact-event statistics and handles pushes, DNP and rescheduling',()=>{
 const p={...quote,event_id:'123',starts_at:g.date,line:50};
 const final={...g,state:'post',completed:true},h=[{id:'123',stats:{rushingYards:50}}];
 assert.equal(C.settle(p,g,h),null);assert.equal(C.settle(p,final,[]),null);assert.equal(C.settle(p,final,h).result,'push');
 assert.equal(C.settle({...p,line:49.5},final,h).result,'win');assert.equal(C.settle({...p,line:49.5,side:'under'},final,h).result,'loss');
 assert.equal(C.settle(p,final,[],true).result,'void');assert.equal(C.settle(p,{...g,date:'2026-10-10T00:15Z'},[]).result,'void');
});
test('player prop routes are available for every modeled league',()=>{
 for(const sport of C.SPORTS)assert.equal(R.hashFor(R.route(`#/models/${sport}/props`)),`#/models/${sport}/props`);
 const app=fs.readFileSync(require.resolve('../app.js'),'utf8');assert.match(app,/delete container.dataset.propToken/);
});

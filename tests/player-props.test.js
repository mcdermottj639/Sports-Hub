'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../supabase/functions/_shared/prop-model.js'),R=require('../desk-core.js');
const now=Date.parse('2026-10-07T05:00:00Z'),g={id:'123',sport:'nfl',state:'pre',seasonType:2,date:'2026-10-07T20:15:00Z',home:{id:'6'},away:{id:'27'},probables:[]};
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
 const p=C.project({...quote,line:50},history,athlete,g,now);assert.equal(p.features.pushes,1);assert.ok(Math.abs(p.push_probability-1/22)<1e-12);
 assert.ok(p.model_probability>0&&p.model_probability+p.push_probability<1);
 assert.ok(Math.abs(p.expected_return-(p.model_probability*C.payout(-110)-(1-p.model_probability-p.push_probability)))<1e-12);
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

test('v2 probabilities start from the no-vig market and only lean toward the hit rate',()=>{
 assert.equal(C.VERSION,'props-v2');assert.deepEqual(C.LEGACY,['props-v1']);
 assert.ok(Math.abs(C.fair(-110,-110)-.5)<1e-12);
 assert.ok(Math.abs(C.fair(-110)-C.implied(-110)/C.ASSUMED_MARGIN)<1e-12);
 assert.ok(Math.abs(C.fair(-150,130)-C.implied(-150)/(C.implied(-150)+C.implied(130)))<1e-12);
 assert.equal(C.fair(50),null);
 // 18 of 20 past games cleared 50.5: v1 said (18+1)/22 = 86%; v2 stays near the market.
 const hot=history.map((r,i)=>({...r,stats:{rushingYards:i<2?40:60}}));
 const p=C.project(quote,hot,athlete,g,now,20,-110);
 assert.equal(p.features.hits,18);assert.ok(Math.abs(p.model_probability-(18+80*.5)/(20+80))<1e-12);
 assert.ok(p.model_probability<.6&&p.model_probability>.5);assert.equal(p.features.market_probability,.5);
 assert.equal(p.features.market_weight,C.MARKET_WEIGHT);assert.equal(p.features.opposite_price,-110);
 assert.match(p.features.method,/No-vig market price/);
 // Same record, no opposite price: the side's own price less the assumed margin.
 const q=C.project(quote,hot,athlete,g,now);assert.ok(Math.abs(q.features.market_probability-C.implied(-110)/C.ASSUMED_MARGIN)<1e-12);assert.equal(q.features.opposite_price,null);
 // A player who never cleared the line still is not called a lock either way.
 const cold=C.project(quote,history.map(r=>({...r,stats:{rushingYards:10}})),athlete,g,now,20,-110);
 assert.ok(cold.model_probability>.35&&cold.model_probability<.5);
});
test('v2 picks only within 24 hours of the start and pairs each quote with its opposite side',()=>{
 assert.equal(C.captureOpen(g,now),true);
 const far={...g,date:new Date(now+30*3600000).toISOString()};
 assert.equal(C.captureOpen(far,now),false);assert.equal(C.project(quote,history,athlete,far,now),null);
 const under={...quote,side:'under',price:-120},alt={...quote,line:60.5,side:'under',price:-200},other={...quote,provider:'FanDuel',side:'under',price:-105};
 assert.equal(C.opposite(quote,[quote,alt,other,under]),-120);assert.equal(C.opposite(under,[quote,under]),-110);assert.equal(C.opposite(quote,[quote]),null);
});
test('legacy v1 picks keep their own record',()=>{
 const base={captured_at:new Date(now).toISOString(),starts_at:g.date};
 const rows=[{...base,model_version:'props-v1',result:'win',price:-110},{...base,model_version:'props-v1',result:'loss',price:-110},{...base,model_version:'props-v2',result:'win',price:100}];
 assert.equal(C.performance(rows).n,1);assert.equal(C.performance(rows).profit,1);
 const old=C.performance(rows,'props-v1');assert.equal(old.n,2);assert.equal(old.wins,1);
});
test('v354 college football has no prop feed: labelled, never scanned; other leagues still scan',()=>{
 assert.equal(C.feedAvailable('cfb'),false);assert.match(C.NO_FEED.cfb,/college player prop lines/);
 for(const s of ['nfl','nba','mlb'])assert.equal(C.feedAvailable(s),true);
 assert.ok(C.SPORTS.includes('cfb'),'cfb stays a valid sport for discovery and the database check');
 const src=fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/sports-hub-props/index.ts'),'utf8');
 const guard=src.indexOf("if(!C.feedAvailable(job.sport))"),fetchAt=src.indexOf('await gameNow(job)');
 assert.ok(guard>0&&guard<fetchAt,'worker closes no-feed rows before any source fetch');
 assert.match(src,/coverage_status:'no_source',coverage_note:C\.NO_FEED\[sport\],next_poll_at:null/);
});
test('v354 an unpublished odds page before the start is waiting for lines, not a source error',()=>{
 const at=Date.parse('2026-11-08T02:00:00Z'),game={date:'2026-11-09T00:30:00Z'};
 assert.equal(C.pageNotPosted(Error('Source 404'),game,at),true);
 assert.equal(C.pageNotPosted(Error('Source 503'),game,at),false);
 assert.equal(C.pageNotPosted(Error('Source 404'),{date:'2026-11-08T01:00:00Z'},at),false,'after the start a 404 stays an error');
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const C=require('../supabase/functions/_shared/prop-model.js');
const fixtures=require('./fixtures/prop-final-boxscores.json').cases;
function sample(sport,athlete,market,line=.5,side='over'){
 const data=structuredClone(fixtures[sport].summary),co=data.header.competitions[0];
 const team=data.boxscore.players.find(t=>t.statistics.some(c=>c.athletes.some(a=>a.athlete.id===athlete)));
 const game={id:data.header.id,sport,date:co.date,state:'post',completed:true,status:'Final'};
 const pick={id:9,event_id:game.id,sport,team_id:team.team.id,athlete_id:athlete,market,line,side,starts_at:game.date,model_version:C.VERSION,result:'pending',price:165};
 return {data,game,pick};
}
test('real delayed MLB game logs settle both stuck RBI picks from the final box score',()=>{
 for(const id of ['4872595','5136929']){
  const {data,game,pick}=sample('mlb',id,'RBIs');
  assert.equal(C.settle(pick,game,[]),null);
  assert.deepEqual(C.settle(pick,game,[],false,data),{result:'loss',actual:0,reason:'Final player box score'});
  assert.equal(C.settle({...pick,side:'under'},game,[],false,data).result,'win');
  assert.equal(C.settle({...pick,line:0},game,[],false,data).result,'push');
 }
});
test('box scores require a final, matching game, team, player and timestamp',()=>{
 const {data,game,pick}=sample('mlb','4872595','RBIs');
 for(const mutate of [
  d=>{d.header.id='other';},
  d=>{d.header.competitions[0].id='other';},
  d=>{d.header.competitions[0].status.type.completed=false;},
  d=>{d.header.competitions[0].status.type.state='in';},
  d=>{d.header.competitions[0].date='2026-10-08T20:00Z';},
  d=>{d.boxscore.players.find(t=>t.team.id===pick.team_id).team.id='other';},
  d=>{d.header.competitions[0].competitors=[];},
 ]){const changed=structuredClone(data);mutate(changed);assert.equal(C.settle(pick,game,[],false,changed),null);}
 assert.equal(C.settle(pick,{...game,id:'other'},[],false,data),null);
 assert.equal(C.settle({...pick,athlete_id:'missing'},game,[],false,data),null);
 assert.equal(C.settle(pick,{...game,state:'in',completed:false},[],false,data),null);
 assert.equal(C.settle(pick,{...game,status:'Postponed'},[],false,data).result,'void');
});
test('missing stats stay pending, explicit DNP voids, and available logs retain precedence',()=>{
 const {data,game,pick}=sample('mlb','4872595','RBIs');
 const cat=data.boxscore.players.find(t=>t.team.id===pick.team_id).statistics.find(c=>c.type==='batting');
 const row=cat.athletes.find(a=>a.athlete.id===pick.athlete_id);
 for(const value of ['—','',null]){row.stats[cat.keys.indexOf('RBIs')]=value;assert.equal(C.settle(pick,game,[],false,data),null);}
 row.didNotPlay=true;assert.equal(C.settle(pick,game,[],false,data).result,'void');
 row.didNotPlay=false;
 assert.deepEqual(C.settle(pick,game,[{id:pick.event_id,stats:{RBIs:2}}],false,data),{result:'win',actual:2,reason:'Final player game log'});
});
test('real NFL/CFB completions and attempts and NBA rebounds/combos use the box-score keys',()=>{
 for(const [sport,id,market,expected] of [
  ['nfl','2577417','completions',32],['nfl','2577417','passingAttempts',45],
  ['nfl','2577417','passingYards',335],['nfl','2577417','passingTouchdowns',1],
  ['nfl','4361579','rushingAttempts',19],['nfl','4361579','rushingYards',62],
  ['nfl','4241389','receptions',17],['nfl','4241389','receivingYards',189],
  ['cfb','5079653','completions',15],['cfb','5079653','passingAttempts',26],
  ['nba','4222252','points',18],['nba','4222252','totalRebounds',12],
  ['nba','4222252','assists',3],['nba','4222252','threes',0],
  ['nba','4222252','pra',33],['nba','4222252','pointsRebounds',30],
  ['nba','4222252','pointsAssists',21],['nba','4222252','reboundsAssists',15],
 ]){const {data,game,pick}=sample(sport,id,market);assert.equal(C.settle(pick,game,[],false,data)?.actual,expected,`${sport} ${market}`);}
});
test('MLB batting and pitching stay separate and linked final at-bats resolve total bases',()=>{
 for(const [id,bases] of [['4872595',0],['5136929',2],['40854',4]]){
  const {data,game,pick}=sample('mlb',id,'totalBases');
  assert.equal(C.settle(pick,game,[],false,data)?.actual,bases);
  if(bases){data.plays=[];assert.equal(C.settle(pick,game,[],false,data),null);}
 }
 const {data,game,pick}=sample('mlb','33856','pitcherOuts');
 assert.equal(C.settle(pick,game,[],false,data)?.actual,6);
 assert.equal(C.settle({...pick,market:'pitcherStrikeouts'},game,[],false,data)?.actual,1);
 const cat=data.boxscore.players.find(t=>t.team.id===pick.team_id).statistics.find(c=>c.type==='pitching');
 const row=cat.athletes.find(a=>a.athlete.id===pick.athlete_id);
 row.stats[cat.keys.indexOf('fullInnings.partInnings')]='5.2';
 assert.equal(C.settle(pick,game,[],false,data)?.actual,17);
 row.stats[cat.keys.indexOf('fullInnings.partInnings')]='5.3';
 assert.equal(C.settle(pick,game,[],false,data),null);
 assert.equal(C.settle({...pick,market:'hits'},game,[],false,data),null);
});
test('total bases reject incomplete, duplicate or wrong-player at-bat evidence',()=>{
 for(const mutate of [
  d=>{const a=d.boxscore.players.find(t=>t.team.id==='4').statistics.find(c=>c.type==='batting').athletes.find(a=>a.athlete.id==='5136929');d.plays=d.plays.filter(p=>p.id!==a.atBats[0].playId);},
  d=>{for(const p of d.plays)p.participants=[];},
  d=>{const c=d.boxscore.players.find(t=>t.team.id==='4').statistics.find(c=>c.type==='batting');const a=c.athletes.find(a=>a.athlete.id==='5136929');a.atBats.push(a.atBats[0]);},
 ]){
  const {data,game,pick}=sample('mlb','5136929','totalBases');
  mutate(data);
  assert.equal(C.settle(pick,game,[],false,data),null);
 }
});
test('worker grades through failed game-log requests, preserves snapshots and safely retries',async()=>{
 const {data,game,pick}=sample('mlb','4872595','RBIs');
 const job={sport:'mlb',event_id:game.id,starts_at:game.date,game:{...game,season:2026,seasonType:3}};
 const stored={...pick,captured_at:'2026-10-07T05:42:01.168Z'},patches=[];let handler,claimed=false,logCalls=0;
 const source=fs.readFileSync(require.resolve('../supabase/functions/sports-hub-props/index.ts'),'utf8').replace(/^import .*;\n/gm,'');
 const context={SportsHubPropsCore:C,console:{error(){},warn(){}},URLSearchParams,AbortSignal,Response,Date,
  Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://db.test':'test-only'},serve:fn=>{handler=fn;}},
  fetch:async(url,init={})=>{
   const u=new URL(url);
   if(u.pathname.endsWith('/summary'))return Response.json(data);
   if(u.pathname.includes('/gamelog')){logCalls++;return new Response('unavailable',{status:503});}
   if(u.pathname.endsWith('/rpc/claim_prop_game')){if(claimed)return Response.json([]);claimed=true;return Response.json([job]);}
   if(u.pathname.endsWith('/prop_picks')){
    if(init.method==='PATCH'){const patch=JSON.parse(init.body);patches.push(patch);Object.assign(stored,patch);return Response.json([stored]);}
    return Response.json(u.searchParams.get('result')==='eq.pending'&&stored.result!=='pending'?[]:[stored]);
   }
   if(u.pathname.endsWith('/prop_games')){Object.assign(job,JSON.parse(init.body));return Response.json([job]);}
   if(u.pathname.endsWith('/prop_runs'))return Response.json([]);
   throw Error('Unexpected request '+url);
  }};
 vm.runInNewContext(stripTypeScriptTypes(source),context);
 const invoke=()=>handler({method:'POST',json:async()=>({mode:'worker'})});
 let result=await (await invoke()).json();
 assert.equal(result.coverage_status,'settled');assert.equal(result.next_poll_at,null);
 assert.equal(stored.result,'loss');assert.equal(stored.actual,0);assert.equal(stored.settlement_note,'Final player box score');
 assert.equal(job.game.completed,true);assert.equal(logCalls,1);assert.equal(patches.length,1);
 assert.deepEqual(Object.keys(patches[0]).sort(),['actual','result','settled_at','settlement_note']);
 assert.equal(stored.captured_at,'2026-10-07T05:42:01.168Z');assert.equal(stored.line,.5);
 claimed=false;result=await (await invoke()).json();
 assert.equal(result.coverage_status,'settled');assert.equal(patches.length,1);
});

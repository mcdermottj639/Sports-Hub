const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../supabase/functions/_shared/football-research-core.js');
const at='2026-09-30T19:00:00Z';
const fpi={requestedSeason:{year:2026},lastUpdated:'2026-09-30T08:00Z',categories:[{name:'fpi',names:['rank','fpi']}],teams:[{team:{id:'1'},categories:[{name:'fpi',values:[1,20]}]},{team:{id:'2'},categories:[{name:'fpi',values:[2,12]}]}]};
test('FPI uses named metadata, season and pre-observation update, never mixed scales',()=>{
 const ratings=C.fpi(fpi,2026,at);assert.equal(C.collegeMargin(ratings,'1','2',false),11);assert.equal(C.collegeMargin(ratings,'1','2',true),8);assert.equal(C.collegeMargin(ratings,'1','3',false),null);
 for(const data of [{...fpi,requestedSeason:{year:2025}},{...fpi,lastUpdated:'2026-10-01T08:00Z'},{...fpi,lastUpdated:'2026-09-01T08:00Z'}])assert.equal(C.fpi(data,2026,at).available,false);
});
test('NFL depth is never confirmed starting or healthy merely because injuries are empty',()=>{
 const depth={team:{id:'1'},season:{year:2026},timestamp:at,depthchart:[{positions:{qb:{position:{abbreviation:'QB'},athletes:[{id:'99',displayName:'Quarterback',injuries:[]}]}}}]};
 const injuries={season:{year:2026},timestamp:at,injuries:[]};
 assert.equal(C.quarterback(depth,injuries,'1',2026,at).confirmedStarter,false);
 assert.match(C.quarterback(depth,null,'1',2026,at).status,/unavailable/);
 injuries.injuries=[{id:'1',injuries:[{athlete:{links:[{href:'https://www.espn.com/nfl/player/_/id/99/name'}]},date:at,status:'Questionable'}]}];
 assert.equal(C.quarterback(depth,injuries,'1',2026,at).status,'Questionable');
 assert.equal(C.quarterback({...depth,timestamp:'2026-09-01T00:00Z'},injuries,'1',2026,at).name,null);
});
test('windows exclude kickoff and preserve early/near distinction',()=>{
 assert.equal(C.phase('2026-09-30T21:00Z',at),'early');assert.equal(C.phase('2026-09-30T20:30Z',at),'near');assert.equal(C.phase(at,at),null);assert.equal(C.phase('bad',at),null);
});
test('postseason merge preserves regular season, deduplicates by event and accepts empty playoffs',()=>{
 const regular={events:[{id:'1',date:'2026-09-20'},{id:'2',date:'2026-09-21'}]},post={events:[{id:'2',date:'2026-09-21'},{id:'3',date:'2026-09-30'}]};
 assert.equal(C.mergeSchedules(regular,post).events.length,3);assert.equal(C.mergeSchedules(regular,{events:[]}).events.length,2);
});
test('human review is a separately frozen forecast and rejects postgame or missing values',()=>{
 const row={event_id:'x',starts_at:'2026-09-30T21:00Z',captured_at:'2026-09-30T18:00Z',snapshot:{research:{phase:'early',baseline:{margin:6,total:40,home:true}}}};
 const saved=C.humanReview(row,{margin:-2,total:50,reason:'QB availability',factors:['QB']},at);assert.deepEqual(saved.combined,{margin:2,total:45});assert.equal(row.snapshot.research.baseline.margin,6);
 assert.throws(()=>C.humanReview(row,{margin:4,total:45,reason:'Quarterback out'},'2026-09-30T21:00Z'));
 assert.throws(()=>C.humanReview(row,{margin:'',total:45,reason:'Quarterback out'},at));
});
test('research collector freezes all markets, exact side prices and no invented calibration',async()=>{
 const {researchRows}=await import('../supabase/functions/sports-hub-ai/football-research.ts');
 const g={id:'x',state:'pre',date:new Date(Date.now()+3*3600000).toISOString(),observedAt:new Date().toISOString(),home:{id:'1',name:'Home',abbr:'H'},away:{id:'2',name:'Away',abbr:'A'}};
 const p={home:true,p:.6,margin:4,total:43,quality:[],features:{}},o={spread:-3,ou:44,hML:-150,aML:130,hSpreadPrice:-110,aSpreadPrice:-105,overPrice:-108,underPrice:-112,provider:'book'};
 const rows=researchRows('cfb',g,p,o,{candidateMargin:-5},'test');assert.equal(rows.length,3);assert.ok(rows.every(r=>r.tier===null&&r.model_probability===null&&r.model_version===C.VERSION+'-early'));
 assert.equal(rows[1].selection_home,false);assert.equal(rows[1].line,-3);assert.equal(rows[1].price,-105);assert.equal(rows[1].snapshot.research.baseline.margin,4);assert.equal(rows[2].price,-112);
 assert.deepEqual(researchRows('cfb',{...g,date:new Date(Date.now()-1).toISOString()},p,o,{},'test'),[]);
 const near={...g,date:new Date(Date.now()+89*60000).toISOString(),observedAt:new Date(Date.now()-5*60000).toISOString()};assert.deepEqual(researchRows('cfb',near,p,o,{},'test'),[]);
});
test('paired baseline and human grading uses frozen market line, not winner accuracy',()=>{
 const sandbox={SportsHubFootballResearch:C};sandbox.globalThis=sandbox;vm.runInNewContext(fs.readFileSync(require.resolve('../football-development.js'),'utf8'),sandbox);
 const row={market:'spread',line:-7,result:'loss',final_home_score:24,final_away_score:20};
 assert.equal(sandbox.SportsHubFootballDevelopment.resultFor(row,{margin:3,total:45}),'win');assert.equal(sandbox.SportsHubFootballDevelopment.resultFor(row,{margin:10,total:45}),'loss');
 assert.equal(C.grade('total','OVER',null,44,{home:24,away:20}),'push');
});
test('research rows remain outside the official model query; football total promotion excluded',()=>{
 const cloud=fs.readFileSync(require.resolve('../cloud-ai.js'),'utf8'),app=fs.readFileSync(require.resolve('../app.js'),'utf8');assert.match(cloud,/model_version=eq.v239/);assert.match(app,/live.filter\(\(r\) => r.tot && !r.tot.researchOnly\)/);assert.match(app,/tier: sport === 'mlb' \?/);assert.match(app,/FootballDevelopment\?\.mount\(target, sport\)/);
});
test('browser postseason profile actually uses current regular-season history, not prior-year fallback',async()=>{
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8'),calls=[];
 const ev=(id,date,home,away)=>({id,date,season:{type:2},competitions:[{status:{type:{completed:true}},competitors:[{team:{id:'1'},homeAway:'home',score:{value:home}},{team:{id:'2'},homeAway:'away',score:{value:away}}]}]});
 const context={SportsHubFootballResearch:C,SITE:'test',LEAGUES:{mlb:{espnPath:'baseball/mlb'}},isPreseasonEv:()=>false,fetchJSON:async(url)=>{calls.push(url);if(url.includes('seasontype=3'))return {events:[]};return {events:Array.from({length:8},(_,i)=>ev(String(i),'2026-09-20T00:00Z',5,2))};}};
 vm.createContext(context);vm.runInContext(source.match(/^async function teamProfile\([^]*?^}/m)[0],context);
 const p=await context.teamProfile('mlb','1','2026-09-30T00:00Z');assert.equal(p.gp,8);assert.equal(p.pdpg,3);assert.equal(p.blended,false);assert.equal(calls.length,2);assert.ok(calls.every(u=>u.includes('season=2026')));
});

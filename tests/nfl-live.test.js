'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
require('../supabase/functions/_shared/football-research-core.js');
const F=require('../supabase/functions/_shared/nfl-football.js');
require('../supabase/functions/_shared/nfl-evidence.js');
const config=require('../supabase/functions/_shared/nfl-football-config.js');
const L=require('../supabase/functions/_shared/nfl-live.js'),math=require('../ai-model-utils.js');
const history=require('../data/nfl-football-live.json');
const at=history.generatedAt,state=F.build(history,at),teams=Object.keys(state.teams),home=teams[0],away=teams[1];
const g={id:'promotion-fixture',state:'pre',date:new Date(Date.parse(at)+2*864e5).toISOString(),season:history.currentSeason,seasonType:2,home:{id:'h',name:'Home',abbr:home},away:{id:'a',name:'Away',abbr:away}};
const depth=(id,abbr)=>({team:{id},season:{year:g.season},timestamp:at,depthchart:[{positions:{qb:{position:{abbreviation:'QB'},athletes:[{id:Object.keys(history.qbIdentities).find(k=>history.qbIdentities[k].id===state.teams[abbr].lastQB),displayName:abbr+' QB'}]}}}]});
const inputs={homeDepth:depth('h',home),awayDepth:depth('a',away),injuries:{timestamp:at,season:{year:g.season},injuries:[]},history,summary:{}};
const app=fs.readFileSync('app.js','utf8');
test('browser and collector use the exact football candidate, without a baseline blend or old confidence cap',()=>{
 const e=L.evidence(g,inputs,at),p=L.projection(e,g,at),browser=L.browser(e,g,at);
 assert.equal(e.candidate.available,true);assert.ok(p);assert.equal(p.margin,e.candidate.margin);assert.equal(p.total,e.candidate.total);assert.equal(p.p,e.candidate.probHome);
 assert.equal(browser.projMargin,p.margin);assert.equal(browser.projTotal,p.total);assert.equal(browser.probHome,p.p);assert.equal(browser.modelVersion,L.VERSION);
 assert.equal(L.projection({...e,candidate:{...e.candidate,probHome:.94}},g,at).p,.94);
 assert.equal(p.promotion.statisticalGatePassed,false);
});
test('uncertain QBs, missing evidence, stale observations and kickoff never become official fallback picks',()=>{
 const e=L.evidence(g,inputs,at),injured=structuredClone(inputs);
 injured.injuries.injuries=[{id:'h',injuries:[{athlete:{id:inputs.homeDepth.depthchart[0].positions.qb.athletes[0].id},status:'Out',date:at}]}];
 const withheld=L.evidence(g,injured,at);assert.equal(withheld.candidate.available,false);assert.equal(L.projection(withheld,g,at),null);assert.equal(L.browser(withheld,g,at),null);
 for(const bad of [null,{...e,at:'bad'},{...e,at:new Date(Date.parse(at)-6*60000).toISOString()},{...e,at:new Date(Date.parse(at)+1000).toISOString()}])assert.equal(L.projection(bad,g,at),null);
 assert.equal(L.projection(e,{...g,state:'in'},at),null);assert.equal(L.projection(e,{...g,date:at},at),null);
});
test('the actual browser NFL entry point cannot reach the old score/record path',async()=>{
 let calls=0;const c=vm.createContext({SportsHubNFLLiveClient:{predict:async game=>{calls++;return {modelVersion:L.VERSION,projMargin:game.home.id==='h'?7:0};}},teamProfile:()=>{throw Error('Legacy profile must not run');}});
 vm.runInContext(app.match(/^async function computePregamePrediction\([^]*?^}/m)[0],c);
 assert.equal((await c.computePregamePrediction('nfl',g)).projMargin,7);assert.equal(calls,1);
 c.SportsHubNFLLiveClient.predict=async()=>null;assert.equal(await c.computePregamePrediction('nfl',g),null);
});
test('official collector saves the new version, all available markets and model evidence; withheld creates no rows',()=>{
 const core=require('../supabase/functions/_shared/betting-signals-core.js');
 const c=vm.createContext({Date,Number,SPORTS:[],APP_VERSION:'v276',MODEL_VERSION:'v239',modelVersionFor:L.versionFor,SportsHubSignalsCore:core,
  american:math.american,implied:math.implied,ATS_EDGE_MIN:{nfl:2},TOTAL_MIN:{nfl:4},TOTAL_MAX:{nfl:14}});
 const source=fs.readFileSync('supabase/functions/sports-hub-ai/index.ts','utf8');
 for(const name of ['odds','marketProb','pickPrice','tierFor','slateDate','fairProbability','rowBase','rowsFor']){
  const start=source.indexOf('function '+name+'('),next=source.indexOf('\n',start);
  let end=next,script;
  while(!script){try{script=new vm.Script(stripTypeScriptTypes(source.slice(start,end)));}catch(_){end=source.indexOf('\n',end+1);if(end<0)throw Error(name);}}
  script.runInContext(c);
 }
 const game={...g,date:new Date(Date.now()+864e5).toISOString(),odds:{provider:{name:'Book'},spread:-3,overUnder:44,homeTeamOdds:{moneyLine:-150},awayTeamOdds:{moneyLine:130}}};
 const p={modelVersion:L.VERSION,home:true,p:.7,conf:70,margin:8,total:50,quality:[],features:{football:{marker:'shared'}},promotion:{mode:'owner-selected'}};
 const small=c.rowsFor('nfl',game,{...p,p:.51,margin:3.1,total:44.1});assert.equal(small.length,3);assert.equal(small[0].tier,null);
 const rows=c.rowsFor('nfl',game,p);assert.equal(rows.length,3);assert.ok(rows.every(r=>r.model_version===L.VERSION));
 assert.equal(rows.find(r=>r.market==='total').snapshot.researchOnly,false);assert.equal(rows.find(r=>r.market==='spread').projection,8);
 assert.equal(rows[0].snapshot.forecast.total,50);assert.equal(rows[0].snapshot.features.football.marker,'shared');
 assert.equal(rows[0].model_probability,.7);assert.equal(rows[1].model_probability,null);assert.equal(c.rowsFor('nfl',game,null).length,0);
 // Reproduce TB @ DAL: the backup-QB assumption must accompany all markets.
 const provisional={...p,margin:4.2,total:47.8,quality:['Provisional forecast'],features:{football:{candidate:{provisional:true,assumptions:[{text:'Assumes backup starts'}]}}}};
 const affected={...game,home:{...game.home,abbr:'DAL'},away:{...game.away,abbr:'TB'},odds:{...game.odds,spread:-8.5,overUnder:47.5}};
 const recovered=c.rowsFor('nfl',affected,provisional);
 assert.equal(recovered.length,3);assert.equal(recovered[1].selection,'TB +8.5');assert.equal(recovered[2].selection,'OVER 47.5');
 assert.ok(recovered.every(r=>r.quality.includes('Provisional forecast')&&r.snapshot.features.football.candidate.assumptions[0].text==='Assumes backup starts'));
 assert.equal(c.rowsFor('nfl',affected,{...provisional,quality:['Provisional forecast','Incomplete team history']}).length,1);
 assert.equal(c.rowsFor('nfl',affected,{...provisional,features:{}}).length,1);
 assert.equal(c.rowsFor('cfb',affected,provisional).length,1);
 assert.equal(c.rowsFor('nfl',affected,{...provisional,margin:NaN,total:NaN}).length,1);
 assert.equal(c.rowsFor('nfl',{...affected,odds:null},provisional).length,1);
});
test('official results select current versions per sport and exclude legacy NFL plus research rows',()=>{
 const q={at:'2026-10-03T06:00Z',start:'2026-10-04T17:00Z',price:-110,prob:.6};
 const rows=[{s:'nfl',c:1,q:{...q,v:L.VERSION}},{s:'nfl',c:0,q:{...q,v:'v239'}},{s:'nfl',c:0,q:{...q,v:F.VERSION+'-early'}},{s:'cfb',c:1,q:{...q,v:'v239'}}];
 const result=math.evaluate(rows,L.versionFor);assert.equal(result.n,2);assert.equal(result.w,2);assert.equal(result.legacy,2);
});
test('kickoff recovery refuses the old cached engine and restores only a saved new-engine forecast',()=>{
 const values=new Map(),root={localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}};root.globalThis=root;vm.runInNewContext(fs.readFileSync('forecast-lock.js','utf8'),root);
 const lock=root.SportsHubForecastLock;const p=L.browser(L.evidence(g,inputs,at),g,at);
 lock.capture('nfl',g,{...p,modelVersion:'v239'},null,{},Date.parse(at));assert.equal(lock.read('nfl',g,L.VERSION),null);
 const q={v:L.VERSION,at,start:g.date,home:true,prob:.6,forecast:{margin:4.7,total:46.1},cloud:true};
 const saved=lock.recover('nfl',{...g,state:'in'},{[g.id]:{s:'nfl',q}},L.VERSION);
 assert.equal(saved.prediction.modelVersion,L.VERSION);assert.equal(saved.prediction.projMargin,4.7);assert.equal(saved.prediction.projTotal,46.1);
});

test('provisional forecasts reach browser and collector with identical values and evidence',()=>{
 const changed=structuredClone(inputs);
 changed.injuries.injuries=[{id:'h',injuries:[{athlete:{id:inputs.homeDepth.depthchart[0].positions.qb.athletes[0].id},status:'Questionable',date:at}]}];
 const e=L.evidence(g,changed,at),p=L.projection(e,g,at),browser=L.browser(e,g,at);
 assert.ok(e.candidate.provisional);assert.ok(p);assert.ok(browser.provisional);assert.equal(p.margin,browser.projMargin);assert.equal(p.p,browser.probHome);assert.equal(p.features.football.candidate.availabilityPolicy,'provisional-v1');assert.match(browser.notes.join(' '),/Questionable/);
});

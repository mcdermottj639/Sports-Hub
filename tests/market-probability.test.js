const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../supabase/functions/_shared/market-probability.js');
const config=require('../supabase/functions/_shared/market-probability-config.js');
const math=require('../ai-model-utils.js');
const model={n:20,mean:0,sd:10,trainedThrough:'2026-09-01T00:00:00Z'},at='2026-09-30T20:00:00Z';
const cfg={version:'test',models:{nfl_spread:model,nfl_total:model}};
const args={sport:'nfl',market:'spread',projection:3,line:-3,home:true,at};
test('Student t implementation matches independent known values',()=>{for(const [x,df,want] of [[0,4,.5],[1,1,.75],[2.2281388519649385,10,.975],[2.7764451051977987,4,.975],[-2.093024054408263,19,.025]])assert.ok(Math.abs(P.tCDF(x,df)-want)<1e-10);});
test('integer lines model pushes; half-point lines cannot push; sides sum to one',()=>{const h=P.estimate(args,cfg),a=P.estimate({...args,home:false},cfg);assert.ok(h.push>0);assert.ok(Math.abs(h.prob-.5)<1e-10);assert.ok(Math.abs(h.win+a.win+h.push-1)<1e-10);assert.equal(h.push,a.push);assert.ok(P.estimate({...args,line:-3.5},cfg).push<1e-12);assert.ok(P.estimate({...args,projection:8},cfg).prob>h.prob);});
test('over/under probabilities complement, with nonnegative-score support',()=>{const over=P.estimate({...args,market:'total',projection:45,line:45,side:'OVER'},cfg),under=P.estimate({...args,market:'total',projection:45,line:45,side:'UNDER'},cfg);assert.ok(Math.abs(over.prob+under.prob-1)<1e-10);assert.ok(Math.abs(over.win+under.win+over.push-1)<1e-10);});
test('no future-trained, missing-input, unsupported or insufficient-sample estimates',()=>{assert.equal(P.estimate({...args,at:model.trainedThrough},cfg),null);assert.equal(P.estimate({...args,projection:null},cfg),null);assert.equal(P.estimate({...args,sport:'nba'},cfg),null);assert.equal(P.estimate(args,{models:{nfl_spread:{...model,n:4}}}),null);});
test('fit uses forecast errors and excludes invalid or post-start snapshots',()=>{const rows=Array.from({length:6},(_,i)=>({projection:10,market:'spread',final_home_score:20+i,final_away_score:10,result:'win',captured_at:'2026-08-01',starts_at:'2026-08-02',graded_at:'2026-08-03'}));const f=P.fit([...rows,{...rows[0],projection:999,captured_at:'2026-08-04'}]);assert.equal(f.n,6);assert.equal(f.mean,2.5);assert.ok(Math.abs(f.sd-Math.sqrt(3.5))<1e-10);});
test('validation never trains on held-out game or results that were unavailable at capture',()=>{const report=require('../data/market-probability-validation.json'),sample=require('../data/market-probability-sample.json');for(const [key,m] of Object.entries(report.markets)){assert.equal(m.trainingN,config.models[key].n);for(const r of m.heldOut){assert.ok(Date.parse(r.trainEnd)<Date.parse(r.at));const train=sample.rows.filter(q=>`${q.sport}_${q.market}`===key&&Date.parse(q.graded_at)<Date.parse(r.at)&&q.event_id!==r.event);assert.equal(train.length,r.trainN);}}});
test('new probability timestamps guard retrospective scoring',()=>{const q={v:'v239',at:'2026-09-01',start:'2026-09-02',prob:.6,probability:{at:'2026-09-03',trainedThrough:'2026-08-01'}};assert.equal(math.evaluate([{q,c:1}],'v239').probabilityN,0);assert.equal(math.evaluate([{q:{...q,probability:{at:'2026-09-01T12:00:00Z',trainedThrough:'2026-08-01'}},c:1}],'v239').probabilityN,1);});
test('pending enrichment saves timestamped probability without changing forecast, odds or result',async()=>{
 const {stripTypeScriptTypes}=require('node:module');const src=fs.readFileSync('supabase/functions/sports-hub-ai/index.ts','utf8');
 const writes=[],date=new Date(Date.now()+864e5).toISOString(),r={id:1,sport:'nfl',market:'spread',projection:5,line:-3,selection_home:true,selection:'HOME -3',starts_at:date,snapshot:{priceCapturedAt:'kept'}};
 const c=vm.createContext({Date,encodeURIComponent,MODEL_VERSION:'v239',SportsHubMarketProbability:{estimate:a=>P.estimate(a,config)},db:async(path,init)=>{if(init){writes.push({path,body:JSON.parse(init.body)});return [];}return [r];}});
 vm.runInContext(stripTypeScriptTypes(src.match(/^async function enrichProbabilities\([^]*?^}/m)[0]),c);
 await c.enrichProbabilities({id:'event',state:'pre',date});assert.equal(writes.length,1);const b=writes[0].body;assert.ok(b.model_probability>0&&b.model_probability<1);assert.equal(b.snapshot.priceCapturedAt,'kept');assert.equal(b.projection,undefined);assert.equal(b.price,undefined);assert.equal(b.result,undefined);assert.ok(Date.parse(b.snapshot.probability.at)<Date.parse(date));
 writes.length=0;await c.enrichProbabilities({id:'event',state:'post',date});assert.equal(writes.length,0);
});
test('browser preview and collector share the same probability and expose experimental status',()=>{
 const source=fs.readFileSync('app.js','utf8');const c=vm.createContext({Date,gameState:()=> 'scheduled',SportsHubMarketProbability:{estimate:a=>P.estimate(a,config)}});
 for(const name of ['marketProbabilityFor','marketProbabilityHTML'])vm.runInContext(source.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'))[0],c);
 const r={sport:'nfl',g:{},p:{projMargin:5,projTotal:45},ats:{qualifies:true,home:true,homeSpread:-3}};
 const p=c.marketProbabilityFor(r,'spread');assert.ok(p&&p.prob>0);assert.equal(p.prob,P.estimate({sport:'nfl',market:'spread',projection:5,line:-3,home:true,at:p.at},config).prob);assert.match(c.marketProbabilityHTML(p),/Experimental/);assert.match(c.marketProbabilityHTML(p),/excluding pushes/);
});
test('probability scripts load before application and cover every supported market',()=>{
 const html=fs.readFileSync('index.html','utf8');for(const file of ['market-probability-config.js','market-probability.js'])assert.ok(html.indexOf(file)>0&&html.indexOf(file)<html.indexOf('<script src="app.js'));
 assert.deepEqual(Object.keys(config.models).sort(),['cfb_spread','cfb_total','mlb_total','nfl_spread','nfl_total']);
});

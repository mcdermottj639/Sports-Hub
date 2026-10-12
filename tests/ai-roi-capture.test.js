'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const core=require('../supabase/functions/_shared/betting-signals-core.js');
const math=require('../ai-model-utils.js');
const source=fs.readFileSync('supabase/functions/sports-hub-ai/index.ts','utf8');
function load(rows=[]){
 const writes=[];
 const context=vm.createContext({Date,encodeURIComponent,SportsHubSignalsCore:core,MODEL_VERSION:'v239',modelVersionFor:require('../supabase/functions/_shared/nfl-live.js').versionFor,american:math.american,implied:math.implied,pickPrice:(p,o)=>math.priceFor(o,p.home),db:async(path,opts)=>{if(opts){writes.push({path,body:JSON.parse(opts.body)});return [];}return rows;}});
 for(const name of ['odds','enrichPrices','fairProbability']){
  const fn=source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'))[0];
  vm.runInContext(stripTypeScriptTypes(fn),context);
 }
 return {context,writes};
}
const raw={provider:{id:'100',name:'DraftKings'},spread:-3,overUnder:45,moneyline:{home:{close:{odds:'-150'}},away:{close:{odds:'+130'}}},pointSpread:{home:{close:{line:'-3',odds:'-105'}},away:{close:{line:'+3',odds:'-115'}}},total:{over:{close:{line:'o45',odds:'-110'}},under:{close:{line:'u45',odds:'-110'}}}};
const date=new Date(Date.now()+864e5).toISOString();
const game={id:'g',state:'pre',date,home:{abbr:'H'},away:{abbr:'A'},odds:raw};
const row={id:1,event_id:'g',market:'spread',selection_home:false,selection:'A +3',line:-3,starts_at:date,provider:'DraftKings',snapshot:{features:{saved:true}}};
test('collector reads actual nested prices and same-line values',()=>{const {context:c}=load();const o=c.odds(raw,game);assert.equal(o.hML,-150);assert.equal(o.aML,130);assert.equal(o.aSpreadPrice,-115);assert.equal(o.underPrice,-110);assert.equal(o.spread,-3);assert.equal(o.ou,45);});
test('fill frozen away selection at matching line, retaining original snapshot',async()=>{const {context:c,writes}=load([row]);await c.enrichPrices(game);assert.equal(writes.length,1);assert.equal(writes[0].body.price,-115);assert.equal(writes[0].body.snapshot.features.saved,true);assert.ok(Date.parse(writes[0].body.snapshot.priceCapturedAt)<Date.parse(date));assert.equal(writes[0].body.selection,undefined);assert.equal(writes[0].body.model_probability,undefined);assert.match(writes[0].path,/price=is.null.*result=eq.pending.*starts_at=gt/);});
test('never fills prices after kickoff, with changed line, provider or schedule',async()=>{for(const bad of [{...row,line:-3.5},{...row,provider:'Other'},{...row,starts_at:new Date(Date.now()+2*864e5).toISOString()}]){const {context:c,writes}=load([bad]);await c.enrichPrices(game);assert.equal(writes.length,0);}const {context:c,writes}=load([row]);await c.enrichPrices({...game,state:'post'});assert.equal(writes.length,0);await c.enrichPrices({...game,date:new Date(Date.now()-1000).toISOString()});assert.equal(writes.length,0);});
test('fair probability is for selected market and side',()=>{const {context:c}=load(),o=c.odds(raw,game);assert.equal(c.fairProbability('total',null,'UNDER 45',o),.5);assert.ok(c.fairProbability('spread',false,'A +3',o)>.5);assert.ok(c.fairProbability('moneyline',false,'Away',o)<.5);});
test('aggregate separates model probability, odds implied probability and actual ROI',()=>{const q={v:'v239',at:'2026-09-01',start:'2026-09-02'};const e=math.evaluate([{c:1,q:{...q,price:150,prob:.6}},{c:0,q:{...q,price:-110,prob:.7}},{c:1,q:{...q,price:null,prob:.8}}],'v239');assert.equal(e.priced,2);assert.equal(e.roi,.25);assert.ok(Math.abs(e.meanProbability-.7)<1e-10);assert.ok(Math.abs(e.meanImplied-(.4+110/210)/2)<1e-10);});
// Regression: CFB winner picks saved a week early, before any line, carry provider null
// and were never priced (0 of 15 in Oct 2026). They may take the first DraftKings pregame
// price for their frozen side; the forecast and the provider column stay untouched.
const early={id:2,event_id:'g',market:'moneyline',selection_home:false,selection:'Away',line:null,starts_at:date,provider:null,market_probability:null,model_probability:.55,snapshot:{features:{saved:true},odds:null}};
test('null-provider winner pick takes the first DraftKings pregame price',async()=>{const {context:c,writes}=load([early]);await c.enrichPrices(game);assert.equal(writes.length,1);const b=writes[0].body;assert.equal(b.price,130);assert.equal(b.snapshot.priceSource,'espn_first_draftkings_pregame');assert.equal(b.snapshot.priceProvider,'DraftKings');assert.ok(Date.parse(b.snapshot.priceCapturedAt)<Date.parse(date));assert.equal(b.snapshot.features.saved,true);assert.ok(b.market_probability>0&&b.market_probability<.5);for(const k of ['provider','selection','selection_home','model_probability','captured_at','confidence'])assert.equal(b[k],undefined,k);assert.match(writes[0].path,/price=is.null.*result=eq.pending.*starts_at=gt/);});
test('null-provider fill stays strictly pregame, DraftKings-only and winner-only',async()=>{const other={...game,odds:{...raw,provider:{id:'200',name:'Caesars'}}};for(const [r,g] of [[early,other],[early,{...game,state:'in'}],[early,{...game,date:new Date(Date.now()-1000).toISOString()}],[{...early,market:'spread',line:-3,selection:'A +3'},game],[{...early,market:'total',line:45,selection:'UNDER 45'},game]]){const {context:c,writes}=load([r]);await c.enrichPrices(g);assert.equal(writes.length,0);}});
test('null-provider fill keeps an existing market probability',async()=>{const {context:c,writes}=load([{...early,market_probability:.41}]);await c.enrichPrices(game);assert.equal(writes.length,1);assert.equal(writes[0].body.market_probability,undefined);});

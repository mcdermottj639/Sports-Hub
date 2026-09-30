'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../forecast-lock.js'),'utf8');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const start=Date.parse('2026-10-01T20:00:00Z');
const game=()=>({id:'1',date:new Date(start).toISOString(),state:'pre',home:{name:'Home'},away:{name:'Away'}});
const p={conf:63,probHome:.63,homePick:true,projTotal:8.3,projMargin:1.2,winner:{name:'Home'},breakdown:[],notes:[]};
function load(storage=new Map()){
 const root={Date,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
 vm.createContext(root);vm.runInContext(source,root);return {root,lock:root.SportsHubForecastLock,storage};
}
for(const sport of ['mlb','nfl','cfb','nba']) test(`${sport}: pregame updates stop at kickoff and survive reload`,()=>{
 const {lock,storage}=load(),g=game();
 lock.capture(sport,g,p,{ou:7.5},{total:{prob:.6}},start-2000);
 lock.capture(sport,g,{...p,projTotal:8.8},{ou:8},{total:{prob:.65}},start-1000);
 assert.equal(lock.capture(sport,g,{...p,projTotal:12},{ou:11},{},start),null);
 g.state='in';assert.equal(lock.capture(sport,g,p,{ou:14},{},start-500),null);
 const saved=load(storage).lock.read(sport,g);
 assert.equal(saved.prediction.projTotal,8.8);assert.equal(saved.odds.ou,8);assert.equal(saved.probabilities.total.prob,.65);
 saved.prediction.projTotal=20;assert.equal(lock.read(sport,g).prediction.projTotal,8.8);
 g.state='post';assert.equal(lock.read(sport,g).prediction.projTotal,8.8);
});
test('cloud restoration uses valid pregame evidence and never invents missing projections',()=>{
 const {lock}=load(),g=game();g.state='in';
 const q={at:new Date(start-1000).toISOString(),start:g.date,prob:.6,home:false,cloud:true,odds:{ou:8}};
 const records={'1':{s:'mlb',cf:60,q},'1:t':{s:'mlb',q:{...q,line:8,proj:9.2,probability:{prob:.62}}}};
 const saved=lock.recover('mlb',g,records);assert.equal(saved.prediction.probHome,.4);assert.equal(saved.prediction.projTotal,9.2);assert.equal(saved.prediction.projMargin,null);
 assert.equal(saved.source,'cloud');records['1'].q.prob=.9;assert.equal(lock.recover('mlb',g,records).prediction.probHome,.4);
 assert.equal(load().lock.recover('nfl',g,records),null);
 records['1'].q.at=g.date;assert.equal(load().lock.recover('mlb',g,records),null);
 assert.equal(load().lock.recover('mlb',g,{}),null);
});
test('rescheduled game cannot reuse an earlier-start snapshot',()=>{
 const {lock}=load(),g=game();lock.capture('nfl',g,p,{}, {},start-1000);g.date=new Date(start+86400000).toISOString();assert.equal(lock.read('nfl',g),null);
});
test('prediction entry point never computes live/final games and discards a request crossing kickoff',async()=>{
 const {root,lock}=load();let now=start-1000,calls=0;
 root.Date=class extends Date{static now(){return now;}};
 Object.assign(root,{getPending:()=>({}),getTally:()=>({}),normOdds:()=>({ou:8}),atsRead:()=>null,totalRead:()=>null,marketProbabilityFor:()=>null});
 vm.runInContext('let forecastRecoverySync=null;',root);
 for(const name of ['restoreForecast','predictGame','shownOdds'])vm.runInContext(app.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`,'m'))[0],root);
 root.computePregamePrediction=async()=>{calls++;return p;};
 const g=game();await root.predictGame('mlb',g);assert.equal(calls,1);
 g.state='in';const frozen=await root.predictGame('mlb',g);assert.equal(calls,1);assert.equal(frozen.locked,true);assert.equal(frozen.projTotal,8.3);
 assert.equal(root.shownOdds('mlb',g,{ou:22}).info.ou,8);
 g.state='post';await root.predictGame('mlb',g);assert.equal(calls,1);
 const fresh={...game(),id:'2'};root.computePregamePrediction=async()=>{calls++;now=start;return {...p,projTotal:99};};
 assert.equal(await root.predictGame('nfl',fresh),null);assert.equal(lock.read('nfl',fresh),null);
 const missing={...game(),id:'3'};assert.equal(await root.predictGame('nba',missing),null);assert.equal(calls,2);assert.equal(root.shownOdds('nba',missing,{ou:250}).info,null);
});
test('frozen probabilities are restored without estimating from live inputs',()=>{
 const {root}=load();root.SportsHubMarketProbability={estimate(){throw Error('must not estimate live');}};
 vm.runInContext(app.match(/^function marketProbabilityFor\([^]*?^}/m)[0],root);
 assert.equal(root.marketProbabilityFor({p:{locked:true,lockedProbabilities:{total:{prob:.62}}}},'total').prob,.62);
 assert.equal(root.marketProbabilityFor({p:{locked:true}},'spread'),null);
});

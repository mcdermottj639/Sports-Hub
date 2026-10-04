'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const A = require('../ai-model-utils.js');
const version = 'nfl-football-v1';
const base = () => ({s:'nfl', p:'Home', q:{v:version,at:'2026-10-04T15:00:00Z',start:'2026-10-04T17:00:00Z',home:true,price:-110,forecast:{margin:4,total:44},odds:{spread:-3,ou:45},finalHome:24,finalAway:20}});
test('below-threshold forecasts grade independently without creating bets',()=>{
 const r=base();
 assert.equal(A.forecastGrade(r,'spread',version).result,'win');
 assert.equal(A.forecastGrade(r,'total',version).result,'win');
 assert.equal(A.missingBetReason(r,'spread',version),'No qualifying edge');
 assert.equal(A.missingBetReason(r,'total',version),'No qualifying edge');
 assert.equal(A.qualifyingBet(r),false);
 assert.equal(r.a,undefined);assert.equal(r.t,undefined);
});
test('forecast grading handles away sides, losses, pushes and exact-line abstentions',()=>{
 const r=base();r.q.forecast.margin=2;
 assert.equal(A.forecastGrade(r,'spread',version).result,'loss');
 r.q.finalHome=23;assert.equal(A.forecastGrade(r,'spread',version).result,'push');
 r.q.forecast.margin=3;assert.equal(A.forecastGrade(r,'spread',version).result,null);
 r.q.finalHome=25;assert.equal(A.forecastGrade(r,'total',version).result,'push');
 r.q.finalHome=20;assert.equal(A.forecastGrade(r,'moneyline',version).result,'push');
});
test('missing lines still retain score error; null scores never turn into zero',()=>{
 const r=base();r.q.odds.ou=null;
 assert.equal(A.forecastGrade(r,'total',version).status,'Missing pregame line');
 assert.equal(A.forecastGrade(r,'total',version).error,0);
 r.q.finalHome=null;assert.equal(A.forecastGrade(r,'spread',version).status,'Awaiting result');
 assert.equal(A.forecastGrade(r,'spread',version).result,null);
 r.q.forecast.total=null;assert.equal(A.forecastGrade(r,'total',version).status,'Missing pregame projection');
});
test('post-kickoff, wrong-version and rescheduled evidence cannot grade',()=>{
 const r=base();assert.equal(A.forecastGrade(r,'spread','other').result,null);
 assert.equal(A.forecastGrade(r,'spread',version,'2026-10-05T17:00:00Z').result,null);
 r.q.at=r.q.start;assert.equal(A.forecastGrade(r,'spread',version).result,null);
});
test('missing qualifying pick and quality blocks are not disguised as no edge',()=>{
 const r=base();r.q.forecast.margin=9;
 assert.equal(A.missingBetReason(r,'spread',version),'Qualifying pick missing');
 r.q.quality=['Missing starter'];assert.equal(A.missingBetReason(r,'spread',version),'Data quality blocked bet');
 r.q.quality=[];r.q.forecast.total=100;
 assert.equal(A.missingBetReason(r,'total',version),'Data quality blocked bet');
});
test('paper ROI includes only qualifying bets and excludes CFB research totals',()=>{
 const r=base();r.c=1;
 const candidates=[r,{...r,tr:'edge'},{...r,a:1},{...r,t:1,s:'cfb'}];
 const e=A.evaluate(candidates.filter(A.qualifyingBet),version);
 assert.equal(e.n,2);assert.equal(e.priced,2);
 assert.equal(A.qualifyingBet({...r,t:1,q:{...r.q,researchOnly:true}}),false);
});
test('official cloud evidence restores full nonqualifying forecast across devices',()=>{
 const raw={event_id:'1',sport:'nfl',market:'moneyline',model_version:version,selection:'Home',selection_home:true,captured_at:base().q.at,starts_at:base().q.start,result:'win',final_home_score:24,final_away_score:20,snapshot:{forecast:base().q.forecast,odds:base().q.odds}};
 const root={localStorage:{getItem:()=>JSON.stringify({rows:[raw]})}};root.globalThis=root;
 vm.runInNewContext(fs.readFileSync(require.resolve('../cloud-ai.js'),'utf8'),root);
 const r=root.SportsHubCloudAI.maps().tally['1'];
 assert.equal(A.forecastGrade(r,'total',version).result,'win');
 assert.equal(Object.keys(root.SportsHubCloudAI.maps().tally).length,1);
});
test('all-forecast evaluation renders separately from qualifying-bet ROI',()=>{
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
 const start=source.indexOf('function forecastEvaluationHTML('),end=source.indexOf('// Bumped on every view paint',start);
 const r=base();r.c=1;
 const root={AI_MATH:A,modelVersionFor:()=>version,esc:String,SportsHubCloudAI:{maps:()=>({tally:{1:r},pending:{}})}};root.globalThis=root;
 vm.runInNewContext(source.slice(start,end),root);
 const html=root.evaluationHTML('nfl');
 assert.match(html,/All pregame forecasts/);assert.match(html,/Qualifying bets/);assert.match(html,/1W · 0L/);assert.match(html,/0 settled/);
});

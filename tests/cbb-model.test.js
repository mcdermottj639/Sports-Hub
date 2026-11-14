'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const N=require('../supabase/functions/_shared/cbb-model.js'),C=require('../supabase/functions/_shared/cbb-model-config.js');
const A=require('../ai-model-utils.js'),D=require('../desk-core.js'),P=require('../performance-core.js'),L=require('../forecast-lock.js');
const game=(o={})=>({id:'999',date:'2027-01-20T23:00Z',season:2027,seasonType:2,state:'pre',home:{id:'a',rank:1},away:{id:'b'},...o});
const data={generatedAt:'2027-01-20T12:00Z',games:Array.from({length:24},(_,i)=>[String(i),new Date(Date.UTC(2026,10,1+i*2)).toISOString(),2027,i%2?'b':'a',i%2?'a':'b',i%2?68:85,i%2?82:65,false,false,false])};
test('CBB scope includes a ranked opponent and unranked tournament teams; neutral regular games do not expand coverage',()=>{
 assert.equal(N.select([game()]).length,1);
 const ordinary=game({home:{id:'a',rank:99},neutralSite:true});assert.equal(N.select([ordinary]).length,0);
 assert.equal(N.select([game({seasonType:1})]).length,0);
 for(const extra of [{tournamentId:22},{tournamentType:'TRNMNT'},{seasonType:3}]){
  const g={...ordinary,...extra};assert.equal(N.select([g],'tournaments').length,1);assert.equal(N.select([g],'top25').length,0);
 }
});
test('real source forms identify early-season events, conference finals, First Four and NIT',()=>{
 for(const c of [{type:{abbreviation:'TRNMNT'},notes:[{headline:'Players Era Festival'}]},{tournamentId:33,notes:[{headline:'West Coast Conference Tournament - Final'}]},{tournamentId:22,notes:[{headline:"NCAA Men's Basketball Championship - First Four"}]},{tournamentId:21,notes:[{headline:'NIT - 1st Round'}]}]){
  const meta=N.metadata({season:{type:2},competitions:[c]});assert.equal(meta.tournament,true);assert.ok(meta.tournamentLabel.length);
 }
 assert.equal(N.metadata({competitions:[{conferenceCompetition:true,neutralSite:true}]}).tournament,false);
});
test('CBB ratings ignore duplicate, future, same-day unconfirmed-final and wrong-season scores',()=>{
 const at='2027-01-20T12:00Z',state=N.build(data,2027,at,C);
 const more={...data,games:[...data.games,...data.games,["future",'2027-01-20T10:00Z',2027,'a','b',199,1,false],["ancient",'2024-01-01',2024,'a','b',199,1,false]]};
 assert.deepEqual(N.build(more,2027,at,C),state);
 const p=N.predict(state,game());assert.ok(p.margin>0);assert.ok(p.p>.5);assert.ok(p.total>100&&p.total<200);
 assert.equal(N.predict(state,game({season:2026})),null);
});
test('neutral court removes only home advantage and swapping teams reverses the neutral margin',()=>{
 const state=N.build(data,2027,'2027-01-20T12:00Z',C),h=N.predict(state,game()),n=N.predict(state,game({neutral:true}));
 assert.ok(Math.abs(h.margin-n.margin-C.homeCourt)<1e-10);assert.equal(h.total,n.total);
 const swapped=N.predict(state,game({neutralSite:true,home:{id:'b'},away:{id:'a'}}));assert.ok(Math.abs(n.margin+swapped.margin)<1e-8);assert.ok(Math.abs(n.p+swapped.p-1)<1e-6);
});
test('early-season prior is shrunk and sparse new teams withhold instead of guessing',()=>{
 const prior={...data,games:data.games.map(g=>[...g.slice(0,1),g[1].replace('2026','2025'),2026,...g.slice(3)])};
 const state=N.build(prior,2027,'2027-01-20T12:00Z',C);assert.ok(N.predict(state,game()));assert.equal(state.teams.a.n,0);
 assert.equal(N.predict(state,game({away:{id:'unknown'}})),null);
 assert.equal(N.build({games:[]},2027,'2027-01-20T12:00Z',C),null);
});
test('CBB loader refuses started, postponed, preseason, stale or wrong-season evidence',async()=>{
 const g=game({date:'2099-01-20T23:00Z'}),at='2099-01-20T12:00Z';let calls=0;
 for(const v of [{...g,state:'post'},{...g,seasonType:1},{...g,status:'Postponed'}])assert.equal(await N.load(v,async()=>{calls++;return data;},at),null);
 assert.equal(calls,0);assert.equal(await N.load(g,async()=>({...data,season:2027}),at),null);
});
test('CBB display, immutable grading and research-only qualification keep the original forecast',()=>{
 const p=N.predict(N.build(data,2027,'2027-01-20T12:00Z',C),game()),b=N.browser(p,game());assert.equal(b.projMargin,p.margin);assert.equal(b.researchOnly,true);
 const r={s:'cbb',a:true,q:{v:'cbb-v1',at:'2027-01-20T12:00Z',start:game().date,home:true,prob:.7,researchOnly:true,forecast:{margin:6,total:150},odds:{spread:-3.5,ou:148},finalHome:80,finalAway:70}};
 assert.equal(A.forecastGrade(r,'spread','cbb-v1').result,'win');assert.equal(A.qualifyingBet(r),false);assert.equal(A.missingBetReason(r,'spread','cbb-v1'),'Research only');
 const ml={...r,a:false};const restored=L.recover('cbb',game(),{999:ml},'cbb-v1');assert.equal(restored.prediction.researchOnly,true);assert.equal(restored.prediction.projMargin,6);
});
test('CBB routes, watchlist and performance accept only CBB-scoped rows',()=>{
 for(const route of ['#/cbb','#/models/cbb/picks','#/models/cbb/results'])assert.equal(D.hashFor(D.route(route)),route);
 assert.equal(D.group(D.route('#/cbb')),'leagues');assert.equal(D.normalizeWatch([{sport:'cbb',id:'123'}]).length,1);
 const r={event_id:'1',sport:'cbb',market:'moneyline',model_version:'cbb-v1',starts_at:'2027-01-20T23:00Z',captured_at:'2027-01-20T12:00Z'};
 assert.equal(P.select([r,{...r,sport:'nba'}],{sport:'cbb'}).length,1);
});
test('CBB scheduled rows retain ML/spread/total, but never promote research to a betting tier',()=>{
 const src=fs.readFileSync(require.resolve('../supabase/functions/sports-hub-ai/index.ts'),'utf8');
 const fn=src.match(/function rowsFor\([^]*?\n\nconst SB_URL/)[0].split('\n\nconst SB_URL')[0].replace(/:Sport|:any/g,'');
 const ctx={ATS_EDGE_MIN:{cbb:3},TOTAL_MIN:{cbb:6},odds:()=>({spread:-3.5,ou:150}),tierFor:()=>({tier:'best'}),pickPrice:()=>null,rowBase:(...args)=>args};vm.runInNewContext(fn,ctx);
 const rows=ctx.rowsFor('cbb',game(),{home:true,p:.7,margin:8,total:160,quality:[],researchOnly:true});assert.deepEqual(Array.from(rows,r=>r[4]),['moneyline','spread','total']);
 assert.match(src,/tier:sport==='cbb'\?null:tier/);assert.match(src,/researchOnly:sport==='cbb'/);assert.match(src,/SportsHubCBB\.select/);
});
test('chronological CBB replay keeps calibration season before holdout and reports no invented ROI',()=>{
 const v=C.validation;assert.equal(v.trainedSeason,2025);assert.equal(v.holdoutSeason,2026);assert.ok(v.holdout.games>5500);assert.ok(v.requestedCoverage.games>1200);assert.equal(v.bettingROI,null);
 assert.ok(v.holdout.marginMAE<v.holdout.marginBaselineMAE);assert.ok(v.holdout.totalMAE<v.holdout.totalBaselineMAE);
});

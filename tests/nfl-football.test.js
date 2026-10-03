'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const F=require('../supabase/functions/_shared/nfl-football.js'),E=require('../supabase/functions/_shared/nfl-evidence.js'),V=require('../supabase/functions/_shared/nfl-validation.js');
const config=require('../supabase/functions/_shared/nfl-football-config.js');
const history=require('../data/nfl-football-live.json');
const at=history.generatedAt,state=F.build(history,at),teams=Object.keys(state.teams),home=teams[0],away=teams[1];
const game={home,away,date:new Date(Date.parse(at)+2*864e5).toISOString(),season:history.currentSeason};
const identity=gsis=>Object.keys(history.qbIdentities).find(k=>history.qbIdentities[k].id===gsis);
const qb=Object.fromEntries(['home','away'].map(side=>[side,{athleteId:identity(state.teams[game[side]].lastQB),status:'No current restriction found; starter unconfirmed',name:side+' QB'}]));
test('shared play-level features exclude target/future games and deduplicate history',()=>{
 const before=F.features(state,game);const future=structuredClone(history.games.at(-1));future.id='future';future.date=game.date;Object.values(future.sides).forEach(s=>{s.passEPA=1e8;});
 const changed=F.build({...history,games:[...history.games,history.games[0],future]},at);
 assert.deepEqual(F.features(changed,game),before);assert.equal(changed.used,state.used);
});
test('missing, stale, future and wrong-season sources fail closed; zero-game preseason uses priors',()=>{
 assert.equal(F.sourceReady(history,at,history.currentSeason),true);
 assert.equal(F.sourceReady(history,new Date(Date.parse(at)+4*864e5).toISOString(),history.currentSeason),false);
 assert.equal(F.sourceReady(history,new Date(Date.parse(at)-1).toISOString(),history.currentSeason),false);
 assert.equal(F.sourceReady(history,at,history.currentSeason-1),false);
 assert.equal(F.sourceReady({...history,coverage:{expected:0,available:0}},at,history.currentSeason),true);
});
test('available forecast uses frozen fit; missing QB does not invent neutral talent',()=>{
 const p=F.candidate(state,history,game,qb,config,{at});assert.equal(p.available,true);assert.ok(Number.isFinite(p.margin));assert.ok(p.probHome>0&&p.probHome<1);
 const missing=F.candidate(state,history,game,{...qb,home:{status:'unknown'}},config,{at});assert.equal(missing.available,false);assert.equal(missing.margin,null);assert.equal(missing.conditional,null);
 const locked=F.candidate(state,history,{...game,date:at},qb,config,{at});assert.equal(locked.available,false);
});
test('QB changes use difference from the measured lineup and questionable starters get conditional scenarios',()=>{
 const backup=Object.values(state.qbs).find(q=>q.id!==state.teams[home].lastQB&&q.n>100&&identity(q.id));
 const f=F.features(state,game),alt=F.features(state,game,{home:backup.id});
 assert.notEqual(f.qbGap,alt.qbGap);assert.equal(f.passGap,alt.passGap);assert.equal(f.rushGap,alt.rushGap);
 const evidence={...qb,home:{...qb.home,status:'Questionable',backupId:identity(backup.id),backupName:'Backup'}};
 const c=F.candidate(state,history,game,evidence,config,{at});assert.equal(c.available,false);assert.equal(c.decision,'Wait for confirmation');assert.equal(c.scenarios.length,1);assert.equal(c.probHome,null);
 assert.ok(c.uncertainty.margin[0]<=c.conditional.marginRange[0]);assert.ok(c.uncertainty.margin[1]>=c.scenarios[0].marginRange[1]);
});
test('subjective factors do not move model output or trigger automatic promotion',()=>{
 const a=F.candidate(state,history,game,qb,config,{at}),b=F.candidate(state,history,game,qb,config,{at,coaching:{pedigree:99},clutch:100,weather:{temperature:30}});
 assert.equal(a.margin,b.margin);assert.equal(a.total,b.total);assert.equal(a.promotion.eligible,false);
 const later=F.candidate(state,history,game,qb,{...config,selectedThrough:game.date},{at});assert.equal(later.available,false);
});
test('scouting observations require HTTPS source, dates and expiry; never become verified weights',()=>{
 const input={text:'Quarterback mobility looked limited',source:'https://example.com/report',kind:'opinion',category:'QB',expiresAt:game.date};
 const o=F.observation(input,at,game.date);assert.equal(o.numericWeight,0);assert.equal(o.verified,false);
 assert.throws(()=>F.observation({...input,source:'javascript:alert(1)'},at,game.date));
 assert.throws(()=>F.observation({...input,expiresAt:at},at,game.date));assert.throws(()=>F.observation(input,game.date,game.date));
});
test('missing weather stays missing and never borrows another game',()=>{
 assert.equal(E.weather({header:{id:'wrong'},gameInfo:{weather:{temperature:10}}},'target',at).available,false);
 const w=E.weather({header:{id:'target'},gameInfo:{weather:{temperature:60}}},'target',at);assert.equal(w.temperature,60);assert.equal(w.windMph,null);
});
function row(phase='early',available=true){return {event_id:'e',model_version:F.VERSION+'-'+phase,market:'moneyline',starts_at:game.date,captured_at:at,result:'win',selection_home:true,price:-110,final_home_score:24,final_away_score:14,snapshot:{research:{phase,candidateAvailable:available,baseline:{probHome:.6,margin:5,total:43},evidence:{candidate:{probHome:.65}}},odds:{hML:-110,aML:-110}}};}
test('prospective gates deduplicate windows, exclude withheld near rows and grade same-time market blend',()=>{
 assert.equal(V.evaluate([row(),row('near',false)]).markets.moneyline.n,0);
 const v=V.evaluate([row(),row(),row('near')]);assert.equal(v.markets.moneyline.n,1);assert.equal(v.markets.moneyline.marketProbabilityN,1);assert.equal(v.promoted,false);assert.match(v.markets.moneyline.gate,/1\/150/);assert.ok(Math.abs(v.markets.moneyline.blendBrier-(.575-1)**2)<1e-9);
 const late=row();late.captured_at=late.starts_at;assert.equal(V.evaluate([late]).uniqueGames,0);
});
test('new UI escapes evidence and keeps expanded football detail concise',()=>{
 const s={};s.globalThis=s;vm.runInNewContext(fs.readFileSync(require.resolve('../nfl-football-ui.js'),'utf8'),s);
 const c=F.candidate(state,history,game,qb,config,{at});c.mainUncertainty='<img src=x onerror=alert(1)>';
 const html=s.SportsHubNFLFootballUI.detail({candidate:c});assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);assert.equal((html.match(/<li>/g)||[]).length,3);assert.match(html,/zero extra points/);
});

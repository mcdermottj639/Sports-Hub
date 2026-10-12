const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../supabase/functions/_shared/nfl-ppp-shadow.js');
const at='2026-10-12T18:00:00Z',game={sport:'nfl',id:'target',home:{abbr:'BUF'},away:{abbr:'LAR'},state:'pre',date:'2026-10-13T00:15:00Z',season:2026,seasonType:2};
const past={id:'past',date:'2026-10-05T00:00:00Z',home:'BUF',away:'LA',homeScore:24,awayScore:16,sides:{BUF:{rawPlays:60},LA:{rawPlays:50}}};
const history={schema:1,generatedAt:at,currentSeason:2026,coverage:{expected:1,available:1},games:[past]};
const project=(h=history)=>P.project(h,{home:'BUF',away:'LAR',date:game.date,season:2026},at);
function rows(){return P.rows(game,{modelVersion:'nfl-football-v1',total:48,margin:4,quality:[],features:{football:{ppp:project(),candidate:{}}}},{ou:44,overPrice:-110,underPrice:-105,provider:'test'},'test',at);}
test('raw plays and aliases feed fixed 75/25 experiment without changing official forecast',()=>{
 const x=project();assert.equal(x.available,true);assert.equal(x.profiles.home.games,1);assert.equal(x.profiles.away.games,1);
 assert.ok(Math.abs(x.total-40)<.001);const [r]=rows();assert.ok(Math.abs(r.snapshot.pppShadow.total-46)<.001);assert.equal(r.snapshot.pppShadow.baseline.total,48);assert.equal(r.model_version,P.VERSION);assert.equal(r.snapshot.researchOnly,true);assert.equal(r.tier,null);
});
test('duplicates, future and in-progress games cannot leak into inputs',()=>{
 const future={...past,id:'future',date:game.date,homeScore:1000},running={...future,id:'running',date:'2026-10-12T17:00:00Z'};
 assert.deepEqual(project({...history,games:[past,past,future,running]}),project());
});
test('missing snaps, stale sources, wrong cohorts and kickoff fail closed',()=>{
 assert.equal(project({...history,games:[{...past,sides:{BUF:{plays:60},LA:{plays:50}}}]}).available,false);
 for(const change of [{generatedAt:'2026-10-01T00:00:00Z'},{generatedAt:game.date},{coverage:{expected:10,available:1}}])assert.equal(project({...history,...change}).available,false);
 assert.equal(P.project(history,{home:'BUF',away:'LA',date:at,season:2026},at).available,false);
 const p={modelVersion:'nfl-football-v1',total:48,features:{football:{ppp:project()}}};
 assert.equal(P.rows({...game,state:'post'},p,{ou:44},'test',at).length,0);assert.equal(P.rows(game,p,{ou:44},'test',game.date).length,0);assert.equal(P.rows(game,p,{ou:null},'test',at).length,0);assert.equal(P.rows({...game,sport:'cfb'},p,{ou:44},'test',at).length,0);assert.equal(P.rows(game,{...p,modelVersion:'v239'},{ou:44},'test',at).length,0);
});
test('paired evaluation deduplicates and rejects void or invalid captures',()=>{
 const r={...rows()[0],result:'pending'};let v=P.evaluate([r,r]);assert.equal(v.captured,1);assert.equal(v.pending,1);assert.equal(v.settled,0);assert.equal(v.promoted,false);
 const settled={...r,result:'win',final_home_score:'24',final_away_score:'21'};v=P.evaluate([settled,settled]);assert.equal(v.settled,1);assert.equal(v.baseline.mae,3);assert.ok(Math.abs(v.shadow.mae-1)<.001);assert.equal(v.reviewReady,false);
 assert.equal(P.evaluate([{...settled,result:'void'}]).settled,0);assert.equal(P.evaluate([{...settled,captured_at:game.date}]).captured,0);
 const changed=structuredClone(settled);changed.snapshot.pppShadow.baseline.capturedAt='2026-10-11T12:00Z';assert.equal(P.evaluate([changed]).captured,0);
});
test('collector freezes separate research cohort using existing settlement',()=>{
 const src=fs.readFileSync('supabase/functions/sports-hub-ai/index.ts','utf8');assert.match(src,/SportsHubNFLPPPShadow\.rows\(g,p,odds/);assert.match(src,/resolution=ignore-duplicates/);assert.match(src,/startsWith\('football-research-'\).*Date\.parse\(r\.starts_at\)!==Date\.parse\(g\.date\)/);
 assert.equal(require('../supabase/functions/_shared/nfl-live.js').current(rows()[0]),false);
});

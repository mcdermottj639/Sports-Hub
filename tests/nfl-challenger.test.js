'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const N=require('../supabase/functions/_shared/nfl-challenger.js'),C=require('../supabase/functions/_shared/football-research-core.js');
const at='2026-09-30T21:00Z';
function game(id,h,a,hp,ap){return {id,date:'2026-09-20T17:00Z',neutral:true,sides:[{id:h,home:true,points:hp,drives:10,qbId:h+'QB',yardsPerPlay:5},{id:a,home:false,points:ap,drives:10,qbId:a+'QB',yardsPerPlay:5}]};}
const qb={home:{athleteId:'AQB',status:'No current restriction found; starter unconfirmed'},away:{athleteId:'BQB',status:'No current restriction found; starter unconfirmed'}};
test('opponent adjustment distinguishes equal raw scoring against different defenses',()=>{
 const games=[game('1','A','S',20,20),game('2','B','W',20,20),game('3','X','S',10,20),game('4','X','W',30,20),game('5','Y','S',10,20),game('6','Y','W',30,20)];
 const m=N.fit(games,6,at);assert.equal(m.teams.A.points/m.teams.A.drives,m.teams.B.points/m.teams.B.drives);assert.ok(m.teams.A.offense>m.teams.B.offense);assert.equal(m.coverage,1);
});
test('minimum sample, incomplete coverage, future observations and duplicates are guarded',()=>{
 const g=[game('1','A','B',20,20),game('2','B','A',20,20),game('3','A','B',20,20)];
 const m=N.fit([...g,g[0],{...g[0],id:'future',date:'2026-10-01T00:00Z'}],3,at);assert.equal(m.used,3);
 const c=N.candidate(m,'A','B',true,qb);assert.equal(c.available,true);assert.equal(c.margin,0);assert.equal(c.total,40);
 assert.equal(N.candidate({...m,coverage:.89},'A','B',false,qb).available,false);
 assert.equal(N.candidate(N.fit(g.slice(0,2),2,at),'A','B',false,qb).available,false);
 assert.equal(N.candidate(m,'A','B',false,qb).margin,1.6);
});
test('QB change, questionable, out, missing feed and missing passer withhold, not invent penalties',()=>{
 const m=N.fit([1,2,3].map(i=>game(String(i),'A','B',20,20)),3,at);
 for(const status of ['Questionable','Out','unknown','Injury feed unavailable; starter unconfirmed'])assert.equal(N.candidate(m,'A','B',false,{...qb,home:{...qb.home,status}}).available,false);
 assert.equal(N.candidate(m,'A','B',false,{...qb,home:{...qb.home,athleteId:'backup'}}).available,false);
 const missing=structuredClone(m);missing.teams.A.qbId=null;assert.equal(N.candidate(missing,'A','B',false,qb).available,false);
 assert.equal(N.candidate(m,'A','B',false,qb).available,true);
});
test('boxscore parser requires exact season, final, past cutoff and real drive counts',()=>{
 const d={header:{id:'1',season:{year:2026,type:2},competitions:[{date:'2026-09-20T17:00Z',status:{type:{completed:true}},competitors:[{id:'A',homeAway:'home',score:'20'},{id:'B',homeAway:'away',score:'10'}]}]},boxscore:{teams:['A','B'].map(id=>({team:{id},statistics:[{name:'totalDrives',displayValue:'10'}]}))}};
 assert.equal(N.game(d,2026,at).sides[0].drives,10);assert.equal(N.game(d,2025,at),null);
 const no=structuredClone(d);no.boxscore.teams[0].statistics=[];assert.equal(N.game(no,2026,at),null);
 const live=structuredClone(d);live.header.competitions[0].status.type.completed=false;assert.equal(N.game(live,2026,at),null);
 assert.equal(N.game(d,2026,'2026-09-20T20:00Z'),null);
});
test('new NFL cohort preserves baseline, freezes candidate margins/totals and marks missing candidate',async()=>{
 const {researchRows}=await import('../supabase/functions/sports-hub-ai/football-research.ts');
 const g={id:'1',state:'pre',date:new Date(Date.now()+4*3600000).toISOString(),observedAt:new Date().toISOString(),home:{id:'A',name:'Home',abbr:'H'},away:{id:'B',name:'Away',abbr:'A'}};
 const p={home:true,p:.6,margin:5,total:45,quality:[],features:{}},o={spread:-3,ou:44,hML:-150,aML:130,hSpreadPrice:-110,aSpreadPrice:-105,overPrice:-108,underPrice:-112};
 const rows=researchRows('nfl',g,p,o,{candidateMargin:-4,candidateTotal:39},'test');
 assert.ok(rows.every(r=>r.model_version===N.VERSION+'-early'&&r.model_probability===null&&r.tier===null));assert.equal(rows[0].selection_home,false);assert.equal(rows[0].price,130);assert.equal(rows[2].projection,39);assert.equal(rows[2].selection,'UNDER 44');assert.equal(rows[2].snapshot.research.baseline.total,45);
 const missing=researchRows('nfl',g,p,o,{},'test');assert.equal(missing[0].snapshot.research.candidateAvailable,false);
 assert.equal(C.versionFor('cfb'),C.VERSION);
});
function ui(){const s={SportsHubFootballResearch:C};s.globalThis=s;vm.runInNewContext(fs.readFileSync(require.resolve('../football-development.js'),'utf8'),s);return s.SportsHubFootballDevelopment;}
test('paired ROI uses both captured side prices, excludes unavailable studies and grades baseline independently',()=>{
 const row={market:'moneyline',result:'win',price:150,selection_home:false,final_home_score:10,final_away_score:20,snapshot:{research:{candidateAvailable:true,baseline:{home:true,probHome:.6,margin:4,total:45}},odds:{hML:-170,aML:150}}};
 const m=ui().comparisonMetrics([row]);assert.equal(m.roi.n,1);assert.equal(m.roi.baseline,-1);assert.equal(m.roi.study,1.5);assert.equal(m.calibration.n,1);
 const missing=structuredClone(row);missing.snapshot.odds.hML=null;assert.equal(ui().comparisonMetrics([missing]).roi.n,0);
 const blocked=structuredClone(row);blocked.snapshot.research.candidateAvailable=false;assert.equal(ui().comparisonMetrics([blocked]).paired,0);
});
test('same-game error compares baseline and challenger to the frozen book line',()=>{
 const row={market:'spread',line:-7,projection:5,result:'win',price:-110,final_home_score:24,final_away_score:20,snapshot:{research:{candidateAvailable:true,baseline:{margin:8,total:44}},odds:{hSpreadPrice:-110,aSpreadPrice:-110}}};
 const m=ui().comparisonMetrics([row]);assert.equal(m.error.n,1);assert.equal(m.error.baseline,4);assert.equal(m.error.study,1);assert.equal(m.error.market,3);assert.equal(m.roi.baseline,-1);assert.equal(m.roi.study,100/110);
});

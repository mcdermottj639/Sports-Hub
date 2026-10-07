'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const N=require('../supabase/functions/_shared/nba-model.js'),C=require('../supabase/functions/_shared/nba-model-config.js');
const A=require('../ai-model-utils.js'),R=require('../desk-core.js');
const history=Array.from({length:82},(_,i)=>({id:String(i),season:2026,date:new Date(Date.UTC(2025,9,1+i*2)).toISOString(),pf:115,pa:110,margin:5,win:true,home:i%2===0}));
const g={id:'401',season:2027,seasonType:2,state:'pre',date:'2026-10-21T00:00:00Z',home:{id:'2',name:'Home'},away:{id:'18',name:'Away'}};
test('NBA opening-night priors exclude future results, preseason, duplicates and older seasons',()=>{
 const p=N.profile([...history,...history,{...history[0],id:'future',season:2027,date:'2026-10-22',pf:200},{...history[0],id:'ancient',season:2025,pf:200}],2027,g.date);
 assert.equal(p.gp,0);assert.equal(p.priorGP,82);assert.equal(p.ppg,115);assert.equal(p.priorWeight,1);
 const payload={season:{year:2027},events:[1,2].map(type=>({id:String(type),date:'2026-01-01',season:{year:2026},seasonType:{type},competitions:[{status:{type:{completed:true}},competitors:[{team:{id:'2'},homeAway:'home',score:{value:100}},{team:{id:'3'},score:{value:90}}]}]}))};
 assert.equal(N.parse(payload,'2',2026).length,1);assert.equal(N.parse(payload,'2',2026)[0].season,2026);
 assert.equal(N.profile([],2027,g.date),null);
});
test('NBA neutral court, early-season blend, back-to-back and winner/margin outputs use the shared coefficients',()=>{
 const h=N.profile(history,2027,g.date),a={...h,pdpg:-3,ppg:108,papg:111,winPct:.4};
 const home=N.predict(h,a,g,C),neutral=N.predict(h,a,{...g,neutral:true},C);
 assert.ok(Math.abs(home.margin-neutral.margin-C.margin[0])<1e-8);
 const rest=N.features({...h,lastDate:'2026-10-20T00:00:00Z'},{...a,lastDate:'2026-10-18T00:00:00Z'},g);
 assert.equal(rest.b2b,-1);assert.equal(rest.rest,-2);
 const current={...history[0],id:'current',date:'2026-10-19T23:00Z',season:2027,pf:131,pa:110,margin:21};
 const blended=N.profile([...history,current],2027,g.date);assert.equal(blended.priorWeight,15/16);assert.equal(blended.ppg,116);
 const browser=N.browser(home,g);assert.equal(browser.projMargin,home.margin);assert.equal(browser.probHome,home.p);assert.equal(browser.modelVersion,'nba-v1');
});
test('NBA live loader crosses calendar years correctly and fails closed when current history is unavailable',async()=>{
 const urls=[];await N.load({...g,date:'2027-01-03T00:00Z'},async url=>{urls.push(url);return null;});
 assert.ok(urls.every(u=>/season=202[67]&/.test(u)));assert.equal(urls.length,4);
 assert.equal(await N.load(g,async()=>null),null);
});
test('NBA historical holdout is complete, distinct from training, and better than simple baselines',()=>{
 const v=C.validation;assert.equal(v.holdoutSeason,2026);assert.ok(v.holdoutN>=1230);assert.ok(v.trainSeasons.every(y=>y<v.selectionSeason&&y<v.holdoutSeason));
 assert.ok(v.brier<v.homeBaselineBrier);assert.ok(v.marginMAE<v.marginBaselineMAE);assert.ok(v.totalMAE<v.totalBaselineMAE);assert.equal(v.bettingROI,null);
});
test('NBA spreads grade from immutable pregame evidence, including below-filter forecasts and pushes',()=>{
 const r={s:'nba',q:{v:'nba-v1',at:'2026-10-20T12:00Z',start:g.date,home:true,prob:.6,forecast:{margin:4,total:224},odds:{spread:-3.5,ou:223},finalHome:110,finalAway:108}};
 assert.equal(A.forecastGrade(r,'spread','nba-v1').result,'loss');
 assert.equal(A.forecastGrade({...r,q:{...r.q,odds:{spread:-2,ou:223}}},'spread','nba-v1').result,'push');
});
test('NBA and Leagues deep links resolve, the mobile dock drops Fantasy, and direct league switching exists',()=>{
 for(const page of ['nba','leagues'])assert.equal(R.hashFor(R.route('#/'+page)),'#/'+page);
 assert.equal(R.group(R.route('#/nba')),'leagues');
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),dock=html.match(/<nav id="botbar"[^]*?<\/nav>/)[0];
 assert.match(dock,/data-desk-route="leagues"/);assert.doesNotMatch(dock,/fantasy/i);
 assert.match(html,/id="nba-games"/);assert.ok(html.indexOf('nba-model.js')<html.indexOf('app.js?'));
});
test('NBA collector creates all available market rows, with its own version and original input snapshot',()=>{
 const src=fs.readFileSync(require.resolve('../supabase/functions/sports-hub-ai/index.ts'),'utf8');
 // Run the actual collector row builder in a VM; helpers capture the arguments.
 const match=src.match(/function rowsFor\([^]*?\n\nconst SB_URL/)[0].split('\n\nconst SB_URL')[0];
 const fn=match.replace(/:Sport|:any/g,'');
 const ctx={Number,Math,ATS_EDGE_MIN:{nba:3},TOTAL_MIN:{nba:6},odds:()=>({spread:-3.5,ou:223,hSpreadPrice:-110,aSpreadPrice:-110,overPrice:-110,underPrice:-110}),tierFor:()=>({tier:null}),pickPrice:()=>null,rowBase:(...args)=>args};
 vm.runInNewContext(fn,ctx);
 const rows=ctx.rowsFor('nba',{...g,home:{...g.home,abbr:'H'},away:{...g.away,abbr:'A'}},{home:true,p:.6,conf:60,margin:4,total:224,quality:[]});
 assert.deepEqual(Array.from(rows,r=>r[4]),['moneyline','spread','total']);
 assert.equal(rows[1][8],4);assert.equal(rows[2][8],224);
 assert.match(src,/const SPORTS = \['nfl', 'cfb', 'mlb', 'nba'\]/);
 assert.match(src,/if\(sport==='nba'\)return \(globalThis as any\).SportsHubNBA.load/);
});

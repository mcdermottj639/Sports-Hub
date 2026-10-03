'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../supabase/functions/_shared/football-research-core.js');
function ui(){const s={SportsHubFootballResearch:C};s.globalThis=s;vm.runInNewContext(fs.readFileSync(require.resolve('../football-development.js'),'utf8'),s);return s.SportsHubFootballDevelopment;}
function rows(phase='early',available=true){
  return ['moneyline','spread','total'].map(market=>({
    event_id:'game',model_version:C.versionFor('nfl')+'-'+phase,matchup:'PIT @ CLE',
    starts_at:'2026-10-04T17:00Z',captured_at:phase==='early'?'2026-09-30T20:00Z':'2026-10-04T16:00Z',
    market,line:market==='spread'?-3:market==='total'?42:null,projection:market==='total'?40:2,result:'pending',
    snapshot:{research:{phase,candidateAvailable:available,baseline:{margin:5,total:45},
      evidence:{candidateTotal:40,candidate:{reasons:['home: listed QB Out']}}}}
  }));
}
test('frontline compares the same frozen near window, regardless of row ordering',()=>{const early=rows(),near=rows('near');near.forEach(r=>r.snapshot.research.baseline.margin=-7);const c=ui().gameComparison([...early,...near],'game');assert.equal(c.phase,'near');assert.equal(c.b.margin,-7);assert.equal(c.cm,2);});
test('agreement uses spread and total lines, not outright winner or identical projections',()=>{const c=ui().gameComparison(rows(),'game');assert.equal(c.spreadStatus,'Disagree');assert.equal(c.totalStatus,'Disagree');assert.match(ui().gameHTML(rows(),'game'),/CLE by 5.0/);assert.match(ui().gameHTML(rows(),'game'),/not calibrated/);});
test('withheld near candidate does not silently fall back to eligible early candidate',()=>{const c=ui().gameComparison([...rows(),...rows('near',false)],'game');assert.equal(c.available,false);assert.equal(c.cm,null);assert.equal(c.ct,null);assert.equal(c.totalStatus,'Unavailable');assert.match(ui().gameHTML(rows('early',false),'game'),/listed QB Out/);});
test('missing, post-kickoff and old-cohort observations never fabricate a comparison',()=>{assert.equal(ui().gameComparison([],'game'),null);const r=rows();r.forEach(x=>x.captured_at=x.starts_at);assert.equal(ui().gameComparison(r,'game'),null);const old=rows();old.forEach(x=>x.model_version='football-research-v2-early');assert.equal(ui().gameComparison(old,'game'),null);assert.match(ui().gameHTML([],'game'),/No saved challenger comparison/);});
test('results separate windows, exclude withheld and show collecting without settled prices',()=>{const html=ui().summaryHTML([...rows(),...rows('near',false)],'early');assert.match(html,/1 saved games · 1 challenger available · 0 withheld/);assert.match(html,/0 settled pairs/);assert.match(html,/previous collecting · live engine collecting/);const near=ui().summaryHTML([...rows(),...rows('near',false)],'near');assert.match(near,/1 saved games · 0 challenger available · 1 withheld/);});
test('saved source strings are escaped and exact-line comparisons are not called agreement',()=>{const r=rows();r.forEach(x=>{x.matchup='<img> @ CLE';x.projection=x.market==='total'?42:3;});const html=ui().gameHTML(r,'game');assert.ok(!html.includes('<img>'));assert.equal(ui().gameComparison(r,'game').spreadStatus,'At line');assert.equal(ui().gameComparison(r,'game').totalStatus,'At line');});
function college(phase='early',available=true){return rows(phase,available).map(r=>({...r,sport:'cfb',matchup:'TEX @ UGA',model_version:C.versionFor('cfb')+'-'+phase,snapshot:{research:{...r.snapshot.research,evidence:{fpi:{home:22,away:23,updatedAt:'2026-09-30T20:00Z'}}}}}));}
test('compact rows show picks at the saved line with each model projection beneath',()=>{
  const html=ui().gameHTML(rows(),'game');const summaries=[...html.matchAll(/<details class="fc-market"><summary>(.*?)<\/summary>/g)].map(x=>x[1]);
  assert.equal(summaries.length,2);assert.match(summaries[0],/CLE -3/);assert.match(summaries[0],/PIT \+3/);assert.match(summaries[0],/Disagree/);assert.match(summaries[1],/O42/);assert.match(summaries[1],/U42/);assert.match(summaries[0],/Proj. CLE by 5.0/);assert.match(summaries[0],/Proj. CLE by 2.0/);assert.match(summaries[1],/Proj. 45.0/);assert.match(summaries[1],/Proj. 40.0/);
  assert.equal([...ui().gameHTML(college(),'game','cfb').matchAll(/class="fc-market"/g)].length,1);
});
test('withheld compact selections are blank rather than copied baseline picks',()=>{
  const html=ui().gameHTML(rows('early',false),'game');const summaries=[...html.matchAll(/<details class="fc-market"><summary>(.*?)<\/summary>/g)].map(x=>x[1]);assert.ok(summaries.every(x=>x.includes('<b>—</b>')&&x.includes('Unavailable')));
});
test('CFB shows FPI margin but never an independent total or NFL QB explanation',()=>{
  const c=ui().gameComparison(college(),'game','cfb');assert.equal(c.cm,2);assert.equal(c.ct,null);assert.equal(c.totalStatus,'Baseline only');
  const html=ui().gameHTML(college(),'game','cfb');assert.match(html,/Current vs FPI Challenger/);assert.match(html,/home 22.0 · away 23.0/);assert.match(html,/No separate model/);assert.ok(!html.includes('QB evidence unavailable'));assert.ok(!html.includes('Total: Agree'));
});
test('CFB result summary excludes copied total forecasts from paired performance',()=>{
  const html=ui().summaryHTML(college(),'early','cfb');assert.match(html,/Margin error/);assert.match(html,/Totals: baseline only/);assert.ok(!html.includes('Total error'));assert.ok(!html.includes('<b>Total</b>'));
});
test('league cohorts remain isolated and unavailable near FPI does not fall back',()=>{
  assert.equal(ui().gameComparison(rows(),'game','cfb'),null);assert.equal(ui().gameComparison(college(),'game','nfl'),null);
  const r=[...college(),...college('near',false)];const c=ui().gameComparison(r,'game','cfb');assert.equal(c.phase,'near');assert.equal(c.available,false);assert.match(ui().gameHTML(r,'game','cfb'),/One or both FPI ratings unavailable/);
  assert.match(ui().summaryHTML([...college(),...rows().map(x=>({...x,sport:'nfl'}))],'early','cfb'),/1 saved games/);
});

test('compact summary distinguishes pending results from settled pairs',()=>{
  const pending=ui().summaryHTML(rows());assert.match(pending,/Collecting results/);assert.match(pending,/Awaiting settled games/);
  const settled=rows().map(r=>({...r,result:'win',final_home_score:24,final_away_score:20}));
  const html=ui().summaryHTML(settled);assert.match(html,/1 settled pairs/);assert.ok(!html.includes('Awaiting settled games'));assert.match(html,/Previous 1.0/);assert.match(html,/Live engine 2.0/);
});

test('latest results select one paired window per game, including withheld near snapshots',()=>{
  const other=rows().map(r=>({...r,event_id:'other'}));
  const html=ui().summaryHTML([...rows(),...rows('near',false),...other]);
  assert.match(html,/2 saved games · 1 challenger available · 1 withheld/);
  assert.ok(html.indexOf('data-fc-window')>html.indexOf('class="fc-results-details"'));
  assert.match(html,/data-fc-window="latest" aria-pressed="true"/);
});

test('agreeing spread picks still show opposite projected winners',()=>{
  const r=rows();r.forEach(x=>{x.line=x.market==='spread'?2.5:x.line;x.projection=x.market==='total'?40.4:2.5;x.snapshot.research.baseline={margin:-0.8,total:43.8};});
  const html=ui().gameHTML(r,'game');const summary=html.match(/<details class="fc-market"><summary>(.*?)<\/summary>/)[1];
  assert.match(summary,/Agree/);assert.match(summary,/Proj. PIT by 0.8/);assert.match(summary,/Proj. CLE by 2.5/);assert.equal((summary.match(/<b>CLE \+2.5<\/b>/g)||[]).length,2);
});

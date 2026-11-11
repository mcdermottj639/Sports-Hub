'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../sports-evidence-core.js');
const UI=require('../sports-evidence.js');
const fixture=require('../data/draftkings-evidence.json');
const clone=x=>JSON.parse(JSON.stringify(x));
const game=(id,start,home='NYK',away='BOS',hs=110,as=100)=>({id,start,home:{abbr:home,score:hs},away:{abbr:away,score:as},status:'ScoresOfficial',observedAt:'2026-11-11T10:00:00Z'});
const g=game('x','2026-11-10T00:00:00Z');
const row=(extra={})=>({event_id:'espn-x',sport:'nba',model_version:'nba-v1',market:'moneyline',matchup:'BOS @ NY',starts_at:g.start,captured_at:'2026-11-09T12:00:00Z',result:'win',final_home_score:110,final_away_score:100,snapshot:{forecast:{margin:8,total:215},odds:{spread:-7,ou:214}},...extra});
const snapshot=(gs=[g])=>({schemaVersion:1,capturedAt:'2026-11-11T10:00:00Z',leagues:{nba:{games:gs,teams:[]}}});
test('aliases match ESPN to DraftKings without crossing leagues',()=>{
  assert.equal(C.canonical('nba','NY'),'NYK');assert.equal(C.canonical('nfl','WSH'),'WAS');
  assert.equal(C.canonical('nba','NO'),'NOP');assert.equal(C.canonical('nfl','NO'),'NO');
  assert.equal(C.rowGame(snapshot(),row()).id,'x');
});
test('identity requires exact start and orientation; ambiguous or rescheduled games stay unmatched',()=>{
  assert.equal(C.rowGame(snapshot(),row({starts_at:'2026-11-10T01:00:00Z'})),null);
  assert.equal(C.rowGame(snapshot(),row({matchup:'NY @ BOS'})),null);
  assert.equal(C.rowGame(snapshot([g,{...g,id:'y'}]),row()),null);
});
test('missing numeric inputs never become zero; tie and score strings remain valid',()=>{
  for(const v of [null,undefined,'',false,NaN])assert.equal(C.number(v),null);
  assert.equal(C.number(0),0);assert.equal(C.final({...g,home:{abbr:'NYK',score:null}}),false);
  const f=C.form(snapshot([{...g,home:{abbr:'NYK',score:'99'},away:{abbr:'BOS',score:'110'}}]),'nba','NY','2026-11-11T00:00:00Z');
  assert.equal(f.rows[0].result,'L');
});
test('calendar gaps use Eastern dates across DST, and form excludes target/future games',()=>{
  assert.equal(C.dayGap('2026-10-31T23:00:00-04:00','2026-11-01T23:00:00-05:00'),1);
  const gs=[game('old','2026-11-08T00:00:00Z'),g,game('future','2026-11-11T00:00:00Z')];
  const f=C.form(snapshot(gs),'nba','NY',g.start);
  assert.equal(f.n,1);assert.equal(f.rows[0].id,'old');
});
test('five-game baseline uses earlier scores only and is withheld when either team lacks five',()=>{
  const gs=Array.from({length:5},(_,i)=>game('past'+i,`2026-11-0${i+1}T00:00:00Z`,'NYK','BOS',110+i,100+i));
  const s=snapshot([...gs,g]);const b=C.baseline(s,'nba',g);
  assert.equal(b.available,true);assert.equal(b.margin,10);assert.equal(b.total,214);
  assert.equal(C.baseline(snapshot(gs.slice(1)),'nba',g).available,false);
  const altered=clone(s);altered.leagues.nba.games.at(-1).home.score=999;
  assert.equal(C.baseline(altered,'nba',g).total,b.total,'target score cannot leak into baseline');
});
test('audit counts games once across markets and checks every saved scored market',()=>{
  const s=snapshot(),rows=[row(),row({market:'spread'}),row({market:'total'})],before=JSON.stringify(rows);
  const a=C.audit(s,rows,'nba','nba-v1');assert.equal(a.matched,1);assert.equal(a.items.length,1);assert.equal(JSON.stringify(rows),before);
  rows[2].final_home_score=111;assert.equal(C.audit(s,rows,'nba','nba-v1').disputed,1);
});
test('audit excludes wrong versions, voids and at/after-tipoff captures',()=>{
  const rows=[row({model_version:'old'}),row({result:'void'}),row({captured_at:g.start})];
  assert.equal(C.audit(snapshot(),rows,'nba','nba-v1').items.length,0);
});
test('missing saved finals are awaiting, disagreements never enter diagnostics',()=>{
  assert.equal(C.audit(snapshot(),[row({final_home_score:null})],'nba','nba-v1').awaiting,1);
  const a=C.audit(snapshot(),[row({final_home_score:120})],'nba','nba-v1');
  assert.equal(a.disputed,1);assert.equal(C.diagnostics(a).metrics.margin.n,0);
});
test('error/bias and saved-book comparisons use the same games and home-oriented line',()=>{
  const m=C.diagnostics(C.audit(snapshot(),[row()],'nba','nba-v1')).metrics;
  assert.equal(m.margin.mae,2);assert.equal(m.margin.bias,-2);assert.equal(m.margin.bookMAE,3);
  assert.equal(m.total.mae,5);assert.equal(m.total.bias,5);assert.equal(m.total.bookMAE,4);
  const r=row();r.snapshot.odds={};const missing=C.diagnostics(C.audit(snapshot(),[r],'nba','nba-v1')).metrics;
  assert.equal(missing.margin.n,1);assert.equal(missing.margin.bookN,0);assert.equal(missing.margin.bookMAE,null);
});
test('freshness flags stale and future timestamps; unknown schemas fail',()=>{
  const now=Date.parse('2026-11-11T11:00:00Z');assert.equal(C.freshness(snapshot(),now).stale,false);
  assert.equal(C.freshness({...snapshot(),capturedAt:'2026-11-09T00:00:00Z'},now).stale,true);
  assert.equal(C.freshness({...snapshot(),capturedAt:'2027-01-01T00:00:00Z'},now).available,false);
  assert.equal(C.freshness({...snapshot(),schemaVersion:2},now).available,false);
});
test('real snapshot includes 62 teams, unique games, valid final scores and request provenance',()=>{
  assert.deepEqual(C.validate(fixture),[]);assert.equal(fixture.leagues.nfl.teams.length,32);assert.equal(fixture.leagues.nba.teams.length,30);
  assert.ok(fixture.queries.every(q=>q.requestId&&q.count>0));
  const bad=clone(fixture);bad.leagues.nba.games.push(bad.leagues.nba.games[0]);assert.ok(C.validate(bad).length);
});
test('rendered evidence stays explicit about provenance, hindsight, no ROI and unsafe text',()=>{
  const s=clone(fixture),g=s.leagues.nfl.games.find(C.final);const html=UI.matchupHTML(s,'nfl',g,[]);
  assert.match(html,/not historical pregame inputs/);assert.match(html,/not betting returns/);assert.match(html,/No projection is filled in|retrospective replay/);
  g.home.abbr='<script>';assert.doesNotMatch(UI.matchupHTML(s,'nfl',g,[]),/<script>/);
  assert.match(UI.accuracyHTML(s,[],'nfl'),/Not prospective validation or ROI/);
});
test('release wires evidence before app and preserves the existing scoring pipelines',()=>{
  const fs=require('node:fs');const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  assert.ok(html.indexOf('sports-evidence-core.js')<html.indexOf('sports-evidence.js'));
  assert.ok(html.indexOf('sports-evidence.js')<html.indexOf('<script src="app.js'));
  const version=fs.readFileSync(require.resolve('../app.js'),'utf8').match(/APP_VERSION\s*=\s*['"]v(\d+)/)[1];
  assert.match(html,/desk-matchup-lab/);assert.ok(html.includes(`sports-evidence.css?v=${version}`));
});

test('official forecast remains visible even when recent-form baseline lacks five games',()=>{
  const html=UI.matchupHTML(snapshot(),'nba',g,[row()]);
  assert.match(html,/SAVED OFFICIAL FORECAST/);
  assert.match(html,/BOS 103.5/);assert.match(html,/NYK 111.5/);
  assert.match(html,/Needs more games/);assert.match(html,/No projection is filled in/);
});
test('matchup details retain earlier opponent scores and compact game reports',()=>{
  const s=snapshot([game('old','2026-11-08T00:00:00Z'),g]);
  const html=UI.matchupHTML(s,'nba',g,[]);
  assert.match(html,/Last five games/);assert.match(html,/recent results/);
  assert.match(html,/110–100/);assert.match(html,/Forecast comparison/);
  const compact=UI.matchupHTML(s,'nba',g,[],true);
  assert.match(compact,/Compare season ranks &amp; form baseline/);
  assert.doesNotMatch(compact,/se-detail-grid|se-history-grid/);
});

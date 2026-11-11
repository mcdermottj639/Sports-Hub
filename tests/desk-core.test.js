'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../desk-core.js');
const now = Date.parse('2026-10-03T12:00:00Z');
const item = {sport:'nfl',id:'401',away:'Away',home:'Home',date:'2026-10-04T17:00:00Z',note:'Keep my note'};

test('deep links round trip all model scopes and fantasy sections', () => {
  for (const sport of ['all','nfl','cfb','mlb','nba']) {
    for (const sub of ['picks','results','calibration','method']) {
      const path=`#/models/${sport}/${sub}`;
      assert.equal(C.hashFor(C.route(path)),path);
    }
  }
  for (const section of ['gm','lineup','matchup','roster','season','waivers']) {
    const path=`#/fantasy/${section}`;
    assert.equal(C.hashFor(C.route(path)),path);
  }
  for (const section of ['', '/gm', '/lineup', '/matchup', '/roster', '/season', '/waivers']) {
    assert.equal(C.group(C.route('#/fantasy' + section)), 'explore');
  }
  assert.deepEqual(C.route('#/matchup-lab'),{panel:'matchup-lab'});
  assert.equal(C.hashFor(C.route('#/matchup-lab')),'#/matchup-lab');
  assert.equal(C.group(C.route('#/matchup-lab')),'research');
  assert.equal(C.group(C.route('#/research')),'research');
  assert.equal(C.group(C.route('#/nfl/research')),'research');
  assert.equal(C.group(C.route('#/cfb/research')),'research');
  assert.equal(C.route('#pk=important-pool-import'),null);
  assert.equal(C.route('#/not-a-destination'),null);
  assert.equal(C.route('#/models/invalid/bad').aiSport,'all');
});

test('bookmarks preserve notes, deduplicate by league and refuse silent eviction', () => {
  const normalized=C.normalizeWatch([item,{...item,note:'duplicate'},null,{...item,sport:'invalid'},{...item,id:'javascript:alert(1)'},{...item,id:'402',note:'x'.repeat(900)}]);
  assert.equal(normalized.length,2);
  assert.equal(normalized[0].note,item.note);
  assert.equal(normalized[1].note.length,800);
  assert.deepEqual(C.toggleWatch(normalized,item),[normalized[1]]);
  const full=Array.from({length:80},(_,i)=>({...item,id:String(i+1)}));
  assert.equal(C.toggleWatch(full,{...item,id:'1000'}).length,80);
  assert.equal(C.toggleWatch(full,{...item,id:'1000'})[0].note,item.note);
  assert.equal(C.normalizeWatch([...full,{...item,sport:'cfb',id:'1'}]).length,80);
});

test('Lab links retain the league, exact game, period and evidence view', () => {
  const selected={panel:'matchup-lab',lab:{sport:'nba',tab:'audit',scope:'completed',selected:'1026001'}};
  assert.deepEqual(C.route(C.hashFor(selected)),selected);
  assert.deepEqual(C.route('#/matchup-lab?league=nfl&game=974129&view=matchups&period=all'),{panel:'matchup-lab',lab:{sport:'nfl',tab:'matchups',scope:'all',selected:'974129'}});
  assert.deepEqual(C.route('#/matchup-lab?league=cfb&game=%3Cscript%3E&view=unknown&period=bad'),{panel:'matchup-lab'});
  assert.equal(C.route('#/fantasy/lineup?ignored=1').section,'lineup');
});

test('workspace preferences recover from malformed storage and keep per-league game choices', () => {
  for(const value of [null,undefined,false,'bad',[],{choices:null}]) assert.equal(C.labPreferences(value).sport,'nfl');
  const prefs=C.labPreferences({sport:'nba',tab:'accuracy',choices:{nfl:{selected:'974129',scope:'upcoming'},nba:{selected:'1026001',scope:'completed'}}});
  assert.equal(prefs.choices.nfl.selected,'974129');assert.equal(prefs.choices.nba.scope,'completed');assert.equal(prefs.tab,'accuracy');
  const bad=C.labPreferences({sport:'cfb',tab:'bad',choices:{nfl:{scope:'bad',selected:'x'.repeat(500)}}});
  assert.deepEqual(bad.choices.nfl,{selected:null,scope:'upcoming'});
  assert.deepEqual(C.agendaPreferences({filter:'nba',edges:true}),{filter:'nba',edges:true});
  assert.deepEqual(C.agendaPreferences({filter:'unknown',edges:'false'}),{filter:'all',edges:false});
});

test('capture status differentiates stale, failed, missing and implausible timestamps', () => {
  assert.equal(C.captureStatus(null,now).tone,'muted');
  assert.equal(C.captureStatus({status:'ok',finished_at:new Date(now-30*60000).toISOString()},now).tone,'good');
  assert.equal(C.captureStatus({status:'ok',finished_at:new Date(now-91*60000).toISOString()},now).tone,'caution');
  assert.equal(C.captureStatus({status:'error',finished_at:new Date(now).toISOString()},now).tone,'caution');
  assert.equal(C.captureStatus({status:'ok',finished_at:new Date(now+86400000).toISOString()},now).tone,'muted');
});

test('summary separates game counts from forecasts and excludes post-start captures', () => {
  const row={sport:'nfl',event_id:'10',model_version:'v239',captured_at:'2026-10-03T10:00:00Z',starts_at:'2026-10-03T17:00:00Z',market:'spread',result:'pending',price:-110};
  const rows=[row,{...row,market:'total',price:null},{...row,event_id:'20',price:''},{...row,event_id:'30',captured_at:'2026-10-03T08:00:00Z',starts_at:'2026-10-03T11:00:00Z'}, {...row,model_version:'old'},{...row,captured_at:'2026-10-03T18:00:00Z'},{...row,result:'win'}];
  assert.deepEqual(C.savedSummary(rows,'v239',now),{upcoming:3,games:2,priced:1,due:1});
  const map=C.gameForecasts([...rows,{...row,result:'void'},row],'v239');
  assert.equal(map.get('nfl:10').size,2);
  assert.equal(map.get('nfl:10').get('spread').price,-110);
  assert.equal(C.gameForecasts([{...row,captured_at:row.starts_at}],'v239').size,0);
});

test('radar deduplicates, excludes preseason and ranks live then saved upcoming games', () => {
  const game=(id,state,date,sport='nfl')=>({sport,g:{id,state,date,seasonType:2}});
  const rows=[game('401','pre','2026-10-04T17:00:00Z'),game('5','in','2026-10-03T11:00:00Z'),game('6','post','2026-10-02T11:00:00Z'),game('7','pre','2026-10-03T13:00:00Z','cfb')];
  const sorted=C.agenda([...rows,rows[0],{sport:'nfl',g:{id:'8',seasonType:1}}],[item],'all',now);
  assert.deepEqual(sorted.map(x=>x.g.id),['5','401','7','6']);
  assert.deepEqual(C.agenda(rows,[item],'watchlist',now).map(x=>x.g.id),['401']);
  assert.equal(C.agenda(rows,[item],'cfb',now).length,1);
});

test('search matches every query token across destination title and purpose', () => {
  const items=[{title:'Waiver & trade plan',description:'Your roster and league rules'},{title:'Model results',description:'Official record, ROI and saved odds'}];
  assert.equal(C.search(items,'trade roster')[0].title,items[0].title);
  assert.equal(C.search(items,'  ROI   SAVED ')[0].title,items[1].title);
  assert.deepEqual(C.search(items,'waiver ROI'),[]);
});

test('v328 games-ahead read: official version per league reaches the desk', () => {
  const base = {result:'pending',captured_at:'2026-11-01T12:00:00Z',starts_at:'2026-11-01T17:00:00Z'};
  const rows = [
    {...base,sport:'nfl',event_id:'1',market:'moneyline',model_version:'nfl-football-v1'},
    {...base,sport:'nfl',event_id:'1',market:'spread',model_version:'football-research-nfl-v4-early'},
    {...base,sport:'nba',event_id:'2',market:'total',model_version:'nba-v1'},
    {...base,sport:'cfb',event_id:'3',market:'moneyline',model_version:'v239'},
  ];
  const versionFor = s => s==='nfl'?'nfl-football-v1':s==='nba'?'nba-v1':'v239';
  const f = C.gameForecasts(rows, versionFor);
  assert.deepEqual([...f.get('nfl:1').keys()], ['moneyline']);
  assert.ok(f.get('nba:2').has('total'));
  assert.ok(f.get('cfb:3').has('moneyline'));
  // The old single-string call still works and still only sees v239.
  assert.deepEqual([...C.gameForecasts(rows,'v239').keys()], ['cfb:3']);
});

test('v328 games-ahead read: line, chips, edge, flip and projected score', () => {
  const g = {home:{abbr:'BUF',name:'Buffalo Bills'},away:{abbr:'BAL',name:'Baltimore Ravens'}};
  const fc = {total:51.4,margin:5.3};
  const markets = new Map([
    ['moneyline',{selection:'Buffalo Bills',selection_home:true,confidence:69,tier:null,price:-192,model_probability:0.68936,market_probability:0.63094,snapshot:{forecast:fc}}],
    ['spread',{selection:'BUF -3.5',selection_home:true,tier:null,line:-3.5,projection:5.3}],
    ['total',{selection:'UNDER 53.5',tier:'edge',line:53.5,projection:51.4}],
  ]);
  const r = C.gameRead(markets,{spread:-3.5,ou:53.5,hML:-192,aML:160},g);
  assert.equal(r.line,'BUF −3.5 · O/U 53.5');
  assert.deepEqual(r.moneyline,{away:'+160',home:'−192'});
  assert.deepEqual(r.chips.map(c=>c.value),['BUF 69%','BUF −3.5','U 53.5']);
  assert.deepEqual(r.chips.map(c=>c.hot),[false,false,true]);
  assert.equal(r.edge.pts,5.8);
  assert.equal(r.flip,false);
  assert.equal(r.hot,false);
  assert.equal(r.proj,'Proj. BUF 28.4 – BAL 23.1');

  // ATL @ TB: book has ATL +114, model 50.7% -> dog flip and an Edge tier.
  const atl = new Map([['moneyline',{selection:'Atlanta Falcons',selection_home:false,confidence:51,tier:'edge',price:114,model_probability:0.506638,market_probability:0.448559,snapshot:{forecast:{total:43,margin:0.1}}}]]);
  const a = C.gameRead(atl,{spread:-2.5,ou:46.5,hML:-135,aML:114},{home:{abbr:'TB'},away:{abbr:'ATL'}});
  assert.equal(a.flip,true);
  assert.equal(a.hot,true);
  assert.equal(a.edge.tier,'Edge');
  assert.equal(a.edge.pts,5.8);
  assert.equal(a.line,'TB −2.5 · O/U 46.5');
  assert.equal(a.proj,'Proj. about even · 43 total');

  // Away favorite, no forecast, no odds: nothing invented.
  const none = C.gameRead(undefined,{spread:3},{home:{abbr:'H'},away:{abbr:'A'}});
  assert.equal(none.line,'A −3');
  assert.deepEqual(none.chips,[]);
  assert.equal(none.edge,null);
  assert.equal(none.proj,null);
  assert.equal(C.gameRead(undefined,null,{home:{},away:{}}).line,null);
  assert.deepEqual(C.slateSummary([a,r,none]),{games:3,edges:1,flips:1});
});

test('v329 games-ahead read: saved date, line moves and whether the saved projection still clears today', () => {
  const at = '2026-10-27T03:37:00Z';
  // TEN @ CIN: saved CIN -10, projected CIN by 15; today CIN -13.5.
  const cin = new Map([
    ['moneyline',{selection_home:true,confidence:86,price:-600,model_probability:0.856994,market_probability:0.822335,captured_at:at,snapshot:{forecast:{total:45.5,margin:15}}}],
    ['spread',{selection:'CIN -10',selection_home:true,line:-10,projection:15,captured_at:at}],
    ['total',{selection:'UNDER 46.5',tier:'edge',line:46.5,projection:45.5,captured_at:at}],
  ]);
  const c = C.gameRead(cin,{spread:-13.5,ou:46.5,hML:-900,aML:600},{home:{abbr:'CIN'},away:{abbr:'TEN'}});
  assert.equal(c.savedAt,'Oct 26');
  assert.equal(c.proj,'Proj. CIN 30.3 – TEN 15.3');
  const spread = c.moves.find(m=>m.market==='spread');
  assert.equal(spread.text,'Spread CIN −10 → −13.5 now · still covers by 1.5');
  assert.equal(spread.ok,true);
  assert.deepEqual(c.moves.map(m=>m.market),['moneyline','spread']);
  assert.equal(spread.saved,'CIN −10');assert.equal(spread.current,'CIN −13.5');assert.equal(spread.assessment,'Model covers by 1.5 pts');
  assert.equal(c.moves.some(m=>m.market==='total'),false); // total unchanged -> no note
  assert.match(c.moves.find(m=>m.market==='moneyline').text,/^ML CIN −600 → −900 now · edge now /);

  // ARI @ DAL: saved ARI +6.5 (home line -6.5), DAL by 5.2; today DAL -7.
  const ari = new Map([
    ['moneyline',{selection_home:true,confidence:68,price:-298,model_probability:0.679479,market_probability:0.717971,captured_at:at,snapshot:{forecast:{total:46.8,margin:5.2}}}],
    ['spread',{selection:'ARI +6.5',selection_home:false,line:-6.5,projection:5.2,captured_at:at}],
  ]);
  const a = C.gameRead(ari,{spread:-7,ou:54.5},{home:{abbr:'DAL'},away:{abbr:'ARI'}});
  assert.equal(a.proj,'Proj. DAL 26.0 – ARI 20.8');
  assert.equal(a.moves[0].text,'Spread ARI +6.5 → +7 now · still covers by 1.8');

  // A move that the saved projection no longer clears.
  const short = C.gameRead(new Map([['spread',{selection:'CIN -10',selection_home:true,line:-10,projection:15}],['total',{selection:'UNDER 46.5',line:46.5,projection:45.5}]]),
    {spread:-16,ou:44.5},{home:{abbr:'CIN'},away:{abbr:'TEN'}});
  assert.equal(short.moves.find(m=>m.market==='spread').text,'Spread CIN −10 → −16 now · now short by 1.0');
  assert.equal(short.moves.find(m=>m.market==='total').text,'Total U 46.5 → 44.5 now · now short by 1.0');
  assert.equal(short.moves.every(m=>m.ok===false),true);
  assert.equal(short.savedAt,null);

  // BAL @ BUF ML: saved -192, today -162/+136 -> edge vs today's no-vig price.
  const buf = C.gameRead(new Map([['moneyline',{selection_home:true,price:-192,model_probability:0.68936,market_probability:0.63094}]]),
    {hML:-162,aML:136},{home:{abbr:'BUF'},away:{abbr:'BAL'}});
  assert.equal(buf.moves[0].text,'ML BUF −192 → −162 now · edge now +9.6');
  assert.equal(buf.moves[0].assessment,'Model win chance 9.6 percentage points above market');
});

test('v335: no clubhouse banner on Today; Eagles and Red Sox live on the Leagues tab', () => {
  const fs = require('node:fs'), path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'desk.css'), 'utf8');
  assert.doesNotMatch(html, /id="desk-follow-teams"/);
  const leagues = html.slice(html.indexOf('<section id="leagues"'), html.indexOf('</section>', html.indexOf('<section id="leagues"')));
  assert.match(leagues, /data-desk-route="eagles"/);
  assert.match(leagues, /data-desk-route="redsox"/);
  assert.match(css, /body\[data-desk-panel="home"\] \.desk-page-heading \{ position:absolute!important/);
  assert.match(html, /class="desk-agenda-refresh" data-desk-refresh/);
});

test('Today includes the entire local calendar day across sports and statuses', () => {
  const oldTZ = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    // Fall-back day is 25 hours: both 1:30 AM occurrences belong to today.
    const now = Date.parse('2026-11-01T17:00:00Z');
    const make = (id,date,state='pre',sport='nfl') => ({sport,g:{id,date,state,seasonType:2}});
    const rows = [make('yesterday','2026-11-01T03:59:59Z'),
      make('start','2026-11-01T04:00:00Z','post'),
      make('first','2026-11-01T05:30:00Z','post','cfb'),
      make('second','2026-11-01T06:30:00Z','post','mlb'),
      make('live','2026-11-01T16:00:00Z','in','nba'),
      make('end','2026-11-02T04:59:59Z'),
      make('tomorrow','2026-11-02T05:00:00Z'),make('invalid','bad')];
    assert.deepEqual(new Set(C.agenda([...rows,rows[1]],[],'today',now).map(x=>x.g.id)),new Set(['start','first','second','live','end']));
    assert.equal(C.agenda(rows,[],'today',Date.parse('2026-11-02T05:00:00Z'))[0].g.id,'tomorrow');
  } finally { if (oldTZ === undefined) delete process.env.TZ; else process.env.TZ = oldTZ; }
});

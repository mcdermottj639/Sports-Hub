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

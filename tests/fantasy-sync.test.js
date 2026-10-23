'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../fantasy-sync.js');
const fixture = require('./fixtures/matchup-hq-week7.json');
const now = Date.parse('2026-10-23T22:00:00Z');
const clone = v => structuredClone(v);
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function harness(overrides={}) {
  let saved = {...clone(fixture.L),syncedAt:now-3600000};
  const responses = {
    roster:{team:saved.team,roster:saved.rosterFull,record:saved.record,rules:saved.rules,live:true},
    matchup:saved.matchup,opponent:saved.opponent,standings:saved.standings,
    'freeagents?size=80':saved.freeAgents,season:saved.season,rosters:saved.rosters,
  };
  const calls=[],publications=[],statuses=[];let invalidations=0;
  const controller=S.create({read:()=>saved,now:()=>now,
    request:p=>{calls.push(p);return p in overrides ? overrides[p] : clone(responses[p] || {ok:true});},
    invalidate:async()=>{invalidations++;},
    publish:L=>{saved=L;publications.push(L);},status:s=>statuses.push(s)});
  return {...controller,calls,publications,statuses,get saved(){return saved;},set saved(L){saved=L;},get invalidations(){return invalidations;}};
}

test('warm roster first, share all overlapping refreshes, publish core before slow details',async()=>{
  const roster=deferred(),details=deferred(),h=harness({roster:roster.promise,'freeagents?size=80':details.promise});
  const first=h.sync();assert.equal(h.sync(true),first);
  await tick();assert.deepEqual(h.calls,['roster']);assert.equal(h.invalidations,0);
  roster.resolve({team:fixture.L.team,roster:fixture.L.rosterFull});
  await tick();assert.equal(h.publications.length,1);assert.equal(S.complete(h.saved),true);
  assert.equal(h.statuses.at(-1).phase,'details');assert.equal(h.saved.coreSyncedAt,now);
  assert.equal(h.sync(true),first);assert.equal(h.calls.filter(p=>p==='roster').length,1);
  details.resolve({players:[]});assert.equal(await first,true);
  assert.equal(h.statuses.at(-1).busy,false);assert.equal(h.statuses.at(-1).phase,'ready');
});

for(const path of ['roster','matchup','opponent']) test(`failed ${path} preserves the complete saved snapshot and its age`,async()=>{
  const h=harness({[path]:null}),before=h.saved;
  assert.equal(await h.sync(true),false);assert.equal(h.invalidations,1);
  assert.equal(h.saved,before);assert.equal(h.publications.length,0);
  assert.equal(h.statuses.at(-1).busy,false);assert.equal(h.statuses.at(-1).phase,'failed');
});

test('a stale raw response cannot renew the age of an 18-day-old incomplete snapshot',async()=>{
  const old={...clone(fixture.L),opponent:null,syncedAt:now-18*86400000};
  const h=harness({matchup:{...fixture.L.matchup,__stale:true}});h.saved=old;
  assert.equal(await h.sync(),false);assert.equal(h.saved,old);
  assert.match(S.snapshotIssue(old,now),/opponent lineup/);
});

test('mismatched opponent responses are not combined into a new matchup',async()=>{
  const h=harness({opponent:{...fixture.L.opponent,opponent:'A different team'}});
  assert.equal(await h.sync(),false);assert.equal(h.publications.length,0);
});

test('failed supplemental data carries its original age for at most three days',async()=>{
  const h=harness({season:null,standings:null});
  h.saved.carried={season:now-2*86400000,standings:now-4*86400000};
  await h.sync();assert.deepEqual(h.saved.season,fixture.L.season);
  assert.equal(h.saved.carried.season,now-2*86400000);assert.equal(h.saved.standings,null);
  assert.equal(h.statuses.at(-1).phase,'partial');assert.equal(S.complete(h.saved),true);
});

test('a failed request can recover on a later refresh without leaving it busy',async()=>{
  const overrides={opponent:null},h=harness(overrides);
  assert.equal(await h.sync(),false);overrides.opponent=fixture.L.opponent;
  assert.equal(await h.sync(true),true);assert.equal(h.calls.filter(p=>p==='roster').length,2);
  assert.equal(h.statuses.at(-1).busy,false);assert.equal(S.snapshotIssue(h.saved,now),'');
});

test('zero scores are valid; missing/null scores and missing opponent roster are not',()=>{
  const L=clone(fixture.L);L.matchup.me.score=0;L.matchup.opponent.score=0;
  assert.equal(S.complete(L),true);
  L.matchup.opponent.score=null;assert.equal(S.complete(L),false);
  L.matchup.opponent.score=0;L.opponent.roster=[];assert.equal(S.complete(L),false);
});

test('previous-week snapshots are labeled and cannot claim a current-week forecast',()=>{
  assert.match(S.snapshotIssue({...fixture.L,syncedAt:now-8*86400000},now),/earlier week/);
  assert.equal(S.snapshotIssue({...fixture.L,syncedAt:now-86400000},now),'');
  assert.match(S.snapshotIssue({...fixture.L,syncedAt:now,coreSyncedAt:now-8*86400000},now),/earlier week/);
});

test('weekly rollover is Tuesday 4 AM Eastern through daylight saving changes',()=>{
  const key=s=>S.weekKey(Date.parse(s));
  assert.equal(key('2026-10-20T07:59:59Z'),'2026-10-13');
  assert.equal(key('2026-10-20T08:00:00Z'),'2026-10-20');
  assert.equal(key('2026-11-03T08:59:59Z'),'2026-10-27');
  assert.equal(key('2026-11-03T09:00:00Z'),'2026-11-03');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../desk-core.js');
const E = require('../sports-evidence-core.js');

// Exercise the desk's real navigation against a small browser/history adapter.
// No network, forecasts or saved user records are changed by these journeys.
function browser(load = async () => snapshot) {
  const nodes = new Map(), entries = [{ hash:'#/today', state:null }];
  let cursor = 0;
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set(id === 'game-modal' ? ['hidden'] : []);
      nodes.set(id, { textContent:'', dataset:{}, focus(){},
        classList:{ contains:x=>classes.has(x), add:x=>classes.add(x), remove:x=>classes.delete(x), toggle(){} } });
    }
    return nodes.get(id);
  };
  const ctx = { SportsHubDeskCore:C, SportsHubEvidenceCore:E, SportsHubEvidence:{load},
    document:{getElementById:node,querySelectorAll:()=>[],body:{dataset:{}}},
    location:{hash:'#/today'},localStorage:{getItem:()=>null},state:{aiSport:'all',aiSub:'picks'},
    currentTab:'home',scrollY:0,setTimeout:()=>1,clearTimeout(){},
    scrollTo({top}){ctx.scrollY=top;},
    history:{
      get state(){return entries[cursor].state;},
      pushState(state,unused,hash){entries.splice(++cursor);entries.push({state,hash});ctx.location.hash=hash;},
      replaceState(state,unused,hash){entries[cursor]={state,hash};ctx.location.hash=hash;},
      back(){if(cursor){cursor--;ctx.location.hash=entries[cursor].hash;ctx.SportsHubDesk.restoreRoute();}},
      forward(){if(cursor<entries.length-1){cursor++;ctx.location.hash=entries[cursor].hash;ctx.SportsHubDesk.restoreRoute();}},
    },
    showTab(name,opts){ctx.currentTab=name;ctx.SportsHubDesk.onTab(name,opts);return ctx.render?.(name);},
    closeModal(){node('game-modal').classList.add('hidden');ctx.SportsHubDesk.reportClosed();},
    openGameDetail(sport,id,game){ctx.report={sport,id,game};node('game-modal').classList.remove('hidden');},
  };
  ctx.window=ctx;
  vm.runInNewContext(fs.readFileSync(require.resolve('../desk.js'),'utf8'),ctx);
  return {ctx,api:ctx.SportsHubDesk,node,entries};
}
const game={id:'espn-1',date:'2026-11-15T18:00:00Z',away:{abbr:'PHI'},home:{abbr:'DAL'}};
const published={id:'dk-1',start:game.date,away:game.away,home:game.home,status:'Scheduled'};
const snapshot={leagues:{nfl:{games:[published]}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('Lab selection replaces its entry; Back restores the source position',async()=>{
  const {ctx,api,entries}=browser();
  ctx.scrollY=620;
  api.navigate('matchup-lab');
  api.syncLab({sport:'nfl',tab:'matchups',scope:'all',selected:'dk-1'});
  api.syncLab({sport:'nba',tab:'accuracy',scope:'completed',selected:'dk-2'});
  assert.equal(entries.length,2);
  assert.equal(api.labReturn().label,'Today');
  api.backFromLab();await tick();
  assert.equal(ctx.location.hash,'#/today');assert.equal(ctx.scrollY,620);
  ctx.history.forward();await tick();
  assert.equal(C.route(ctx.location.hash).lab.selected,'dk-2');
});

test('a game report opens its exact Lab game and reopens on Back',async()=>{
  const {ctx,api,node}=browser();
  ctx.scrollY=440;ctx.openGameDetail('nfl',game.id,game);
  await api.openLab('nfl',game);
  assert.equal(C.route(ctx.location.hash).lab.selected,'dk-1');
  assert.equal(api.labReturn().label,'Game report');
  assert.equal(node('game-modal').classList.contains('hidden'),true);
  api.backFromLab();await tick();
  assert.equal(node('game-modal').classList.contains('hidden'),false);
  assert.equal(ctx.report.game,game);assert.equal(ctx.scrollY,440);
  ctx.history.forward();await tick();
  assert.equal(node('game-modal').classList.contains('hidden'),true);
  ctx.history.back();ctx.closeModal();
  assert.equal(ctx.history.state.deskReport,undefined);
});

test('changed kickoff or a failed load leaves the current game report intact',async()=>{
  for(const load of [async()=>snapshot,async()=>{throw new Error('offline');}]){
    const {ctx,api,node}=browser(load);
    const changed={...game,date:'2026-11-15T21:00:00Z'};
    ctx.openGameDetail('nfl',changed.id,changed);
    const trigger={disabled:false,setAttribute(){},removeAttribute(){}};
    await api.openLab('nfl',changed,trigger);
    assert.equal(ctx.location.hash,'#/today');
    assert.equal(node('game-modal').classList.contains('hidden'),false);
    assert.match(node('desk-toast').textContent,/snapshot yet|could not load/);
    assert.equal(trigger.disabled,false);
  }
});

test('late evidence cannot pull the user away from their next destination',async()=>{
  let release;
  const {ctx,api}=browser(()=>new Promise(resolve=>{release=resolve;}));
  const pending=api.openLab('nfl',game);
  api.navigate('fantasy');release(snapshot);await pending;
  assert.equal(ctx.location.hash,'#/fantasy');
});

test('a direct Lab link returns to Today without leaving the app',()=>{
  const {ctx,api,entries}=browser();
  ctx.history.replaceState(null,'','#/matchup-lab?league=nfl&game=dk-1');
  api.restoreRoute();api.backFromLab();
  assert.equal(ctx.location.hash,'#/today');assert.equal(entries.length,1);
});

test('returning to an expanded game list keeps enough rows for its saved position',()=>{
  const {ctx,api,entries}=browser();
  ctx.history.replaceState({deskScroll:2400,deskAgendaLimit:30},'','#/today');
  api.restoreRoute();api.navigate('matchup-lab');
  assert.equal(entries[0].state.deskAgendaLimit,30);
  assert.equal(entries[0].state.deskScroll,2400);
});

test('slow source rendering restores scroll, but cannot scroll a later destination',async()=>{
  const {ctx,api}=browser();
  ctx.scrollY=760;api.navigate('matchup-lab');
  let finish;
  ctx.render=name=>name==='home'?new Promise(resolve=>{finish=resolve;}):undefined;
  api.backFromLab();ctx.scrollY=0;finish();await tick();
  assert.equal(ctx.scrollY,760);
  ctx.render=undefined;api.navigate('matchup-lab');
  ctx.render=name=>name==='home'?new Promise(resolve=>{finish=resolve;}):undefined;
  api.backFromLab();api.navigate('fantasy');finish();await tick();
  assert.equal(ctx.scrollY,0);assert.equal(ctx.location.hash,'#/fantasy');
});

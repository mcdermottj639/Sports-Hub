'use strict';
// v318: CFB projected total ran +2.58 pts above the book line on all 64 v239 pregame rows
// (57 of 64 picks OVER, 19-26 graded). Both the browser (app.js) and the scheduled
// collector (sports-hub-ai) subtract the same fitted offset, and only for CFB.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const ts=fs.readFileSync('supabase/functions/sports-hub-ai/index.ts','utf8');
const app=fs.readFileSync('app.js','utf8');
const offTs=Number(ts.match(/const CFB_TOTAL_OFFSET = ([\d.]+)/)[1]);
const offApp=Number(app.match(/^const CFB_TOTAL_OFFSET = ([\d.]+);/m)[1]);

function loadPredict(conf=new Map()){
  const fn=ts.match(/^async function predict\([^]*?^}/m)[0];
  const ctx=vm.createContext({Math,Date,Promise,Map,CFB_TOTAL_OFFSET:offTs,CFB_TOTAL_CAL:'cfb-total-offset-v1',
    CFB_TIER:{p4:12,g5:0,fcs:-12},PD_SD:{cfb:16.5},CONF_CAP:{cfb:90},
    clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),
    normalCdf:x=>.5*(1+Math.tanh(x*.8)), // shape is irrelevant to the total
    tier:()=> 'p4',conferenceMap:async()=>conf,profiles:{}});
  vm.runInContext(`async function profile(s,t){return profiles[t.id]||null}\n`+stripTypeScriptTypes(fn),ctx);
  return ctx;
}
const team=(id,ppg,papg)=>({id,ppg,papg,pdpg:ppg-papg,form:0,gp:6});
const game={id:'e',date:'2026-10-24T19:30:00Z',neutral:false,home:{id:'h',name:'Home'},away:{id:'a',name:'Away'}};

test('browser and collector carry the same CFB total offset',()=>{
  assert.equal(offTs,2.6);
  assert.equal(offApp,offTs);
});

test('collector CFB total = raw PF/PA average minus the offset, with the raw value kept',async()=>{
  // Real row 190117 (VAN @ UK, Oct 24): saved projection 55.9 under the old formula.
  const c=loadPredict();c.profiles.h=team('h',32.714285714285715,25.857142857142858);c.profiles.a=team('a',23.571428571428573,29.714285714285715);
  const p=await c.predict('cfb',game);
  const raw=(32.714285714285715+25.857142857142858+23.571428571428573+29.714285714285715)/2;
  assert.equal(Math.round(raw*10)/10,55.9);
  assert.equal(p.total,Math.round((raw-2.6)*10)/10); // 53.3
  assert.deepEqual({...p.features.cfbTotal},{raw:55.9,offset:2.6,cal:'cfb-total-offset-v1'});
});

test('collector CFB margin and win probability are unchanged by the total offset',async()=>{
  const c=loadPredict();c.profiles.h=team('h',40,20);c.profiles.a=team('a',30,25);
  const p=await c.predict('cfb',game);
  // margin = (12 + .6*20) - (12 + .6*5) + 3 home field = 12
  assert.equal(p.margin,12);
});

test('missing history leaves the CFB total null rather than a bare negative offset',async()=>{
  const c=loadPredict();c.profiles.h=team('h',40,20);
  const p=await c.predict('cfb',game);
  assert.equal(p.total,null);
  assert.equal(p.features.cfbTotal,undefined);
});

test('the offset is applied only on the CFB path in both files',()=>{
  assert.equal([...ts.matchAll(/-=CFB_TOTAL_OFFSET/g)].length,1);
  assert.match(ts,/if\(sport==='cfb'\)\{[^\n]*total-=CFB_TOTAL_OFFSET;/);
  assert.match(app,/if \(sport === 'cfb' && projTotal != null\) projTotal -= CFB_TOTAL_OFFSET;/);
  assert.equal([...app.matchAll(/-= CFB_TOTAL_OFFSET/g)].length,1);
});

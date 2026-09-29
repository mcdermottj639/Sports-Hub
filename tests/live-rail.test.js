const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const src = require('node:fs').readFileSync(require.resolve('../app.js'),'utf8');
function load(off=[],hidden=false,fail=false,games=[{id:'1'}]) {
 const el=(tag,className='',textContent='')=>({className,textContent,children:[],hidden:false,set innerHTML(v){this.children=[]},appendChild(c){this.children.push(c)},setAttribute(){},addEventListener(){}});
 const n=Object.fromEntries(['rail-wrap','rail-toggle','rail-leagues','live-rail'].map(k=>['#'+k,el()]));
 const saved={'sportshub:railoff':JSON.stringify(off),'sportshub:railhidden':hidden?'1':'0'};
 const s={$:k=>n[k],el,LEAGUES:{mlb:{label:'MLB'}},localStorage:{getItem:k=>saved[k],setItem:(k,v)=>saved[k]=v},document:{querySelectorAll:()=>n['#live-rail'].children.filter(c=>c.className==='lrc')},sortedSports:()=>['mlb'],getGames:async()=>{if(fail)throw Error('offline');return games},ymd:()=>'',sportsDate:()=>new Date(),gameState:()=> 'live',isFav:()=>false,paintLivePips(){},liveRailCard:()=>el('div','lrc')};
 vm.createContext(s);
 vm.runInContext(src.slice(src.indexOf('const RAIL_OFF_KEY'),src.indexOf('// 🔴 pip on the tab')),s);
 vm.runInContext(src.slice(src.indexOf('const RAIL_HIDE_KEY'),src.indexOf('// v192: the 💰')),s);
 return {s,n};
}
test('hidden single league retains working recovery controls',async()=>{
 const {s,n}=load(['mlb']);await s.renderLiveRail();
 assert.equal(n['#rail-wrap'].hidden,false);assert.equal(n['#rail-leagues'].hidden,false);
 assert.match(n['#live-rail'].children[0].textContent,/All leagues hidden/);
 n['#rail-leagues'].children[0].onclick();await s.renderLiveRail();
 assert.equal(n['#live-rail'].children[0].className,'lrc');
});
test('collapsed filtered scores keep the expand button',async()=>{
 const {s,n}=load(['mlb'],true);await s.renderLiveRail();
 assert.equal(n['#rail-wrap'].hidden,true);assert.equal(n['#rail-toggle'].hidden,false);
 assert.match(n['#rail-toggle'].textContent,/SHOW SCORES/);
});
test('empty schedule and failed feed have distinct visible messages',async()=>{
 for(const fail of [false,true]){const {s,n}=load([],false,fail,[]);await s.renderLiveRail();
 assert.equal(n['#rail-wrap'].hidden,false);
 assert.match(n['#live-rail'].children[0].textContent,fail?/temporarily unavailable/:/No games scheduled/);}
});
test('normal scores respect saved collapse preference',async()=>{
 for(const hidden of [false,true]){const {s,n}=load([],hidden);await s.renderLiveRail();
 assert.equal(n['#live-rail'].children[0].className,'lrc');assert.equal(n['#rail-wrap'].hidden,hidden);assert.equal(n['#rail-toggle'].hidden,false);}
});

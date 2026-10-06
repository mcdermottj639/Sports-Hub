const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const src = fs.readFileSync('app.js','utf8');
function setup(fetcher) {
 const events=[], calls=[];
 const ctx={document:{hidden:false,querySelectorAll:()=>[],addEventListener:(...x)=>events.push(x)},navigator:{onLine:true},window:{dispatchEvent:e=>events.push(e),addEventListener:(...x)=>events.push(x)},CustomEvent:class {constructor(type,opts){this.type=type;this.detail=opts.detail;}},sortedSports:()=>[],LEAGUES:Object.fromEntries(['nfl','cfb','mlb','nba'].map(s=>[s,{espnPath:s}])),WEEK_SPORTS:new Set(['nfl','cfb']),ymd:()=> '20261005',sportsDate:()=>new Date(),SITE:'espn',LIVE_RAIL_MS:30000,fetchLive:async url=>{calls.push(url);return fetcher?fetcher(url):{events:[{id:url}]};},normEvent:x=>x,renderLiveRail:async()=>{},refreshOpenGameDetail:async()=>{},liveRailTimer:null,setInterval:(fn,ms)=>{ctx.timer={fn,ms};return 1;},clearInterval:()=>{}};
 vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('let liveScorePending = false;'),src.indexOf('\nasync function renderHome()')),ctx);
 return {ctx,calls,events};
}
test('polls fresh daily/weekly feeds and delivers scores to mounted cards',async()=>{
 const {ctx,calls,events}=setup();let updated;
 ctx.document.querySelectorAll=()=>[{dataset:{liveSport:'mlb',liveId:'espn/mlb/scoreboard?dates=20261005'},_updateLiveScore:g=>updated=g}];
 await ctx.refreshLiveScores();assert.equal(calls.length,6);assert.ok(updated);assert.equal(events[0].type,'sportshub:live-scores');
});
test('hidden and offline sessions skip all requests',async()=>{
 const {ctx,calls}=setup();ctx.document.hidden=true;await ctx.refreshLiveScores();ctx.document.hidden=false;ctx.navigator.onLine=false;await ctx.refreshLiveScores();assert.equal(calls.length,0);
});
test('slow requests cannot overlap and a failed feed does not block next cycle',async()=>{
 let release;const pending=new Promise(r=>release=r);const {ctx,calls}=setup(async()=>{await pending;throw Error('offline');});
 const first=ctx.refreshLiveScores();await ctx.refreshLiveScores();assert.equal(calls.length,6);release();await first;await ctx.refreshLiveScores();assert.equal(calls.length,12);
});
test('30-second timer also resumes on visibility and reconnect',async()=>{
 const {ctx,events}=setup();ctx.startLiveRail();assert.equal(ctx.timer.ms,30000);assert.ok(events.some(e=>e[0]==='visibilitychange'));assert.ok(events.some(e=>e[0]==='online'));
});

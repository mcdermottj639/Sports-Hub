'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../performance-core.js');
const pick=(x={})=>({id:'1',event_id:'401',sport:'nfl',market:'spread',model_version:'nfl-football-v1',provider:'DraftKings',starts_at:'2026-11-01T18:00:00Z',captured_at:'2026-10-27T04:00:00Z',result:'win',selection:'CHI +3',selection_home:false,line:-3,price:-110,...x});
const q=(market,line,minutes=6)=>({[market]:{market,line,provider_name:'DraftKings',observed_at:new Date(Date.parse('2026-11-01T18:00:00Z')-minutes*60000).toISOString()}});

test('spread CLV is from the bettor\'s seat for away and home picks',()=>{
 // away +3 saved, close moved to home -2.5 (line -2.5) → away now +2.5 → we got +0.5 better
 let v=C.closingValue(pick(),q('spread',-2.5));
 assert.equal(v.status,'ok');assert.equal(v.points,0.5);assert.equal(v.pickLine,3);assert.equal(v.closeLine,2.5);assert.equal(v.minutesBefore,6);assert.equal(v.stale,false);
 // home -3 saved, close -3.5 → got the better number by 0.5
 v=C.closingValue(pick({selection:'SEA -3',selection_home:true}),q('spread',-3.5));assert.equal(v.points,0.5);
 // home -3 saved, close -2.5 → worse by 0.5
 v=C.closingValue(pick({selection:'SEA -3',selection_home:true}),q('spread',-2.5));assert.equal(v.points,-0.5);
});
test('total CLV: over wants a lower number, under a higher one',()=>{
 assert.equal(C.closingValue(pick({market:'total',selection:'OVER 44.5',selection_home:null,line:44.5}),q('total',45.5)).points,1);
 assert.equal(C.closingValue(pick({market:'total',selection:'UNDER 46.5',selection_home:null,line:46.5}),q('total',45.5)).points,1);
 assert.equal(C.closingValue(pick({market:'total',selection:'UNDER 46.5',selection_home:null,line:46.5}),q('total',47)).points,-0.5);
});
test('unavailable when no quote, wrong market, or moneyline; stale flag past 60 minutes',()=>{
 assert.equal(C.closingValue(pick(),null).status,'unavailable');
 assert.equal(C.closingValue(pick(),q('total',45)).status,'unavailable');
 assert.equal(C.closingValue(pick({market:'moneyline'}),q('spread',-3)),null);
 assert.equal(C.closingValue(pick({selection_home:undefined}),q('spread',-3)).status,'unavailable');
 assert.equal(C.closingValue(pick(),q('spread',-3,90)).stale,true);
});
test('clvSummary groups settled picks by market, counts beats and unread',()=>{
 const rows=[pick(),pick({id:'2',event_id:'402',selection_home:true,selection:'X -3'}),pick({id:'3',event_id:'403',result:'pending'}),pick({id:'4',event_id:'404',market:'total',selection:'OVER 40',selection_home:null,line:40})];
 const quotes={[C.quoteKey(rows[0])]:q('spread',-2.5),[C.quoteKey(rows[1])]:q('spread',-3)};
 const s=C.clvSummary(rows,quotes);
 assert.equal(s.spread.n,2);assert.equal(s.spread.avg,0.25);assert.equal(s.spread.beat,1);assert.equal(s.spread.tied,1);assert.equal(s.spread.worse,0);assert.equal(s.spread.pending,0);
 assert.equal(s.total.n,0);assert.equal(s.total.pending,1);
});

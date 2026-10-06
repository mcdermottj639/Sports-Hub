const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const src = fs.readFileSync('app.js','utf8');
function setup(fetcher) {
 let hidden=false, expanded=false;
 const away={textContent:'45'},home={textContent:'17'},status={classList:{toggle(){}},textContent:'2:00 - 4th Quarter'};
 const heading={classList:{contains:()=>expanded},_accSet:o=>expanded=o};
 const host={dataset:{},innerHTML:'old play',querySelector:()=>heading};
 const body={querySelector:s=>s.includes('away')?away:s.includes('home')?home:status};
 const nodes={'#md-live-situation':host,'#modal-body':body};
 const data={header:{competitions:[{status:{type:{state:'in',detail:'1:00 - 4th Quarter'}},competitors:[{homeAway:'away',score:'48'},{homeAway:'home',score:'17'}]}]}};
 const ctx={$:s=>nodes[s],document:{hidden:false},modal:()=>({classList:{contains:()=>hidden}}),SITE:'espn',LEAGUES:{nfl:{espnPath:'football/nfl'}},fetchLive:fetcher||async function(){return data},liveSituationHTML:()=>'<div>new play</div>',makeAccordion:()=>{expanded=true;},SEC_OPEN_ALL:999};
 vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('let detailToken = 0;'),src.indexOf('async function openGameDetail(')),ctx);
 vm.runInContext("activeGameDetail = {sport:'nfl',id:'123',token:0}",ctx);
 return {ctx,host,away,home,status,hide:()=>hidden=true,expanded:()=>expanded,data};
}
test('open report updates score, clock and situation and preserves collapsed state',async()=>{
 const x=setup();await x.ctx.refreshOpenGameDetail();assert.equal(x.away.textContent,'48');assert.equal(x.status.textContent,'1:00 - 4th Quarter');assert.match(x.host.innerHTML,/new play/);assert.equal(x.expanded(),false);
});
test('late response cannot replace another game or a closed report',async()=>{
 for(const close of [true,false]) {
 let done;const x=setup(()=>new Promise(r=>done=r));const pending=x.ctx.refreshOpenGameDetail();
 if(close)x.hide();else vm.runInContext('++detailToken',x.ctx);
 done(x.data);await pending;assert.equal(x.away.textContent,'45');assert.equal(x.host.innerHTML,'old play');
 }
});
test('failed summary retains last score and final clears live situation',async()=>{
 const x=setup(async()=>{throw Error('offline')});await x.ctx.refreshOpenGameDetail();assert.equal(x.away.textContent,'45');
 const y=setup();y.data.header.competitions[0].status.type={state:'post',detail:'Final'};await y.ctx.refreshOpenGameDetail();assert.equal(y.status.textContent,'Final');assert.equal(y.host.innerHTML,'');
});

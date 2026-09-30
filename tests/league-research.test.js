'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const ui=require('../betting-signals-ui.js');
test('embedded research locks league without removing deep filters',()=>{
 for(const sport of ['nfl','cfb']){
  const html=ui.systemResultsHTML({filters:{sport,scope:'explore'},lockSport:true});
  assert.doesNotMatch(html,/data-bs-filter="sport"/);
  for(const filter of ['market','rest','division','teamSide','movement','cohort','minGap'])assert.ok(html.includes(`data-bs-filter="${filter}"`));
  if(sport==='cfb'){assert.match(html,/data-bs-filter="ranking"/);assert.doesNotMatch(html,/Fixed-rule tests/);}
 }
});
test('late NFL response cannot overwrite CFB research, and requests freeze their filters',async()=>{
 const host={innerHTML:'',isConnected:true},pending=[],filters={sport:'nfl',scope:'explore'};
 const context=vm.createContext({document:{getElementById:()=>host},signalResultToken:0,signalFilters:filters,
  SportsHubSignalsUI:{systemResultsHTML:v=>`${v.filters.sport}:${v.state}`},
  SportsHubCloudSignals:{loadResults:(rule,unused,dates,f)=>new Promise(resolve=>pending.push({resolve,filters:f}))}});
 vm.runInContext(source.match(/^async function paintSignalResults\([^]*?^}/m)[0],context);
 const nfl=context.paintSignalResults();filters.sport='cfb';const cfb=context.paintSignalResults();
 assert.equal(pending[0].filters.sport,'nfl');
 pending[1].resolve({state:'ready'});await cfb;pending[0].resolve({state:'ready'});await nfl;
 assert.equal(host.innerHTML,'cfb:ready');
});
test('league switches exist, Labs has no research shortcut, and AI links route by sport',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 for(const sport of ['nfl','cfb'])assert.ok(html.includes(`data-sport-view="research" data-sport="${sport}"`));
 assert.doesNotMatch(html,/data-bs-results/);
 const context=vm.createContext({});vm.runInContext(source.match(/^function researchLinksHTML\([^]*?^}/m)[0],context);
 assert.match(context.researchLinksHTML('cfb'),/data-bs-sport="cfb"/);
 assert.doesNotMatch(context.researchLinksHTML('cfb'),/data-bs-sport="nfl"/);
 assert.match(context.researchLinksHTML('all'),/data-bs-sport="nfl"/);
 assert.match(context.researchLinksHTML('all'),/data-bs-sport="cfb"/);
});

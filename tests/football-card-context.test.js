'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
function fixture(sport='nfl',football=true) {
 const element=()=>({classList:{add(){}},dataset:{},setAttribute(){},appendChild(){},querySelector(){return {appendChild(){}};}});
 const context={el:element,esc:String,TIER_META:{},LEAGUES:{nfl:{label:'NFL',emoji:''},cfb:{label:'CFB',emoji:''}},
  gameState:()=> 'scheduled',scheduledLabel:()=> 'Sunday',logoHTML:()=>'',rankHTML:()=>'',
  compactMarketsHTML:()=>'<div class="test-live-picks">Live picks</div>',signalsEnabled:()=>false,
  SportsHubNFLLive:{VERSION:'nfl-football-v1'},SportsHubFootballDevelopment:{mountGame(card){context.atComparison=card.innerHTML;}}};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(require.resolve('../nfl-football-ui.js'),'utf8'),context);
 vm.runInContext(source.match(/^function boardCard\([^]*?^}/m)[0],context);
 const evidence={candidate:{version:'football-v4',drivers:[{label:'Live passing evidence',marginPoints:3.5}],mainUncertainty:'Future performance unproven',qb:{home:{name:'Live QB',weightedDropbacks:100,epa:.2,cpoe:1}}},context:{personnel:{missing:true}}};
 const row={sport,g:{id:'game',home:{name:'Home',abbr:'H'},away:{name:'Away',abbr:'A'}},p:{modelVersion:'nfl-football-v1',football:football?evidence:null}};
 const before=JSON.stringify(row),card=context.boardCard(row);
 assert.equal(JSON.stringify(row),before,'rendering does not alter the forecast or its evidence');
 return {card,context};
}
test('main NFL card exposes live Football read before comparison mounting',()=>{
 const {card,context}=fixture();
 assert.match(card.innerHTML,/Football read/);assert.match(card.innerHTML,/Live passing evidence/);assert.match(card.innerHTML,/Live QB/);
 assert.ok(card.innerHTML.indexOf('Football read')>card.innerHTML.indexOf('test-live-picks'));
 assert.match(context.atComparison,/QB, personnel &amp; conditions/);
 assert.ok(!card.innerHTML.slice(0,card.innerHTML.indexOf('Football read')).includes('<details'));
 assert.equal((card.innerHTML.match(/class="nf-detail"/g)||[]).length,1);
});
test('missing live context is not substituted with a saved comparison',()=>{
 assert.ok(!fixture('nfl',false).card.innerHTML.includes('Football read'));
});
test('college cards do not inherit NFL quarterback evidence',()=>{
 assert.ok(!fixture('cfb').card.innerHTML.includes('Football read'));
});

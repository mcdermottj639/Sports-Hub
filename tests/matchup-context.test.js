'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../sports-evidence-core.js');
const M=require('../matchup-context.js'),UI=require('../sports-evidence.js');
const g={id:'dk-1',start:'2099-11-13T01:15:00Z',status:'Scheduled',home:{abbr:'NYG',score:null},away:{abbr:'WAS',score:null}};
const s={capturedAt:'2099-11-11T10:00:00Z',leagues:{nfl:{games:[g],teams:[]}}};
const row=(extra={})=>({event_id:'espn-1',sport:'nfl',market:'moneyline',model_version:'nfl-football-v1',starts_at:g.start,captured_at:'2099-11-11T10:00:00Z',matchup:'WSH @ NYG',selection:'Giants',selection_home:true,price:-130,model_probability:.51,result:'pending',quality:[],snapshot:{forecast:{margin:1.2,total:44.9}},...extra});
const summary=(extra={})=>({header:{id:'espn-1',competitions:[{date:g.start,status:{type:{state:'pre'}},competitors:[{homeAway:'home',id:'19',team:{id:'19',abbreviation:'NYG'},record:[{type:'total',summary:'5-2-1'}]},{homeAway:'away',id:'28',team:{id:'28',abbreviation:'WSH'}}]}]},pickcenter:[{provider:{name:'DraftKings'},spread:-2.5}],...extra});
const normalize=()=>({provider:'DraftKings',spread:-2.5,ou:41.5,hML:-135,aML:114});
test('official picks require current model, exact start, unambiguous game ID and pregame capture',()=>{
  const valid=row();
  assert.deepEqual(M.officialRows(s,'nfl',g,[row({result:'void'}),row({model_version:'old'}),row({captured_at:g.start}),row({starts_at:'2099-11-13T02:15:00Z'}),valid]),[valid]);
  assert.deepEqual(M.officialRows(s,'nfl',g,[valid,row({event_id:'other'})]),[]);
});
test('earliest saved market is kept and markets remain ML, Spread, Total without changing rows',()=>{
  const rows=[row({market:'total',selection:'OVER 42.5'}),row({captured_at:'2099-11-12T10:00:00Z',selection:'new'}),row({market:'spread'}),row()],before=JSON.stringify(rows);
  const picks=M.officialRows(s,'nfl',g,rows);assert.deepEqual(picks.map(r=>r.market),['moneyline','spread','total']);assert.equal(picks[0].selection,'Giants');assert.equal(JSON.stringify(rows),before);
});
test('ESPN summary verifies orientation and exact kickoff before showing odds or injuries',()=>{
  const d=summary({injuries:[{team:{id:'19'},injuries:[{athlete:{displayName:'QB'},status:'Questionable'}]},{team:{id:'999'},injuries:[{athlete:{displayName:'Wrong team'},status:'Out'}]}],predictor:{homeTeam:{id:'19',gameProjection:'50.1'},awayTeam:{id:'28',gameProjection:'49.5'}}});
  const c=M.parseESPN(d,'nfl',g,normalize);assert.equal(c.home.record,'5-2-1');assert.equal(c.injuries.length,1);assert.equal(c.predictor.home,50.1);assert.equal(c.predictor.away,49.5);
  d.header.competitions[0].date='2099-11-13T02:15:00Z';assert.throws(()=>M.parseESPN(d,'nfl',g,normalize),/identity/);
});
test('ESPN failures retain available saved history; force refresh bypasses cache',async()=>{
  let calls=0;const rows=[row()];
  const loader=M.createLoader({fetchJSON:async()=>{calls++;throw Error('offline');},normalizeOdds:normalize,eventRows:async()=>rows});
  const a=await loader.read(s,'nfl',g,rows);assert.equal(a.rows,rows);assert.equal(a.context,null);assert.match(a.error,/could not load/);
  await loader.read(s,'nfl',g,rows);assert.equal(calls,1);await loader.read(s,'nfl',g,rows,true);assert.equal(calls,2);
});
test('uncached matchup finds ESPN by date, teams and exact start, then reads its saved picks',async()=>{
  const urls=[],d=summary();const loader=M.createLoader({fetchJSON:async url=>{urls.push(url);return url.includes('scoreboard')?{events:[d.header]}:d;},normalizeOdds:normalize,eventRows:async(sport,id)=>{assert.equal(id,'espn-1');return [row()];}});
  const state=await loader.read(s,'nfl',g,[]);assert.equal(state.context.id,'espn-1');assert.equal(state.rows.length,1);assert.match(urls[0],/dates=20991112/);
});
test('comparison shows saved selections and separate latest prices, with correctly oriented gaps',()=>{
  const rows=[row(),row({market:'spread',line:-2.5,selection_home:false,selection:'WSH +2.5',projection:1.2}),row({market:'total',line:42.5,selection:'OVER 42.5',projection:44.9})];
  const c=M.parseESPN(summary(),'nfl',g,normalize),html=M.modelHTML(s,'nfl',g,rows,{context:c});
  assert.match(html,/WAS \+2.5/);assert.match(html,/OVER 42.5/);assert.match(html,/Over 41.5/);assert.match(html,/1.3 pts toward WAS vs latest line/);assert.match(html,/3.4 pts above latest line/);assert.match(html,/51.0% model win probability/);assert.match(html,/quote update time unavailable/);
  assert.ok(html.indexOf('ML · winner')<html.indexOf('<h4>Spread'));assert.ok(html.indexOf('<h4>Spread')<html.indexOf('<h4>Total'));
  c.odds.ou=null;assert.match(M.modelHTML(s,'nfl',g,rows,{context:c}),/2.4 pts above saved line/);
});
test('missing or blank saved numbers never appear as zero and untrusted labels are escaped',()=>{
  const r=row({selection:'<script>',selection_home:null,price:null,model_probability:null,snapshot:{forecast:{margin:null,total:null}},quality:['<img src=x>']});
  const html=M.modelHTML(s,'nfl',g,[r]);assert.match(html,/No matching saved pregame forecast/);assert.match(html,/Saved odds Unavailable/);assert.match(html,/Win probability not saved/);assert.doesNotMatch(html,/<script>|<img src=x>|0.0%/);
});
test('completed game shows final scores beside teams, saved results and no current market/injury forecasts',()=>{
  const final={...g,status:'ScoresOfficial',home:{...g.home,score:23},away:{...g.away,score:17}},snapshot={...s,leagues:{nfl:{games:[final],teams:[]}}};
  const c={...M.parseESPN(summary(),'nfl',g,normalize),state:'post',completed:true,home:{score:23},away:{score:17},injuries:[{name:'Old injury',status:'Out'}],predictor:{home:90}};
  const html=M.modelHTML(snapshot,'nfl',final,[row({result:'win'})],{context:c});assert.match(html,/Final total <b>40/);assert.match(html,/Final margin <b>NYG by 6.0/);assert.match(html,/>Won</);assert.doesNotMatch(html,/Over 41.5|latest line|ESPN · DraftKings/);
  const context=M.contextHTML(final,c);assert.doesNotMatch(context,/Old injury|matchup predictor|Injury report/);
  const header=UI.labMatchupHTML(snapshot,'nfl',final);assert.match(header,/mc-score-team winner/);assert.match(header,/mc-final-score">23/);assert.match(header,/mc-final-score">17/);assert.doesNotMatch(header,/Score audit|Model check|Final scores agree/);
});
test('late response cannot paint a different game after the matchup DOM is replaced',async()=>{
  let resolve;M.configure({fetchJSON:()=>new Promise(r=>{resolve=r;}),normalizeOdds:normalize,eventRows:async()=>[row()]});
  const element=()=>({isConnected:true,innerHTML:'',querySelectorAll:()=>[]}),model=element(),context=element(),host={isConnected:true,querySelector:s=>s==='[data-mc-model]'?model:context};
  const pending=M.mount(host,s,'nfl',g,[row()]);model.isConnected=false;context.isConnected=false;model.innerHTML='New game';resolve(summary());await pending;assert.equal(model.innerHTML,'New game');
});

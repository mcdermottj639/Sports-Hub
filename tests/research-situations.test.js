const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../supabase/functions/_shared/betting-signals-core.js');
const S=require('../supabase/functions/_shared/research-situations.js');
const UI=require('../betting-signals-ui.js');
function row(extra={}){return {id:'d',sport:'nfl',event_id:'1',schedule_instance:'a',rule_id:'nfl_research_spread_away',rule_version:'v1',market:'spread',selection_side:'away',selection_line:3,selected_price:-110,status:'matched',model_context:{engine:'scheduled-nfl-football-v1'},inputs:{matchup:'SF @ NYG',neutral:false,scheduled_start_at:'2026-10-04T17:00:00Z',away_previous_game_at:'2026-09-20T17:00:00Z',home_previous_game_at:'2026-09-27T17:00:00Z',away_post_bye:true,home_post_bye:false,...extra}};}
test('coast travel uses frozen team geography and excludes neutral/unknown venues',()=>{
 assert.equal(S.select([row()],'westeast').length,1);assert.equal(S.select([row()],'westearly').length,1);
 assert.equal(S.select([row({scheduled_start_at:'2026-10-05T00:20:00Z'})],'westearly').length,0);
 assert.equal(S.select([row({matchup:'NYG @ SF'})],'eastwest').length,1);
 assert.equal(S.select([row({neutral:true})],'westeast').length,0);
 assert.equal(S.coverage([row({matchup:'UNKNOWN @ NYG'})],'westeast').unknown,1);
 assert.equal(S.select([row({international:true})],'westeast').length,0);
});
test('bye is verified independently of long rest; opposite and total sides are not counted',()=>{
 assert.equal(S.select([row()],'postbye').length,1);
 assert.equal(S.select([row({away_post_bye:null})],'postbye').length,0);
 assert.equal(S.select([row({away_post_bye:null})],'long').length,1);
 assert.equal(S.select([{...row(),selection_side:'under',market:'total'}],'postbye').length,0);
 assert.equal(S.select([{...row(),selection_side:'home'}],'postbye').length,0);
});
test('international return, road sequence and previous margin require explicit saved facts',()=>{
 const d=row({international:false,away_previous_international:true,away_previous_away:true,away_previous_margin:-17});
 for(const id of ['intlreturn','roadrepeat','loss','bigloss'])assert.equal(S.select([d],id).length,1,id);
 for(const id of ['intlreturn','roadrepeat','loss','bigloss'])assert.equal(S.coverage([row()],id).unknown,1,id);
 assert.equal(S.select([row({international:true,away_previous_international:true})],'intlreturn').length,0);
 assert.equal(S.select([row({away_previous_margin:0})],'loss').length,0);
});
test('coverage deduplicates games and does not mutate rows or manufacture settlements',()=>{
 const d=row(),before=JSON.stringify(d);assert.equal(S.coverage([d,{...d,id:'ml',market:'moneyline'}],'postbye').games,1);
 const html=UI.systemResultsHTML({state:'ready',filters:{scope:'situations'},decisions:[d],settlements:[]});
 assert.match(html,/Find a situation/);assert.match(html,/awaiting results/);assert.doesNotMatch(html,/Matching games/);
 assert.match(UI.situationBodyHTML('postbye'),/Matching games · newest first/);
 assert.doesNotMatch(html,/100\.0%/);assert.equal(JSON.stringify(d),before);
});
test('v338 situation rows show record + win % per market; team rows combine home and road',()=>{
 // SF @ NYG, SF off a bye (road). Second game: NYG off a bye at home. Both SF and NYG bet on.
 const g1=row(),g2={...row({matchup:'DAL @ NYG',away_post_bye:false,home_post_bye:true}),event_id:'2',selection_side:'home',rule_id:'nfl_research_spread_home'};
 const a={...g1,id:'a'},b={...g2,id:'b'},c={...g1,id:'c',market:'moneyline',rule_id:'nfl_research_moneyline_away',selected_price:150};
 const html=UI.systemResultsHTML({state:'ready',filters:{scope:'situations'},decisions:[a,b,c],settlements:[{decision_id:'a',result:'win'},{decision_id:'b',result:'loss'},{decision_id:'c',result:'win'}]});
 const bye=html.match(/data-situation-id="postbye"[\s\S]*?<\/summary>/)[0];
 assert.match(bye,/<b>ML<\/b> 1-0<i>100%<\/i>/);assert.match(bye,/<b>ATS<\/b> 1-1<i>50%<\/i>/);
 assert.match(html,/ML ignores price/);
});
test('original fixed-rule cards hide old collection and keep internals inside details',()=>{
 const d={...row(),rule_id:'nfl_divisional_under'},old={...d,id:'old',model_context:{engine:'scheduled-v239'}};
 const html=UI.systemResultsHTML({state:'ready',filters:{scope:'rules'},decisions:[d,old]});
 assert.doesNotMatch(html,/scheduled-v239<\/p>/);assert.match(html,/1 games/);
 assert.match(html,/<summary>Rule &amp; collection details<\/summary>/);
});
test('collector saves actual venue and prior completed schedule facts without future leakage',async()=>{
 const H=await import('../supabase/functions/sports-hub-ai/signals.ts'),original=global.fetch;
 const competition=(margin,completed=true)=>({neutralSite:false,venue:{address:{country:'England'}},status:{type:{completed}},competitors:[{team:{id:'1'},homeAway:'away',score:{value:20+margin}},{team:{id:'2'},homeAway:'home',score:{value:20}}]});
 try{global.fetch=async url=>({ok:true,json:async()=>String(url).includes('/standings')?{children:[]}:{season:{year:2026,type:2},byeWeek:3,events:[{id:'past',date:'2026-09-20T17:00:00Z',seasonType:{type:2},competitions:[competition(-14)]},{id:'future',date:'2026-12-20T17:00:00Z',seasonType:{type:2},competitions:[competition(25)]},{id:'target',date:'2026-10-04T17:00:00Z',week:{number:4}}]}});
 const i=await H.signalInputs({id:'target',date:'2026-10-04T17:00:00Z',season:2026,seasonType:2,neutral:false,venue:{fullName:'MetLife',address:{country:'USA',state:'NJ'}},home:{id:'2',abbr:'NYG'},away:{id:'1',abbr:'SF'}});
 assert.equal(i.away_previous_margin,-14);assert.equal(i.away_previous_international,true);assert.equal(i.away_previous_away,true);assert.equal(i.away_post_bye,true);assert.equal(i.international,false);assert.equal(i.venue_zone,'Eastern');assert.equal(i.away_base_zone,'Pacific');
 }finally{global.fetch=original;}
});
test('international country missing is unknown and neutral flag remains unknown when absent',async()=>{
 assert.equal(S.international({address:{country:'United States'}}),false);assert.equal(S.international({}),null);
 const H=await import('../supabase/functions/sports-hub-ai/signals.ts');assert.equal(H.signalGame({id:'x',competitions:[{}]}).neutral,null);
});
test('team situations label rows by the team being bet, not a bare home/away side',()=>{
 const away=row({away_previous_game_at:'2026-09-20T17:00:00Z'}),home={...row({matchup:'NYG @ SF',home_previous_game_at:'2026-09-20T17:00:00Z',away_previous_game_at:'2026-09-27T17:00:00Z'}),id:'h',event_id:'2',rule_id:'nfl_research_spread_home',selection_side:'home'};
 const ml={...away,id:'m',rule_id:'nfl_research_moneyline_away',market:'moneyline'};
 const html=UI.systemResultsHTML({state:'ready',filters:{scope:'situations'},decisions:[away,home,ml],settlements:[{decision_id:'d',result:'win'},{decision_id:'h',result:'loss'},{decision_id:'m',result:'win'}]});
 assert.match(html,/data-situation-id="long"/);const long=UI.situationBodyHTML('long');
 assert.match(long,/<h4>Rested team \(10\+ days\) · home<\/h4>/);assert.match(long,/<h4>Rested team \(10\+ days\) · road<\/h4>/);
 assert.match(long,/Bet on · Spread/);assert.match(long,/1W · 0L · early sample/);
 assert.doesNotMatch(long,/Matching team sides only|<h4>Home team<\/h4>|priced results/);
 const dog=UI.situationBodyHTML('westeast');
 assert.match(dog,/<h4>West Coast team traveling east · road<\/h4>/);
 assert.ok(S.defs.filter(d=>!d.bet).every(d=>['intl','neutral','division','nondivision','prime'].includes(d.id)));
});

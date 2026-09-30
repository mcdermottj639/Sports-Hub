const test=require('node:test'),assert=require('node:assert/strict');
global.SportsHubSignalsCore=require('../supabase/functions/_shared/betting-signals-core.js');
const ui=require('../betting-signals-ui.js');
const quote=(extra={})=>({id:'q1',sport:'nfl',event_id:'1',schedule_instance:'s',source:'espn',provider_id:'1',provider_name:'Book',market:'spread',line:-3.5,away_price:-110,observed_at:'2026-09-30T16:00:00Z',...extra});
test('summary has collecting and escaping without invented current matches',()=>{
 assert.match(ui.signalsSummaryHTML({eventId:'x" onmouseover="bad'}),/Collecting evidence/);
 assert.doesNotMatch(ui.signalsSummaryHTML({eventId:'x" onmouseover="bad'}),/data-bs-report="x"/);
 assert.equal(ui.signalsSummaryHTML({sport:'mlb'}),'');
});
test('stale quote suppresses a current rule match',()=>{
 const h=ui.signalsSummaryHTML({quotes:[quote()],rules:[{status:'matched',rule_id:'nfl_divisional_under'}],now:Date.parse('2026-09-30T17:00:00Z')});
 assert.match(h,/current matches unavailable/);assert.doesNotMatch(h,/1 rule match/);
});
test('same provider breaks gaps and unknown providers never connect',()=>{
 const h=ui.chartHTML([quote(),quote({id:'q2',observed_at:'2026-09-30T17:00:00Z'})],'spread','away');
 assert.match(h,/1 gap\(s\)/);assert.equal((h.match(/<path /g)||[]).length,2);
 const unknown=ui.chartHTML([quote({provider_id:'unknown'}),quote({id:'q2',provider_id:'unknown'})],'spread','away');
 assert.equal((unknown.match(/One observation so far/g)||[]).length,2);
});
test('detail filters mixed markets and escapes provider text',()=>{
 const h=ui.systemDetailHTML({quotes:[quote({provider_name:'<img src=x>'}),quote({market:'total',line:99})],market:'spread'});
 assert.match(h,/&lt;img src=x&gt;/);assert.doesNotMatch(h,/\+99/);
});
test('paper ROI percent is not multiplied twice and missing prices remain collecting',()=>{
 const d={id:'d',sport:'nfl',rule_id:'nfl_divisional_under',rule_version:'v1',status:'matched',selected_price:-110};
 const h=ui.systemResultsHTML({decisions:[d],settlements:[{decision_id:'d',result:'win'}]});
 assert.match(h,/\+90\.9%/);assert.doesNotMatch(h,/9090/);
 assert.match(ui.systemResultsHTML({decisions:[{...d,status:'unpriced_match',selected_price:null}]}),/No priced settled entries/);
});
test('condition values are readable with honest missing inputs',()=>{
 const h=ui.systemDetailHTML({rules:[{rule_id:'nfl_road_dog_extra_rest',inputs:{scheduled_start_at:'2026-10-04T17:00:00Z',home_previous_game_at:'2026-09-27T17:00:00Z',away_previous_game_at:'2026-09-24T17:00:00Z'},condition_results:[{key:'regular_season',value:2,passed:true},{key:'venue',value:false,passed:true},{key:'handicap',value:3.5,passed:true},{key:'rest',value:3,passed:true},{key:'provider',value:null,passed:null}]}]});
 for(const value of ['Regular season','Home venue','+3.5 points','10 vs 7 days','Missing'])assert.ok(h.includes(value),value);
 const results=ui.systemResultsHTML({filters:{minGap:'2.5',movement:'up'}});assert.match(results,/Minimum model gap \(points\)/);assert.match(results,/not a probability/);
});

const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const core=require('../supabase/functions/_shared/betting-signals-core.js');
test('current matches follow newest same-schedule quote, without changing saved decisions',()=>{
 const now=Date.now(),kick=new Date(now+3600e3).toISOString(),observed=new Date(now-20*60000).toISOString();
 const context={SportsHubSignalsCore:core,signalGames:new Map(),signalData:new Map(),gameState:()=> 'scheduled',Date};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function signalVM('),source.indexOf('function queueSignalSummary(')),context);
 const inputs={season_type:2,neutral:false,scheduled_start_at:kick,home_previous_game_at:new Date(now-7*864e5).toISOString(),away_previous_game_at:new Date(now-11*864e5).toISOString()};
 const q={event_id:'1',schedule_instance:kick,observed_at:observed,market:'spread',line:-4,away_price:-110,provider_id:'100'};
 const decision={id:1,status:'matched',event_id:'1',selection_line:4};
 const data={current:[{event_id:'1',schedule_instance:kick,scheduled_start_at:kick,observed_at:observed,inputs,rule_evaluations:[{status:'matched'}]}],quotes:[q,{...q,line:-8,observed_at:new Date(now-60000).toISOString()}],decisions:[decision]};
 assert.equal(context.signalVM('1',data).rules[0].status,'not_matched');assert.equal(decision.selection_line,4);
 data.current[0].observed_at=new Date(now-46*60000).toISOString();assert.equal(context.signalVM('1',data).rules,undefined);
});
test('signals remain isolated from model calculation and load before application',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');for(const asset of ['cloud-signals.js','betting-signals-ui.js','betting-signals-core.js'])assert.ok(html.indexOf(asset)<html.indexOf('<script src="app.js'));
 const predict=source.slice(source.indexOf('async function predictGame('),source.indexOf('// --- Game Report (betting intel:'));
 assert.doesNotMatch(predict.slice(0,predict.indexOf('// v244:')),/evaluateRules/);
});

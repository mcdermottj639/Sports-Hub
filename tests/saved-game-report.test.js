const test=require('node:test'),assert=require('node:assert/strict');
const {html}=require('../saved-game-report.js');
test('postgame archive shows withheld evidence without turning research into an official pick',()=>{
 const g={id:'1',date:'2026-10-04T13:30:00Z'};
 const row={sport:'nfl',event_id:'1',captured_at:'2026-10-04T12:00:00Z',starts_at:g.date,model_version:'football-research-nfl-v4-near',market:'moneyline',selection:'Away',result:'win',snapshot:{research:{candidateAvailable:false,evidence:{candidate:{reasons:['QB Out']}}}}};
 const out=html([row],g,null,'nfl');assert.match(out,/Pregame forecast withheld/);assert.match(out,/QB Out/);assert.match(out,/No official pick/);assert.match(out,/excluded from the current model record/);
 const late=html([{...row,captured_at:'2026-10-04T14:00:00Z'}],g,null,'nfl');assert.doesNotMatch(late,/QB Out/);
});
test('college official archive includes original price and projection after final',()=>{
 const g={id:'2',date:'2026-10-03T17:00:00Z'};
 const out=html([{sport:'cfb',event_id:'2',captured_at:'2026-10-03T16:00:00Z',starts_at:g.date,model_version:'v239',market:'spread',selection:'Home -3',price:-110,line:-3,projection:7,result:'win',snapshot:{features:{rating:{home:{r:12}}}}}],g,null,'cfb');
 assert.match(out,/Official saved picks/);assert.match(out,/Saved odds -110/);assert.match(out,/projection 7.0/);assert.match(out,/Saved model inputs/);
});

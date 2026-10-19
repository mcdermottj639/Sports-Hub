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
// v316 — the official picks are a strip, with a flip note only while the live
// read can still differ from the saved side; the archive sits behind one toggle.
test('official strip flags a saved side the live read has moved off, but not after a final',()=>{
 const g={id:'3',date:'2026-10-21T00:15:00Z',state:'pre',home:{name:'San Francisco 49ers',abbr:'SF'},away:{name:'Washington Commanders',abbr:'WSH'}};
 const rows=[{sport:'nfl',event_id:'3',captured_at:'2026-10-19T17:07:00Z',starts_at:g.date,model_version:'v239',market:'total',selection:'OVER 50.5',price:-118,line:50.5,projection:50.7,result:'pending'},
  {sport:'nfl',event_id:'3',captured_at:'2026-10-19T17:07:00Z',starts_at:g.date,model_version:'v239',market:'moneyline',selection:'San Francisco 49ers',price:-405,result:'pending'}];
 const pred={probHome:.792,projMargin:11.1,projTotal:50.7};
 const out=html(rows,g,pred,'nfl',{ou:51.5,spread:-7.5});
 assert.match(out,/gr-saved-k">Official saved picks/);assert.match(out,/now reads Under 51\.5/);
 assert.doesNotMatch(out,/gr-saved-row[^]*Winner[^]*now reads/);
 assert.match(out,/Saved pregame archive · 2 snapshots/);
 const done=html(rows.map(r=>({...r,result:'loss'})),{...g,state:'post'},pred,'nfl',{ou:51.5});
 assert.doesNotMatch(done,/now reads/);assert.match(done,/gr-saved-res l">loss/);
});

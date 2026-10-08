const test=require('node:test'),assert=require('node:assert/strict');
require('../nfl-football-ui.js');
const UI=globalThis.SportsHubNFLFootballUI;
test('model contributions and scenarios name both directions and handle absent or zero values',()=>{
 const game={home:{name:'Dallas'},away:{name:'Tampa Bay'}};
 assert.equal(UI.contribution(3.8,game),'3.8 pts toward Dallas');
 assert.equal(UI.contribution(-1.4,game),'1.4 pts toward Tampa Bay');
 assert.match(UI.contribution(0,game),/no team edge/);
 assert.equal(UI.margin(null,game),'Unavailable');
 assert.equal(UI.margin(-2,{matchup:'Tampa Bay @ Dallas'}),'Tampa Bay by 2.0 pts');
 assert.equal(UI.margin(0,game),'Even');
 assert.equal(UI.margin(2,{home:{name:'A&B'}},'runs'),'A&amp;B by 2.0 runs');
 const out=UI.detail({candidate:{version:'test',drivers:[{label:'Pace',marginPoints:-1.4}],conditional:{margin:3},scenarios:[{name:'Backup',margin:-2}]}},game);
 assert.match(out,/1.4 pts toward Tampa Bay/);assert.match(out,/Dallas by 3.0 pts/);assert.match(out,/Tampa Bay by 2.0 pts/);
});
test('saved reports label projected winners for NFL, CFB, NBA and MLB',()=>{
 const {html}=require('../saved-game-report.js');
 for(const sport of ['nfl','cfb','nba','mlb']){
 const out=html([],{id:'1',home:{name:'Home'},away:{name:'Away'}},{projMargin:-4.2,projTotal:48},sport);
 assert.match(out,new RegExp(`Away by 4.2 ${sport==='mlb'?'runs':'pts'}`));
 }
});

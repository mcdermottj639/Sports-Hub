/* Chronological replay; source history is a retrospective ESPN snapshot. */
const fs=require('node:fs'),N=require('../supabase/functions/_shared/cbb-model.js');
const data=JSON.parse(fs.readFileSync('data/cbb-history.json','utf8'));
const config={...N.CONFIG};
function replay(season,c){
 const rows=data.games.filter(g=>g[2]===season),groups=new Map();
 for(const r of rows){const day=new Date(r[1]).toLocaleDateString('en-CA',{timeZone:'America/New_York'});if(!groups.has(day))groups.set(day,[]);groups.get(day).push(r);}
 const out=[];
 for(const [day,rows] of groups){
  const at=day+'T09:00:00Z',state=N.build(data,season,at,c);
  for(const r of rows){if(Date.parse(r[1])<=Date.parse(at))continue;
   const g={season,date:r[1],home:{id:r[3]},away:{id:r[4]},neutral:r[7]},p=N.predict(state,g);if(!p)continue;
   const actual=r[5]-r[6],total=r[5]+r[6];out.push({id:r[0],date:r[1],margin:p.margin,total:p.total,actual,actualTotal:total,p:p.p,top25:r[9],tournament:r[8],baselineTotal:state.mean});
  }
 }
 return out;
}
function stats(rows){const n=rows.length,avg=f=>rows.reduce((s,r)=>s+f(r),0)/n;return {games:n,winnerAccuracy:avg(r=>(r.p>=.5)===(r.actual>0)?1:0),brier:avg(r=>(r.p-(r.actual>0?1:0))**2),marginMAE:avg(r=>Math.abs(r.margin-r.actual)),totalMAE:avg(r=>Math.abs(r.total-r.actualTotal)),marginBias:avg(r=>r.margin-r.actual),totalBias:avg(r=>r.total-r.actualTotal),homeBaselineAccuracy:avg(r=>r.actual>0?1:0),marginBaselineMAE:avg(r=>Math.abs(3-r.actual)),totalBaselineMAE:avg(r=>Math.abs(r.baselineTotal-r.actualTotal))};}
const train=replay(2025,config);config.marginSD=Math.sqrt(train.reduce((s,r)=>s+(r.margin-r.actual)**2,0)/train.length);
const test=replay(2026,config),scope=test.filter(r=>r.top25||r.tournament);
const validation={trainedSeason:2025,holdoutSeason:2026,trainingGames:train.length,holdout:stats(test),requestedCoverage:stats(scope),top25:stats(test.filter(r=>r.top25)),tournaments:stats(test.filter(r=>r.tournament)),bettingROI:null,limitations:['Retrospective source snapshot; publication-time revisions are not reconstructable','Current D1 membership directory applied to historical scores','No historical odds or player availability','All structural parameters predeclared; only residual scale fitted on 2025'],status:'prospective-validation-pending'};
config.validation=validation;
fs.writeFileSync('supabase/functions/_shared/cbb-model-config.js','/* Structural priors fixed before replay; residual scale from 2024–25 only. */\n(function(root){const config='+JSON.stringify(config,null,2)+';root.SportsHubCBBConfig=config;if(typeof module!=="undefined"&&module.exports)module.exports=config;})(globalThis);\n');
fs.writeFileSync('data/cbb-validation.json',JSON.stringify(validation,null,2)+'\n');console.log(JSON.stringify({marginSD:config.marginSD,validation},null,2));

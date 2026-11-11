#!/usr/bin/env node
'use strict';
// Accept a normalized connector snapshot. No credentials or API scraping.
const fs=require('node:fs');
const path=require('node:path');
const C=require('../sports-evidence-core.js');
const root=path.resolve(__dirname,'..');
function refresh(input,{write=false}={}) {
  const s=typeof input==='string'?JSON.parse(fs.readFileSync(input,'utf8')):input;
  const errors=C.validate(s);
  if(s.source!=='DraftKings Sports connector'||s.kind!=='dated-snapshot')errors.push('Unexpected source');
  for(const [sport,count] of [['nfl',32],['nba',30]]) {
    if(s.leagues?.[sport]?.teams?.length!==count)errors.push('Incomplete '+sport+' team coverage');
    for(const g of s.leagues?.[sport]?.games||[])if(Date.parse(g.observedAt)>Date.parse(s.capturedAt)+60000)errors.push('Game observation after snapshot capture');
  }
  if(errors.length)throw new Error(errors.join('; '));
  const dest=path.join(root,'data/draftkings-evidence.json');
  const old=fs.existsSync(dest)?JSON.parse(fs.readFileSync(dest,'utf8')):null;
  if(old&&Date.parse(s.capturedAt)<Date.parse(old.capturedAt))throw new Error('Refusing an older snapshot');
  // Preserve timestamped team profiles for future prospective feature research.
  // Final-game replays and profiles captured after kickoff cannot be training inputs for that game.
  const observation={schemaVersion:1,source:s.source,capturedAt:s.capturedAt,leagues:Object.fromEntries(Object.entries(s.leagues).map(([k,v])=>[k,{teams:v.teams}]))};
  const archive=path.join(root,'data/evidence-observations',s.capturedAt.replace(/[:.]/g,'-')+'.json');
  if(write){
    fs.mkdirSync(path.dirname(archive),{recursive:true});
    const archived=JSON.stringify(observation)+'\n';
    if(fs.existsSync(archive)&&fs.readFileSync(archive,'utf8')!==archived)throw new Error('Refusing to rewrite a captured observation');
    fs.writeFileSync(archive,archived);
    fs.writeFileSync(dest+'.tmp',JSON.stringify(s)+'\n');fs.renameSync(dest+'.tmp',dest);
  }
  return {capturedAt:s.capturedAt,teams:Object.values(s.leagues).reduce((a,l)=>a+l.teams.length,0),games:Object.values(s.leagues).reduce((a,l)=>a+l.games.length,0),archive:path.relative(root,archive),written:write};
}
if(require.main===module){try{console.log(JSON.stringify(refresh(process.argv.slice(2).find(a=>!a.startsWith('--'))||path.join(root,'data/draftkings-evidence.json'),{write:process.argv.includes('--write')})));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={refresh};

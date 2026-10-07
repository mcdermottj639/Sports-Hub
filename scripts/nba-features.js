// Every feature is formed before adding that game's result to team histories.
const fs=require('node:fs'),NBA=require('../supabase/functions/_shared/nba-model.js');
const games=JSON.parse(fs.readFileSync(require.resolve('../data/nba-history.json'))).games;
const history=new Map(),rows=[];
for(const g of games){
  const h=NBA.profile(history.get(g.home)||[],g.season,g.date),a=NBA.profile(history.get(g.away)||[],g.season,g.date);
  const f=NBA.features(h,a,g);
  if(f&&g.season>=2023)rows.push({id:g.id,date:g.date,season:g.season,f,margin:g.hs-g.as_,total:g.hs+g.as_,win:g.hs>g.as_?1:0});
  for(const [id,pf,pa,home] of [[g.home,g.hs,g.as_,true],[g.away,g.as_,g.hs,false]]){
    if(!history.has(id))history.set(id,[]);
    history.get(id).push({id:g.id,date:g.date,season:g.season,pf,pa,margin:pf-pa,win:pf>pa,home});
  }
}
process.stdout.write(JSON.stringify(rows));

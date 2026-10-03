// Replays the EXACT production feature builder, never full-season target ratings.
const fs=require('node:fs');
const F=require('../supabase/functions/_shared/nfl-football.js');
const N=require('../nfl-model.js');
const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const games=source.games.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function profile(team,target){
  const isHome=g=>F.alias(g.home)===F.alias(team);
  const history=games.filter(g=>Date.parse(g.date)+6*3600000<Date.parse(target.date)&&(isHome(g)||F.alias(g.away)===F.alias(team)));
  const rows=year=>history.filter(g=>g.season===year).map(g=>({date:g.date,home:isHome(g),margin:(isHome(g)?1:-1)*(g.homeScore-g.awayScore),pf:isHome(g)?g.homeScore:g.awayScore,pa:isHome(g)?g.awayScore:g.homeScore}));
  const curr=rows(target.season),prior=rows(target.season-1),gp=curr.length,pw=gp<6&&prior.length>=8?(6-gp)/6*.75:0;
  const avg=(a,f)=>a.length?a.reduce((s,g)=>s+f(g),0)/a.length:0;
  const mix=f=>pw?(gp?avg(curr,f)*(1-pw)+avg(prior,f)*pw:avg(prior,f)):avg(curr,f);
  const h=curr.filter(g=>g.home),a=curr.filter(g=>!g.home),recent=curr.slice(-5);
  return {gp,win:mix(g=>g.margin>0?1:0),margin:mix(g=>g.margin),pf:mix(g=>g.pf),pa:mix(g=>g.pa),hg:h.length,ag:a.length,hwp:avg(h,g=>g.margin>0?1:0),awp:avg(a,g=>g.margin>0?1:0),form:recent.reduce((s,g,i)=>s+g.margin*(i+1),0)/(recent.length*(recent.length+1)/2||1),last:curr.at(-1)?.date};
}
const rows=[];let state,previous;
for(const g of games){
  if(g.season<2018)continue;
  // Identical cutoff for simultaneous kickoffs; target game is never in build().
  if(g.date!==previous){state=F.build(source,g.date);previous=g.date;}
  const f=F.features(state,g);if(!f)continue;
  const h=profile(g.home,g),a=profile(g.away,g),rest=t=>t.last?clamp(Math.round((Date.parse(g.date)-Date.parse(t.last))/864e5),0,10):0;
  const base={neutral:g.neutral,record:h.win-a.win,margin:clamp((h.margin-a.margin)/7,-3,3),form:clamp((h.form-a.form)/7,-3,3),split:g.neutral?0:clamp(Math.min(h.hg,a.ag)/10,0,1)*(h.hwp-a.awp),rest:clamp(rest(h)-rest(a),-5,5)};
  rows.push({id:g.id,date:g.date,season:g.season,features:f,margin:g.homeScore-g.awayScore,total:g.homeScore+g.awayScore,
    baseline:{margin:N.spreadMargin(base),total:N.projectedTotal((h.pf+h.pa+a.pf+a.pa)/2),probHome:N.moneylineProbability(base)},
    qbChanged:g.sides[g.home].qbId!==state.teams[F.alias(g.home)].lastQB||g.sides[g.away].qbId!==state.teams[F.alias(g.away)].lastQB});
}
fs.writeFileSync(process.argv[3],JSON.stringify({sourceGeneratedAt:source.generatedAt,groups:F.FEATURE_GROUPS,rows}));
console.log(`${rows.length} chronological feature rows`);

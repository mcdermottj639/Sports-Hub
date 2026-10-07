/* Projection-only chronological replay of factual ESPN player game logs.
   Usage: node scripts/validate-props.js data/prop-validation-history.json
   Also accepts a folder of <sport>-<athleteId>-<season>.json raw ESPN logs.
   No historical betting return claim. */
const fs=require('fs'),path=require('path'),C=require('../supabase/functions/_shared/prop-model.js');
const dir=process.argv[2];if(!dir)throw Error('Provide the game-log folder or saved history file');
const people=new Map();
if(fs.statSync(dir).isFile()){
 for(const p of JSON.parse(fs.readFileSync(dir,'utf8')).players)people.set(p.sport+':'+p.id,p);
}else for(const file of fs.readdirSync(dir)){
 const m=file.match(/^(nfl|cfb|mlb|nba)-(\d+)-(\d+)\.json$/);if(!m)continue;
 const k=m[1]+':'+m[2];if(!people.has(k))people.set(k,{sport:m[1],id:m[2],rows:[]});people.get(k).rows.push(...C.logs(JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'))));
}
const result={method:'Projection-only chronological replay; fixed last-20 mean. Selected player sample, not league-wide validation. No archived prop odds; probabilities, selection ranking and ROI are unvalidated.',bySport:{}};
for(const player of people.values()){
 const rows=[...new Map(player.rows.map(r=>[r.id,r])).values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 for(const actual of rows){
  if(Date.parse(actual.date)<Date.parse(player.sport==='nba'?'2025-10-01':'2026-01-01'))continue;
  const at=Date.parse(actual.date)-1000,game={id:actual.id,sport:player.sport,state:'pre',seasonType:2,date:actual.date,home:{id:actual.team_id},away:{id:actual.opponent_id},probables:[player.id]},athlete={id:player.id,team:{id:actual.team_id},displayName:player.id};
  for(const market of Object.keys(C.definitions).filter(k=>C.definitions[k][2].includes(player.sport)&&actual.stats[k]!=null)){
   // Dummy quote only exercises the projection path. Never reported as a bet.
   const p=C.project({athlete_id:player.id,market,line:0,price:-110,side:'over',quote_at:new Date(at).toISOString()},rows,athlete,game,at);
   if(!p)continue;
   const s=result.bySport[player.sport]||={players:[],forecasts:0,absoluteError:0,byMarket:{}};if(!s.players.includes(player.id))s.players.push(player.id);
   const m=s.byMarket[market]||={n:0,absoluteError:0};m.n++;m.absoluteError+=Math.abs(p.projection-actual.stats[market]);s.forecasts++;
   if(p.features.history.some(h=>Date.parse(h.date)>=at))throw Error('Future leakage');
  }
 }
}
for(const s of Object.values(result.bySport)){s.players=s.players.length;delete s.absoluteError;for(const m of Object.values(s.byMarket)){m.mae=m.absoluteError/m.n;delete m.absoluteError;}}
process.stdout.write(JSON.stringify(result,null,2)+'\n');

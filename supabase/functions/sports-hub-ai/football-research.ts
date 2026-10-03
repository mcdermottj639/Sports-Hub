import '../_shared/football-research-core.js';
import '../_shared/nfl-challenger.js';
import '../_shared/nfl-football.js';
import '../_shared/nfl-football-config.js';
import '../_shared/nfl-evidence.js';
const C = (globalThis as any).SportsHubFootballResearch;
const N = (globalThis as any).SportsHubNFLChallenger;
const F = (globalThis as any).SportsHubNFLFootball;
const E = (globalThis as any).SportsHubNFLEvidence;
const CONFIG = (globalThis as any).SportsHubNFLFootballConfig;
type Json = Record<string, any>;
// Caches expire within a warm isolate so a later cron can observe new evidence.
const cache = new Map<string, {at:number, data:Promise<any>}>();
async function source(url:string) {
  const old=cache.get(url);if(old && Date.now()-old.at<5*60000)return old.data;
  const data=(async()=>{try{const r=await fetch(url,{headers:{accept:'application/json','user-agent':'Sports-Hub/1.0'},signal:AbortSignal.timeout(10000)});const body=r.ok?await r.json():{};return {...body,_sourceStatus:r.status};}catch(_){return {_sourceStatus:'unavailable'};}})();
  cache.set(url,{at:Date.now(),data});return data;
}
const efficiencyCache = new Map<number,{at:number,data:Promise<any>}>();
const completedHistory = new Map<number,Map<string,any>>();
let footballCache:{at:number,data:Promise<any>}|null=null;
async function footballHistory() {
  if(footballCache&&Date.now()-footballCache.at<15*60000)return footballCache.data;
  const data=source('https://raw.githubusercontent.com/mcdermottj639/Sports-Hub/main/data/nfl-football-live.json');
  footballCache={at:Date.now(),data};return data;
}
const states=new Map<string,any>();
export function primeNFLHistory(efficiency:any) {
  if(!Number.isInteger(efficiency?.season))return;
  const saved=completedHistory.get(efficiency.season)||new Map();
  for(const g of efficiency.observations||[])if(g.id&&g.sides?.length===2)saved.set(String(g.id),g);
  completedHistory.set(efficiency.season,saved);
}
export async function nflEfficiency(year:number) {
  const old=efficiencyCache.get(year);if(old&&Date.now()-old.at<30*60000)return old.data;
  const data=(async()=>{
    const base='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
    const board=await source(`${base}/scoreboard?dates=${year}&seasontype=2&limit=1000`),cutoff=new Date().toISOString();
    const events=(board.events||[]).filter((e:any)=>Number(e.season?.year)===year&&Number(e.season?.type)===2&&(e.status?.type?.completed||e.competitions?.[0]?.status?.type?.completed)&&Date.parse(e.date)+6*3600000<Date.parse(cutoff));
    const saved=completedHistory.get(year)||new Map(),games:any[]=[];let next=0;
    // Bounded parallelism; shared once per league/run, not once per matchup.
    await Promise.all(Array.from({length:6},async()=>{while(next<events.length){const e=events[next++];let parsed=saved.get(String(e.id));if(!parsed){const summary=await source(`${base}/summary?event=${e.id}`);parsed=N.game(summary,year,cutoff);}if(parsed&&parsed.id===String(e.id)&&Date.parse(parsed.date)===Date.parse(e.date)){games.push(parsed);saved.set(parsed.id,parsed);}}}));
    completedHistory.set(year,saved);
    games.sort((a,b)=>a.id.localeCompare(b.id));
    return {...N.fit(games,events.length,cutoff),season:year,source:`${base}/summary`,boardStatus:board._sourceStatus};
  })();
  efficiencyCache.set(year,{at:Date.now(),data});return data;
}
export async function footballEvidence(sport:string,g:Json) {
  const year=Number(g.season)||new Date(g.date).getUTCFullYear();
  if(sport==='cfb') {
    const url=`https://site.web.api.espn.com/apis/fitt/v3/sports/football/college-football/powerindex?season=${year}`;
    const data=await source(url),at=new Date().toISOString(),ratings=C.fpi(data,year,at);
    return {at,fpi:{source:url,updatedAt:ratings.updatedAt,season:year,home:ratings.ratings[g.home.id]??null,away:ratings.ratings[g.away.id]??null},candidateMargin:C.collegeMargin(ratings,g.home.id,g.away.id,g.neutral)};
  }
  const base='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
  const [h,a,injuries,history,summary]=await Promise.all([source(`${base}/teams/${g.home.id}/depthcharts`),source(`${base}/teams/${g.away.id}/depthcharts`),source(`${base}/injuries`),footballHistory(),source(`${base}/summary?event=${g.id}`)]);
  const at=new Date().toISOString();
  const qb={home:C.quarterback(h,injuries,g.home.id,year,at),away:C.quarterback(a,injuries,g.away.id,year,at)};
  const key=`${history.generatedAt}:${at.slice(0,13)}`;
  let state=states.get(key);if(!state){state=F.build(history,at);states.clear();states.set(key,state);}
  const game={home:F.alias(g.home.abbr),away:F.alias(g.away.abbr),date:g.date,season:year,neutral:g.neutral};
  const context={at,personnel:E.personnel({home:h,away:a},injuries,{home:g.home.id,away:g.away.id},year,at),weather:E.weather(summary,g.id,at),coaching:E.coaching(state,game.home,game.away)};
  const candidate=F.candidate(state,history,game,qb,CONFIG,context);
  return {at,sourceStatus:{homeDepth:h?._sourceStatus,awayDepth:a?._sourceStatus,injuries:injuries?._sourceStatus,playByPlay:history?._sourceStatus},qb,context,candidate,
    efficiency:{used:state.used,expected:history.coverage?.expected,method:'opponent-adjusted-play-level-efficiency'},candidateMargin:candidate.margin,candidateTotal:candidate.total};
}
export function researchRows(sport:string,g:Json,p:Json,o:Json|null,evidence:Json,app:string) {
  const at=new Date().toISOString(),phase=C.phase(g.date,at);
  if(!phase||C.phase(g.date,g.observedAt)!==phase||Date.parse(g.observedAt)>Date.parse(at)||g.state!=='pre'||!['nfl','cfb'].includes(sport)||p.quality.length)return [];
  const candidate=evidence.candidateMargin;
  const margin=candidate??p.margin,home=candidate!=null?(evidence.candidate?.probHome!=null?evidence.candidate.probHome>=.5:margin>=0):p.home;
  const total=sport==='nfl'&&candidate!=null?evidence.candidateTotal:p.total;
  const baseline={margin:p.margin,total:p.total,home:p.home,probHome:p.p,version:'v239'};
  const research={phase,baseline,evidence,method:sport==='cfb'?(candidate!=null?'fpi-difference-home3-v1':'baseline-only-fpi-unavailable'):'opponent-adjusted-play-level-efficiency-v1',candidateAvailable:candidate!=null,policy:'research-only',unvalidated:true};
  const base={event_id:g.id,sport,model_version:`${C.versionFor(sport)}-${phase}`,app_version:app,matchup:`${g.away.abbr} @ ${g.home.abbr}`,slate_date:new Date(g.date).toLocaleDateString('en-CA',{timeZone:'America/New_York'}),starts_at:g.date,captured_at:at,confidence:null,tier:null,model_probability:null,market_probability:null,provider:o?.provider||null,quality:[],snapshot:{research,odds:o,neutral:g.neutral,oddsObservedAt:g.observedAt,features:p.features}};
  const row=(market:string,selection:string,selection_home:boolean|null,line:number|null,projection:number|null,price:number|null)=>({...base,market,selection,selection_home,line,projection,price});
  const rows=[row('moneyline',home?g.home.name:g.away.name,home,null,margin,home?o?.hML??null:o?.aML??null)];
  if(o?.spread!=null){const h=margin+o.spread>0;rows.push(row('spread',`${h?g.home.abbr:g.away.abbr} ${h?o.spread:-o.spread}`,h,o.spread,margin,h?o.hSpreadPrice:o.aSpreadPrice));}
  if(o?.ou!=null&&total!=null){const over=total>o.ou;rows.push(row('total',`${over?'OVER':'UNDER'} ${o.ou}`,null,o.ou,total,over?o.overPrice:o.underPrice));}
  return rows;
}

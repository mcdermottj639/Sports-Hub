import '../_shared/football-research-core.js';
const C = (globalThis as any).SportsHubFootballResearch;
type Json = Record<string, any>;
// Caches expire within a warm isolate so a later cron can observe new evidence.
const cache = new Map<string, {at:number, data:Promise<any>}>();
async function source(url:string) {
  const old=cache.get(url);if(old && Date.now()-old.at<5*60000)return old.data;
  const data=(async()=>{try{const r=await fetch(url,{headers:{accept:'application/json','user-agent':'Sports-Hub/1.0'},signal:AbortSignal.timeout(10000)});const body=r.ok?await r.json():{};return {...body,_sourceStatus:r.status};}catch(_){return {_sourceStatus:'unavailable'};}})();
  cache.set(url,{at:Date.now(),data});return data;
}
export async function footballEvidence(sport:string,g:Json) {
  const year=Number(g.season)||new Date(g.date).getUTCFullYear();
  if(sport==='cfb') {
    const url=`https://site.web.api.espn.com/apis/fitt/v3/sports/football/college-football/powerindex?season=${year}`;
    const data=await source(url),at=new Date().toISOString(),ratings=C.fpi(data,year,at);
    return {at,fpi:{source:url,updatedAt:ratings.updatedAt,season:year,home:ratings.ratings[g.home.id]??null,away:ratings.ratings[g.away.id]??null},candidateMargin:C.collegeMargin(ratings,g.home.id,g.away.id,g.neutral)};
  }
  const base='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
  const [h,a,injuries]=await Promise.all([source(`${base}/teams/${g.home.id}/depthcharts`),source(`${base}/teams/${g.away.id}/depthcharts`),source(`${base}/injuries`)]);
  const at=new Date().toISOString();
  return {at,sourceStatus:{homeDepth:h?._sourceStatus,awayDepth:a?._sourceStatus,injuries:injuries?._sourceStatus},qb:{home:C.quarterback(h,injuries,g.home.id,year,at),away:C.quarterback(a,injuries,g.away.id,year,at)},candidateMargin:null};
}
export function researchRows(sport:string,g:Json,p:Json,o:Json|null,evidence:Json,app:string) {
  const at=new Date().toISOString(),phase=C.phase(g.date,at);
  if(!phase||C.phase(g.date,g.observedAt)!==phase||Date.parse(g.observedAt)>Date.parse(at)||g.state!=='pre'||!['nfl','cfb'].includes(sport)||p.quality.length)return [];
  const candidate=sport==='cfb'?evidence.candidateMargin:null;
  const margin=candidate??p.margin,home=sport==='cfb'&&candidate!=null?margin>=0:p.home;
  const baseline={margin:p.margin,total:p.total,home:p.home,probHome:p.p,version:'v239'};
  const research={phase,baseline,evidence,method:sport==='cfb'?(candidate!=null?'fpi-difference-home3-v1':'baseline-only-fpi-unavailable'):'baseline-with-qb-evidence-v1',candidateAvailable:sport==='cfb'?candidate!=null:false,policy:'research-only',unvalidated:true};
  const base={event_id:g.id,sport,model_version:`${C.VERSION}-${phase}`,app_version:app,matchup:`${g.away.abbr} @ ${g.home.abbr}`,slate_date:new Date(g.date).toLocaleDateString('en-CA',{timeZone:'America/New_York'}),starts_at:g.date,captured_at:at,confidence:null,tier:null,model_probability:null,market_probability:null,provider:o?.provider||null,quality:[],snapshot:{research,odds:o,neutral:g.neutral,oddsObservedAt:g.observedAt,features:p.features}};
  const row=(market:string,selection:string,selection_home:boolean|null,line:number|null,projection:number|null,price:number|null)=>({...base,market,selection,selection_home,line,projection,price});
  const rows=[row('moneyline',home?g.home.name:g.away.name,home,null,margin,home?o?.hML??null:o?.aML??null)];
  if(o?.spread!=null){const h=margin+o.spread>0;rows.push(row('spread',`${h?g.home.abbr:g.away.abbr} ${h?o.spread:-o.spread}`,h,o.spread,margin,h?o.hSpreadPrice:o.aSpreadPrice));}
  if(o?.ou!=null&&p.total!=null){const over=p.total>o.ou;rows.push(row('total',`${over?'OVER':'UNDER'} ${o.ou}`,null,o.ou,p.total,over?o.overPrice:o.underPrice));}
  return rows;
}

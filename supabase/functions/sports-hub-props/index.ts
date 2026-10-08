import '../_shared/prop-model.js';
const C=(globalThis as any).SportsHubPropsCore;
const SITE='https://site.api.espn.com/apis/site/v2/sports';
const COMMON='https://site.web.api.espn.com/apis/common/v3/sports';
const URL=Deno.env.get('SUPABASE_URL')!,KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
type J=Record<string,any>;
async function db(path:string,method='GET',body?:any,prefer='return=representation'){
 const r=await fetch(`${URL}/rest/v1/${path}`,{method,headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error(`Database ${r.status}: ${(await r.text()).slice(0,240)}`);const text=await r.text();return text?JSON.parse(text):null;
}
async function fetchData(url:string,html=false){
 const r=await fetch(url,{headers:{accept:html?'text/html':'application/json','user-agent':'Sports-Hub/1.0'},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error(`Source ${r.status}`);return html?r.text():r.json();
}
function event(e:J,sport:string){
 const co=e.competitions?.[0]||{},s=co.status?.type||e.status?.type||{},sides=co.competitors||[];
 const team=(x:any)=>({id:String(x?.team?.id||''),abbr:x?.team?.abbreviation||'',name:x?.team?.displayName||''});
 return {id:String(e.id),sport,date:e.date||co.date,season:Number(e.season?.year),seasonType:Number(e.season?.type),state:s.state,status:s.detail||'',completed:s.completed===true,
 home:team(sides.find((x:any)=>x.homeAway==='home')),away:team(sides.find((x:any)=>x.homeAway==='away')),
 probables:sides.flatMap((x:any)=>(x.probables||[]).map((p:any)=>String(p.athlete?.id||'')))};
}
const day=(d:Date)=>d.toLocaleDateString('en-CA',{timeZone:'America/New_York'}).replaceAll('-','');
async function discover(){
 let run=`discover:${Math.floor(Date.now()/900000)}`;
 let claim=await db('prop_runs?on_conflict=id','POST',{id:run},'resolution=ignore-duplicates,return=representation');
 if(!claim?.length){
  const [prior]=await db(`prop_runs?id=eq.${encodeURIComponent(run)}&select=status`);
  if(prior?.status!=='partial')return {status:'already-scanned'};
  // One bounded retry per interval, preserving the original failed audit row.
  run+=':retry';claim=await db('prop_runs?on_conflict=id','POST',{id:run},'resolution=ignore-duplicates,return=representation');
  if(!claim?.length)return {status:'already-scanned'};
 }
 const errors:any[]=[],found:any[]=[];
 for(const sport of C.SPORTS){
  try{
   const dates=['nba','mlb'].includes(sport)?[day(new Date()),day(new Date(Date.now()+864e5))]:[''];
   for(const date of dates){
    const q=new URLSearchParams({limit:'300',...(date?{dates:date}:{}),...(sport==='cfb'?{groups:'80'}:{})});
    let board=await fetchData(`${SITE}/${C.path[sport]}/scoreboard?${q}`);
    if(['nfl','cfb'].includes(sport)&&board.events?.length&&board.events.every((e:any)=>e.status?.type?.state==='post')&&board.week?.number&&board.season?.year){
     const next=new URLSearchParams(q);next.set('week',String(Number(board.week.number)+1));next.set('seasontype',String(board.season.type));next.set('dates',String(board.season.year));
     const future=await fetchData(`${SITE}/${C.path[sport]}/scoreboard?${next}`).catch(()=>null);if(future?.events?.length)board=future;
    }
    for(const e of board.events||[]){
     if(sport==='cfb'&&!e.competitions?.[0]?.competitors?.some((x:any)=>Number(x.curatedRank?.current)>=1&&Number(x.curatedRank?.current)<=25))continue;
     const g=event(e,sport);if(!g.id||!g.home.id||!g.away.id||!Number.isFinite(Date.parse(g.date)))continue;
     if(Date.parse(g.date)<Date.now()-864e5)continue;
     const preseason=g.seasonType===1,played=g.state!=='pre'||Date.parse(g.date)<=Date.now();
     found.push({sport,event_id:g.id,starts_at:g.date,matchup:`${g.away.abbr} @ ${g.home.abbr}`,game:g,state:g.state,
      coverage_status:preseason?'preseason':played?'not_captured':'queued',coverage_note:preseason?'Preseason props are excluded':played?'No pregame prop picks were saved':'Waiting for the first prop scan',next_poll_at:preseason||played?null:new Date().toISOString()});
    }
   }
  }catch(e){errors.push({sport,error:String(e)});}
 }
 // Insert-only discovery cannot reset saved picks, polling leases or coverage.
 if(found.length)await db('prop_games?on_conflict=sport,event_id','POST',[...new Map(found.map(g=>[g.sport+g.event_id,g])).values()],'resolution=ignore-duplicates,return=minimal');
 await db(`prop_runs?id=eq.${encodeURIComponent(run)}`,'PATCH',{finished_at:new Date().toISOString(),status:errors.length?'partial':'ok',details:{games:found.length,errors}});
 return {games:found.length,errors};
}
async function mapLimit(items:any[],limit:number,fn:(x:any)=>Promise<any>){
 const out:any[]=Array(items.length);let i=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(i<items.length){const at=i++;out[at]=await fn(items[at]);}}));return out;
}
async function gameNow(job:any){
 const data=await fetchData(`${SITE}/${C.path[job.sport]}/summary?event=${job.event_id}`),head=data.header||{},co=head.competitions?.[0]||{};
 if(String(head.id)!==String(job.event_id))throw Error('Game identity mismatch');
 const g={...job.game,...event({...head,id:job.event_id,date:co.date||head.date||job.starts_at},job.sport)};
 g.season=Number(head.season?.year)||job.game.season;g.seasonType=Number(head.season?.type)||job.game.seasonType;
 if(!g.home.id||!g.away.id)throw Error('Game identity unavailable');return {g,data};
}
async function playerHistory(sport:string,id:string,year:number,prior=true){
 const list=await Promise.all((prior?[year,year-1]:[year]).map(async y=>{
  try{return C.logs(await fetchData(`${COMMON}/${C.path[sport]}/athletes/${id}/gamelog?season=${y}`));}catch(e){if(y===year)throw e;return [];}
 }));return list.flat();
}
async function worker(){
 const [job]=await db('rpc/claim_prop_game','POST',{});if(!job)return {status:'idle'};
 const key=`sport=eq.${job.sport}&event_id=eq.${job.event_id}`,run=`game:${job.sport}:${job.event_id}:${Date.now()}`;
 await db('prop_runs','POST',{id:run});
 const finish=async(patch:J)=>{await db(`prop_games?${key}`,'PATCH',{checked_at:new Date().toISOString(),lease_until:null,...patch});await db(`prop_runs?id=eq.${encodeURIComponent(run)}`,'PATCH',{finished_at:new Date().toISOString(),status:patch.coverage_status==='source_error'?'error':'ok',details:{sport:job.sport,event:job.event_id,...patch}});return patch;};
 const later=(ms:number)=>new Date(Date.now()+ms).toISOString();
 try{
  const {g,data}=await gameNow(job),saved=await db(`prop_picks?${key}&model_version=eq.${C.VERSION}&select=*`);
  const year=g.season||(new Date(g.date).getUTCFullYear()+(g.sport==='nba'&&new Date(g.date).getUTCMonth()>=8?1:0));
  if(saved.length){
   for(const p of saved.filter((x:any)=>x.result==='pending')){
    if(g.state!=='post'&&!/cancel|postpon/i.test(g.status)&&Date.parse(g.date)===Date.parse(p.starts_at))continue;
    const dnp=C.boxScoreRow(p,g,data)?.didNotPlay===true;
    let history:any[]=[];
    if(g.state==='post'&&g.completed&&!dnp){
     try{history=await playerHistory(g.sport,p.athlete_id,year,false);}
     catch(e){console.warn('Prop game log unavailable; checking final box score',g.sport,g.id,p.athlete_id,String(e).slice(0,120));}
    }
    const result=C.settle(p,g,history,dnp,data);
    if(result)await db(`prop_picks?id=eq.${p.id}&result=eq.pending`,'PATCH',{result:result.result,actual:result.actual,settled_at:new Date().toISOString(),settlement_note:result.reason});
   }
   const pending=await db(`prop_picks?${key}&result=eq.pending&select=id`);
   return finish({game:g,state:g.state,coverage_status:pending.length?'saved':'settled',coverage_note:pending.length?(g.state==='post'?'Waiting for final player statistics':'Selections and original lines are saved'):'Final prop results recorded',pick_count:saved.length,next_poll_at:pending.length?(Date.parse(g.date)>Date.now()?new Date(Date.parse(g.date)+2*3600000).toISOString():later(15*60000)):null});
  }
  if(g.state!=='pre'||g.seasonType===1||Date.parse(g.date)<=Date.now()||/cancel|postpon|suspend|delay/i.test(g.status))return finish({state:g.state,coverage_status:g.seasonType===1?'preseason':'not_captured',coverage_note:g.seasonType===1?'Preseason props are excluded':'No pregame prop picks were saved',next_poll_at:null});
  if(Date.parse(g.date)!==Date.parse(job.starts_at))await db(`prop_games?${key}`,'PATCH',{starts_at:g.date,game:g});
  const html=await fetchData(`https://www.espn.com/${g.sport==='cfb'?'college-football':g.sport}/odds/_/gameId/${g.id}`,true),at=new Date().toISOString();
  const pkg=C.packageFromHTML(html,g.id),quotes=C.quotes(pkg,g.sport,g.id,at),refresh=Date.parse(g.date)-Date.now()>864e5?3600000:15*60000;
  if(Date.parse(pkg.gmStrp?.dt)!==Date.parse(g.date))throw Error('Prop feed start time does not match this game');
  if(!quotes.length)return finish({state:g.state,coverage_status:'waiting_lines',coverage_note:'No supported player prop lines are posted in the available feed',quote_count:0,modeled_count:0,next_poll_at:later(refresh)});
  const ids=[...new Set(quotes.map((q:any)=>q.athlete_id))];
  // Never silently call a truncated scan the best two in the game.
  if(ids.length>32)throw Error('Prop coverage exceeds this worker’s supported scan size');
  let failures=0;
  const candidates=(await mapLimit(ids,5,async(id)=>{
   try{
    const [detail,history]=await Promise.all([fetchData(`${COMMON}/${C.path[g.sport]}/athletes/${id}`),playerHistory(g.sport,id,year)]);
    const athlete=detail.athlete||detail;return quotes.filter((q:any)=>q.athlete_id===id).map((q:any)=>C.project(q,history,athlete,g,Date.now())).filter(Boolean);
   }catch(_){failures++;return [];}
  })).flat();
  // Retry an incomplete scan; a temporary player-data failure must not choose the winner.
  if(failures)return finish({coverage_status:'source_error',coverage_note:`Player data was unavailable for ${failures} athletes; retrying the full scan`,quote_count:quotes.length,modeled_count:candidates.length,next_poll_at:later(15*60000)});
  const chosen=C.select(candidates),captured=new Date().toISOString();
  if(Date.parse(g.date)<=Date.now())return finish({state:g.state,coverage_status:'not_captured',coverage_note:'Game started before the prop scan completed',next_poll_at:null});
  if(chosen.length)await db('prop_picks?on_conflict=sport,event_id,model_version,rank','POST',chosen.map((p:any)=>({...p,sport:g.sport,event_id:g.id,model_version:C.VERSION,starts_at:g.date,captured_at:captured,features:{...p.features,candidates_evaluated:candidates.length,quotes_observed:quotes.length,source_url:`https://www.espn.com/${g.sport==='cfb'?'college-football':g.sport}/odds/_/gameId/${g.id}`}})),'resolution=ignore-duplicates,return=minimal');
  return finish({state:g.state,coverage_status:chosen.length?'saved':'insufficient_data',coverage_note:chosen.length?`${chosen.length} ranked props saved from ${candidates.length} modeled selections`:'Posted props do not yet have enough verified player history',quote_count:quotes.length,modeled_count:candidates.length,pick_count:chosen.length,next_poll_at:chosen.length?new Date(Date.parse(g.date)+2*3600000).toISOString():later(refresh)});
 }catch(e){console.error('Prop scan failed',job.sport,job.event_id,String(e).slice(0,240));return finish({coverage_status:'source_error',coverage_note:'The prop data source is temporarily unavailable. Automatic collection will retry.',next_poll_at:later(15*60000)});}
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 try{const body=await req.json().catch(()=>({}));const result=body.mode==='discover'?await discover():await worker();return Response.json(result);}catch(e){return Response.json({error:String(e)},{status:500});}
});

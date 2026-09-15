const MODEL_VERSION = 'v239';
const APP_VERSION = 'v239';
const SPORTS = ['nfl', 'cfb', 'mlb'] as const;
type Sport = typeof SPORTS[number];
type Json = Record<string, any>;

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const CORE = 'https://site.api.espn.com/apis/v2/sports';
const BBCORE = 'https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb';
const PATH: Record<Sport, string> = {
  nfl: 'football/nfl', cfb: 'football/college-football', mlb: 'baseball/mlb',
};
const PD_SCALE: Record<Sport, number> = { nfl: 7, cfb: 14, mlb: 2.2 };
const PD_SD: Record<Sport, number> = { nfl: 13.5, cfb: 16.5, mlb: 4 };
const CONF_CAP: Record<Sport, number> = { nfl: 85, cfb: 90, mlb: 72 };
const ATS_EDGE_MIN: Partial<Record<Sport, number>> = { nfl: 2, cfb: 3 };
const TOTAL_MIN: Record<Sport, number> = { nfl: 4, cfb: 6, mlb: 1.5 };
const TOTAL_MAX: Record<Sport, number> = { nfl: 14, cfb: 21, mlb: 4 };
const PARK: Record<string, number> = { COL:113,CIN:106,BOS:106,KC:104,ARI:103,PHI:103,BAL:103,TEX:103,ATL:102,CHW:101,WSH:101,LAA:101,TOR:101,HOU:101,CHC:100,MIN:100,NYY:100,STL:99,PIT:99,MIL:99,CLE:98,LAD:97,NYM:97,TB:96,DET:96,ATH:95,SD:95,MIA:95,SF:93,SEA:92 };
const MLB_SP_ERA = 4.3;
const CFB_TIER: Record<string, number> = { p4: 12, g5: 0, fcs: -12 };

const clamp = (v:number, lo:number, hi:number) => Math.max(lo, Math.min(hi, v));
const logistic = (z:number) => 1 / (1 + Math.exp(-z));
const number = (v:any) => v == null || String(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const american = (v:any) => { const n = number(v); return n != null && Math.abs(n) >= 100 ? n : null; };
const implied = (v:any) => { const n = american(v); return n == null ? null : n < 0 ? -n / (100 - n) : 100 / (100 + n); };
const ymd = (d:Date) => d.toISOString().slice(0, 10).replaceAll('-', '');
const isoDate = (d:string) => `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
const wait = (ms:number) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(url:string, retries = 2):Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Sports-Hub/1.0' } });
      if (response.ok) return await response.json();
      if (response.status < 500 || i === retries) throw new Error(`ESPN ${response.status}: ${url}`);
    } catch (error) { if (i === retries) throw error; }
    await wait(200 * (i + 1));
  }
}

function team(c:any) {
  const t = c?.team || {};
  const rank = Number(c?.curatedRank?.current);
  return { id:String(t.id || ''), name:t.displayName || t.name || '', abbr:t.abbreviation || '',
    score:number(c?.score?.value ?? c?.score), winner:c?.winner === true,
    rank:rank >= 1 && rank <= 25 ? rank : null, conf:t.conferenceId == null ? null : String(t.conferenceId),
    probables:c?.probables || [], leaders:c?.leaders || [] };
}
function event(ev:any) {
  const c = ev.competitions?.[0] || {}, sides = c.competitors || [];
  const h = sides.find((x:any) => x.homeAway === 'home') || sides[0] || {};
  const a = sides.find((x:any) => x.homeAway === 'away') || sides[1] || {};
  const st = ev.status?.type || c.status?.type || {};
  return { id:String(ev.id), date:ev.date, state:st.state, status:st.shortDetail || st.detail || '',
    seasonType:Number(ev.season?.type ?? c.season?.type) || null, neutral:c.neutralSite === true,
    home:team(h), away:team(a), odds:c.odds?.[0] || null };
}

async function scoreboard(sport:Sport, date?:string, params:Json = {}) {
  const q = new URLSearchParams();
  if (sport === 'cfb') { q.set('groups', '80'); q.set('limit', '300'); }
  if (date) q.set('dates', date);
  Object.entries(params).forEach(([k,v]) => q.set(k, String(v)));
  const data = await json(`${SITE}/${PATH[sport]}/scoreboard?${q}`);
  return { data, games:(data.events || []).map(event) };
}

function odds(raw:any, g:any) {
  if (!raw) return null;
  const details = raw.details || raw.shortDetails || null;
  const hML = american(raw.homeTeamOdds?.moneyLine), aML = american(raw.awayTeamOdds?.moneyLine);
  let favHome:any = null, dML:any = null;
  const favorite = typeof details === 'string' ? details.match(/([A-Za-z]{2,5})\s*([+-]\d{3,4})\b/) : null;
  if (favorite) {
    dML = american(favorite[2]);
    favHome = favorite[1].toUpperCase() === String(g.home.abbr).toUpperCase() ? true
      : favorite[1].toUpperCase() === String(g.away.abbr).toUpperCase() ? false : null;
  }
  let spread = number(raw.spread);
  if (spread != null && Math.abs(spread) >= 100) spread = null;
  if (spread == null && typeof details === 'string') {
    if (/^(pk|pick['’]?em|even)$/i.test(details.trim())) spread = 0;
    const m = details.match(/([A-Za-z]{2,5})\s*(-\d+(?:\.\d+)?)/);
    if (m && Math.abs(Number(m[2])) < 100) spread = m[1].toUpperCase() === String(g.home.abbr).toUpperCase() ? Number(m[2]) : -Number(m[2]);
  }
  if (favHome == null && hML != null && aML != null) favHome = hML < aML;
  return { details, hML, aML, dML, favHome, spread, ou:number(raw.overUnder ?? raw.total),
    hSpreadPrice:american(raw.homeTeamOdds?.spreadOdds), aSpreadPrice:american(raw.awayTeamOdds?.spreadOdds),
    overPrice:american(raw.overOdds), underPrice:american(raw.underOdds), provider:raw.provider?.name || null };
}

function parseSchedule(payload:any, teamId:string, before:string) {
  const cut = Date.parse(before), rows:any[] = [];
  for (const ev of payload?.events || []) {
    const c = ev.competitions?.[0];
    if (!c?.status?.type?.completed || Number(ev?.seasonType?.type ?? ev?.season?.type) === 1 || !(Date.parse(ev.date) < cut)) continue;
    const me = (c.competitors || []).find((x:any) => String(x.team?.id) === teamId);
    const op = (c.competitors || []).find((x:any) => String(x.team?.id) !== teamId);
    const ms = number(me?.score?.value ?? me?.score?.displayValue), os = number(op?.score?.value ?? op?.score?.displayValue);
    if (!me || ms == null || os == null) continue;
    rows.push({ date:ev.date, margin:ms-os, pf:ms, pa:os, home:me.homeAway === 'home', win:me.winner === true || ms > os });
  }
  return rows.sort((a,b) => Date.parse(a.date) - Date.parse(b.date));
}
async function profile(sport:Sport, side:any, before:string) {
  if (!side.id) return null;
  const url = `${SITE}/${PATH[sport]}/teams/${side.id}/schedule`;
  const data = await json(url).catch(() => null), games = parseSchedule(data, side.id, before);
  let prior:any = null, priorW = 0;
  if (games.length < 6) {
    const year = Number(data?.season?.year) || new Date(before).getUTCFullYear();
    const old = await json(`${url}?season=${year-1}`).catch(() => null), pg = parseSchedule(old, side.id, before);
    if (pg.length >= 8) {
      const avg = (f:(g:any)=>number) => pg.reduce((s:number,g:any) => s + f(g), 0) / pg.length;
      prior = { winPct:avg(g=>g.win?1:0), pdpg:avg(g=>g.margin), ppg:avg(g=>g.pf), papg:avg(g=>g.pa) };
      priorW = ((6-games.length)/6)*0.75;
    }
  }
  if (!games.length && !prior) return null;
  const gp = games.length, avg = (f:(g:any)=>number) => gp ? games.reduce((s,g)=>s+f(g),0)/gp : 0;
  const mix = (v:number, p:number) => prior ? (gp ? v*(1-priorW)+p*priorW : p) : v;
  const recent = games.slice(-5); let ws=0, wt=0; recent.forEach((g,i)=>{ws+=g.margin*(i+1);wt+=i+1;});
  const hg=games.filter(g=>g.home), rg=games.filter(g=>!g.home), wp=(x:any[])=>x.length?x.filter(g=>g.win).length/x.length:null;
  return { gp, winPct:mix(avg(g=>g.win?1:0),prior?.winPct), pdpg:mix(avg(g=>g.margin),prior?.pdpg),
    ppg:mix(avg(g=>g.pf),prior?.ppg), papg:mix(avg(g=>g.pa),prior?.papg), form:wt?ws/wt:0,
    homeWP:wp(hg),roadWP:wp(rg),homeGP:hg.length,roadGP:rg.length,lastDate:gp?games[gp-1].date:null,blended:priorW>0 };
}

function stat(stats:any[], keys:string[]) {
  const x=(stats||[]).find(s=>keys.some(k=>String(s.abbreviation||'').toUpperCase()===k.toUpperCase() || String(s.name||'').toLowerCase()===k.toLowerCase()));
  return number(x?.value ?? x?.displayValue);
}
function innings(v:any) { const n=number(v); if(n==null||n<0)return null; const w=Math.floor(n),o=Math.round((n-w)*10); return o<=2?w+o/3:null; }
async function starter(probable:any, date:string) {
  const supplied=probable?.statistics||[], id=probable?.athlete?.id;
  if(!id)return null;
  const year=new Date(date).getUTCFullYear();
  const data=await json(`${BBCORE}/seasons/${year}/types/2/athletes/${id}/statistics`).catch(()=>null);
  const stats=[...(data?.splits?.categories?.find((c:any)=>c.name==='pitching')?.stats||[]),...supplied];
  const raw=stat(stats,['ERA','earnedRunAverage']), ip=innings(stat(stats,['IP','inningsPitched','innings']))||0;
  return raw==null?null:{ id:String(id), raw, era:(ip*raw+60*MLB_SP_ERA)/(ip+60), ip, whip:stat(stats,['WHIP']) };
}
async function starterForm(athleteId:string, before:string) {
  if(!athleteId)return null;
  const data=await json(`https://site.web.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/${athleteId}/gamelog`).catch(()=>null);
  if(!data)return null;
  const names=(data.names||data.labels||[]).map((n:any)=>String(n||'').toLowerCase()),meta=data.events||{},games:any[]=[];
  for(const st of data.seasonTypes||[])for(const cat of st.categories||[])for(const e of cat.events||[]){const id=e.eventId||e.id,m=meta[id]||{},date=m.gameDate||m.date,dict:any={};(e.stats||[]).forEach((v:any,i:number)=>{if(names[i])dict[names[i]]=v;});if(date&&Date.parse(date)<Date.parse(before))games.push({date:Date.parse(date),dict});}
  const value=(d:any,...keys:string[])=>{for(const k of keys)if(d[k]!=null&&d[k]!==''){const n=parseFloat(d[k]);return Number.isFinite(n)?n:0;}return 0;};
  const outs=(v:any)=>{const n=parseFloat(v)||0,w=Math.floor(n);return w*3+Math.round((n-w)*10);};
  const recent=games.sort((a,b)=>b.date-a.date).slice(0,3);let er=0,o=0,bb=0,h=0;
  for(const g of recent){er+=value(g.dict,'earnedruns','er');o+=outs(value(g.dict,'inningspitched','ip','innings'));bb+=value(g.dict,'walks','bb','baseonballs');h+=value(g.dict,'hits','h');}
  return o<12?null:{era:er*27/o,whip:(bb+h)*3/o,starts:recent.length};
}
async function ops(teamId:string, date:string) {
  const y=new Date(date).getUTCFullYear(), data=await json(`${BBCORE}/seasons/${y}/types/2/teams/${teamId}/statistics`).catch(()=>null);
  for(const c of data?.splits?.categories||[]) for(const s of c.stats||[]) if(String(s.abbreviation||'').toUpperCase()==='OPS') return number(s.value??s.displayValue);
  return null;
}

let cfbConferences:Promise<Map<string,string>>|null=null;
async function conferenceMap() {
  if(cfbConferences)return cfbConferences;
  cfbConferences=(async()=>{
    const out=new Map<string,string>(), data=await json(`${CORE}/football/college-football/standings?level=3`).catch(()=>null);
    const walk=(node:any,path:string[])=>{ const name=node?.name||node?.displayName||node?.abbreviation||''; const next=[...path,name].filter(Boolean); const entries=node?.standings?.entries||node?.entries||[]; for(const e of entries) if(e.team?.id) out.set(String(e.team.id),next.join(' / ')); for(const child of node?.children||[])walk(child,next); };
    for(const child of data?.children||[])walk(child,[]); return out;
  })(); return cfbConferences;
}
function tier(name:string, teamName:string) {
  if(/notre dame/i.test(teamName))return 'p4';
  if(/\bfcs\b|football championship/i.test(name))return 'fcs';
  if(/\b(sec|southeastern|big ten|big 10|b1g|acc|atlantic coast|big 12|big xii)\b/i.test(name))return 'p4';
  return name?'g5':null;
}

const NFL_ML={i:.203692,record:.611511,margin:.407612,form:-.027132,split:.119897,rest:.018756};
const NFL_SP={i:1.595353,record:1.405095,margin:3.783585,form:-.174039,split:2.633208,rest:.083451};
function normalCdf(x:number){const t=1/(1+.3275911*Math.abs(x)/Math.SQRT2),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-(x*x)/2);return x>=0?.5*(1+y):.5*(1-y);}
function invNorm(p:number){if(!(p>0&&p<1))return 0;const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239],b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572],c=[-.007784894002430293,-.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],d=[.007784695709041462,.3224671290700398,2.445134137142996,3.754408661907416];let q:number,r:number;if(p<.02425){q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}if(p>.97575){q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}q=p-.5;r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)}

async function predict(sport:Sport,g:any){
  const [h,a]=await Promise.all([profile(sport,g.home,g.date),profile(sport,g.away,g.date)]);
  const quality:string[]=[]; if(!h||!a)quality.push('Incomplete team history');
  let p=.5,margin=0,total=h&&a?(h.ppg+h.papg+a.ppg+a.papg)/2:null,features:any={home:h,away:a};
  if(sport==='nfl'&&h&&a){const ss=clamp(Math.min(h.homeGP,a.roadGP)/10,0,1),split=g.neutral?0:ss*((h.homeWP??0)-(a.roadWP??0)),day=864e5,hr=h.lastDate?clamp(Math.round((Date.parse(g.date)-Date.parse(h.lastDate))/day),0,10):0,ar=a.lastDate?clamp(Math.round((Date.parse(g.date)-Date.parse(a.lastDate))/day),0,10):0;const f={record:h.winPct-a.winPct,margin:clamp((h.pdpg-a.pdpg)/7,-3,3),form:clamp((h.form-a.form)/7,-3,3),split,rest:clamp(hr-ar,-5,5)};p=logistic((g.neutral?0:NFL_ML.i)+NFL_ML.record*f.record+NFL_ML.margin*f.margin+NFL_ML.form*f.form+NFL_ML.split*f.split+NFL_ML.rest*f.rest);margin=(g.neutral?0:NFL_SP.i)+NFL_SP.record*f.record+NFL_SP.margin*f.margin+NFL_SP.form*f.form+NFL_SP.split*f.split+NFL_SP.rest*f.rest;total=total==null?null:28.832+.3679*total;features.nfl=f;}
  if(sport==='cfb'){const cm=await conferenceMap(),ht=tier(cm.get(g.home.id)||'',g.home.name),at=tier(cm.get(g.away.id)||'',g.away.name);if(!ht||!at)quality.push('Unverified college team classification');const hr=(CFB_TIER[ht||'g5']||0)+(ht==='fcs'?.3:.6)*(h?.pdpg||0),ar=(CFB_TIER[at||'g5']||0)+(at==='fcs'?.3:.6)*(a?.pdpg||0);margin=hr-ar+(g.neutral?0:3)+clamp((h?.form||0)-(a?.form||0),-20,20)*.25;p=normalCdf(margin/PD_SD.cfb);features.rating={home:{tier:ht,r:hr},away:{tier:at,r:ar}};}
  if(sport==='mlb'){
    let z=0; if(h&&a){z+=.6*(h.winPct-a.winPct)+.9*clamp((h.pdpg-a.pdpg)/2.2,-3,3)+.4*clamp((h.form-a.form)/2.2,-3,3);const s=clamp(Math.min(h.homeGP,a.roadGP)/10,0,1);z+=.7*s*(((h.homeWP??0)-(a.roadWP??0))-.06)+.24;}
    else z=.24;
    const hp=g.home.probables?.[0],ap=g.away.probables?.[0];
    const [hs,awayStarter,ho,ao,hf,af]=await Promise.all([starter(hp,g.date),starter(ap,g.date),ops(g.home.id,g.date),ops(g.away.id,g.date),starterForm(String(hp?.athlete?.id||''),g.date),starterForm(String(ap?.athlete?.id||''),g.date)]);
    if(!hs||!awayStarter)quality.push('Both starting pitchers and ERA data are not available');
    if(hs&&awayStarter){const parts=[clamp((awayStarter.era-hs.era)/1.5,-2,2)];if(hs.whip!=null&&awayStarter.whip!=null)parts.push(clamp((awayStarter.whip-hs.whip)/.25,-2,2));z+=.42*parts.reduce((x,y)=>x+y,0)/parts.length;if(total!=null)total+=((hs.era-MLB_SP_ERA)+(awayStarter.era-MLB_SP_ERA))*.6;}
    if(hf&&af)z+=.18*(clamp((af.era-hf.era)/2,-2,2)+clamp((af.whip-hf.whip)/.35,-2,2))/2;
    if(ho!=null&&ao!=null)z+=.2*clamp((ho-ao)/.05,-2,2);
    p=logistic(z*.5);margin=PD_SD.mlb*invNorm(clamp(p,.02,.98));features.starters={home:hs,away:awayStarter};features.ops={home:ho,away:ao};if(total!=null){const pf=PARK[g.home.abbr];if(pf&&!g.neutral)total*=1+((pf/100)-1)*.7;total=clamp(total,4,20);}
  }
  const cap=CONF_CAP[sport]/100;p=clamp(p,1-cap,cap);const home=p>=.5;
  return {home,p,conf:Math.round((home?p:1-p)*100),margin:Math.round(margin*10)/10,total:total==null?null:Math.round(total*10)/10,quality,features};
}

function marketProb(o:any){const h=implied(o?.hML),a=implied(o?.aML);return h==null||a==null?null:h/(h+a);}
function pickPrice(pred:any,o:any){const direct=american(pred.home?o?.hML:o?.aML);return direct??(o?.favHome===pred.home?american(o?.dML):null);}
function tierFor(pred:any,o:any){const m=marketProb(o);if(m==null||pred.quality.length)return {tier:null,gap:null};const pp=pred.home?pred.p:1-pred.p,mp=pred.home?m:1-m,gap=Math.round((pp-mp)*100),price=pickPrice(pred,o);if(price==null||gap<2)return {tier:null,gap};const payout=price>0?price/100:100/-price;if(pp*payout-(1-pp)<=0)return {tier:null,gap};if(price>=150&&gap>=10)return {tier:'alert',gap};return {tier:gap>=10?'best':gap>=5?'edge':'lean',gap};}
function slateDate(g:any){const d=new Date(g.date);return d.toLocaleDateString('en-CA',{timeZone:'America/New_York'});}
function rowBase(sport:Sport,g:any,p:any,o:any,market:string,selection:string,home:boolean|null,line:number|null,projection:number|null,price:number|null,tier:string|null){return {event_id:g.id,sport,market,model_version:MODEL_VERSION,app_version:APP_VERSION,matchup:`${g.away.abbr||g.away.name} @ ${g.home.abbr||g.home.name}`,slate_date:slateDate(g),starts_at:g.date,captured_at:new Date().toISOString(),selection,selection_home:home,confidence:market==='moneyline'?p.conf:null,tier,price,line,projection,model_probability:market==='moneyline'?(home?p.p:1-p.p):null,market_probability:marketProb(o),provider:o?.provider||null,quality:p.quality,snapshot:{odds:o,features:p.features,neutral:g.neutral,engine:'scheduled-v239'}};}
function rowsFor(sport:Sport,g:any,p:any){const o=odds(g.odds,g),tt=tierFor(p,o),rows=[rowBase(sport,g,p,o,'moneyline',p.home?g.home.name:g.away.name,p.home,null,null,pickPrice(p,o),tt.tier)];if(o?.spread!=null&&ATS_EDGE_MIN[sport]!=null){const edge=p.margin+o.spread,home=edge>0;if(!p.quality.length&&Math.abs(edge)>=(ATS_EDGE_MIN[sport]||0))rows.push(rowBase(sport,g,p,o,'spread',`${home?g.home.abbr:g.away.abbr} ${(home?o.spread:-o.spread)>0?'+':''}${home?o.spread:-o.spread}`,home,o.spread,p.margin,home?o.hSpreadPrice:o.aSpreadPrice,null));}if(o?.ou!=null&&p.total!=null){const diff=p.total-o.ou,side=diff>0?'OVER':'UNDER';if(!p.quality.length&&Math.abs(diff)>=TOTAL_MIN[sport]&&Math.abs(diff)<=TOTAL_MAX[sport])rows.push(rowBase(sport,g,p,o,'total',`${side} ${o.ou}`,null,o.ou,p.total,side==='OVER'?o.overPrice:o.underPrice,Math.abs(diff)>=TOTAL_MIN[sport]*1.75?'best':'edge'));}return rows;}

const SB_URL=Deno.env.get('SUPABASE_URL')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function db(path:string,init:RequestInit={}){const response=await fetch(`${SB_URL}/rest/v1/${path}`,{...init,headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json',...(init.headers||{})}});if(!response.ok)throw new Error(`Database ${response.status}: ${await response.text()}`);const text=await response.text();return text?JSON.parse(text):null;}
async function insertRows(rows:any[]){if(!rows.length)return 0;const got=await db('ai_predictions?on_conflict=event_id,market,model_version',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(rows)});return got?.length||0;}
async function gradeGame(g:any){if(g.state!=='post'||g.home.score==null||g.away.score==null||/cancel|postpon|suspend/i.test(g.status))return 0;const rows=await db(`ai_predictions?event_id=eq.${encodeURIComponent(g.id)}&result=eq.pending&select=*`);let n=0;for(const r of rows||[]){let result='void';const hm=g.home.score-g.away.score;if(r.market==='moneyline'){if(hm!==0)result=(r.selection_home?(hm>0):(hm<0))?'win':'loss';}else if(r.market==='spread'){const v=hm+Number(r.line);result=v===0?'push':(r.selection_home?(v>0):(v<0))?'win':'loss';}else{const v=g.home.score+g.away.score-Number(r.line);result=v===0?'push':((String(r.selection).startsWith('OVER'))?(v>0):(v<0))?'win':'loss';}await db(`ai_predictions?id=eq.${r.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({result,final_home_score:g.home.score,final_away_score:g.away.score,graded_at:new Date().toISOString(),updated_at:new Date().toISOString()})});n++;}return n;}
async function gradePending(){const pending=await db('ai_predictions?result=eq.pending&select=event_id,sport,slate_date&order=starts_at.asc&limit=1000'),groups=new Map<string,any>();for(const r of pending||[])groups.set(`${r.sport}|${String(r.slate_date).replaceAll('-','')}`,r);let n=0;for(const [key] of groups){const [sport,date]=key.split('|') as [Sport,string];try{const {games}=await scoreboard(sport,date);for(const g of games)n+=await gradeGame(g);}catch(_){}}return n;}
async function slate(sport:Sport){if(sport==='mlb'){const today=new Date(),tomorrow=new Date(Date.now()+864e5);const sets=await Promise.all([scoreboard(sport,ymd(today)),scoreboard(sport,ymd(tomorrow))]);return sets.flatMap(x=>x.games);}let board=await scoreboard(sport);if(board.games.length&&board.games.every((g:any)=>g.state==='post')){const type=Number(board.data?.season?.type),week=Number(board.data?.week?.number),year=Number(board.data?.season?.year);if([1,2].includes(type)&&week&&year){const next=await scoreboard(sport,undefined,{week:week+1,seasontype:type,dates:year}).catch(()=>null);if(next?.games?.some((g:any)=>g.state!=='post'))board=next;}}if(sport==='cfb')board.games=board.games.filter((g:any)=>g.home.rank||g.away.rank);return board.games;}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return new Response('Method not allowed',{status:405});
  const started=new Date().toISOString();let run:any=null,captured=0,graded=0,skipped=0;const errors:any[]=[];
  try{const recent=await db('ai_job_runs?select=id,status,started_at,details&order=started_at.desc&limit=1');if(recent?.[0]&&recent[0].details?.model===MODEL_VERSION&&['running','ok','partial'].includes(recent[0].status)&&Date.now()-Date.parse(recent[0].started_at)<10*60*1000)return Response.json({ok:true,status:'rate-limited',run:recent[0].id},{status:202});run=(await db('ai_job_runs',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({started_at:started,sports:[...SPORTS]})}))[0];graded=await gradePending();for(const sport of SPORTS){try{const games=await slate(sport);for(const g of games){if(g.state!=='pre'||g.seasonType===1||!(Date.parse(g.date)>Date.now())||/postpon|cancel|suspend|delay/i.test(g.status)){skipped++;continue;}try{const p=await predict(sport,g),rows=rowsFor(sport,g,p);captured+=await insertRows(rows);}catch(error){errors.push({sport,event:g.id,error:String(error)});}}}catch(error){errors.push({sport,error:String(error)});}}
    const status=errors.length?(captured||graded?'partial':'error'):'ok',finished=new Date().toISOString();await db(`ai_job_runs?id=eq.${run.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({finished_at:finished,status,captured,graded,skipped,errors,details:{model:MODEL_VERSION,app:APP_VERSION}})});return Response.json({ok:status==='ok',status,captured,graded,skipped,errors,run:run.id});
  }catch(error){if(run)await db(`ai_job_runs?id=eq.${run.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({finished_at:new Date().toISOString(),status:'error',captured,graded,skipped,errors:[...errors,{error:String(error)}]})}).catch(()=>{});return Response.json({ok:false,error:String(error)},{status:500});}
});

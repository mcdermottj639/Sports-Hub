/* Read-only matchup comparison. Saved picks never change when an ESPN quote refreshes. */
(function(root){
  'use strict';
  const C=root.SportsHubEvidenceCore;
  const MARKETS=['moneyline','spread','total'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>v==null||typeof v==='boolean'||String(v).trim()===''||!Number.isFinite(Number(v))?null:Number(v);
  const fixed=v=>num(v)===null?'—':Number(v).toFixed(1);
  const signed=v=>num(v)===null?'—':`${v>0?'+':''}${Number(v)}`;
  const price=v=>num(v)!==null&&Math.abs(Number(v))>=100?signed(v):'Unavailable';
  const pct=v=>num(v)!==null&&v>=0&&v<=1?`${(100*v).toFixed(1)}%`:'Not saved';
  const when=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Unknown time';
  const version=s=>root.SportsHubNFLLive?.versionFor(s)||(s==='nba'?'nba-v1':'nfl-football-v1');
  const team=(g,side)=>g[side].abbr;
  const margin=(v,g)=>num(v)===null?'Not saved':v===0?'Even':`${team(g,v>0?'home':'away')} by ${fixed(Math.abs(v))}`;
  const key=(sport,g)=>`${sport}:${g.id}:${g.start}`;
  function matchingRows(s,sport,g,rows){
    return (rows||[]).filter(r=>r.sport===sport&&r.result!=='void'&&Date.parse(r.captured_at)<Date.parse(r.starts_at)&&C.rowGame(s,r)?.id===g.id);
  }
  function officialRows(s,sport,g,rows){
    const eligible=matchingRows(s,sport,g,rows).filter(r=>r.model_version===version(sport)).sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at));
    // One event and one immutable first observation per market. Never combine ambiguous IDs.
    if(new Set(eligible.map(r=>String(r.event_id))).size>1)return [];
    return MARKETS.map(m=>eligible.find(r=>r.market===m)).filter(Boolean);
  }
  function eventFromSummary(data){
    const c=data?.header?.competitions?.[0]||data?.competitions?.[0];
    if(!c)return null;
    const side=s=>{const t=c.competitors?.find(x=>x.homeAway===s);return {id:t?.team?.id||t?.id,abbr:t?.team?.abbreviation,name:t?.team?.displayName,score:num(t?.score),record:(t?.record||t?.records||[]).find(x=>x.type==='total'||x.type==='overall')?.summary||null};};
    const status=c.status?.type||data.header?.status?.type||{};
    return {id:data.header?.id||c.id,date:c.date||data.header?.date,home:side('home'),away:side('away'),state:status.state||'pre',completed:status.completed===true,statusText:status.shortDetail||status.description||''};
  }
  function parseESPN(data,sport,g,normalizeOdds,at=new Date().toISOString()){
    const e=eventFromSummary(data);
    if(!e||C.canonical(sport,e.home.abbr)!==C.canonical(sport,g.home.abbr)||C.canonical(sport,e.away.abbr)!==C.canonical(sport,g.away.abbr)||Date.parse(e.date)!==Date.parse(g.start))throw new Error('ESPN game identity changed');
    const all=[...(data.pickcenter||[]),...(Array.isArray(data.odds)?data.odds:[])];
    const available=o=>o?.spread!=null||o?.overUnder!=null||o?.homeTeamOdds||o?.moneyline||o?.pointSpread;
    const raw=all.find(o=>available(o)&&/draft\s*kings/i.test(o.provider?.name||''))||all.find(available);
    const odds=raw?normalizeOdds(raw,e.home.name,e.away.name,e.home.abbr,e.away.abbr):null;
    const injuries=(data.injuries||[]).flatMap(group=>{
      const side=['away','home'].find(s=>String(e[s].id)===String(group.team?.id));
      return side?(group.injuries||[]).map(i=>({team:team(g,side),name:i.athlete?.displayName||i.athlete?.fullName,position:i.athlete?.position?.abbreviation,status:i.status,detail:i.shortComment||'',date:i.date})).filter(i=>i.name&&i.status):[];
    });
    const predictor={};
    for(const side of ['away','home']){
      const p=data.predictor?.[side+'Team'],v=num(p?.gameProjection);
      if(p&&String(p.id)===String(e[side].id)&&v!==null&&v>=0&&v<=100)predictor[side]=v;
    }
    const stats=(data.boxscore?.teams||[]).flatMap(t=>{
      const side=['away','home'].find(s=>String(e[s].id)===String(t.team?.id));
      return side?(t.statistics||[]).map(x=>({side,name:x.name,label:x.label||x.displayName||x.name,value:x.displayValue})).filter(x=>x.value!=null):[];
    });
    return {...e,odds,at,sourceUpdatedAt:raw?.lastUpdated||raw?.updatedAt||raw?.sourceUpdatedAt||null,injuries,predictor,stats,venue:data.gameInfo?.venue?.fullName||null,weather:data.gameInfo?.weather||null};
  }
  function createLoader({fetchJSON,normalizeOdds,eventRows=async()=>[]}){
    const cache=new Map(),pending=new Map();
    async function read(s,sport,g,rows,force=false){
      const k=key(sport,g),cached=cache.get(k);
      if(!force&&cached&&Date.now()-cached.at<60000)return cached.value;
      if(pending.has(k))return pending.get(k);
      const work=(async()=>{
        const base=`https://site.api.espn.com/apis/site/v2/sports/${sport==='nfl'?'football/nfl':'basketball/nba'}`;
        const ids=[...new Set(matchingRows(s,sport,g,rows).map(r=>String(r.event_id)))];
        let id=ids.length===1?ids[0]:null;
        if(!id){
          const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(g.start)).replace(/-/g,'');
          const board=await fetchJSON(`${base}/scoreboard?dates=${day}&limit=100`);
          const matches=(board.events||[]).filter(ev=>{
            const e=eventFromSummary({header:ev});return e&&C.findGame(s,sport,e)?.id===g.id;
          });
          if(matches.length!==1)throw new Error('No unique ESPN game match');
          id=String(matches[0].id);
        }
        const [summary,saved]=await Promise.allSettled([fetchJSON(`${base}/summary?event=${encodeURIComponent(id)}`),eventRows(sport,id)]);
        let context=null;
        if(summary.status==='fulfilled')context=parseESPN(summary.value,sport,g,normalizeOdds);
        const value={context,rows:saved.status==='fulfilled'?saved.value:rows,historyError:saved.status==='rejected',error:context?'':'ESPN could not load. Saved model picks and DraftKings stats remain available.'};
        cache.set(k,{at:Date.now(),value});return value;
      })().finally(()=>pending.delete(k));
      pending.set(k,work);return work;
    }
    return {read};
  }
  let loader;
  function configure(options){loader=createLoader(options);}
  function savedPick(r,g){
    if(!r)return 'No saved pick';
    if(r.market==='moneyline'&&typeof r.selection_home==='boolean')return team(g,r.selection_home?'home':'away');
    if(r.market==='spread'&&typeof r.selection_home==='boolean'&&num(r.line)!==null)return `${team(g,r.selection_home?'home':'away')} ${signed(r.selection_home?r.line:-r.line)}`;
    return r.selection||'No saved pick';
  }
  function latestMarket(m,c,g){
    const o=c?.odds;if(!o)return '<span>Unavailable</span>';
    if(m==='moneyline')return ['away','home'].map(side=>`<span>${esc(team(g,side))} <b>${price(o[side==='home'?'hML':'aML'])}</b></span>`).join('');
    if(m==='spread')return num(o.spread)===null?'<span>Unavailable</span>':['away','home'].map(side=>`<span>${esc(team(g,side))} ${signed(side==='home'?o.spread:-o.spread)} <small>${price(o[side==='home'?'hSpreadPrice':'aSpreadPrice'])}</small></span>`).join('');
    return num(o.ou)===null?'<span>Unavailable</span>':`<span>Over ${esc(o.ou)} <small>${price(o.overPrice)}</small></span><span>Under ${esc(o.ou)} <small>${price(o.underPrice)}</small></span>`;
  }
  function resultHTML(r){
    if(!r)return '<span>No saved result</span>';
    const status=({win:['Won','win'],loss:['Lost','loss'],push:['Push','push']})[r?.result];
    return status?`<b class="mc-result ${status[1]}">${status[0]}</b><small>Saved grading</small>`:'<span>Awaiting grading</span>';
  }
  function savedDetailsHTML(rows,source){
    return `<details class="mc-sources" data-mc-fold="sources"><summary>Saved prices &amp; source details</summary><p class="mc-note">${esc(source)} Original pregame picks, projections and grading are unchanged.</p><div class="mc-captures">${rows.map(r=>`<div><b>${esc(({moneyline:'ML · winner',spread:'Spread',total:'Total'})[r.market])} · ${esc(r.selection||'No saved pick')}</b><span>Saved odds ${price(r.price)}${r.provider?' · '+esc(r.provider):''}</span><span>Pick saved ${esc(when(r.captured_at))}</span><span>Price saved ${esc(when(r.snapshot?.priceCapturedAt||r.captured_at))}</span></div>`).join('')||'<p class="mc-note">No matching pregame picks saved yet.</p>'}</div></details>`;
  }
  function projectionGap(m,r,f,c,g){
    if(!r||!f)return '';
    const o=c?.odds,ref=num(m==='spread'?o?.spread:o?.ou)!==null?'latest line':'saved line';
    if(m==='moneyline')return r.model_probability==null?'Win probability not saved':`${pct(r.model_probability)} model win probability`;
    if(m==='spread'){
      const line=num(o?.spread??r.line),p=num(r.projection)??f.margin;
      if(line===null||p===null)return `Model margin: ${margin(p,g)}`;
      const gap=p+line;
      return `Model: ${margin(p,g)} · ${gap===0?'even with':`${fixed(Math.abs(gap))} pts toward ${team(g,gap>0?'home':'away')} vs`} ${ref}`;
    }
    const line=num(o?.ou??r.line),p=num(r.projection)??f.total;
    return `Model total: ${fixed(p)}${line===null||p===null?'':` · ${fixed(Math.abs(p-line))} pts ${p>=line?'above':'below'} ${ref}`}`;
  }
  function explanationHTML(rows,g){
    const first=rows.find(r=>r.snapshot?.features),features=first?.snapshot?.features;
    if(!features)return '';
    const football=features.football,drivers=football?.candidate?.drivers||features.drivers||[];
    const notes=[...(features.limitations||[]),...new Set(rows.flatMap(r=>r.quality||[]))];
    const driverHTML=drivers.filter(d=>num(d.marginPoints??d.points)!==null).map(d=>{const p=d.marginPoints??d.points;return `<li><span>${esc(d.label)}</span><b>${fixed(Math.abs(p))} pts${p===0?'':` → ${esc(team(g,p>0?'home':'away'))}`}</b></li>`;}).join('');
    return `<details class="mc-explain" data-mc-fold="explain"><summary>Why the model leans this way</summary><p class="mc-note">Inputs saved ${esc(when(first.captured_at))}. Contributions explain the projected margin.</p>${football&&root.SportsHubNFLFootballUI?root.SportsHubNFLFootballUI.detail(football,g):`<ul class="mc-drivers">${driverHTML}</ul>`}${notes.length?`<p class="mc-note">${notes.map(esc).join(' · ')}</p>`:''}</details>`;
  }
  function modelHTML(s,sport,g,allRows,state={}){
    const rows=officialRows(s,sport,g,allRows),first=[...rows].sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at))[0],f=first?C.forecast(first):null,c=state.context;
    const done=C.final(g),started=Date.parse(g.start)<=Date.now(),showMarket=!done&&!started&&(!c||c.state==='pre');
    const complete=f&&f.margin!==null&&f.total!==null;
    const flags=[...new Set(rows.flatMap(r=>r.quality||[]))],uncertainty=first?.snapshot?.features?.football?.candidate?.mainUncertainty;
    const score=complete?`<div class="mc-projected-score"><span>${esc(g.away.abbr)} <b>${fixed((f.total-f.margin)/2)}</b></span><span>${esc(g.home.abbr)} <b>${fixed((f.total+f.margin)/2)}</b></span></div>`:'<p class="mc-note">No matching saved pregame forecast yet.</p>';
    const forecast=`<section class="mc-forecast"><div class="mc-section-title"><h3>Our model projection</h3><small>${first?'First saved '+esc(when(first.captured_at)):'Awaiting saved forecast'}</small></div>${score}${f?`<div class="mc-summary"><span>Margin <b>${esc(margin(f.margin,g))}</b></span><span>Total <b>${fixed(f.total)}</b></span></div>`:''}${done?`<div class="mc-summary mc-actual"><span>Final margin <b>${esc(margin(g.home.score-g.away.score,g))}</b></span><span>Final total <b>${Number(g.home.score)+Number(g.away.score)}</b></span></div>`:''}</section>`;
    const cards=MARKETS.map((m,i)=>{
      const r=rows.find(x=>x.market===m),p=r?C.forecast(r):f;
      const current=showMarket?c:null;
      return `<article class="mc-market" aria-label="${['ML · winner','Spread','Total'][i]} comparison"><div class="mc-market-title"><h4>${['ML','Spread','Total'][i]}</h4></div><div class="mc-compare"><div><strong>${esc(savedPick(r,g))}</strong>${r?`<small class="mc-pick-price">${price(r.price)}</small>${r.tier?`<span class="se-tag">Saved ${esc(r.tier)}</span>`:''}`:'<small>No pick saved.</small>'}</div><div><div class="mc-quotes">${done?resultHTML(r):showMarket?(state.loading?'Loading…':latestMarket(m,c,g)):'Pregame prices hidden'}</div></div></div>${r?`<p class="mc-gap">${esc(projectionGap(m,r,p,current,g))}</p>`:''}</article>`;
    }).join('');
    const warnings=flags.length||uncertainty?`<p class="mc-caution">${flags.map(esc).join(' · ')}${uncertainty?`${flags.length?' · ':''}${esc(uncertainty.replace(/\b(home|away):/g,(_,side)=>team(g,side)+':'))}`:''}</p>`:'';
    const source=showMarket&&c?`ESPN market retrieved ${when(c.at)}${c.sourceUpdatedAt?' · provider updated '+when(c.sourceUpdatedAt):' · quote update time unavailable'}.`:'Original pregame picks and prices are unchanged.';
    return `${forecast}${warnings}<div class="mc-section-title"><h3>${done?'Picks & results':'Picks vs market'}</h3></div><div class="mc-comparison-head"><span>Market</span><span>Our saved pick</span><span>${done?'Saved result':showMarket?'ESPN · '+esc(c?.odds?.provider||'market'):'Game underway'}</span></div><div class="mc-market-grid">${cards}</div>${showMarket&&c?`<p class="mc-quote-time">Retrieved ${esc(when(c.at))}${c.sourceUpdatedAt?'':' · quote time unavailable'}</p>`:''}${state.error?`<p class="mc-caution" role="status">${esc(state.error)}</p>`:''}${state.historyError?'<p class="mc-caution">Saved history could not refresh. Showing the available cached picks.</p>':''}${explanationHTML(rows,g)}${savedDetailsHTML(rows,source)}`;
  }
  function contextHTML(g,c,loading=false){
    if(!c)return `<div class="mc-section-title"><h3>ESPN game context</h3></div><p class="mc-note" role="status">${loading?'Loading records, injuries and game details…':'ESPN context is unavailable for this matchup.'}</p>`;
    const done=C.final(g),pre=!done&&c.state==='pre'&&Date.parse(g.start)>Date.now();
    const records=['away','home'].map(side=>`<div><span>${esc(team(g,side))}</span><b>${esc(c[side].record||'—')}</b><small>${done?'ESPN record':'Season record'}</small></div>`).join('');
    const predictor=pre&&Object.keys(c.predictor).length?`<div class="mc-section-title"><h4>ESPN matchup predictor</h4></div><div class="mc-records">${['away','home'].map(side=>`<div><span>${esc(team(g,side))}</span><b>${num(c.predictor[side])===null?'—':fixed(c.predictor[side])+'%'}</b></div>`).join('')}</div><p class="mc-note">ESPN win forecast · separate from our model and sportsbook odds.</p>`:'';
    const injuries=pre?`<details class="mc-injuries" data-mc-fold="injuries"><summary>Injury report${c.injuries.length?' · '+c.injuries.length+' listed':''}</summary>${c.injuries.length?c.injuries.map(i=>`<div class="mc-injury"><b>${esc(i.name)} <small>${esc(i.team)} · ${esc(i.position||'')}</small></b><span>${esc(i.status)}</span>${i.detail?`<p>${esc(i.detail)}</p>`:''}<small>Reported ${esc(when(i.date))}</small></div>`).join(''):'<p class="mc-note">No injury entries supplied for this game. This does not confirm a healthy or final lineup.</p>'}</details>`:'';
    const names=[...new Set(c.stats.map(x=>x.name))],wanted=names.filter(x=>/^(fieldGoalPct|threePointFieldGoalPct|freeThrowPct|totalRebounds|turnovers|assists|totalYards|netPassingYards|rushingYards|thirdDownEff|possessionTime)$/i.test(x));
    const stats=done&&wanted.length?`<table class="mc-stat-table"><caption>Final game stats · ESPN</caption><thead><tr><th>Stat</th><th>${esc(g.away.abbr)}</th><th>${esc(g.home.abbr)}</th></tr></thead><tbody>${wanted.slice(0,8).map(name=>{const list=c.stats.filter(x=>x.name===name);return `<tr><th>${esc(list[0].label)}</th><td>${esc(list.find(x=>x.side==='away')?.value??'—')}</td><td>${esc(list.find(x=>x.side==='home')?.value??'—')}</td></tr>`;}).join('')}</tbody></table>`:'';
    const weather=pre&&c.weather&&num(c.weather.temperature)!==null?`${c.weather.temperature}°F${num(c.weather.precipitation)===null?'':' · '+c.weather.precipitation+'% precipitation'}`:'';
    const conflict=done&&c.completed&&num(c.home.score)!==null&&num(c.away.score)!==null&&(c.home.score!==g.home.score||c.away.score!==g.away.score)?'<p class="mc-caution">ESPN and DraftKings final scores differ. The header shows DraftKings; saved results remain unchanged.</p>':'';
    return `<div class="mc-section-title"><h3>ESPN game context</h3><small>${esc(c.statusText)}</small></div><div class="mc-records">${records}</div>${predictor}${c.venue||weather?`<p class="mc-venue">${esc(c.venue||'')}${weather?`<span>${esc(weather)}</span>`:''}</p>`:''}${injuries}${stats}${conflict}<p class="mc-note">Retrieved ${esc(when(c.at))}${done?' · current records are not pregame inputs.':'.'}</p>`;
  }
  async function mount(host,s,sport,g,rows,force=false){
    const model=host.querySelector('[data-mc-model]'),context=host.querySelector('[data-mc-context]');if(!model||!context)return;
    const ticket={};host._matchupTicket=ticket;
    const paint=(state,list)=>{
      if(!host.isConnected||host._matchupTicket!==ticket)return;
      for(const [el,html] of [[model,modelHTML(s,sport,g,list,state)],[context,contextHTML(g,state.context,state.loading)]]){
        if(!el.isConnected)return;
        const opened=[...el.querySelectorAll('details[open][data-mc-fold]')].map(d=>d.dataset.mcFold);
        el.innerHTML=html;el.querySelectorAll('details[data-mc-fold]').forEach(d=>{d.open=opened.includes(d.dataset.mcFold);});
      }
    };
    paint({loading:true},rows);
    try{if(!loader)throw new Error('Not configured');const state=await loader.read(s,sport,g,rows,force);paint(state,state.rows||rows);}
    catch(_){paint({error:'ESPN could not be matched or loaded. Saved model picks and DraftKings stats remain available.'},rows);}
  }
  const api={configure,createLoader,officialRows,eventFromSummary,parseESPN,modelHTML,contextHTML,mount};
  root.SportsHubMatchupContext=Object.freeze(api);
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);

/* Read-only player prop displays. Collection and grading run on the server. */
(function(root){
 'use strict';
 const C=root.SportsHubPropsCore,cfg=root.SPORTS_HUB_SUPABASE,cache=new Map();
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=x=>x!=null&&Number.isFinite(Number(x))?Number(x).toFixed(1):'—';
 const odds=x=>Number(x)>0?'+'+x:String(x),pct=x=>(100*Number(x)).toFixed(1)+'%';
 const when=x=>new Date(x).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
 const fields='id,sport,event_id,model_version,rank,starts_at,captured_at,quote_at,athlete_id,athlete_name,team_id,team_abbr,market,market_label,side,line,price,provider,projection,model_probability,push_probability,expected_return,result,actual,settled_at,settlement_note,sample_size:features->sample_size,hits:features->hits,last5:features->last5,last10:features->last10,prop_games(matchup,game)';
 async function request(path){
  if(!cfg?.url||!cfg?.key)throw Error('Cloud props are not configured');
  const res=await fetch(`${cfg.url}/rest/v1/${path}`,{headers:{apikey:cfg.key,Authorization:`Bearer ${cfg.key}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error(`Prop history ${res.status}`);return res.json();
 }
 async function load(sport='all',eventId=null,force=false){
  const key=`${sport}:${eventId||'all'}`,old=cache.get(key);if(!force&&old&&Date.now()-old.at<60000)return old.promise;
  const filter=(sport!=='all'?`&sport=eq.${encodeURIComponent(sport)}`:'')+(eventId?`&event_id=eq.${encodeURIComponent(eventId)}`:'');
  const promise=(async()=>{
   const rows=[];for(let offset=0;;offset+=500){const page=await request(`prop_picks?select=${fields}&order=starts_at.desc,id.asc&limit=500&offset=${offset}${filter}`);rows.push(...page);if(page.length<500)break;}
   const since=new Date(Date.now()-2*864e5).toISOString();
   const games=await request(`prop_games?select=sport,event_id,starts_at,matchup,coverage_status,coverage_note,quote_count,modeled_count,pick_count,checked_at,game&order=starts_at.asc${filter}${eventId?'':`&starts_at=gte.${encodeURIComponent(since)}`}`);
   return {rows,games};
  })().catch(e=>{cache.delete(key);throw e;});cache.set(key,{at:Date.now(),promise});return promise;
 }
 function method(){return `<details class="prop-method"><summary>How the prop model works</summary><p>The model projects each player’s supported stat from their last 20 completed games with their current team. It compares the observed results with the posted prop line, adds one prior observation on each side, and ranks the available selections by estimated return at the saved price. Up to two different players are selected per game.</p><p>Each card shows the projection, last-five and last-ten averages, sample size and exact game history. Football, NBA and starting pitchers need at least eight games; MLB hitters need fifteen. Inactive players are excluded; NBA and MLB also screen for sharp workload drops. Opponent history is context only. Injuries, lineup changes, pace, weather and defensive matchups are not fully modeled.</p><p>This is an experimental statistical baseline. Its probabilities and estimated returns are not validated betting edges. Picks are recorded even when neither offers positive estimated value. Missing lines or insufficient history produce a waiting status. No lines or missing statistics are invented.</p><p>The first issued picks, prices and inputs are saved permanently before tipoff. Win/loss/push comes from final player statistics. Explicit DNPs and cancelled/rescheduled games are void; unresolved statistics stay pending. Paper returns assume one unit per pick at the recorded price and may differ from sportsbook settlement rules.</p></details>`;}
 function card(p){
  const state=p.result==='pending'?(Date.parse(p.starts_at)<=Date.now()?'Awaiting final':'Saved'):p.result.toUpperCase();
  return `<article class="prop-card prop-${esc(p.result)}"><div class="prop-card-top"><span>#${p.rank} · ${esc(p.team_abbr)}</span><b class="prop-result">${esc(state)}</b></div><h3>${esc(p.athlete_name)}</h3><div class="prop-selection">${esc(p.side.toUpperCase())} ${esc(p.line)} ${esc(p.market_label)} <strong>${esc(odds(p.price))}</strong></div><div class="prop-numbers"><span><small>Projection</small><b>${fmt(p.projection)}</b></span><span><small>Last 5 avg</small><b>${fmt(p.last5)}</b></span><span><small>History at line</small><b>${p.hits}/${p.sample_size}</b></span></div><p class="prop-estimate">${pct(p.model_probability)} model estimate · ${p.expected_return>0?'Positive estimated return':'Top available lean; no positive estimated return'}</p>${p.actual!=null?`<p class="prop-actual">Final: <b>${esc(p.actual)}</b> ${esc(p.market_label)}</p>`:''}<div class="prop-meta">${esc(p.provider)} · saved ${esc(when(p.captured_at))}</div><details class="prop-evidence" data-prop-detail="${p.id}"><summary>Why this prop · saved data</summary><div class="prop-evidence-body">Loading saved player evidence…</div></details></article>`;
 }
 function evidence(p){const f=p.features||{};return `<div class="prop-evidence-summary"><p>Last ${f.sample_size} average <b>${fmt(f.mean)}</b>; last 5 <b>${fmt(f.last5)}</b>; last 10 <b>${fmt(f.last10)}</b>. ${f.hits} hits, ${f.losses} misses${f.pushes?`, ${f.pushes} pushes`:''} against this exact line.</p>${f.workload?`<p>Workload (${esc(({minutes:'minutes',atBats:'at-bats',pitcherOuts:'outs pitched'})[f.workload.name]||f.workload.name)}): ${fmt(f.workload.mean)} average; ${fmt(f.workload.last3)} last 3.</p>`:''}${f.matchup?`<p>Against this opponent: ${fmt(f.matchup.mean)} across ${f.matchup.n} games. Context only.</p>`:''}<p>Projected edge: ${fmt((p.side==='over'?1:-1)*(p.projection-p.line))} ${esc(p.market_label)}. Experimental expected return: ${pct(p.expected_return)} per unit. Push estimate: ${pct(p.push_probability)}.</p>${f.warnings?.length?`<p>Player status: ${esc(f.warnings.join(', '))}</p>`:''}<p>Ranked from ${f.candidates_evaluated} modeled selections (${f.quotes_observed} posted quotes). Original line ${esc(p.line)}, price ${esc(odds(p.price))}; observed ${esc(when(p.quote_at))}.</p>${p.settlement_note?`<p>${esc(p.settlement_note)}</p>`:''}</div><div class="prop-table-wrap"><table><thead><tr><th>Game date</th><th>Actual</th><th>At saved line</th></tr></thead><tbody>${(f.history||[]).slice().reverse().map(r=>`<tr><td>${esc(new Date(r.date).toLocaleDateString())}</td><td>${esc(r.value)}</td><td>${r.value===p.line?'Push':(p.side==='over'?r.value>p.line:r.value<p.line)?'Hit':'Miss'}</td></tr>`).join('')}</tbody></table></div>`;}
 function wire(host){
  host.addEventListener('toggle',async e=>{const d=e.target.closest?.('[data-prop-detail]');if(!d||!d.open||d.dataset.loaded)return;d.dataset.loaded='1';
   try{const [p]=await request(`prop_picks?id=eq.${encodeURIComponent(d.dataset.propDetail)}&select=*`);if(!p)throw Error('Missing saved pick');if(d.isConnected)d.querySelector('.prop-evidence-body').innerHTML=evidence(p);}catch(_){d.dataset.loaded='';if(d.isConnected)d.querySelector('.prop-evidence-body').textContent='Saved evidence is unavailable. Close and reopen to retry.';}
  },true);
 }
 function stats(rows){const r=C.performance(rows);return `<div class="prop-record"><span><b>${r.wins}–${r.losses}</b>Prop record</span><span><b>${r.n?pct(r.wins/r.n):'—'}</b>Win rate · ${r.n} graded</span><span><b>${r.profit>=0?'+':''}${fmt(r.profit)}u</b>Paper profit</span><span><b>${r.roi==null?'—':pct(r.roi)}</b>ROI · ${r.priced} settled</span></div><p class="prop-meta">${r.pending} pending · ${r.pushes} pushes · ${r.voids} voids. Props have their own record; game-market results stay separate.</p>`;}
 function gameHTML(game,picks){return `<section class="prop-game"><div class="prop-game-heading"><div><span>${esc(game.sport.toUpperCase())} · ${esc(when(game.starts_at))}</span><h3>${esc(game.matchup)}</h3></div><button class="fan-btn" data-prop-game="${esc(game.sport+':'+game.event_id)}">Game report →</button></div>${picks.length?`<div class="prop-grid">${picks.sort((a,b)=>a.rank-b.rank).map(card).join('')}</div>`:`<p class="prop-wait">${esc(game.coverage_note)}${game.checked_at?` · checked ${esc(when(game.checked_at))}`:''}</p>`}</section>`;}
 async function panel(host,sport='all'){
  host.innerHTML='<div role="status" class="empty">Loading saved player props…</div>';const token=String(Date.now())+Math.random();host.dataset.propToken=token;
  try{
   const data=await load(sport);if(host.dataset.propToken!==token||!host.isConnected)return;
   let history=false,search='';
   const paint=()=>{
    const rows=data.rows.filter(x=>x.model_version===C.VERSION),map=new Map(data.games.map(g=>[g.sport+':'+g.event_id,g]));
    for(const p of rows)if(!map.has(p.sport+':'+p.event_id))map.set(p.sport+':'+p.event_id,{sport:p.sport,event_id:p.event_id,starts_at:p.starts_at,matchup:p.prop_games?.matchup||'',game:p.prop_games?.game});
    const shown=[...map.values()].filter(g=>history?rows.some(p=>p.sport===g.sport&&p.event_id===g.event_id&&p.result!=='pending'):Date.parse(g.starts_at)>Date.now()-8*3600000||rows.some(p=>p.sport===g.sport&&p.event_id===g.event_id&&p.result==='pending'))
     .filter(g=>!search||[g.matchup,...rows.filter(p=>p.sport===g.sport&&p.event_id===g.event_id).map(p=>p.athlete_name)].join(' ').toLowerCase().includes(search.toLowerCase()))
     .sort((a,b)=>(history?-1:1)*(Date.parse(a.starts_at)-Date.parse(b.starts_at)));
    host.innerHTML=`<div class="prop-intro"><div><span class="prop-kicker">PLAYER PROPS</span><h2>Top player props.</h2><p>Up to two per game, with the numbers behind them.</p></div><span class="prop-badge">Experimental · live tracking</span></div>${stats(rows)}<div class="prop-toolbar"><button class="fan-btn ${history?'':'on'}" data-prop-view="current">Upcoming & live</button><button class="fan-btn ${history?'on':''}" data-prop-view="history">Results & history</button><button class="fan-btn" data-prop-refresh>Refresh</button><input type="search" aria-label="Search player props" placeholder="Player or game" value="${esc(search)}"></div><div class="prop-list">${shown.length?shown.map(g=>gameHTML(g,rows.filter(p=>p.sport===g.sport&&p.event_id===g.event_id))).join(''):'<div class="empty">'+(history?'No settled prop picks yet. Results appear after games finish.':'No prop games available yet. Automatic collection checks the current slates.')+'</div>'}</div>${method()}`;
    host.querySelectorAll('[data-prop-view]').forEach(b=>b.onclick=()=>{history=b.dataset.propView==='history';paint();});
    host.querySelector('[data-prop-refresh]').onclick=()=>{cache.clear();panel(host,sport);};
    const input=host.querySelector('input');input.onchange=()=>{search=input.value;paint();};
    host.querySelectorAll('[data-prop-game]').forEach(b=>b.onclick=()=>{const x=map.get(b.dataset.propGame);if(x?.game)openGameDetail(x.sport,x.event_id,x.game);});
   };paint();if(!host.dataset.propWired){host.dataset.propWired='1';wire(host);}
  }catch(_){if(host.dataset.propToken===token)host.innerHTML='<div class="empty">Player props could not be loaded. Your saved results remain intact. <button class="fan-btn" data-prop-retry>Retry</button></div>';host.querySelector('[data-prop-retry]')?.addEventListener('click',()=>panel(host,sport));}
 }
 async function mount(host,sport,g){
  if(!host)return;host.innerHTML='<h3>Top player props</h3><p class="prop-meta">Loading saved picks…</p>';
  try{const data=await load(sport,g.id);if(!host.isConnected)return;const rows=data.rows.filter(p=>p.model_version===C.VERSION);host.innerHTML=`<h3>Top player props</h3>${rows.length?`<div class="prop-grid">${rows.map(card).join('')}</div>`:`<p class="prop-wait">${esc(data.games[0]?.coverage_note||(g.seasonType===1?'Preseason props are excluded':g.state==='pre'?'Waiting for the scheduled prop scan':'No pregame prop picks were saved'))}</p>`}<button class="fan-btn" data-desk-route="models/${sport}/props">All ${sport.toUpperCase()} props & results →</button>`;wire(host);}catch(_){if(host.isConnected)host.innerHTML='<h3>Top player props</h3><p class="prop-wait">Saved prop picks are temporarily unavailable.</p>';}
 }
 async function slate(host,sport){
  try{const {rows}=await load(sport);if(!host.isConnected)return;host.querySelectorAll('.game-card[data-gid]').forEach(card=>{if(card.querySelector('.prop-slate'))return;const picks=rows.filter(p=>p.event_id===card.dataset.gid&&p.model_version===C.VERSION);if(!picks.length)return;const box=document.createElement('div');box.className='prop-slate';box.innerHTML='<b>TOP PROPS</b>'+picks.map(p=>`<span>${esc(p.athlete_name)} · ${esc(p.side==='over'?'O':'U')}${p.line} ${esc(p.market_label)} <strong>${esc(odds(p.price))}</strong></span>`).join('');card.appendChild(box);});}catch(_){}
 }
 root.SportsHubProps={panel,mount,slate,stats,method,load};
})(globalThis);

/* Visual evidence layer. DraftKings snapshots supplement ESPN; they are not live odds. */
(function(root){
  'use strict';
  const C=root.SportsHubEvidenceCore;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v,d=1)=>C.number(v)===null?'—':Number(v).toFixed(d);
  const signed=v=>C.number(v)===null?'—':(v>0?'+':'')+fmt(v);
  const time=v=>new Date(v).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const version=s=>root.SportsHubNFLLive?.versionFor(s)||(s==='nba'?'nba-v1':'nfl-football-v1');
  let snapshot=null,pending=null,loadedAt=0;
  async function load(force=false){
    if(snapshot&&!force&&Date.now()-loadedAt<5*60000)return snapshot;
    if(pending)return pending;
    pending=fetch('data/draftkings-evidence.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Evidence unavailable');return r.json();}).then(s=>{if(C.validate(s).length)throw new Error('Evidence failed validation');snapshot=s;loadedAt=Date.now();return s;}).finally(()=>{pending=null;});
    return pending;
  }
  const label=g=>`${g.away.abbr} @ ${g.home.abbr}`;
  function mark(t,abbr){const logo=/^https:\/\/(dkn\.gs|a\.espncdn\.com)\//.test(t?.logo||'')?`<img src="${esc(t.logo)}" alt="" loading="lazy" width="40" height="40">`:'';return `<span class="se-crest">${logo||esc(abbr)}</span>`;}
  function sourceLine(s){const f=C.freshness(s);return `<p class="se-source"><span class="se-dot ${f.stale?'old':''}"></span>DraftKings snapshot · ${esc(time(s.capturedAt))}${f.stale?' · older than 36h':''}<span>ESPN supplies live scores</span></p>`;}
  function formHTML(f){return `<div class="se-form" aria-label="Recent results, oldest to newest">${f.rows.map(r=>`<span class="se-result ${r.result.toLowerCase()}" title="${esc(time(r.start)+' · '+(r.home?'vs ':'at ')+r.opponent+' · '+r.for+'–'+r.against)}">${r.result}</span>`).join('')||'<small>No earlier results</small>'}</div>`;}
  function spark(f){
    if(!f.rows.length)return '';
    const max=Math.max(10,...f.rows.map(r=>Math.abs(r.margin))),w=168,h=48;
    return `<svg class="se-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(f.rows.map(r=>r.result+' '+signed(r.margin)+' versus '+r.opponent).join(', '))}"><line x1="0" y1="24" x2="168" y2="24" stroke="currentColor" opacity=".25"/>${f.rows.map((r,i)=>{const size=Math.abs(r.margin)/max*20,x=9+i*32;return `<rect x="${x}" y="${r.margin>=0?24-size:24}" width="20" height="${Math.max(1,size)}" rx="3" fill="${r.margin>=0?'#247d68':'#b66c4a'}"/>`;}).join('')}</svg>`;
  }
  const STAT_KEYS={nfl:[['Points - Offensive','Scoring'],['Points - Defensive','Points allowed'],['Passing Yards - Offensive','Passing yards'],['Rushing Yards - Offensive','Rushing yards'],['Passing Yards - Defensive','Pass yards allowed'],['Rushing Yards - Defensive','Rush yards allowed']],nba:[['PPG','Scoring'],['Effective Field Goal (%)','Effective FG'],['Rebounds','Rebounds'],['Turnovers','Turnovers'],['3PT FG (%)','3-point shooting'],['Assists','Assists']]};
  function ranksHTML(s,sport,g){
    const home=C.team(s,sport,g.home.abbr),away=C.team(s,sport,g.away.abbr);
    if(!home||!away)return '<p class="se-note">Season team profiles are unavailable for this matchup.</p>';
    const cell=stat=>{const n=Number.parseInt(stat?.rank,10),count=sport==='nfl'?32:30,pct=Number.isFinite(n)&&n>=1&&n<=count?(count-n+1)/count*100:null;return `<div class="se-rank-cell"><div><b>${stat?fmt(stat.value)+(stat.isPercentage?'%':''):'—'}</b><span>${stat?.rank?'#'+esc(stat.rank.replace(/\D/g,'')):'No rank'}</span></div><span class="se-meter" aria-hidden="true"><i style="width:${pct??0}%"></i></span></div>`;};
    return `<div class="se-section-head"><h4>Season profile</h4><small>Longer bar = better league rank</small></div><div class="se-ranks"><div class="se-rank-row se-rank-head"><b>${esc(g.away.abbr)}</b><span>League rank</span><b>${esc(g.home.abbr)}</b></div>${STAT_KEYS[sport].map(([key,title])=>`<div class="se-rank-row">${cell(away.stats.find(x=>x.label===key))}<span class="se-rank-label">${title}</span>${cell(home.stats.find(x=>x.label===key))}</div>`).join('')}</div>`;
  }
  function teamHTML(s,sport,t,f,side){const meta=C.team(s,sport,t.abbr);return `<div class="se-team ${side}">${mark(meta,t.abbr)}<div><span>${side==='away'?'AWAY':'HOME'}</span><h3>${esc(t.abbr)}</h3><small>${esc(meta?.name||t.name)}</small></div>${formHTML(f)}<div class="se-form-stats"><span><b>${f.n?`${f.wins}–${f.losses}${f.ties?'–'+f.ties:''}`:'—'}</b>last ${f.n}</span><span><b>${signed(f.margin)}</b>avg margin</span></div>${spark(f)}</div>`;}
  function resultCheck(s,sport,g,rows){
    const matched=C.findGame(s,sport,g);if(!matched)return '';
    const a=C.audit(s,rows,sport,version(sport)),item=a.items.find(i=>i.game.id===matched.id);
    if(!C.final(matched))return `<p class="se-note">Final-score check waits for completed games and saved results.</p>`;
    const state=item?.status||'awaiting';
    return `<div class="se-check ${state==='matched'?'ok':state==='disputed'?'warn':''}"><b>${state==='matched'?'✓ Final scores agree':state==='disputed'?'! Score discrepancy':'Final score available'}</b><span>${esc(label(matched))} · ${matched.away.score}–${matched.home.score}</span><small>${state==='matched'?'DraftKings matches every saved scored market for this game.':state==='disputed'?'Excluded from this comparison until reviewed. Original records are unchanged.':'Waiting for a matching saved ESPN result.'}</small></div>`;
  }
  function matchupHTML(s,sport,g,rows=[],compact=false){
    const start=g.start||g.date,home=C.form(s,sport,g.home.abbr,start),away=C.form(s,sport,g.away.abbr,start),b=C.baseline(s,sport,{...g,start});
    const isPast=Date.parse(start)<=Date.now(),f=C.freshness(s);
    const forecastRows=rows.filter(r=>r.sport===sport&&r.model_version===version(sport)&&r.result!=='void'&&Date.parse(r.captured_at)<Date.parse(r.starts_at)&&C.rowGame(s,r)?.id===g.id).sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at));
    const forecast=forecastRows.length?C.forecast(forecastRows[0]):null;
    const gap=x=>x.daysSince===null?'—':x.daysSince===1?'Back-to-back':`${x.daysSince} days`;
    const official=forecast&&forecast.margin!==null&&forecast.total!==null;
    const scoreCards=`<div class="se-projection"><div class="se-official"><span>SAVED OFFICIAL FORECAST</span>${official?`<b class="se-scoreline"><span>${esc(g.away.abbr)} ${fmt((forecast.total-forecast.margin)/2)}</span><em>—</em><span>${esc(g.home.abbr)} ${fmt((forecast.total+forecast.margin)/2)}</span></b><small>Frozen before the game · unchanged</small>`:'<b>Not available yet</b><small>No matching saved pregame forecast in loaded history.</small>'}</div><div><span>RECENT-FORM BASELINE</span>${b.available?`<b class="se-scoreline"><span>${esc(g.away.abbr)} ${fmt(b.awayScore)}</span><em>—</em><span>${esc(g.home.abbr)} ${fmt(b.homeScore)}</span></b><small>Last 5 scoring + opponent allowance · ${isPast?'retrospective replay':'experimental context'}</small>`:'<b>Needs more games</b><small>Requires 5 earlier games for each team. No projection is filled in.</small>'}</div></div>`;
    const context=`<div class="se-match-top"><span>${esc(sport.toUpperCase())} · ${esc(time(start))}</span><span class="se-tag">${C.final(g)?'FINAL':isPast?'Dated pregame snapshot':'UPCOMING'}</span></div><div class="se-teams">${teamHTML(s,sport,g.away,away,'away')}<span class="se-vs">${C.final(g)?`${g.away.score}<br>–<br>${g.home.score}`:'VS'}</span>${teamHTML(s,sport,g.home,home,'home')}</div><div class="se-rest"><span>${esc(g.away.abbr)} · ${gap(away)}</span><small>Calendar gap since previous game</small><span>${esc(g.home.abbr)} · ${gap(home)}</span></div>`;
    const note=`<p class="se-note">${isPast?'Season ranks are today’s profile, not historical pregame inputs. ':''}${f.stale?'Snapshot is stale; these figures are not current. ':''}Form bars show scoring margins, not betting returns. Baseline has no injury, opponent-strength or home-court adjustment.</p>`;
    const check=resultCheck(s,sport,{...g,date:start},rows);
    if(compact)return `<article class="se-matchup compact">${context}<details class="se-expand"><summary>Compare season ranks &amp; form baseline</summary>${ranksHTML(s,sport,g)}${scoreCards}</details>${check}${note}</article>`;
    return `<article class="se-matchup">${context}<div class="se-detail-grid"><section class="se-forecast-section" aria-label="Forecast comparison"><div class="se-section-head"><h4>Forecast comparison</h4><small>Points · away / home</small></div>${scoreCards}${check}</section><section class="se-profile-section" aria-label="Team season statistics">${ranksHTML(s,sport,g)}</section></div><details class="se-expand se-history"><summary>Last five games <span>Opponents &amp; scores</span></summary><div class="se-history-grid">${historyHTML(g.away,away)}${historyHTML(g.home,home)}</div></details>${note}</article>`;
  }
  function historyHTML(t,f){
    return `<section><h4>${esc(t.abbr)} · recent results</h4>${[...f.rows].reverse().map(r=>`<div class="se-history-row"><time>${esc(new Date(r.start).toLocaleDateString([],{month:'short',day:'numeric'}))}</time><span>${r.home?'vs':'at'} <b>${esc(r.opponent)}</b></span><strong>${r.for}–${r.against}</strong><span class="se-result ${r.result.toLowerCase()}">${r.result}</span></div>`).join('')||'<p class="se-note">No earlier results available.</p>'}</section>`;
  }

  function barCompare(title,values,caption){
    const available=values.filter(v=>C.number(v.value)!==null),max=Math.max(1,...available.map(v=>v.value));
    return `<article class="se-metric"><h4>${title}</h4>${available.length?available.map(v=>`<div class="se-chart-row"><span>${v.label}</span><div><i class="${v.kind||''}" style="width:${Math.max(2,v.value/max*100)}%"></i></div><b>${fmt(v.value)}</b></div>`).join(''):'<p class="se-note">Waiting for matched evidence</p>'}<p>${caption}</p></article>`;
  }
  function accuracyHTML(s,rows,sport){
    const a=C.audit(s,rows,sport,version(sport)),d=C.diagnostics(a),m=d.metrics;
    const leads=['margin','total'].filter(k=>m[k].n>=20&&Math.abs(m[k].bias)>=2).map(k=>`<div><b>Test ${k==='total'?'scoring':'home-margin'} bias on future games</b><p>${signed(m[k].bias)} points across ${m[k].n} checked games. Freeze any proposed correction, then compare on new games before promotion.</p></div>`).join('');
    return `<div class="se-section-head"><h3>Where the forecast misses</h3><span class="se-tag">${esc(version(sport))}</span></div><div class="se-metric-grid">${['margin','total'].map(k=>barCompare(k==='margin'?'Margin error':'Total error',[{label:'Our model',value:m[k].pairedModelMAE},{label:'Saved book line',value:m[k].bookMAE,kind:'book'}],`${m[k].bookN} identical, score-checked games · ${m[k].n-m[k].bookN} without a comparable saved line · average absolute error in points · lower is better`)).join('')}</div><div class="se-bias"><span>Overall forecast bias</span><b>Margin ${signed(m.margin.bias)} <small>(${m.margin.n} games)</small></b><b>Total ${signed(m.total.bias)} <small>(${m.total.n} games)</small></b></div><p class="se-note">Positive margin bias = too much toward home. Positive total bias = scoring overestimated.</p>${leads?`<div class="se-leads">${leads}</div>`:''}<div class="se-section-head"><h3>Does recent form add anything?</h3><span class="se-tag">REPLAY · UNVALIDATED</span></div><div class="se-metric-grid">${['margin','total'].map(k=>barCompare(k==='margin'?'Margin: model vs form':'Total: model vs form',[{label:'Our model',value:m[k].formModelMAE},{label:'Last-5 baseline',value:m[k].formMAE,kind:'form'}],`${m[k].formN} identical games with 5 earlier games per team · lower error is better`)).join('')}</div><div class="se-buckets">${d.buckets.map(b=>`<article><span>Form ${b.key==='agrees'?'agrees with':'opposes'} model</span><b>${b.n?Math.round(100*b.wins/b.n)+'%':'—'}</b><small>Model picked winner · ${b.wins}/${b.n} games</small></article>`).join('')}</div><p class="se-note">Descriptive replay using final scores retrieved now. Not prospective validation or ROI. Current season ranks never enter historical forecasts. Small groups are exploratory; no weights, confidence or picks change automatically.</p>`;
  }
  function auditHTML(s,rows,sport){
    const a=C.audit(s,rows,sport,version(sport)),items=a.items.filter(i=>i.status!=='awaiting').sort((a,b)=>Date.parse(b.game.start)-Date.parse(a.game.start));
    return `<div class="se-audit-counts"><article><b>${a.matched}</b><span>scores agree</span></article><article class="${a.disputed?'warn':''}"><b>${a.disputed}</b><span>need review</span></article><article><b>${a.awaiting}</b><span>awaiting scores</span></article><article><b>${a.unmatched}</b><span>not matched</span></article></div><p class="se-note">One check per game, across every saved scored market. Team aliases and exact kickoff must match. Unmatched includes games outside the snapshot window. This audit never changes official settlements.</p><div class="se-audit-list">${items.slice(0,12).map(i=>`<div class="se-audit-row"><span><b>${esc(label(i.game))}</b><small>${esc(time(i.game.start))}</small></span><strong>${i.game.away.score}–${i.game.home.score}</strong><span class="se-tag ${i.status==='disputed'?'warn':''}">${i.status==='matched'?'✓ AGREES':'REVIEW'}</span></div>`).join('')||'<p class="se-note">No completed matches yet. Saved history may still be loading.</p>'}</div><details class="se-expand"><summary>Coverage &amp; source policy</summary><p class="se-note">DraftKings covers NFL and NBA here. It supplies team statistics and scores, not odds, player props or your account. This is a dated snapshot; ESPN remains live. No college props are added. Exact starts are required; reschedules and uncertain identity stay unmatched. Rank comparisons use the provider’s league rank.</p><p class="se-note">${s.queries.filter(q=>q.league===sport).map(q=>`${esc(dayRange(q.start,q.end))}: ${q.count} games`).join('<br>')}</p></details>`;
  }
  function dayRange(a,b){return new Date(a).toLocaleDateString()+' – '+new Date(b).toLocaleDateString();}
  function orderedGames(s,sport){const all=C.games(s,sport);return [...all.filter(g=>Date.parse(g.start)>Date.now()).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)),...all.filter(g=>Date.parse(g.start)<=Date.now()).sort((a,b)=>Date.parse(b.start)-Date.parse(a.start))];}
  async function mountResearch(host,initialSport='nfl',options={}){
    if(!host)return;
    if(host.dataset.evidenceMounted){host._evidencePaint?.();return;}
    const full=!!options.fullScreen;
    host.dataset.evidenceMounted='1';host.classList.add('se');
    if(full)host.classList.add('se-workspace');
    let sport=['nfl','nba'].includes(initialSport)?initialSport:'nfl',tab='matchups',token=0,reloading=false,error='';
    const choices={nfl:{selected:null,scope:'upcoming'},nba:{selected:null,scope:'upcoming'}};
    // Keep the controls mounted during feed updates so native selects and keyboard focus survive.
    const leagueButtons=['nfl','nba'].map(x=>`<button type="button" data-se-sport="${x}" aria-pressed="${sport===x}">${x.toUpperCase()}</button>`).join('');
    const tabs=[['matchups','Matchup'],['accuracy','Model check'],['audit','Score audit']].map(([key,title])=>`<button type="button" data-se-tab="${key}" aria-pressed="${tab===key}">${title}</button>`).join('');
    const reload='<button type="button" class="se-reload" data-se-reload aria-label="Reload published evidence" title="Reload the published snapshot">↻</button>';
    host.innerHTML=`<div class="se-chrome">${full?`<header class="se-lab-header"><button type="button" class="se-back" data-desk-route="today"><span aria-hidden="true">←</span> Today</button><div><span class="se-kicker">SPORTS HUB</span><h1 tabindex="-1">Matchup Lab</h1></div>${reload}</header>`:`<div class="se-heading"><div><span class="se-kicker">THE MATCHUP LAB</span><h2>See the matchup. Check the model.</h2></div><button type="button" class="se-open" data-desk-route="matchup-lab">Full screen ↗</button></div>`}<div class="se-controls"><div class="se-picker-row"><div class="se-sport" role="group" aria-label="Evidence league">${leagueButtons}</div><label class="se-scope"><span>Games</span><select data-se-scope aria-label="Game period"><option value="upcoming">Upcoming</option><option value="completed">Completed</option><option value="all">All games</option></select></label><label class="se-select">Choose a game<select data-se-game aria-label="Choose matchup"><option>Loading games…</option></select></label></div><div class="se-tabs" role="group" aria-label="Evidence view">${tabs}${full?'':reload}</div></div></div><div data-se-source></div><p class="se-feedback" data-se-feedback role="status" hidden></p><div class="se-body" data-se-body><p class="se-note" role="status">Loading matchup evidence…</p></div>`;
    const gameSelect=host.querySelector('[data-se-game]'),scopeSelect=host.querySelector('[data-se-scope]');
    const paint=(forceControls=false)=>{
      if(!host.isConnected||!snapshot)return;
      const s=snapshot,rows=root.SportsHubCloudAI?.cached?.().rows||[],all=orderedGames(s,sport),choice=choices[sport];
      const filtered=all.filter(g=>choice.scope==='all'||(choice.scope==='completed'?C.final(g):!C.final(g)&&Date.parse(g.start)>Date.now()));
      if(!filtered.some(g=>g.id===choice.selected))choice.selected=filtered.find(g=>Date.parse(g.start)>Date.now()&&[g.home.abbr,g.away.abbr].includes('PHI'))?.id||filtered[0]?.id||null;
      const g=filtered.find(g=>g.id===choice.selected);
      host.querySelectorAll('[data-se-sport]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.seSport===sport)));
      host.querySelectorAll('[data-se-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.seTab===tab)));
      scopeSelect.value=choice.scope;
      const optionsHTML=filtered.length?filtered.map(x=>`<option value="${esc(x.id)}"${x.id===choice.selected?' selected':''}>${esc(label(x)+' · '+time(x.start)+(C.final(x)?' · Final':''))}</option>`).join(''):'<option value="">No games in this period</option>';
      if(gameSelect.innerHTML!==optionsHTML&&(forceControls||document.activeElement!==gameSelect))gameSelect.innerHTML=optionsHTML;
      gameSelect.disabled=!filtered.length;gameSelect.value=choice.selected||'';
      host.querySelector('[data-se-source]').innerHTML=sourceLine(s);
      host.querySelector('[data-se-body]').innerHTML=tab==='matchups'?(g?matchupHTML(s,sport,g,rows):`<div class="se-empty"><h3>No ${choice.scope==='all'?'':choice.scope+' '}${sport.toUpperCase()} games in this snapshot</h3><p>Try another period or league. Reload checks for a newer published snapshot.</p><button type="button" data-se-all>Show all games</button></div>`):`<p class="se-view-caption">${sport.toUpperCase()} · ${tab==='accuracy'?'League-wide forecast research':'League-wide final-score checks'} · all matched saved games</p>`+(tab==='accuracy'?accuracyHTML(s,rows,sport):auditHTML(s,rows,sport));
      host.querySelector('.se-select').hidden=tab!=='matchups';host.querySelector('.se-scope').hidden=tab!=='matchups';
      const status=host.querySelector('[data-se-feedback]');status.textContent=error;status.hidden=!error;
      const refresh=host.querySelector('[data-se-reload]');refresh.disabled=reloading;refresh.setAttribute('aria-busy',String(reloading));
    };
    const refresh=async()=>{
      if(reloading)return;reloading=true;error='';const ticket=++token;
      const b=host.querySelector('[data-se-reload]');b.disabled=true;b.setAttribute('aria-busy','true');
      try{await load(true);}catch(_){error='Could not reload the published snapshot. Showing the last available evidence. Try refresh again.';}
      finally{if(ticket===token){reloading=false;paint(true);if(!snapshot){b.disabled=false;b.setAttribute('aria-busy','false');const status=host.querySelector('[data-se-feedback]');status.textContent='Matchup evidence could not load. Check your connection and try refresh again.';status.hidden=false;host.querySelector('[data-se-body]').innerHTML='';}}}
    };
    host._evidencePaint=paint;
    host.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.seSport){sport=b.dataset.seSport;paint(true);}
      else if(b.dataset.seTab){tab=b.dataset.seTab;paint();}
      else if(b.hasAttribute('data-se-reload'))refresh();
      else if(b.hasAttribute('data-se-all')){choices[sport].scope='all';paint(true);scopeSelect.focus();}
    });
    host.addEventListener('change',e=>{
      if(e.target===gameSelect){choices[sport].selected=e.target.value;paint();}
      else if(e.target===scopeSelect){choices[sport].scope=e.target.value;paint(true);}
    });
    const onCloud=()=>{if(host.isConnected){if(!host.contains(document.activeElement)||!document.activeElement.matches('select,summary'))paint();}else root.removeEventListener('sportshub:cloud-ai',onCloud);};
    root.addEventListener('sportshub:cloud-ai',onCloud);
    await refresh();
  }
  function mountLab(host){return mountResearch(host,'nfl',{fullScreen:true});}
  async function mountGame(host,sport,g){
    if(!host||!g||!['nfl','nba'].includes(sport))return;
    host.classList.add('se');host.innerHTML='<p class="se-note">Loading matchup context…</p>';
    try{
      const s=await load();if(!host.isConnected)return;
      const matched=C.findGame(s,sport,g);
      if(!matched){host.innerHTML='<p class="se-note">This game is outside the DraftKings snapshot or its start time changed.</p>';return;}
      const rows=await root.SportsHubCloudAI?.eventRows?.(sport,g.id).catch(()=>[]);
      if(host.isConnected)host.innerHTML=sourceLine(s)+matchupHTML(s,sport,matched,rows||[],true);
    }catch(_){if(host.isConnected)host.innerHTML='<p class="se-note">Extra matchup evidence is unavailable. Live game data is unchanged.</p>';}
  }
  const api={load,mountResearch,mountLab,mountGame,matchupHTML,accuracyHTML,auditHTML};root.SportsHubEvidence=Object.freeze(api);
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);

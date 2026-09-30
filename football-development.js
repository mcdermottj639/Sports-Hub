(function (root) {
  'use strict';
  const C = root.SportsHubFootballResearch, KEY = 'sportshub:football-human:v1';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
  const key = r => `${r.event_id}:${r.model_version}:${r.snapshot.research.phase}`;
  const reviewFor = (saved,r) => saved[key(r)] || (r.model_version?.startsWith(C.VERSION+'-') ? saved[`${r.event_id}:${r.snapshot.research.phase}`] : null);
  const label = v => v == null ? 'unavailable' : Number(v).toFixed(1);
  const time = v => v ? new Date(v).toLocaleString() : 'unavailable';
  function resultFor(row, forecast) {
    if (!['win','loss','push'].includes(row.result)) return null;
    const home = row.market === 'moneyline' ? forecast.home ?? forecast.margin >= 0 : forecast.margin + Number(row.line) > 0;
    const selection = row.market === 'total' ? forecast.total > Number(row.line) ? 'OVER' : 'UNDER' : '';
    return C.grade(row.market, selection, home, row.line, {home:row.final_home_score,away:row.final_away_score});
  }
  function score(results) {
    const wins=results.filter(x=>x==='win').length, losses=results.filter(x=>x==='loss').length, pushes=results.filter(x=>x==='push').length;
    return `${wins}–${losses}${pushes ? ` (${pushes} push)` : ''}${wins+losses ? ` · ${(100*wins/(wins+losses)).toFixed(0)}%` : ''}`;
  }
  const implied = price => price != null && Number.isFinite(Number(price)) && Math.abs(Number(price)) >= 100 ? (Number(price)<0 ? -Number(price)/(100-Number(price)) : 100/(100+Number(price))) : null;
  function comparisonMetrics(rows) {
    const paired=rows.filter(r=>r.snapshot?.research?.candidateAvailable&&['win','loss','push'].includes(r.result)&&r.final_home_score!=null&&r.final_away_score!=null);
    const roi={n:0,baseline:0,study:0},error={n:0,baseline:0,study:0,market:0},calibration={n:0,baseline:0,market:0};
    for(const r of paired){
      const b=r.snapshot.research.baseline,o=r.snapshot.odds||{},actual=Number(r.final_home_score)-Number(r.final_away_score);
      const home=r.market==='moneyline'?b.home:b.margin+Number(r.line)>0;
      const basePrice=r.market==='moneyline'?(home?o.hML:o.aML):r.market==='spread'?(home?o.hSpreadPrice:o.aSpreadPrice):(b.total>Number(r.line)?o.overPrice:o.underPrice);
      const baseResult=resultFor(r,b);
      const profit=(result,price)=>result==='push'?0:result==='win'?(price>0?price/100:100/-price):-1;
      if(implied(basePrice)!=null&&implied(r.price)!=null&&baseResult){roi.n++;roi.baseline+=profit(baseResult,Number(basePrice));roi.study+=profit(r.result,Number(r.price));}
      if(['spread','total'].includes(r.market)&&r.line!=null&&r.projection!=null){
        const y=r.market==='total'?Number(r.final_home_score)+Number(r.final_away_score):actual;
        const bp=r.market==='total'?b.total:b.margin,mp=r.market==='total'?Number(r.line):-Number(r.line);
        if(bp!=null){error.n++;error.baseline+=Math.abs(bp-y);error.study+=Math.abs(r.projection-y);error.market+=Math.abs(mp-y);}
      }
      if(r.market==='moneyline'&&actual!==0&&b.probHome!=null){
        const hp=implied(o.hML),ap=implied(o.aML);
        if(hp!=null&&ap!=null){const y=actual>0?1:0;calibration.n++;calibration.baseline+=(b.probHome-y)**2;calibration.market+=(hp/(hp+ap)-y)**2;}
      }
    }
    return {paired:paired.length,roi,error,calibration};
  }
  function metricsHTML(rows,sport) {
    return ['early','near'].flatMap(stage=>(sport==='cfb'?['moneyline','spread']:['moneyline','spread','total']).map(market=>{
      const m=comparisonMetrics(rows.filter(r=>r.snapshot.research.phase===stage&&r.market===market)),r=m.roi,e=m.error,c=m.calibration;
      return `<div class="fd-game"><strong>${stage==='early'?'Early':'Near kickoff'} · ${market}</strong><p>${m.paired} settled paired forecasts. Common-priced sample: ${r.n}.</p><p>Flat-risk paper ROI — baseline ${r.n?(100*r.baseline/r.n).toFixed(1)+'%':'collecting'}; challenger ${r.n?(100*r.study/r.n).toFixed(1)+'%':'collecting'}.</p>${market!=='moneyline'?`<p>Mean absolute error (points; lower is better), n=${e.n}: baseline ${e.n?(e.baseline/e.n).toFixed(1):'—'} · challenger ${e.n?(e.study/e.n).toFixed(1):'—'} · sportsbook line ${e.n?(e.market/e.n).toFixed(1):'—'}.</p>`:`<p>Probability error (Brier; lower is better), n=${c.n}: baseline ${c.n?(c.baseline/c.n).toFixed(3):'—'} · no-vig market ${c.n?(c.market/c.n).toFixed(3):'—'}. Challenger probabilities withheld until independently calibrated.</p>`}</div>`;
    })).join('');
  }
  function comparison(rows, reviews, sport) {
    return ['early','near'].flatMap(stage => (sport==='cfb'?['moneyline','spread']:['moneyline','spread','total']).map(market => {
      const group=rows.filter(r=>r.snapshot?.research?.phase===stage&&r.market===market);
      const paired=group.filter(r=>r.snapshot.research.candidateAvailable);
      const human=group.filter(r=>reviewFor(reviews,r) && reviewFor(reviews,r).sourceCapturedAt===r.captured_at);
      const saved=reviews;
      const cells = [
        ['Saved', group.length],
        ['Challenger available', paired.length],
        ['Baseline', score(paired.map(r=>resultFor(r,r.snapshot.research.baseline)))],
        ['Study', score(paired.map(r=>r.result))],
        ['Baseline on reviewed games', score(human.map(r=>resultFor(r,reviewFor(saved,r).baseline)))],
        ['Your forecast', score(human.map(r=>resultFor(r,reviewFor(saved,r).human)))],
        ['50/50 blend', score(human.map(r=>resultFor(r,reviewFor(saved,r).combined)))],
      ];
      return `<tr><th scope="row">${stage === 'near' ? 'Near kickoff' : 'Early'} · ${market}</th>${cells.map(([name,value])=>`<td><span class="fd-cell-label" aria-hidden="true">${name}</span><span class="fd-cell-value">${value}</span></td>`).join('')}</tr>`;
    })).join('');
  }
  function confidence(rows) {
    return [[50,60],[60,70],[70,80],[80,101]].map(([lo,hi])=>{
      const group=rows.filter(r=>r.market==='moneyline'&&['win','loss'].includes(r.result)).filter(r=>{const b=r.snapshot.research.baseline,p=100*(b.home?b.probHome:1-b.probHome);return p>=lo&&p<hi;});
      const n=group.length, mean=n?group.reduce((s,r)=>{const b=r.snapshot.research.baseline;return s+100*(b.home?b.probHome:1-b.probHome);},0)/n:null;
      return `${lo}–${Math.min(hi-1,100)}%: ${n} observations${n?`, average ${mean.toFixed(1)}%, actual ${score(group.map(r=>resultFor(r,r.snapshot.research.baseline)))}`:''}`;
    }).join('<br>');
  }
  const requests = new Map();
  function load(sport) {
    const old=requests.get(sport);
    if(old&&Date.now()-old.at<60000)return old.promise;
    const entry={at:Date.now(),promise:null};
    entry.promise=fetchRows(sport).catch(err=>{if(requests.get(sport)===entry)requests.delete(sport);throw err;});
    requests.set(sport,entry);return entry.promise;
  }
  async function fetchRows(sport) {
    const cfg=root.SPORTS_HUB_SUPABASE;if(!cfg)throw new Error('Cloud configuration unavailable.');
    let all=[];
    for(let offset=0;;offset+=500){
      const v=C.versionFor(sport);
      // Do not download repeated full-league fitting observations to a phone.
      const select='event_id,model_version,market,result,selection,selection_home,line,projection,price,provider,matchup,starts_at,captured_at,final_home_score,final_away_score,phase:snapshot->research->phase,baseline:snapshot->research->baseline,candidateAvailable:snapshot->research->candidateAvailable,qb:snapshot->research->evidence->qb,candidate:snapshot->research->evidence->candidate,candidateTotal:snapshot->research->evidence->candidateTotal,fpi:snapshot->research->evidence->fpi,used:snapshot->research->evidence->efficiency->used,expected:snapshot->research->evidence->efficiency->expected,mean:snapshot->research->evidence->efficiency->mean,odds:snapshot->odds,oddsObservedAt:snapshot->oddsObservedAt';
      const query=`sport=eq.${sport}&model_version=in.(${v}-early,${v}-near)&select=${encodeURIComponent(select)}&order=captured_at.desc,id.desc&limit=500&offset=${offset}`;
      const res=await fetch(`${cfg.url}/rest/v1/ai_predictions?${query}`,{headers:{apikey:cfg.key},signal:AbortSignal.timeout(15000)});
      if(!res.ok)throw new Error('Research records could not load.');
      const page=await res.json();all=all.concat(page.map(r=>({...r,snapshot:{odds:r.odds,oddsObservedAt:r.oddsObservedAt,research:{phase:r.phase,baseline:r.baseline,candidateAvailable:r.candidateAvailable,evidence:{qb:r.qb,candidate:r.candidate,candidateTotal:r.candidateTotal,fpi:r.fpi,efficiency:r.used==null?null:{used:r.used,expected:r.expected,mean:r.mean}}}}})));if(page.length<500)return all;
    }
  }
  // Front-line comparison uses one immutable pregame window for BOTH models.
  // Never compare today's live baseline against yesterday's saved challenger.
  function gameComparison(rows,id,sport='nfl') {
    const saved=rows.filter(r=>String(r.event_id)===String(id)&&r.model_version?.startsWith(C.versionFor(sport)+'-')&&(!r.sport||r.sport===sport)&&Date.parse(r.captured_at)<Date.parse(r.starts_at));
    const phase=saved.some(r=>r.snapshot.research.phase==='near')?'near':'early';
    const group=saved.filter(r=>r.snapshot.research.phase===phase), row=group.find(r=>r.market==='moneyline');
    if(!row)return null;
    const r=row.snapshot.research,b=r.baseline,e=r.evidence,spread=group.find(x=>x.market==='spread'),total=group.find(x=>x.market==='total');
    const available=r.candidateAvailable===true&&Number.isFinite(row.projection);
    const cm=available?row.projection:null,ct=available&&sport==='nfl'?(total?.projection??e?.candidateTotal):null;
    const direction=(value,line)=>value==null||line==null?null:Math.sign(value-line);
    const agreement=(a,b)=>a==null||b==null?'Unavailable':a===0||b===0?'At line':a===b?'Agree':'Disagree';
    return {row,phase,b,e,cm,ct,available,line:spread?.line,totalLine:total?.line,
      spreadStatus:agreement(direction(b.margin,spread?.line==null?null:-spread.line),direction(cm,spread?.line==null?null:-spread.line)),
      totalStatus:sport==='cfb'?'Baseline only':agreement(direction(b.total,total?.line),direction(ct,total?.line))};
  }
  function gameHTML(rows,id,sport='nfl') {
    const c=gameComparison(rows,id,sport);
    const heading='<div class="fc-title"><strong>Model comparison</strong><small>Experimental</small></div>';
    if(!c)return heading+'<details class="fc-empty"><summary>Comparison unavailable <span aria-hidden="true">⌄</span></summary><p>No saved challenger comparison for this game yet.</p></details>';
    const {row,b,e,cm,ct}=c,[away,home]=row.matchup.split(' @ ');
    const margin=v=>v==null?'Unavailable':v===0?'Even':`${escape(v>0?home:away)} by ${label(Math.abs(v))}`;
    const spread=v=>{
      if(v==null||c.line==null)return '—';
      const edge=v+Number(c.line);if(Math.abs(edge)<1e-9)return 'At line';
      const h=edge>0,line=h?Number(c.line):-Number(c.line);
      return `${escape(h?home:away)} ${line>0?'+':''}${line===0?'PK':escape(line)}`;
    };
    const total=v=>v==null||c.totalLine==null?'—':Math.abs(v-c.totalLine)<1e-9?'At line':`${v>c.totalLine?'O':'U'}${escape(c.totalLine)}`;
    const qb=e?.qb?Object.entries(e.qb).map(([side,q])=>`${side}: ${q.name||'Unknown QB'} — ${q.status||'status missing'}`).join('; '):'QB evidence unavailable';
    const explanation=`<table class="fc-projections"><caption>Current vs ${sport==='cfb'?'FPI Challenger':'Challenger'}</caption><thead><tr><th scope="col">Projection</th><th scope="col">Current</th><th scope="col">${sport==='cfb'?'FPI':'Challenger'}</th></tr></thead><tbody><tr><th scope="row">Margin</th><td>${margin(b.margin)}</td><td>${margin(cm)}</td></tr><tr><th scope="row">Total</th><td>${label(b.total)}</td><td>${sport==='cfb'?'No separate model':ct==null?'Unavailable':label(ct)}</td></tr></tbody></table><p class="fc-snapshot">${c.phase==='near'?'Near kickoff':'Early'} snapshot · ${escape(new Date(row.captured_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</p><p class="fc-official">Experimental challenger · Current model remains official.</p><details class="fc-method"><summary>Model details</summary><p>${c.phase==='near'?'Near kickoff':'Early'} paired snapshot · ${escape(time(row.captured_at))}. Both columns use this saved observation; the main model read may reflect a different pregame snapshot. No in-game recalculation.</p><p>Saved home handicap ${c.line==null?'unavailable':escape(c.line)}; total line ${c.totalLine==null?'unavailable':escape(c.totalLine)}. Agree/disagree compares sides against these same lines, not equal projected scores.</p><p>${c.available?(sport==='cfb'?'FPI challenger: home minus away FPI, plus 3 points at home (zero at neutral sites). No independent total forecast.':'Challenger: opponent-adjusted team scoring per possession and projected pace.'):'Withheld: '+escape(e?.candidate?.reasons?.join('; ')||(sport==='cfb'?'One or both FPI ratings unavailable':'Required evidence unavailable'))+'.'} Challenger win probability: not calibrated.</p>${sport==='cfb'?`<p>FPI: home ${label(e?.fpi?.home)} · away ${label(e?.fpi?.away)}. Source updated ${escape(time(e?.fpi?.updatedAt))}. No NFL QB gate is applied to this CFB model.</p>`:`<p>${escape(qb)}. Depth-chart names do not confirm the starter.</p>`}${e?.efficiency?`<p>Coverage: ${escape(e.efficiency.used)} / ${escape(e.efficiency.expected)} completed games.</p>`:''}</details>`;
    const marketRow=(name,current,challenger,status)=>{
      const tone=status==='Agree'?'agree':status==='Disagree'?'disagree':'unavailable';
      return `<details class="fc-market"><summary><span class="fc-market-name">${name}</span><b>${current}</b><b>${challenger}</b><span class="fc-status ${tone}">${status}</span><span class="fc-chevron" aria-hidden="true">⌄</span></summary><div class="fc-explanation">${explanation}</div></details>`;
    };
    return heading+`<div class="fc-columns" aria-hidden="true"><span></span><span>Current</span><span>${sport==='cfb'?'FPI':'Challenger'}</span><span></span><span></span></div>`+
      marketRow('Spread',spread(b.margin),spread(cm),c.spreadStatus)+
      (sport==='cfb'?'':marketRow('Total',total(b.total),total(ct),c.totalStatus));
  }
  async function mountGame(container,id,sport='nfl') {
    if(!container||!id)return;
    const host=document.createElement('section');host.className='fc-game';host.setAttribute('aria-label','Current model versus experimental challenger');
    host.innerHTML='<strong>Current vs Challenger <small>Experimental</small></strong><p>Loading saved comparison…</p>';container.appendChild(host);
    try{const rows=await load(sport);if(host.isConnected)host.innerHTML=gameHTML(rows,id,sport);}catch(_){if(host.isConnected)host.innerHTML='<strong>Current vs Challenger</strong><p>Saved comparison unavailable. Reopen this view to retry.</p>';}
  }
  function summaryHTML(rows,phase='latest',sport='nfl') {
    const league=rows.filter(r=>!r.sport||r.sport===sport),near=new Set(league.filter(r=>r.market==='moneyline'&&r.snapshot.research.phase==='near').map(r=>r.event_id));
    const group=league.filter(r=>r.snapshot.research.phase===(phase==='latest'?(near.has(r.event_id)?'near':'early'):phase)),games=group.filter(r=>r.market==='moneyline'),eligible=games.filter(r=>r.snapshot.research.candidateAvailable);
    const metric=market=>{const m=comparisonMetrics(group.filter(r=>r.market===market)),e=m.error;return `<div class="fc-result"><b>${market==='spread'?'Margin':'Total'} error</b><span>Current ${e.n?(e.baseline/e.n).toFixed(1):'—'}</span><span>Challenger ${e.n?(e.study/e.n).toFixed(1):'—'}</span><small>${e.n} settled pairs · book ${e.n?(e.market/e.n).toFixed(1):'—'} · lower is better</small></div>`;};
    const settled=comparisonMetrics(group.filter(r=>r.market==='spread')).error.n;
    return `<div class="fc-summary-heading"><strong>${sport==='cfb'?'CFB · Current vs FPI':'NFL · Current vs Challenger'}</strong><small>Experimental</small></div><dl class="fc-counts" aria-label="${games.length} saved games · ${eligible.length} challenger available · ${games.length-eligible.length} withheld"><div><dt>Saved</dt><dd>${games.length}</dd></div><div><dt>Available</dt><dd>${eligible.length}</dd></div><div><dt>Withheld</dt><dd>${games.length-eligible.length}</dd></div></dl><details class="fc-results-details"><summary><span>${settled?`${settled} settled pairs`:'Collecting results'}<small>${settled?'Compare model performance':'Awaiting settled games'}</small></span><span class="fc-results-link">View results <span class="fc-chevron" aria-hidden="true">⌄</span></span></summary><div class="fc-windows" role="group" aria-label="Saved comparison window"><button type="button" data-fc-window="latest" aria-pressed="${phase==='latest'}">Latest</button><button type="button" data-fc-window="early" aria-pressed="${phase==='early'}">Early</button><button type="button" data-fc-window="near" aria-pressed="${phase==='near'}">Near kickoff</button></div><p>${phase==='latest'?'Latest saved window per game; near kickoff when available, otherwise early.':phase==='near'?'Near-kickoff snapshots only.':'Early snapshots only.'}</p>${metric('spread')}${sport==='cfb'?'<p>Totals: baseline only — no independent CFB totals challenger.</p>':metric('total')}<p>Same eligible games, same saved lines. Missing candidates excluded. No settled pairs means collecting—not 0% performance. Each game is counted once in the selected view; small samples do not prove improvement.</p>${(sport==='cfb'?['spread']:['spread','total']).map(market=>{const g=group.filter(r=>r.market===market&&r.snapshot.research.candidateAvailable),m=comparisonMetrics(g),roi=m.roi;return `<p><b>${market==='spread'?'Spread':'Total'}</b> · Current ${score(g.map(r=>resultFor(r,r.snapshot.research.baseline)))} · Challenger ${score(g.map(r=>r.result))}<br>Paper ROI: current ${roi.n?(100*roi.baseline/roi.n).toFixed(1)+'%':'collecting'} · challenger ${roi.n?(100*roi.study/roi.n).toFixed(1)+'%':'collecting'} (${roi.n} common-priced pairs).</p>`;}).join('')}<p>One unit risked per forecast with both exact selection prices saved. No estimated or retrofilled odds. Challenger win probability is not calibrated; the current model remains official.</p></details>`;
  }
  async function mountSummary(container,sport='nfl',placement='prepend') {
    if(!container)return;
    container.querySelectorAll(`:scope > .fc-summary[data-sport="${sport}"]`).forEach(x=>x.remove());
    const host=document.createElement('section');host.className='fc-summary';host.dataset.sport=sport;host.innerHTML=`<strong>${sport==='cfb'?'CFB · Current vs FPI Challenger':'NFL · Current vs Challenger'}</strong><p>Loading saved results…</p>`;container[placement==='append'?'appendChild':'prepend'](host);
    try{const rows=await load(sport);if(!host.isConnected)return;host.innerHTML=summaryHTML(rows,'latest',sport);host.addEventListener('click',event=>{const button=event.target.closest('[data-fc-window]');if(button){const phase=button.dataset.fcWindow;host.innerHTML=summaryHTML(rows,phase,sport);host.querySelector('.fc-results-details').open=true;host.querySelector(`[data-fc-window="${phase}"]`).focus();}});}catch(_){if(host.isConnected)host.innerHTML=`<strong>${sport==='cfb'?'CFB':'NFL'} · Current vs Challenger</strong><p>Saved results unavailable. Reopen this view to retry.</p>`;}
  }
  function render(host, rows, sport) {
    const reviews=read(), latest=new Map();
    for(const r of rows)if(r.market==='moneyline'&&!latest.has(r.event_id))latest.set(r.event_id,r);
    const games=[...latest.values()].filter(r=>C.phase(r.starts_at,new Date().toISOString())).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
    host.innerHTML=`<summary>Football development &amp; your review</summary><p>Football totals are research only. Early and near-kickoff forecasts are frozen separately; near kickoff means the first scheduled observation in the final 90 minutes. Missing windows stay missing. This study begins with v254; past results are not recreated.</p>
      <p>${sport==='cfb'?'College candidate: ESPN FPI difference plus the existing 3-point home term (zero at neutral sites). Totals are baseline-only, excluded from challenger comparisons. If either FPI rating is unavailable, only the baseline is saved; that game is excluded from the paired candidate comparison.':'NFL v3 challenger: opponent-adjusted team scoring per possession and projected possession count. This includes return scores; it is not EPA or pure offensive efficiency. Fixed small-sample shrinkage and the existing home-field term are unvalidated research assumptions. Restricted/missing QB evidence or a change from the most recent passer withholds the challenger; a depth chart never confirms the starter. Yards/play is context only. Previous v2 evidence remains archived, outside this new cohort.'} No study probabilities or recommended stakes are assigned.</p>
      <div class="fd-scroll"><table><caption>Prospective results — baseline and study use the same eligible games and frozen lines</caption><thead><tr><th>Window / market</th><th>Saved</th><th>Challenger available</th><th>Baseline</th><th>Study</th><th>Baseline on reviewed games</th><th>Your forecast</th><th>50/50 blend</th></tr></thead><tbody>${comparison(rows,reviews,sport)}</tbody></table></div>
      <details><summary>Challenger vs baseline vs sportsbook</summary><p>Descriptive results, not evidence of an edge yet. One unit risked per priced forecast; both sides must have valid captured prices for the shared ROI sample. No later price fills. Early/near windows are separate, not independent games. Smaller errors and better ROI must persist on future games before promotion.</p>${metricsHTML(rows,sport)}</details>
      <p>Win–loss records exclude pushes and voids. Human results include only reviewed games and are not comparable to the full baseline sample. No ROI is inferred from missing prices. Small samples do not establish improvement.</p>
      <details><summary>Baseline winner-confidence check</summary><p>Early:<br>${confidence(rows.filter(r=>r.snapshot.research.phase==='early'))}</p><p>Near kickoff:<br>${confidence(rows.filter(r=>r.snapshot.research.phase==='near'))}</p><p>Only winner probabilities are evaluated here. Cover and total probabilities need their own validation.</p></details>
      <div class="fd-games"></div><p>Your reviews stay on this device. Export them before clearing browser data.</p><button type="button" data-fd-export>Export my reviews</button>`;
    const target=host.querySelector('.fd-games');
    if(!games.length)target.textContent='No upcoming saved study forecasts yet. The scheduled collector runs twice an hour.';
    for(const row of games){
      const r=row.snapshot.research,b=r.baseline,e=r.evidence,review=reviewFor(reviews,row),box=document.createElement('details');box.className='fd-game';
      const qb=e?.qb ? Object.entries(e.qb).map(([side,q])=>`${side}: ${q.name||'Unknown QB'} — ${q.status} (source ${time(q.depthUpdatedAt)})`).join('; ') : '';
      const efficiency=e?.efficiency?`<p>League coverage: ${e.efficiency.used}/${e.efficiency.expected} completed games. Opponent-adjusted scoring per drive: ${['home','away'].map(side=>{const t=e.candidate?.[side];return t?`${side} attack ${label(e.efficiency.mean+t.offense)}, defense allowed ${label(e.efficiency.mean+t.allowed)} (${t.games} games)`:`${side} unavailable`;}).join('; ')}. Sample shrunk toward league average.</p>`:'';
      box.innerHTML=`<summary>${escape(row.matchup)} · ${r.phase==='near'?'near kickoff':'early'} · ${r.candidateAvailable?'Challenger saved':'Challenger withheld'}</summary><p>Starts ${escape(time(row.starts_at))}. Frozen ${escape(time(row.captured_at))}.</p><p>Home margin: baseline ${label(b.margin)}, challenger ${r.candidateAvailable?label(row.projection):'withheld'}. Total: baseline ${label(b.total)}, challenger ${sport==='cfb'?'not modeled (baseline only)':r.candidateAvailable?label(e?.candidateTotal??b.total):'withheld'}. Positive margin means the home team wins; negative means away.</p>${!r.candidateAvailable?`<p>${escape(e?.candidate?.reasons?.join('; ')||'Required rating unavailable')}. Baseline-only rows are excluded from challenger results.</p>`:''}<p>${escape(qb||`FPI: home ${label(e?.fpi?.home)}, away ${label(e?.fpi?.away)}; updated ${time(e?.fpi?.updatedAt)}.`)}</p>${efficiency}<p>Saved ${r.candidateAvailable?'challenger':'baseline-only'} prices: ${rows.filter(x=>x.event_id===row.event_id&&x.snapshot.research.phase===r.phase).map(x=>`${escape(x.market)} ${escape(x.selection)} · ${x.price==null?'unpriced':escape(x.price)} · ${escape(x.provider||'provider unavailable')}`).join('; ')}. Odds observed ${escape(time(row.snapshot.oddsObservedAt))}.</p>
      ${review?`<p><b>Review saved ${escape(time(review.at))}</b><br>Your margin ${label(review.human.margin)}, total ${label(review.human.total)}. Blend margin ${label(review.combined.margin)}, total ${label(review.combined.total)}.<br>${escape(review.reason)}</p>`:`<form><label>Your home margin<input name="margin" type="number" min="-100" max="100" step="0.1" required></label><label>Your total<input name="total" type="number" min="0" max="150" step="0.1" required></label><fieldset><legend>What changed your view?</legend>${['QB','Line play','Schedule','Tempo','Coaching'].map(x=>`<label><input type="checkbox" name="factor" value="${x}">${x}</label>`).join('')}</fieldset><label>Your reasoning<textarea name="reason" minlength="8" required></textarea></label><p>The comparison uses your independent forecast and a fixed 50/50 blend with the baseline. One review per game/window, locked when saved.</p><button type="submit">Save pregame review</button><p role="status"></p></form>`}`;
      box.querySelector('form')?.addEventListener('submit',ev=>{
        ev.preventDefault();const form=ev.currentTarget,msg=form.querySelector('[role=status]');
        try{const current=read();if(reviewFor(current,row))throw new Error('A review is already saved for this window.');
          const f=new FormData(form);current[key(row)]=C.humanReview(row,{margin:f.get('margin'),total:f.get('total'),reason:f.get('reason'),factors:f.getAll('factor')},new Date().toISOString());
          localStorage.setItem(KEY,JSON.stringify(current));render(host,rows,sport);host.open=true;
        }catch(err){msg.textContent=err.message;}
      });target.appendChild(box);
    }
    host.querySelector('[data-fd-export]').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,reviews:read()},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='football-reviews.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  }
  async function mount(container,sport) {
    if(!['nfl','cfb'].includes(sport))return;
    container.querySelectorAll(':scope > .football-development').forEach(x=>x.remove());
    const host=document.createElement('details');host.className='football-development';host.innerHTML='<summary>Football development &amp; your review</summary><p>Loading saved experiments…</p>';container.appendChild(host);
    try{const rows=await load(sport);if(host.isConnected)render(host,rows,sport);}catch(err){if(host.isConnected)host.innerHTML=`<summary>Football development &amp; your review</summary><p>${escape(err.message)} Reopen this view to retry.</p>`;}
  }
  root.SportsHubFootballDevelopment={mount,mountGame,mountSummary,gameComparison,gameHTML,summaryHTML,resultFor,score,comparisonMetrics};
})(globalThis);

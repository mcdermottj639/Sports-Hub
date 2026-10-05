(function(root) {
  'use strict';
  const C=root.SportsHubPerformance;
  const names={nfl:'NFL',cfb:'CFB Top 25',mlb:'MLB',nba:'NBA',moneyline:'Moneyline',spread:'Spread',total:'Totals'};
  const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
  const fmt=(v,d=1)=>num(v)==null?'—':Number(v).toFixed(d);
  const sign=(v,d=2)=>num(v)==null?'—':`${v>=0?'+':''}${Number(v).toFixed(d)}`;
  const tone=v=>v>0?'ph-positive':v<0?'ph-negative':'';
  const record=s=>s.n?`${s.w}W · ${s.l}L${s.pushes?` · ${s.pushes}P`:''}`:'Collecting';
  const date=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric'}):'Date unavailable';
  const timestamp=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Unavailable';
  const route=(sport,sub)=>`models/${sport||'all'}/${sub}`;
  const link=(sport,sub,label)=>`<button type="button" class="ph-link" data-desk-route="${route(sport,sub)}">${label} →</button>`;
  const options=(choices,current)=>choices.map(([v,l])=>`<option value="${e(v)}"${String(v)===String(current)?' selected':''}>${e(l)}</option>`).join('');
  const prefs={days:'0',market:'',cohort:'current',query:'',status:'all',limit:12};
  function chart(points,label) {
    if(!points.length)return '<div class="ph-empty">The profit trend starts when a model pick settles with saved odds.</div>';
    const values=[0,...points.map(p=>p.units)],lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||1;
    const y=v=>130-(v-lo)/span*100;
    const times=points.map(p=>Date.parse(p.date+'T12:00:00Z')),first=times[0],last=times.at(-1);
    const x=i=>points.length===1?340:50+(times[i]-first)/(last-first)*570;
    const path=points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.units).toFixed(1)}`).join(' ');
    return `<figure class="ph-chart"><figcaption><b>${e(label)}</b><span>${points.at(-1).n} priced bets · ${sign(points.at(-1).units)}u</span></figcaption><svg viewBox="0 0 680 170" role="img" aria-label="${e(label)}, ${date(points[0].date+'T12:00:00Z')} to ${date(points.at(-1).date+'T12:00:00Z')}, ${sign(points.at(-1).units)} units"><line x1="50" x2="620" y1="${y(0)}" y2="${y(0)}" class="ph-zero"/><text x="5" y="${y(hi)+4}">${fmt(hi)}u</text>${lo!==hi?`<text x="5" y="${y(lo)+4}">${fmt(lo)}u</text>`:''}<path d="${path}" class="${tone(points.at(-1).units)}"/>${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.units)}" r="3"><title>${e(p.date)}: ${sign(p.units)}u cumulative; ${sign(p.dailyUnits)}u that day; ${p.n} priced bets to date</title></circle>`).join('')}<text x="50" y="160">${date(points[0].date+'T12:00:00Z')}</text><text x="620" y="160" text-anchor="end">${date(points.at(-1).date+'T12:00:00Z')}</text></svg><small>Cumulative paper profit · 1 unit per priced bet · elapsed calendar time</small></figure>`;
  }
  function stats(s) {
    return `<div class="ph-stats"><div><strong>${record(s)}</strong><span>${s.n} settled picks · ${s.games} games</span></div><div><strong class="${tone(s.units)}">${s.priced?`${sign(s.units)}u`:'—'}</strong><span>Paper profit · ${s.priced} priced</span></div><div><strong class="${tone(s.roi)}">${s.priced?`${sign(s.roi*100,1)}%`:'—'}</strong><span>Paper ROI</span></div><div><strong>${s.pending}</strong><span>Awaiting results · ${s.unpriced} settled without odds</span></div></div>`;
  }
  function table(rows,first='Split') {
    return `<div class="ph-table-wrap"><table><thead><tr><th>${e(first)}</th><th>Record</th><th>Profit</th><th>ROI</th><th>Sample</th></tr></thead><tbody>${rows.map(s=>`<tr><th>${e(s.label)}</th><td>${record(s)}</td><td class="${tone(s.units)}">${s.priced?sign(s.units)+'u':'—'}</td><td class="${tone(s.roi)}">${s.priced?sign(s.roi*100,1)+'%':'—'}</td><td>${s.n} settled / ${s.priced} priced${s.n<30?' · early':''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function comparisons(rows,market) {
    return `<details class="ph-detail"><summary>Model vs simple strategies <span>Same games &amp; saved quotes</span></summary><p>Each comparison uses only model picks with both side prices and final scores. The model and baseline risk one unit on exactly the same games. Samples can differ by strategy.</p><div class="ph-table-wrap"><table><thead><tr><th>Comparison</th><th>Matched bets</th><th>Our ROI</th><th>Baseline ROI</th><th>Difference</th></tr></thead><tbody>${C.benchmarks(rows,market).map(b=>`<tr><th>Always ${b.strategy==='home'?'home':b.strategy==='favorite'?'favorite':b.strategy}</th><td>${b.n}${b.n<30?' · early':''}</td><td>${b.n?sign(b.model.roi*100,1)+'%':'—'}</td><td>${b.n?sign(b.baseline.roi*100,1)+'%':'—'}</td><td class="${tone(b.model.roi-b.baseline.roi)}">${b.n?sign((b.model.roi-b.baseline.roi)*100,1)+' pp':'Awaiting matched evidence'}</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  function trends(rows,sport) {
    if(!sport||sport==='all')return `${stats(C.summary(rows))}${chart(C.series(rows),'All selected sports · cumulative profit')}<div class="ph-section-head"><h3>Trends by sport</h3><span>Markets and scoring units stay separate</span></div>${C.SPORTS.map(s=>`<details class="ph-detail"><summary>${names[s]} <span>${record(C.summary(rows.filter(r=>r.sport===s)))} · ${C.summary(rows.filter(r=>r.sport===s)).priced?sign(C.summary(rows.filter(r=>r.sport===s)).units)+'u':'no priced results'}</span></summary>${trends(rows.filter(r=>r.sport===s),s)}</details>`).join('')}`;
    return C.MARKETS.filter(m=>!prefs.market||prefs.market===m).map(m=>{
      const rs=rows.filter(r=>r.market===m),s=C.summary(rs),periods=C.weekly(rs),cal=C.calibration(rs);
      return `<section class="ph-market"><div class="ph-section-head"><h3>${names[m]} trends</h3><span>${s.n} settled${s.n<30?' · early sample':''}</span></div>${chart(C.series(rs),`${names[sport]} ${names[m].toLowerCase()} profit`)}${periods.length?`<details class="ph-detail"><summary>Week-by-week results <span>${periods.length} weeks with results</span></summary>${table(periods.map(p=>({...p,label:'Week of '+date(p.date+'T12:00:00Z')})),'Period')}</details>`:''}${comparisons(rs,m)}<details class="ph-detail"><summary>Where the model wins and loses <span>Location, side &amp; predicted gap</span></summary>${table(C.splits(rs,'side'),'Side')}${m!=='total'?table(C.splits(rs,'favorite'),'Favorite / underdog'):''}${table(C.splits(rs,'edge'),'Saved model gap')}<p>Descriptive splits, not validated strategies. Gap buckets are shown within one sport and market; different bets on the same game are correlated.</p></details><details class="ph-detail"><summary>Probability accuracy <span>${cal.reduce((n,b)=>n+b.n,0)} verified forecasts</span></summary>${cal.length?`<div class="ph-table-wrap"><table><thead><tr><th>Predicted range</th><th>Average prediction</th><th>Actual win rate</th><th>Sample</th></tr></thead><tbody>${cal.map(b=>`<tr><th>${b.label}</th><td>${fmt(b.expected*100)}%</td><td>${fmt(b.actual*100)}%</td><td>${b.n}${b.n<30?' · early':''}</td></tr>`).join('')}</tbody></table></div>`:'<p>Verified saved probabilities are not available for this sample yet.</p>'}<p>Pushes excluded. Spread and total probabilities are experimental; this measures past calibration.</p></details></section>`;
    }).join('')+`<details class="ph-detail"><summary>Score projection accuracy <span>All saved forecasts</span></summary><div class="ph-table-wrap"><table><thead><tr><th>Projection</th><th>Average absolute error</th><th>Average bias</th><th>Games</th></tr></thead><tbody>${C.forecastErrors(rows).map(x=>`<tr><th>${x.metric==='margin'?'Home margin':'Combined total'}</th><td>${fmt(x.mae)} ${sport==='mlb'?'runs':'points'}</td><td>${sign(x.bias,1)}</td><td>${x.n}</td></tr>`).join('')}</tbody></table></div><p>Positive bias means the forecast ran high. Each game counts once.</p></details>`;
  }
  function teams(r) {
    const parts=String(r.matchup||'').split(/\s+@\s+/);
    return parts.length===2?{away:parts[0],home:parts[1]}:{away:'Away team',home:'Home team'};
  }
  function projectedMargin(r,value) {
    const margin=num(value),t=teams(r);
    return margin==null?'Not saved':margin===0?'Even matchup':`${margin>0?t.home:t.away} by ${fmt(Math.abs(margin))}`;
  }
  function savedLine(r) {
    const line=num(r.line);
    if(line==null)return 'Not saved';
    if(r.market!=='spread')return fmt(line);
    if(typeof r.selection_home!=='boolean')return `${teams(r).home} ${sign(line,1)} (home line)`;
    return `${r.selection_home?teams(r).home:teams(r).away} ${sign(r.selection_home?line:-line,1)}`;
  }
  function gameCard(rs) {
    const r=rs.find(x=>num(x.final_home_score)!=null&&num(x.final_away_score)!=null)||rs[0];
    const final=num(r.final_home_score)!=null&&num(r.final_away_score)!=null;
    return `<details class="ph-game"><summary><span><b>${e(r.matchup||r.event_id)}</b><small>${names[r.sport]} · ${date(r.starts_at)}${final?` · Final (away–home) ${r.final_away_score}–${r.final_home_score}`:''}</small></span><span class="ph-outcomes">${rs.map(x=>`<span class="ph-result ph-${e(x.result)}">${names[x.market]} · ${e(({win:'Won',loss:'Lost',push:'Push',void:'Void',pending:Date.parse(x.starts_at)>Date.now()?'Upcoming':'Awaiting result'})[x.result]||'Unsettled')}</span>`).join('')}</span></summary><div class="ph-game-body">${rs.map(x=>{
      const p=C.profit(x),sp=x.snapshot||{};
      return `<div class="ph-pick"><h4>${names[x.market]} · ${e(x.selection)}</h4><p><b>Model pick</b>${p!=null?` · <span class="${tone(p)}">${sign(p)}u</span>`:''}</p><dl><div><dt>Saved odds</dt><dd>${num(x.price)==null?'Missing':sign(x.price,0)}</dd></div>${x.market!=='moneyline'?`<div><dt>Saved line</dt><dd>${e(savedLine(x))}</dd></div><div><dt>${x.market==='spread'?'Model':'Projected total'}</dt><dd>${e(x.market==='spread'?projectedMargin(x,x.projection):num(x.projection)==null?'Not saved':fmt(x.projection))}</dd></div>`:''}<div><dt>Model probability</dt><dd>${num(x.model_probability)==null?'Not saved':fmt(x.model_probability*100)+'%'}</dd></div></dl><details><summary>Saved model inputs &amp; capture details</summary><p>Version ${e(x.model_version)} · ${e(x.provider||'Book unavailable')}<br>Saved ${timestamp(x.captured_at)} ET · Start ${timestamp(x.starts_at)} ET<br>Model: ${e(projectedMargin(x,sp.forecast?.margin))} · Projected total ${fmt(sp.forecast?.total)}</p>${x.quality?.length?`<p>${x.quality.map(e).join(' · ')}</p>`:''}<pre>${e(JSON.stringify(sp,null,2))}</pre></details></div>`;
    }).join('')}</div></details>`;
  }
  function recent(rows,sport,limit=12) {
    const selected=rows.filter(r=>prefs.status==='all'||prefs.status==='settled'&&C.settled(r)||r.result===prefs.status);
    const games=C.games(selected);
    return `<div class="ph-section-head"><h3>Game history</h3><span>${games.length} games · newest played first; upcoming below</span></div><p class="ph-caption">Each game opens its saved picks, original lines, projections and model inputs.</p>${games.length?games.slice(0,limit).map(gameCard).join(''):'<div class="ph-empty">No saved games match this view. Try a wider date range or another model version.</div>'}${games.length>limit?'<button type="button" class="ph-more" data-ph-more>Show 12 more games</button>':''}`;
  }
  function overview(rows,sport) {
    const s=C.summary(rows);
    return `${stats(s)}<p class="ph-caption">All saved model picks · 1 unit per priced bet · ${s.n<30?'Early sample; trends are still developing.':'Past results; multiple markets on one game are correlated.'}</p>${chart(C.series(rows),'All model picks · cumulative profit')}<div class="ph-section-head"><h3>${sport==='all'?'By sport':'By market'}</h3><span>Tap a row to inspect trends</span></div><div class="ph-sport-list">${(sport==='all'?C.SPORTS:C.MARKETS).map(k=>{const rs=rows.filter(r=>sport==='all'?r.sport===k:r.market===k),v=C.summary(rs);return `<button type="button" ${sport==='all'?`data-desk-route="${route(k,'trends')}"`:`data-ph-market="${k}"`}><span><b>${names[k]}</b><small>${v.n} settled · ${v.priced} priced${v.n<30?' · early':''}</small></span><strong>${record(v)}</strong><span class="${tone(v.units)}">${v.priced?`${sign(v.units)}u · ${sign(v.roi*100,1)}%`:'Collecting'} →</span></button>`;}).join('')}</div><div class="ph-section-head"><h3>Latest settled games</h3>${link(sport,'recent','Full game history')}</div>${C.games(rows.filter(C.settled)).slice(0,5).map(gameCard).join('')||'<p class="ph-empty">No settled games in this view yet.</p>'}`;
  }
  function panel({sport='all',view='record',versionFor,cache,officialHTML=''}) {
    const host=document.createElement('section');host.className='ph-hub';
    if(prefs.cohort!=='current'&&sport!=='all'&&!prefs.cohort.startsWith(sport+'|'))prefs.cohort='current';
    function paint() {
      const all=cache?.rows||[],rows=C.select(all,{...prefs,query:view==='recent'?prefs.query:'',sport,versionFor});
      const cohorts=[...new Set(C.valid(all).filter(r=>sport==='all'||r.sport===sport).map(r=>`${r.sport}|${r.model_version}`))];
      host.innerHTML=`<div class="ph-top"><div><span class="ph-eyebrow">MODEL PERFORMANCE</span><h2>${view==='trends'?'The trends we’re building':view==='recent'?'Every saved game, within reach':'Is the model adding value?'}</h2></div><span class="ph-saved">${cache?.at?`History checked ${timestamp(cache.at)} ET`:'Saved history is loading'}${cache?.at&&Date.now()-Date.parse(cache.at)>90*60e3?' · Refresh recommended':''}</span></div><div class="ph-filters"><label>Window<select data-ph-filter="days">${options([['0','All saved history'],['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days']],prefs.days)}</select></label><label>Market<select data-ph-filter="market">${options([['','All markets'],...C.MARKETS.map(m=>[m,names[m]])],prefs.market)}</select></label><label>Model version<select data-ph-filter="cohort">${options([['current','Current model per sport'],...cohorts.map(k=>[k,`${names[k.split('|')[0]]} · ${k.split('|')[1]}`])],prefs.cohort)}</select></label>${view==='recent'?`<label>Result<select data-ph-filter="status">${options([['all','All results'],['settled','Settled'],['win','Wins'],['loss','Losses'],['push','Pushes'],['pending','Awaiting / upcoming'],['void','Voids']],prefs.status)}</select></label><label class="ph-search">Find a game<input type="search" data-ph-query value="${e(prefs.query)}" placeholder="Team or pick"></label>`:''}</div>${view==='recent'?recent(rows,sport,prefs.limit):view==='trends'?trends(rows,sport):overview(rows,sport)}<details class="ph-detail ph-data"><summary>Data coverage &amp; counting rules</summary><p>${rows.length} unique saved market forecasts in this view. Only predictions captured before kickoff are used. Every saved model pick counts toward its win/loss record, regardless of betting tier or odds. Paper ROI uses all those picks with real saved odds; missing prices affect profit coverage only. Pushes return the stake and voids are excluded. CFB totals remain experimental but their results are tracked.</p><p>Current-model views keep the previous NFL engine out; select its version to explore its preserved history. Games with multiple selected markets are correlated. Daily profit uses game dates in Eastern time; weeks start Monday. Charts connect observed dates across skipped days without inventing results.</p><p>Closing-line value is not available because a verified closing quote is not saved in this history. Situational rule tests and collection diagnostics remain in Research.</p>${link(sport,'method','All model formulas & inputs')}${link(sport,'calibration','Full diagnostics')}${link('all','results','All-sport performance')}</details>${view==='record'&&officialHTML?`<details class="ph-detail"><summary>Full forecast evaluation &amp; probability evidence <span>Current models · all saved forecasts</span></summary>${officialHTML}</details>`:''}`;
    }
    host.addEventListener('change',ev=>{const key=ev.target.dataset.phFilter;if(key){prefs[key]=ev.target.value;prefs.limit=12;paint();}});
    host.addEventListener('input',ev=>{if(ev.target.hasAttribute('data-ph-query')){const value=ev.target.value,pos=ev.target.selectionStart;prefs.query=value;prefs.limit=12;paint();const input=host.querySelector('[data-ph-query]');input.focus();input.setSelectionRange(pos,pos);}});
    host.addEventListener('click',ev=>{const more=ev.target.closest('[data-ph-more]'),market=ev.target.closest('[data-ph-market]');if(more){prefs.limit+=12;paint();}if(market){prefs.market=market.dataset.phMarket;root.SportsHubDesk?.navigate?.(route(sport,'trends'));}});
    paint();return host;
  }
  root.SportsHubPerformanceUI=Object.freeze({panel,chart,gameCard});
})(globalThis);

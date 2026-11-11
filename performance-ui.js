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
  // v347 — the research "system card" look (win %, ROI, pending, units sparkline) for model records.
  function spark(points){
    const v=[0,...points.map(p=>p.units)];if(v.length<3)return '';
    const lo=Math.min(0,...v),hi=Math.max(0,...v),span=hi-lo||1,w=110,h=32,x=i=>i/(v.length-1)*w,y=u=>h-2-(u-lo)/span*(h-4);
    const d=v.map((u,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(u).toFixed(1)}`).join(' '),up=v.at(-1)>=0;
    return `<svg class="ph-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="ph-spark-zero"/><path d="${d} L${w},${h} L0,${h} Z" class="ph-spark-fill ${up?'up':'down'}"/><path d="${d}" class="ph-spark-line ${up?'up':'down'}"/></svg>`;
  }
  function sysCard({title,sub,v,rows=[],attr='',note=''}){
    const win=v.w+v.l?v.w/(v.w+v.l)*100:null,roi=v.priced?v.roi*100:null;
    const tag=attr?'button':'article';
    return `<${tag} ${attr?`type="button" ${attr}`:''} class="ph-sys"><span class="ph-sys-head"><span class="ph-sys-title"><b>${e(title)}</b>${sub?`<small>${e(sub)}</small>`:''}</span><span class="ph-sys-stats"><span class="${win==null?'':win>=52.4?'ph-positive':win<50?'ph-negative':''}">${win==null?'—':fmt(win,0)+'%'}<small>Win</small></span><span class="${tone(roi)}">${roi==null?'—':sign(roi,1)+'%'}<small>ROI</small></span></span></span><span class="ph-sys-foot"><span class="ph-sys-active"><b>${v.pending||0}</b> Active pick${v.pending===1?'':'s'}</span><span class="ph-sys-rec">${v.n?`${record(v)} · ${v.priced?sign(v.units)+'u':'no prices'}${v.n<30?' · early':''}`:'Collecting'}${note?` · ${e(note)}`:''}</span>${spark(C.series(rows))}</span></${tag}>`;
  }
  function stats(s) {
    return `<div class="ph-stats"><div><strong>${record(s)}</strong><span>${s.n} settled picks · ${s.games} games</span></div><div><strong class="${tone(s.units)}">${s.priced?`${sign(s.units)}u`:'—'}</strong><span>Paper profit · ${s.priced} priced</span></div><div><strong class="${tone(s.roi)}">${s.priced?`${sign(s.roi*100,1)}%`:'—'}</strong><span>Paper ROI</span></div><div><strong>${s.pending}</strong><span>Awaiting results · ${s.unpriced} settled without odds</span></div></div>`;
  }
  function table(rows,first='Split') {
    return `<div class="ph-table-wrap"><table><thead><tr><th>${e(first)}</th><th>Record</th><th>Profit</th><th>ROI</th><th>Sample</th></tr></thead><tbody>${rows.map(s=>`<tr><th>${e(s.label)}</th><td>${record(s)}</td><td class="${tone(s.units)}">${s.priced?sign(s.units)+'u':'—'}</td><td class="${tone(s.roi)}">${s.priced?sign(s.roi*100,1)+'%':'—'}</td><td>${s.n} settled / ${s.priced} priced${s.n<30?' · early':''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function splitCards(rs,dim,label){
    const groups=new Map();for(const g of C.splits(rs,dim))groups.set(g.label,g);
    const by=new Map();for(const r of rs){const k=C.splits([r],dim)[0]?.label;if(k==null)continue;if(!by.has(k))by.set(k,[]);by.get(k).push(r);}
    return `<h4 class="ph-sys-h">${e(label)}</h4><div class="ph-sys-grid">${[...groups.values()].map(g=>sysCard({title:g.label,v:g,rows:by.get(g.label)||[]})).join('')}</div>`;
  }
  function comparisons(rows,market) {
    return `<details class="ph-detail"><summary>Model vs simple strategies <span>Same games &amp; saved quotes</span></summary><p>Each comparison uses only model picks with both side prices and final scores. The model and baseline risk one unit on exactly the same games. Samples can differ by strategy.</p><div class="ph-table-wrap"><table><thead><tr><th>Comparison</th><th>Matched bets</th><th>Our ROI</th><th>Baseline ROI</th><th>Difference</th></tr></thead><tbody>${C.benchmarks(rows,market).map(b=>`<tr><th>Always ${b.strategy==='home'?'home':b.strategy==='favorite'?'favorite':b.strategy}</th><td>${b.n}${b.n<30?' · early':''}</td><td>${b.n?sign(b.model.roi*100,1)+'%':'—'}</td><td>${b.n?sign(b.baseline.roi*100,1)+'%':'—'}</td><td class="${tone(b.model.roi-b.baseline.roi)}">${b.n?sign((b.model.roi-b.baseline.roi)*100,1)+' pp':'Awaiting matched evidence'}</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  function trends(rows,sport) {
    if(!sport||sport==='all'){const head=C.headline(rows,prefs.market),split=!prefs.market;return `${stats(C.summary(head))}${chart(C.series(head),split?'All sports · winner + spread · cumulative profit':'All selected sports · cumulative profit')}<div class="ph-section-head"><h3>Trends by sport</h3><span>${split?'Headline excludes totals; each sport still has a Totals section':'Markets and scoring units stay separate'}</span></div>${C.SPORTS.map(s=>{const v=C.summary(head.filter(r=>r.sport===s));return `<details class="ph-detail"><summary>${names[s]} <span>${record(v)} · ${v.priced?sign(v.units)+'u':'no priced results'}</span></summary>${trends(rows.filter(r=>r.sport===s),s)}</details>`;}).join('')}`;}
    return C.MARKETS.filter(m=>!prefs.market||prefs.market===m).map(m=>{
      const rs=rows.filter(r=>r.market===m),s=C.summary(rs),periods=C.weekly(rs),cal=C.calibration(rs);
      return `<section class="ph-market"><div class="ph-section-head"><h3>${names[m]} trends</h3><span>${s.n} settled${s.n<30?' · early sample':''}</span></div>${chart(C.series(rs),`${names[sport]} ${names[m].toLowerCase()} profit`)}${periods.length?`<details class="ph-detail"><summary>Week-by-week results <span>${periods.length} weeks with results</span></summary>${sport==='nfl'?'<p class="ph-caption">Tuesday–Monday · Eastern time · Monday night stays with its weekend.</p>':''}${table(periods.map(p=>({...p,label:sport==='nfl'?date(p.date+'T12:00:00Z')+' – '+date(p.endDate+'T12:00:00Z'):'Week of '+date(p.date+'T12:00:00Z')})),'Period')}</details>`:''}${comparisons(rs,m)}${m==='moneyline'?'':clvSection(rs)}<details class="ph-detail"><summary>Where the model wins and loses <span>Location, side &amp; predicted gap</span></summary>${splitCards(rs,'side','Side')}${m!=='total'?splitCards(rs,'favorite','Favorite / underdog'):''}${splitCards(rs,'edge','Saved model gap')}<p>Descriptive splits, not validated strategies. Gap buckets are shown within one sport and market; different bets on the same game are correlated.</p></details><details class="ph-detail"><summary>Probability accuracy <span>${cal.reduce((n,b)=>n+b.n,0)} verified forecasts</span></summary>${cal.length?`<div class="ph-table-wrap"><table><thead><tr><th>Predicted range</th><th>Average prediction</th><th>Actual win rate</th><th>Sample</th></tr></thead><tbody>${cal.map(b=>`<tr><th>${b.label}</th><td>${fmt(b.expected*100)}%</td><td>${fmt(b.actual*100)}%</td><td>${b.n}${b.n<30?' · early':''}</td></tr>`).join('')}</tbody></table></div>`:'<p>Verified saved probabilities are not available for this sample yet.</p>'}<p>Pushes excluded. Spread and total probabilities are experimental; this measures past calibration.</p></details></section>`;
    }).join('')+`<details class="ph-detail"><summary>Score projection accuracy <span>All saved forecasts</span></summary><div class="ph-table-wrap"><table><thead><tr><th>Projection</th><th>Average absolute error</th><th>Average bias</th><th>Games</th></tr></thead><tbody>${C.forecastErrors(rows).map(x=>`<tr><th>${x.metric==='margin'?'Home margin':'Combined total'}</th><td>${fmt(x.mae)} ${sport==='mlb'?'runs':'points'}</td><td>${sign(x.bias,1)}</td><td>${x.n}</td></tr>`).join('')}</tbody></table></div><p>Positive bias means the forecast ran high. Each game counts once.</p></details>`;
  }
  // v345 — closing-line value. Quotes live in localStorage so each settled
  // event is read from Supabase once (sportshub:clv:v1 → quoteKey → quotes).
  const QKEY='sportshub:clv:v1', QMISS_MS=24*3600e3, QBATCH=20;
  let quotes=null, hydrating=false;
  function loadQuotes(){ if(quotes)return quotes; try{quotes=JSON.parse(localStorage.getItem(QKEY)||'{}');}catch(_){quotes={};} if(!quotes||typeof quotes!=='object')quotes={}; return quotes; }
  function saveQuotes(){ try{localStorage.setItem(QKEY,JSON.stringify(quotes));}catch(err){console.warn('[performance] quote cache save failed',err);} }
  const clvEligible=r=>C.CLV_MARKETS.includes(r.market)&&['nfl','cfb'].includes(r.sport)&&C.settled(r)&&r.event_id&&r.starts_at;
  function needsQuote(r){ const q=loadQuotes()[C.quoteKey(r)]; return !q||(q.miss&&Date.now()-Date.parse(q.at||0)>QMISS_MS); }
  async function hydrate(rows,repaint){
    const api=root.SportsHubCloudAI; if(hydrating||!api?.lastPregameQuotes)return;
    const seen=new Set(), todo=[];
    for(const r of rows){ if(!clvEligible(r)||!needsQuote(r))continue; const k=C.quoteKey(r); if(seen.has(k))continue; seen.add(k); todo.push(r); if(todo.length>=QBATCH)break; }
    if(!todo.length)return;
    hydrating=true; let got=0;
    try{
      await Promise.all(todo.map(async r=>{
        try{ const q=await api.lastPregameQuotes(r.sport,r.event_id,r.starts_at,r.provider); const k=C.quoteKey(r);
          quotes[k]=q&&(q.spread||q.total)?{...q,at:new Date().toISOString()}:{miss:true,at:new Date().toISOString()}; got++; }
        catch(err){ console.warn('[performance] quote read failed',r.event_id,err); }
      }));
    } finally { hydrating=false; }
    if(got){ saveQuotes(); repaint(); }
  }
  const clvNote=v=>v.status!=='ok'?'':`${v.minutesBefore==null?'':`${v.minutesBefore} min before kickoff`}${v.stale?' · early quote':''}`;
  function clvLine(r){
    const v=C.closingValue(r,loadQuotes()[C.quoteKey(r)]);
    if(!v)return '';
    if(v.status!=='ok')return `<div><dt>Last pregame quote</dt><dd>${needsQuote(r)&&clvEligible(r)?'Reading…':'Not saved'}</dd></div>`;
    return `<div><dt>Last pregame quote</dt><dd>${sign(v.closeLine,1)}${r.market==='total'?'':' (your side)'}${v.minutesBefore!=null?` · ${v.minutesBefore} min out`:''}</dd></div><div><dt>Closing line value</dt><dd class="${tone(v.points)}">${sign(v.points,1)} pts${v.stale?' · early quote':''}</dd></div>`;
  }
  function clvSection(rows,open=false){
    const nflcfb=rows.filter(r=>['nfl','cfb'].includes(r.sport));
    if(!nflcfb.some(clvEligible))return '';
    const sum=C.clvSummary(nflcfb,loadQuotes());
    const cells=C.CLV_MARKETS.filter(m=>!prefs.market||prefs.market===m).map(m=>{const v=sum[m];
      return `<div><strong class="${v.n?tone(v.avg):''}">${v.n?sign(v.avg,2)+' pts':'—'}</strong><span>${names[m]} · avg CLV · ${v.n} picks${v.pending?` · ${v.pending} unread`:''}</span></div><div><strong>${v.n?fmt(v.beat/v.n*100,0)+'%':'—'}</strong><span>Beat the close · ${v.beat}W ${v.tied}T ${v.worse}L${v.stale?` · ${v.stale} early quotes`:''}</span></div>`;}).join('');
    return `<details class="ph-detail"${open?' open':''}><summary>Closing line value <span>NFL + CFB spreads &amp; totals · vs last pregame quote</span></summary><div class="ph-stats">${cells}</div><p>Points from your seat: +0.5 means the pick's saved line was half a point better than the book's last pregame number. The quote is the odds collector's last DraftKings snapshot before kickoff (usually 5–10 minutes out for NFL), not a certified close; "early quote" marks a last snapshot more than ${C.CLV_LATE_MIN} minutes before kickoff. Beating the close consistently is the strongest sign a model has an edge; a win/loss record over a few dozen games is mostly luck. Moneyline picks are price-based and not measured here. Quotes exist from 30 Sep 2026; earlier picks read "Not saved".</p></details>`;
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
      return `<div class="ph-pick"><h4>${names[x.market]} · ${e(x.selection)}</h4><p><b>Model pick</b>${p!=null?` · <span class="${tone(p)}">${sign(p)}u</span>`:''}</p><dl><div><dt>Saved odds</dt><dd>${num(x.price)==null?'Missing':sign(x.price,0)}</dd></div>${x.market!=='moneyline'?`<div><dt>Saved line</dt><dd>${e(savedLine(x))}</dd></div><div><dt>${x.market==='spread'?'Model':'Projected total'}</dt><dd>${e(x.market==='spread'?projectedMargin(x,x.projection):num(x.projection)==null?'Not saved':fmt(x.projection))}</dd></div>`:''}<div><dt>Model probability</dt><dd>${num(x.model_probability)==null?'Not saved':fmt(x.model_probability*100)+'%'}</dd></div>${clvLine(x)}</dl><details><summary>Saved model inputs &amp; capture details</summary><p>Version ${e(x.model_version)} · ${e(x.provider||'Book unavailable')}<br>Saved ${timestamp(x.captured_at)} ET · Start ${timestamp(x.starts_at)} ET<br>Model: ${e(projectedMargin(x,sp.forecast?.margin))} · Projected total ${fmt(sp.forecast?.total)}</p>${x.quality?.length?`<p>${x.quality.map(e).join(' · ')}</p>`:''}<pre>${e(JSON.stringify(sp,null,2))}</pre></details></div>`;
    }).join('')}</div></details>`;
  }
  function recent(rows,sport,limit=12) {
    const selected=rows.filter(r=>prefs.status==='all'||prefs.status==='settled'&&C.settled(r)||r.result===prefs.status);
    const games=C.games(selected);
    return `<div class="ph-section-head"><h3>Game history</h3><span>${games.length} games · newest played first; upcoming below</span></div><p class="ph-caption">Each game opens its saved picks, original lines, projections and model inputs.</p>${games.length?games.slice(0,limit).map(gameCard).join(''):'<div class="ph-empty">No saved games match this view. Try a wider date range or another model version.</div>'}${games.length>limit?'<button type="button" class="ph-more" data-ph-more>Show 12 more games</button>':''}`;
  }
  const fair=p=>{const v=C.fairAmerican(p);return v==null?'—':`${v<0?'−':'+'}${Math.round(Math.abs(v))}`;};
  const team=r=>String(r.selection||'').replace(/\s+ML$/i,'');
  function flipRow(r) {
    const p=C.profit(r),res={win:'Won',loss:'Lost',push:'Push'}[r.result];
    const when=r.result==='pending'?(Date.parse(r.starts_at)>Date.now()?timestamp(r.starts_at)+' ET':'Awaiting result'):date(r.starts_at);
    return `<div class="ph-flip ph-flip-${e(r.result)}"><span class="ph-flip-game"><b>${e(team(r))}</b><small>${names[r.sport]} · ${e(r.matchup||'')} · ${e(when)}</small></span><span class="ph-flip-odds"><span><small>Book</small><b>${sign(r.price,0)}</b></span><i aria-hidden="true">→</i><span><small>Model</small><b>${fair(r.model_probability)}</b></span></span><span class="ph-flip-res">${res?`<b class="${tone(p)}">${res}</b><small class="${tone(p)}">${p==null?'':sign(p)+'u'}</small>`:'<b>Pending</b><small>'+fmt(r.model_probability*100,0)+'% model</small>'}</span></div>`;
  }
  function flipsSection(rows,sport) {
    if(prefs.market&&prefs.market!=='moneyline')return '';
    const f=C.flips(rows),s=f.summary;
    const head=`<div class="ph-section-head" id="ph-flips"><h3>🐶 Underdog flips</h3><span>Book has them as the dog · our model has them favored</span></div>`;
    if(!f.rows.length)return `${head}<div class="ph-empty">No underdog flips in this view yet. They appear when a moneyline pick is plus money at the book but over 50% in the model.</div>`;
    return `<section class="ph-flips">${head}${stats(s)}<div class="ph-sys-grid">${sport==='all'&&f.bySport.length>1?f.bySport.map(g=>sysCard({title:names[g.key],sub:'Underdog flips',v:g,rows:f.rows.filter(r=>r.sport===g.key&&r.result!=='void')})).join(''):''}${f.byStrength.map(g=>sysCard({title:g.label,sub:'Model price',v:g,rows:f.rows.filter(r=>C.flipStrength(r)===g.key&&r.result!=='void')})).join('')}</div>${f.upcoming.length?`<div class="ph-flip-list"><h4>Upcoming flips · ${f.upcoming.length}</h4>${f.upcoming.slice(0,8).map(flipRow).join('')}</div>`:''}${f.latest.length?`<details class="ph-detail"${f.upcoming.length?'':' open'}><summary>Latest settled flips <span>${f.latest.length} games · newest first</span></summary><div class="ph-flip-list">${f.latest.slice(0,15).map(flipRow).join('')}</div></details>`:''}<details class="ph-detail"><summary>How flips are counted</summary><p>A flip is a saved pregame moneyline pick whose saved book price is plus money while the model's saved win probability for that same team is above 50%. "Model" shows that probability as a fair price (60% = −150). Paper profit risks 1 unit at the saved book price. Pushes return the stake; voids are excluded. Uses the same window and model-version filters as above. Small samples swing hard; this is a record, not a validated strategy.</p></details></section>`;
  }

  function overview(rows,sport) {
    const head=C.headline(rows,prefs.market),s=C.summary(head),split=!prefs.market;
    const totals=split?C.summary(rows.filter(r=>r.market==='total')):null;
    const list=sport==='all'
      ?C.SPORTS.map(k=>{const rs=head.filter(r=>r.sport===k);return sysCard({title:names[k],sub:split?'Winner + spread':'All markets',v:C.summary(rs),rows:rs,attr:`data-desk-route="${route(k,'trends')}"`});}).join('')
        +(split&&(totals.n||totals.pending)?sysCard({title:'Totals · all sports',sub:'Tracked separately',v:totals,rows:rows.filter(r=>r.market==='total'),attr:'data-ph-market="total"'}):'')
      :C.MARKETS.map(k=>{const rs=rows.filter(r=>r.market===k);return sysCard({title:names[k],sub:split&&k==='total'?'Not in headline':`${names[sport]||''} model`,v:C.summary(rs),rows:rs,attr:`data-ph-market="${k}"`});}).join('');
    return `${stats(s)}<p class="ph-caption">${split?'Winner + spread picks · totals tracked separately':'All saved model picks'} · 1 unit per priced bet · ${s.n<30?'Early sample; trends are still developing.':'Past results; multiple markets on one game are correlated.'}</p>${chart(C.series(head),split?'Winner + spread · cumulative profit':'All model picks · cumulative profit')}${clvSection(rows,true)}<div class="ph-section-head"><h3>${sport==='all'?'By sport':'By market'}</h3><span>${split?'Sport records exclude totals · ':''}Tap a row to inspect trends</span></div><div class="ph-sys-grid">${list}</div>${flipsSection(rows,sport)}<div class="ph-section-head"><h3>Latest settled games</h3>${link(sport,'recent','Full game history')}</div>${C.games(rows.filter(C.settled)).slice(0,5).map(gameCard).join('')||'<p class="ph-empty">No settled games in this view yet.</p>'}`;
  }
  function panel({sport='all',view='record',versionFor,cache,officialHTML=''}) {
    const host=document.createElement('section');host.className='ph-hub';
    if(prefs.cohort!=='current'&&sport!=='all'&&!prefs.cohort.startsWith(sport+'|'))prefs.cohort='current';
    function paint() {
      const all=cache?.rows||[],rows=C.select(all,{...prefs,query:view==='recent'?prefs.query:'',sport,versionFor});
      const cohorts=[...new Set(C.valid(all).filter(r=>sport==='all'||r.sport===sport).map(r=>`${r.sport}|${r.model_version}`))];
      host.innerHTML=`<div class="ph-top"><div><span class="ph-eyebrow">MODEL PERFORMANCE</span><h2>${view==='trends'?'The trends we’re building':view==='recent'?'Every saved game, within reach':'Is the model adding value?'}</h2></div><span class="ph-saved">${cache?.at?`History checked ${timestamp(cache.at)} ET`:'Saved history is loading'}${cache?.at&&Date.now()-Date.parse(cache.at)>90*60e3?' · Refresh recommended':''}</span></div><div class="ph-filters"><label>Window<select data-ph-filter="days">${options([['0','All saved history'],['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days']],prefs.days)}</select></label><label>Market<select data-ph-filter="market">${options([['','All markets'],...C.MARKETS.map(m=>[m,names[m]])],prefs.market)}</select></label><label>Model version<select data-ph-filter="cohort">${options([['current','Current model per sport'],...cohorts.map(k=>[k,`${names[k.split('|')[0]]} · ${k.split('|')[1]}`])],prefs.cohort)}</select></label>${view==='recent'?`<label>Result<select data-ph-filter="status">${options([['all','All results'],['settled','Settled'],['win','Wins'],['loss','Losses'],['push','Pushes'],['pending','Awaiting / upcoming'],['void','Voids']],prefs.status)}</select></label><label class="ph-search">Find a game<input type="search" data-ph-query value="${e(prefs.query)}" placeholder="Team or pick"></label>`:''}</div>${view==='recent'?recent(rows,sport,prefs.limit):view==='trends'?trends(rows,sport):overview(rows,sport)}<details class="ph-detail ph-data"><summary>Data coverage &amp; counting rules</summary><p>${rows.length} unique saved market forecasts in this view. Only predictions captured before kickoff are used. Every saved model pick counts toward its own market's win/loss record, regardless of betting tier or odds. Headline and per-sport records (top tiles, profit chart, By sport) count winner and spread picks only; totals keep their own record, trends and history — choose Market: Totals to see them alone. Paper ROI uses all those picks with real saved odds; missing prices affect profit coverage only. Pushes return the stake and voids are excluded. CFB totals remain experimental but their results are tracked.</p><p>Current-model views keep the previous NFL engine out; select its version to explore its preserved history. Games with multiple selected markets are correlated. Daily profit uses game dates in Eastern time. NFL reporting weeks run Tuesday–Monday, keeping Monday night with its weekend; other sports use Monday–Sunday. Charts connect observed dates across skipped days without inventing results.</p><p>Closing line value (NFL and CFB spreads and totals) compares each saved pick line with the odds collector's last pregame DraftKings quote for that game, read once per settled game and kept on this device; it is the last quote seen, not a certified close. Situational rule tests and collection diagnostics remain in Research.</p>${link(sport,'method','All model formulas & inputs')}${link(sport,'calibration','Full diagnostics')}${link('all','results','All-sport performance')}</details>${view==='record'&&officialHTML?`<details class="ph-detail"><summary>Full forecast evaluation &amp; probability evidence <span>Current models · all saved forecasts</span></summary>${officialHTML}</details>`:''}`;
    }
    host.addEventListener('change',ev=>{const key=ev.target.dataset.phFilter;if(key){prefs[key]=ev.target.value;prefs.limit=12;paintAndHydrate();}});
    host.addEventListener('input',ev=>{if(ev.target.hasAttribute('data-ph-query')){const value=ev.target.value,pos=ev.target.selectionStart;prefs.query=value;prefs.limit=12;paint();const input=host.querySelector('[data-ph-query]');input.focus();input.setSelectionRange(pos,pos);}});
    host.addEventListener('click',ev=>{const more=ev.target.closest('[data-ph-more]'),market=ev.target.closest('[data-ph-market]');if(more){prefs.limit+=12;paint();}if(market){prefs.market=market.dataset.phMarket;root.SportsHubDesk?.navigate?.(route(sport,'trends'));}});
    function paintAndHydrate(){ paint(); const all=cache?.rows||[]; hydrate(C.select(all,{...prefs,query:'',sport,versionFor}),paintAndHydrate); }
    paintAndHydrate();return host;
  }
  root.SportsHubPerformanceUI=Object.freeze({panel,chart,gameCard,flipsSection,flipRow});
})(globalThis);

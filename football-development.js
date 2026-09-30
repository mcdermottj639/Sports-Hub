(function (root) {
  'use strict';
  const C = root.SportsHubFootballResearch, KEY = 'sportshub:football-human:v1';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
  const key = r => `${r.event_id}:${r.snapshot.research.phase}`;
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
  function comparison(rows, reviews) {
    return ['early','near'].flatMap(stage => ['moneyline','spread','total'].map(market => {
      const group=rows.filter(r=>r.snapshot?.research?.phase===stage&&r.market===market);
      const paired=group.filter(r=>r.sport==='nfl'||r.snapshot.research.candidateAvailable);
      const human=group.filter(r=>reviews[key(r)] && reviews[key(r)].sourceCapturedAt===r.captured_at);
      const saved=reviews;
      return `<tr><td>${stage === 'near' ? 'Near kickoff' : 'Early'} · ${market}</td><td>${group.length}</td><td>${score(paired.map(r=>resultFor(r,r.snapshot.research.baseline)))}</td><td>${score(paired.map(r=>r.result))}</td><td>${score(human.map(r=>resultFor(r,saved[key(r)].baseline)))}</td><td>${score(human.map(r=>resultFor(r,saved[key(r)].human)))}</td><td>${score(human.map(r=>resultFor(r,saved[key(r)].combined)))}</td></tr>`;
    })).join('');
  }
  function confidence(rows) {
    return [[50,60],[60,70],[70,80],[80,101]].map(([lo,hi])=>{
      const group=rows.filter(r=>r.market==='moneyline'&&['win','loss'].includes(r.result)).filter(r=>{const b=r.snapshot.research.baseline,p=100*(b.home?b.probHome:1-b.probHome);return p>=lo&&p<hi;});
      const n=group.length, mean=n?group.reduce((s,r)=>{const b=r.snapshot.research.baseline;return s+100*(b.home?b.probHome:1-b.probHome);},0)/n:null;
      return `${lo}–${Math.min(hi-1,100)}%: ${n} observations${n?`, average ${mean.toFixed(1)}%, actual ${score(group.map(r=>resultFor(r,r.snapshot.research.baseline)))}`:''}`;
    }).join('<br>');
  }
  async function load(sport) {
    const cfg=root.SPORTS_HUB_SUPABASE;if(!cfg)throw new Error('Cloud configuration unavailable.');
    let all=[];
    for(let offset=0;;offset+=500){
      const query=`sport=eq.${sport}&model_version=in.(${C.VERSION}-early,${C.VERSION}-near)&select=*&order=captured_at.desc,id.desc&limit=500&offset=${offset}`;
      const res=await fetch(`${cfg.url}/rest/v1/ai_predictions?${query}`,{headers:{apikey:cfg.key},signal:AbortSignal.timeout(15000)});
      if(!res.ok)throw new Error('Research records could not load.');
      const page=await res.json();all=all.concat(page);if(page.length<500)return all;
    }
  }
  function render(host, rows, sport) {
    const reviews=read(), latest=new Map();
    for(const r of rows)if(r.market==='moneyline'&&!latest.has(r.event_id))latest.set(r.event_id,r);
    const games=[...latest.values()].filter(r=>C.phase(r.starts_at,new Date().toISOString())).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
    host.innerHTML=`<summary>Football development &amp; your review</summary><p>Football totals are research only. Early and near-kickoff forecasts are frozen separately; near kickoff means the first scheduled observation in the final 90 minutes. Missing windows stay missing. This study begins with v254; past results are not recreated.</p>
      <p>${sport==='cfb'?'College candidate: ESPN FPI difference plus the existing 3-point home term (zero at neutral sites). If either FPI rating is unavailable, only the baseline is saved; that game is excluded from the paired candidate comparison.':'NFL: the existing forecast plus timestamped quarterback evidence. No automatic quarterback point adjustment has been fitted, so study and baseline predictions currently match.'} No study probabilities or recommended stakes are assigned.</p>
      <div class="fd-scroll"><table><caption>Prospective results — baseline and study use the same games and lines</caption><thead><tr><th>Window / market</th><th>Saved</th><th>Baseline</th><th>Study</th><th>Baseline on reviewed games</th><th>Your forecast</th><th>50/50 blend</th></tr></thead><tbody>${comparison(rows,reviews)}</tbody></table></div>
      <p>Win–loss records exclude pushes and voids. Human results include only reviewed games and are not comparable to the full baseline sample. No ROI is inferred from missing prices. Small samples do not establish improvement.</p>
      <details><summary>Baseline winner-confidence check</summary><p>Early:<br>${confidence(rows.filter(r=>r.snapshot.research.phase==='early'))}</p><p>Near kickoff:<br>${confidence(rows.filter(r=>r.snapshot.research.phase==='near'))}</p><p>Only winner probabilities are evaluated here. Cover and total probabilities need their own validation.</p></details>
      <div class="fd-games"></div><p>Your reviews stay on this device. Export them before clearing browser data.</p><button type="button" data-fd-export>Export my reviews</button>`;
    const target=host.querySelector('.fd-games');
    if(!games.length)target.textContent='No upcoming saved study forecasts yet. The scheduled collector runs twice an hour.';
    for(const row of games){
      const r=row.snapshot.research,b=r.baseline,e=r.evidence,review=reviews[key(row)],box=document.createElement('details');box.className='fd-game';
      const qb=e?.qb ? Object.entries(e.qb).map(([side,q])=>`${side}: ${q.name||'Unknown QB'} — ${q.status} (source ${time(q.depthUpdatedAt)})`).join('; ') : '';
      box.innerHTML=`<summary>${escape(row.matchup)} · ${r.phase==='near'?'near kickoff':'early'}</summary><p>Starts ${escape(time(row.starts_at))}. Frozen ${escape(time(row.captured_at))}.</p><p>Home margin: baseline ${label(b.margin)}, study ${label(row.projection)}. Total ${label(b.total)}. Positive margin means the home team wins; negative means away.</p><p>${escape(qb||`FPI: home ${label(e?.fpi?.home)}, away ${label(e?.fpi?.away)}; updated ${time(e?.fpi?.updatedAt)}.`)}</p><p>Saved prices: ${rows.filter(x=>x.event_id===row.event_id&&x.snapshot.research.phase===r.phase).map(x=>`${escape(x.market)} ${escape(x.selection)} · ${x.price==null?'unpriced':escape(x.price)} · ${escape(x.provider||'provider unavailable')}`).join('; ')}. Odds observed ${escape(time(row.snapshot.oddsObservedAt))}.</p>
      ${review?`<p><b>Review saved ${escape(time(review.at))}</b><br>Your margin ${label(review.human.margin)}, total ${label(review.human.total)}. Blend margin ${label(review.combined.margin)}, total ${label(review.combined.total)}.<br>${escape(review.reason)}</p>`:`<form><label>Your home margin<input name="margin" type="number" min="-100" max="100" step="0.1" required></label><label>Your total<input name="total" type="number" min="0" max="150" step="0.1" required></label><fieldset><legend>What changed your view?</legend>${['QB','Line play','Schedule','Tempo','Coaching'].map(x=>`<label><input type="checkbox" name="factor" value="${x}">${x}</label>`).join('')}</fieldset><label>Your reasoning<textarea name="reason" minlength="8" required></textarea></label><p>The comparison uses your independent forecast and a fixed 50/50 blend with the baseline. One review per game/window, locked when saved.</p><button type="submit">Save pregame review</button><p role="status"></p></form>`}`;
      box.querySelector('form')?.addEventListener('submit',ev=>{
        ev.preventDefault();const form=ev.currentTarget,msg=form.querySelector('[role=status]');
        try{const current=read();if(current[key(row)])throw new Error('A review is already saved for this window.');
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
  root.SportsHubFootballDevelopment={mount,resultFor,score};
})(globalThis);

(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fixed=v=>v==null?'—':Number(v).toFixed(1),KEY='sportshub:nfl-evidence:v1';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch(_){return {};}};
  function teams(game={}){
    const parts=String(game.matchup||'').split(' @ ');
    const name=(v,fallback)=>typeof v==='string'?v:v?.name||v?.abbr||fallback;
    return {home:name(game.home,parts[1]||'Home team'),away:name(game.away,parts.length===2?parts[0]:'Away team')};
  }
  function margin(value,game,unit='pts'){
    if(value==null||!Number.isFinite(Number(value)))return 'Unavailable';
    const v=Number(value),t=teams(game);
    return v===0?'Even':`${esc(v>0?t.home:t.away)} by ${fixed(Math.abs(v))} ${esc(unit)}`;
  }
  function contribution(value,game){
    if(value==null||!Number.isFinite(Number(value)))return 'Unavailable';
    const v=Number(value),t=teams(game);
    return v===0?'0.0 pts · no team edge':`${fixed(Math.abs(v))} pts toward ${esc(v>0?t.home:t.away)}`;
  }
  // Saved snapshots already contain EPA/play; only fourth-down counts need
  // division. Keep exposure as a sample, never as evidence of better ability.
  function tendencies(co,game){
    const t=teams(game),number=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
    const cell=(value,sample,unit,digits=2)=>value==null?'—':`<b>${value.toFixed(digits)}${unit}</b><small>${esc(sample)}</small>`;
    const rows=[
      ['4th-down go rate',s=>{const a=number(s?.fourthDownAttempts),n=number(s?.fourthDownOpportunities);return a!=null&&a>=0&&n>0&&a<=n?cell(100*a/n,`${a}/${n} opportunities`,'%',1):'—';}],
      ['Late-close EPA / play',s=>{const n=number(s?.latePlays),v=number(s?.lateEPA);return n>0?cell(v,`${n} plays`,''):'—';}],
      ['Cold rush defense EPA / rush',s=>{const n=number(s?.coldDefensePlays),v=number(s?.coldRushEPAAllowed);return n>0?cell(v,`${n} rushes`,''):'—';}]
    ];
    return `<table class="nf-tendencies"><caption>Team tendencies · per opportunity</caption><thead><tr><th scope="col">Metric</th>${['home','away'].map(side=>{const s=co?.[side],n=number(s?.games);return `<th scope="col">${esc(t[side])}<small>${n>0?`${n} games`:'Sample unavailable'}</small></th>`;}).join('')}</tr></thead><tbody>${rows.map(([label,render])=>`<tr><th scope="row">${label}</th>${['home','away'].map(side=>`<td>${render(co?.[side])}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <p class="nf-tendencies-note">EPA = expected points added. Higher late-close EPA and lower defensive EPA are better; go rate measures aggressiveness. Samples show evidence volume, not an edge. Team history is not coach-specific. ${['home','away'].map(side=>{const s=co?.[side];return `${esc(t[side])} ${s?.currentConfirmed?'current':'last recorded'} coach: ${esc(s?.name||'unavailable')}`;}).join('; ')}. Clutch, coaching and cold-weather splits add zero extra points.</p>`;
  }
  function detail(e,game={}){
    const c=e?.candidate;if(!c?.version)return '';
    const t=teams(game);
    const uncertainty=String(c.mainUncertainty||'').replace(/\b(home|away):/g,(_,side)=>t[side]+':');
    const context=e.context||{},qb=c.qb||{},p=context.personnel,w=context.weather,co=context.coaching;
    const scenarios=(c.scenarios||[]).map(s=>`<tr><td>${esc(s.name)} starts</td><td>${margin(s.margin,game)}</td><td>${fixed(s.total)}</td></tr>`).join('');
    const range=(a)=>a?.length===2?`${fixed(a[0])} to ${fixed(a[1])}`:'unavailable';
    return `<section class="nf-detail"><strong>Football read</strong><ul class="nf-drivers">${(c.drivers||[]).slice(0,3).map(d=>`<li>${esc(d.label)} <b>${contribution(d.marginPoints,game)}</b></li>`).join('')}</ul><p class="nf-uncertainty">${esc(uncertainty)}</p>
      <details><summary>QB, personnel &amp; conditions</summary><div class="nf-factors">${['home','away'].map(side=>`<p><b>${esc(t[side])} QB · ${esc(qb[side]?.name||'Unavailable')}</b><br>${qb[side]?`EPA/dropback ${Number(qb[side].epa).toFixed(2)} · accuracy vs expectation ${fixed(qb[side].cpoe)}%<br><small>Sample: ${esc(qb[side].weightedDropbacks)} weighted dropbacks</small>`:'Insufficient verified player history'}</p>`).join('')}</div>
      <p><b>Personnel:</b> ${p?.missing?'Feed incomplete':p?.players?.length?p.players.map(x=>`${esc(x.name)} (${esc(x.position)}, ${esc(x.status)})`).join('; '):'No current restrictions found among the first two depth-chart players at each position.'}</p>
      <p><b>Weather:</b> ${w?.available?`${w.temperature==null?'Temperature unavailable':esc(w.temperature)+'°F'} · ${w.windMph==null?'wind unavailable':esc(w.windMph)+' mph wind'} · ${w.precipitationChance==null?'precipitation unavailable':esc(w.precipitationChance)+'% precipitation chance'}`:'Forecast unavailable'}. Weather has no fitted point adjustment.</p>
      ${tendencies(co,game)}
      ${scenarios?`<table><caption>Conditional QB scenarios · projected winner</caption><thead><tr><th>Scenario</th><th>Projected winner</th><th>Total</th></tr></thead><tbody><tr><td>Forecast QB assumption</td><td>${margin(c.conditional?.margin,game)}</td><td>${fixed(c.conditional?.total)}</td></tr>${scenarios}</tbody></table><p>No assumed playing probabilities. The main forecast uses the stated QB assumption; alternatives show how the matchup could change.</p>`:''}
      <p><b>80% historical outcome range:</b> margin for ${esc(t.home)} (${esc(t.home)} minus ${esc(t.away)}) ${range(c.uncertainty?.margin)}; total ${range(c.uncertainty?.total)}. Experimental residual ranges; personnel and weather uncertainty may not be fully captured.</p>
      <p>Fitted win probability ${c.probHome==null?'withheld':(100*c.probHome).toFixed(0)+'% for '+esc(t.home)}; not calibrated on prospective results yet. Source refreshed ${esc(c.source?.generatedAt)}. ${c.source?.used||0} historical games used; current-season coverage ${c.source?.coverage?.available??'—'}/${c.source?.coverage?.expected??'—'}. Contributions are relative to the training average, positive toward ${esc(t.home)} and negative toward ${esc(t.away)}. They explain model arithmetic, not causal effects.</p></details></section>`;
  }
  function validation(rows){
    const v=root.SportsHubNFLValidation?.evaluate(rows);if(!v)return '';
    const h=root.SportsHubNFLFootballConfig?.validation;
    return `<details class="nf-validation"><summary>Football engine validation</summary><p>The former challenger is the live NFL model, promoted by owner choice on October 3, 2026. Its statistical improvement gate has not passed. Each comparison game counts once using its latest saved pregame window; official results start separately with nfl-football-v1.</p><table><thead><tr><th>Market</th><th>Settled games</th><th>Comparison test</th></tr></thead><tbody>${Object.entries(v.markets).map(([k,m])=>`<tr><th>${esc(k)}</th><td>${m.n}</td><td>${esc(m.gate)}</td></tr>`).join('')}</tbody></table>
      ${h?`<p><b>2025 historical replay:</b> live-engine margin error ${fixed(h.margin.candidate.mae)} vs previous ${fixed(h.margin.baseline.mae)}; total error ${fixed(h.total.candidate.mae)} vs ${fixed(h.total.baseline.mae)}. Winner Brier score ${h.moneyline.candidate.brier.toFixed(3)} vs ${h.moneyline.baseline.brier.toFixed(3)} (lower is better). ${h.margin.candidate.n} games; ${h.moneyline.candidate.n} non-tied winner outcomes.</p><p>Fit: 2018–2023; selection: 2024; chronological holdout: 2025. Corrected historical sources and assumed prior-game starting QBs limit this replay. It does not establish betting profitability. The previous v239 model remains a comparison benchmark.</p>`:''}
      <p>Same-time market and fixed 50/50 market blend: ${v.markets.moneyline.marketProbabilityN} common-priced winner pairs. Brier ${v.markets.moneyline.marketBrier==null?'collecting':v.markets.moneyline.marketBrier.toFixed(3)} market / ${v.markets.moneyline.blendBrier==null?'collecting':v.markets.moneyline.blendBrier.toFixed(3)} blend. Closing-line value is not inferred from unarchived quotes.</p></details>`;
  }
  function mountEvidence(host,rows){
    if(!root.SportsHubNFLFootball)return;
    const games=new Map();for(const r of rows)if(Date.parse(r.starts_at)>Date.now()&&r.market==='moneyline'&&!games.has(r.event_id))games.set(r.event_id,r);
    const section=document.createElement('details');section.className='nf-scouting';host.appendChild(section);
    function render(){
      const saved=read();
      section.innerHTML=`<summary>Scouting notebook</summary><p>Save a dated observation and its source. Notes stay on this device, expire by kickoff, and have zero automatic prediction weight.</p>${games.size?`<form><label>Game<select name="game">${[...games.values()].map(r=>`<option value="${esc(r.event_id)}">${esc(r.matchup)}</option>`).join('')}</select></label><label>Factor<select name="category">${['QB','Line play','Personnel','Coaching','Weather','Clutch','Tempo'].map(s=>`<option>${s}</option>`).join('')}</select></label><label>Evidence type<select name="kind"><option value="opinion">Scouting opinion</option><option value="fact">Reported fact · needs verification</option></select></label><label>Source URL<input type="url" name="source" required placeholder="https://…"></label><label>Observation<textarea name="text" required minlength="8" maxlength="1200"></textarea></label><label>Expires <select name="expiry"><option value="kickoff">At kickoff</option><option value="6">In 6 hours, or kickoff if sooner</option><option value="24">In 24 hours, or kickoff if sooner</option></select></label><button type="submit">Save observation</button><p role="status"></p></form>`:'<p>No upcoming saved games to annotate.</p>'}
        <div>${Object.entries(saved).flatMap(([game,items])=>items.map(o=>`<article class="nf-observation"><b>${esc(o.matchup||game)} · ${esc(o.category)}</b><p>${esc(o.text)}</p><small>${esc(o.kind)} · ${Date.parse(o.expiresAt)>Date.now()?'active':'expired'} · ${esc(new Date(o.at).toLocaleString())}</small><a href="${esc(o.source)}" target="_blank" rel="noopener noreferrer">Source</a></article>`)).join('')}</div><button type="button" data-nf-export>Export notebook</button>`;
      section.querySelector('form')?.addEventListener('submit',event=>{
        event.preventDefault();const form=event.currentTarget,status=form.querySelector('[role=status]');
        try{const input=new FormData(form),g=games.get(input.get('game')),at=new Date().toISOString(),hours=Number(input.get('expiry'));
          const expiresAt=input.get('expiry')==='kickoff'?g.starts_at:new Date(Math.min(Date.parse(g.starts_at),Date.parse(at)+hours*3600000)).toISOString();
          const note=root.SportsHubNFLFootball.observation({text:input.get('text'),source:input.get('source'),kind:input.get('kind'),category:input.get('category'),expiresAt},at,g.starts_at);
          const current=read();(current[g.event_id]||=[]).push({...note,matchup:g.matchup});localStorage.setItem(KEY,JSON.stringify(current));render();section.open=true;
        }catch(error){status.textContent=error.message;}
      });
      section.querySelector('[data-nf-export]').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({schema:1,observations:read()},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='nfl-scouting-notebook.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    }render();
  }
  root.SportsHubNFLFootballUI={detail,validation,mountEvidence,teams,margin,contribution,tendencies};
})(globalThis);

/* Read-only pregame archive. Never creates picks or recalculates finished games. */
(function(root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => value == null ? 'Not saved' : Number(value).toFixed(1);
  const pregame = (r,g) => Date.parse(r.captured_at) < Date.parse(r.starts_at) && Date.parse(r.starts_at) === Date.parse(g.date);
  // v316: the official saved picks are ONE strip (the three market cards
  // above already carry the live read), with a flip note when the live read
  // has moved off a saved side. Inputs, research windows, previous models and
  // the raw archive sit behind one toggle.
  function liveSide(market,pred,info,g) {
    if (!pred) return null;
    if (market==='moneyline') return pred.probHome==null ? null : (pred.probHome>=.5 ? g.home : g.away);
    if (market==='spread') return Number.isFinite(pred.projMargin)&&Number.isFinite(Number(info?.spread)) ? (pred.projMargin+Number(info.spread)>0 ? g.home : g.away) : null;
    if (market==='total') return Number.isFinite(pred.projTotal)&&Number.isFinite(Number(info?.ou)) ? (pred.projTotal<Number(info.ou) ? 'UNDER' : pred.projTotal>Number(info.ou) ? 'OVER' : null) : null;
    return null;
  }
  function flipped(r,pred,info,g) {
    if (g.state === 'post') return '';   // nothing is 'now' after a final
    const live = liveSide(r.market,pred,info,g);
    if (live==null) return '';
    const sel = String(r.selection||'');
    if (r.market==='total') return sel.toUpperCase().startsWith(live) ? '' : `now reads ${live==='OVER'?'Over':'Under'} ${Number(info.ou)}`;
    const on = [live.name,live.abbr].filter(Boolean).some(t => sel.toLowerCase().startsWith(String(t).toLowerCase()));
    if (on) return '';
    const num = r.market==='spread' && Number.isFinite(Number(info?.spread)) ? ` ${live===g.home ? (Number(info.spread)>0?'+':'')+Number(info.spread) : (-Number(info.spread)>0?'+':'')+(-Number(info.spread))}` : '';
    return `now reads ${esc(live.abbr||live.name)}${num}`;
  }
  const when = iso => { const d=new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], {weekday:'short', hour:'numeric', minute:'2-digit'}); };
  const mkt = m => ({moneyline:'Winner',spread:'Spread',total:'Total'})[m] || m;
  function html(rows,g,pred,sport,info) {
    const saved = rows.filter(r => r.sport === sport && String(r.event_id) === String(g.id) && pregame(r,g));
    const current = root.SportsHubNFLLive?.versionFor(sport) || 'v239';
    const official = saved.filter(r => r.model_version === current);
    const study = saved.find(r => r.snapshot?.research?.evidence?.candidate);
    const evidence = pred?.football || official.find(r => r.snapshot?.features?.football)?.snapshot.features.football || study?.snapshot.research.evidence;
    const reason = evidence?.candidate?.reasons || [];
    const groups = new Map();
    for (const row of saved) {
      // Keep the latest research window per engine; earlier windows remain in raw archive.
      const key = row.model_version.replace(/-(early|near)$/, '');
      if (!groups.has(key)) groups.set(key, []);
      const group = groups.get(key);
      if (!group.some(r => r.market === row.market)) group.push(row);
    }
    const settled = r => r.result && !/^(pending|open)$/i.test(String(r.result));
    // The strip: one line per official market.
    const strip = official.length ? `<div class="gr-saved"><span class="gr-saved-k">Official saved pick${official.length===1?'':'s'}</span><span class="gr-saved-when">saved ${esc(when(official[0].captured_at))}</span>${official.map(r => {
      const flip = flipped(r,pred,info,g);
      return `<div class="gr-saved-row"><span class="gr-saved-m">${esc(mkt(r.market))}</span><b>${esc(r.selection)}${r.price==null?'':` (${Number(r.price)>0?'+':''}${esc(r.price)})`}</b>${settled(r)?`<span class="gr-saved-res ${/win/i.test(r.result)?'w':/loss|lose/i.test(r.result)?'l':''}">${esc(r.result)}</span>`:''}${flip?`<span class="gr-saved-flip">${esc(flip)} — the line moved since the save</span>`:''}</div>`;
    }).join('')}</div>` : '';
    const summary = [...groups.entries()].filter(([version]) => version !== current).map(([version,group]) => {
      const research = !!group[0].snapshot?.research;
      const label = research ? 'Saved research · ' + version : 'Previous model · ' + version;
      return `<details><summary>${esc(label)}</summary><p>Captured ${esc(new Date(group[0].captured_at).toLocaleString())} · excluded from the current model record.</p>${group.map(r => {
        const withheld = r.snapshot?.research?.candidateAvailable === false;
        return `<div class="saved-report-market"><b>${esc(r.market)} · ${withheld ? 'Withheld' : esc(r.selection)}</b><span>${withheld ? 'No official pick' : esc(r.result)}</span><p>${r.model_probability == null ? '' : `Model probability ${num(r.model_probability*100)}% · `}Saved odds ${r.price == null ? 'not available' : esc(r.price)}${r.line == null ? '' : ' · line '+esc(r.line)}${r.projection == null ? '' : ' · projection '+(r.market==='spread'&&root.SportsHubNFLFootballUI?root.SportsHubNFLFootballUI.margin(r.projection,g):num(r.projection))}</p></div>`;
      }).join('')}</details>`;
    }).join('');
    const officialDetail = official.length ? `<details><summary>Official saved picks · detail</summary><p>Captured ${esc(new Date(official[0].captured_at).toLocaleString())}.</p>${official.map(r => `<div class="saved-report-market"><b>${esc(r.market)} · ${esc(r.selection)}</b><span>${esc(r.result)}</span><p>${r.model_probability == null ? '' : `Model probability ${num(r.model_probability*100)}% · `}Saved odds ${r.price == null ? 'not available' : esc(r.price)}${r.line == null ? '' : ' · line '+esc(r.line)}${r.projection == null ? '' : ' · projection '+(r.market==='spread'&&root.SportsHubNFLFootballUI?root.SportsHubNFLFootballUI.margin(r.projection,g):num(r.projection))}</p></div>`).join('')}</details>` : '';
    const inputs = pred?.features || official[0]?.snapshot?.features;
    const withheldNote = reason.length && !pred && !official.length ? `<p>${reason.map(esc).join(' · ')}. The model did not issue an official pick; conditional scenarios remain available below.</p>` : '';
    const evidenceHTML = !pred && evidence ? root.SportsHubNFLFootballUI?.detail(evidence,g) || '' : '';
    const none = !saved.length ? (sport==='nba'?`<p class="ai-why">${g.state==='pre'&&Date.parse(g.date)>Date.now()?'No cloud snapshot has been saved yet. Automatic NBA capture covers today and tomorrow.':'No cloud snapshot was captured before tipoff.'}</p>`:'<p class="ai-why">No cloud snapshot was captured before kickoff.</p>') : '';
    const projLine = pred ? `<p>Projection shown above: ${root.SportsHubNFLFootballUI?.margin(pred.projMargin,g,sport==='mlb'?'runs':'pts')||`home margin ${num(pred.projMargin)}`} · total ${num(pred.projTotal)}.</p>` : '';
    const archive = (pred || inputs || summary || officialDetail || saved.length) ? `<details class="md-fold saved-archive"><summary>Saved pregame archive${saved.length ? ` · ${saved.length} snapshot${saved.length===1?'':'s'}` : ''}</summary>${projLine}${officialDetail}${inputs ? `<details><summary>Saved model inputs</summary><pre>${esc(JSON.stringify(inputs,null,2))}</pre></details>` : ''}${summary}${saved.length ? `<details><summary>All saved report data</summary><p>Original prices, projections, model inputs, context and capture timestamps. Missing fields were not saved; nothing is reconstructed using the final result.</p><pre>${esc(JSON.stringify(saved,null,2))}</pre></details>` : ''}</details>` : '';
    const status = !official.length && !pred && reason.length ? '<h3>Pregame forecast withheld</h3>' : '';
    return `<section class="saved-game-report">${status}${withheldNote}${strip}${evidenceHTML}${none}${archive}</section>`;
  }
  async function mount(host,sport,g,pred,info) {
    if (!host || !g) return;
    host.innerHTML = '<p class="ai-note">Loading saved pregame report…</p>';
    try {
      const rows = await root.SportsHubCloudAI.eventRows(sport,g.id);
      if (host.isConnected) host.innerHTML = html(rows,g,pred,sport,info);
    } catch (_) {
      if (host.isConnected) host.innerHTML = '<p class="ai-note">Saved report could not be loaded. Reopen this game to retry; its cloud history has not been deleted.</p>';
    }
  }
  root.SportsHubSavedGameReport = {html,mount};
  if (typeof module !== 'undefined') module.exports = {html,mount};
})(globalThis);

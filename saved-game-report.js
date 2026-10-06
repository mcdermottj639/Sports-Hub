/* Read-only pregame archive. Never creates picks or recalculates finished games. */
(function(root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => value == null ? 'Not saved' : Number(value).toFixed(1);
  const pregame = (r,g) => Date.parse(r.captured_at) < Date.parse(r.starts_at) && Date.parse(r.starts_at) === Date.parse(g.date);
  function html(rows,g,pred,sport) {
    const saved = rows.filter(r => r.sport === sport && String(r.event_id) === String(g.id) && pregame(r,g));
    const current = root.SportsHubNFLLive?.versionFor(sport) || 'v239';
    const official = saved.filter(r => r.model_version === current);
    const study = saved.find(r => r.snapshot?.research?.evidence?.candidate);
    const evidence = pred?.football || official.find(r => r.snapshot?.features?.football)?.snapshot.features.football || study?.snapshot.research.evidence;
    const reason = evidence?.candidate?.reasons || [];
    const status = pred || official.length ? 'Saved pregame model report' : reason.length ? 'Pregame forecast withheld' : 'Saved pregame archive';
    const groups = new Map();
    for (const row of saved) {
      // Keep the latest research window per engine; earlier windows remain in raw archive.
      const key = row.model_version.replace(/-(early|near)$/, '');
      if (!groups.has(key)) groups.set(key, []);
      const group = groups.get(key);
      if (!group.some(r => r.market === row.market)) group.push(row);
    }
    const summary = [...groups.entries()].map(([version,group]) => {
      const active = version === current, research = !!group[0].snapshot?.research;
      const label = active ? 'Official saved picks' : research ? 'Saved research · ' + version : 'Previous model · ' + version;
      return `<details${active ? ' open' : ''}><summary>${esc(label)}</summary><p>Captured ${esc(new Date(group[0].captured_at).toLocaleString())}${active ? '' : ' · excluded from the current model record'}.</p>${group.map(r => {
        const withheld = r.snapshot?.research?.candidateAvailable === false;
        return `<div class="saved-report-market"><b>${esc(r.market)} · ${withheld ? 'Withheld' : esc(r.selection)}</b><span>${withheld ? 'No official pick' : esc(r.result)}</span><p>${r.model_probability == null ? '' : `Model probability ${num(r.model_probability*100)}% · `}Saved odds ${r.price == null ? 'not available' : esc(r.price)}${r.line == null ? '' : ' · line '+esc(r.line)}${r.projection == null ? '' : ' · projection '+num(r.projection)}</p></div>`;
      }).join('')}</details>`;
    }).join('');
    const inputs = pred?.features || official[0]?.snapshot?.features;
    return `<section class="saved-game-report"><h3>${status}</h3>${reason.length && !pred && !official.length ? `<p>${reason.map(esc).join(' · ')}. The model did not issue an official pick; conditional scenarios remain available below.</p>` : ''}${!pred && evidence ? root.SportsHubNFLFootballUI?.detail(evidence) || '' : ''}${pred ? `<p>Saved projections: home margin ${num(pred.projMargin)} · total ${num(pred.projTotal)}.</p>` : ''}${inputs ? `<details><summary>Saved model inputs</summary><pre>${esc(JSON.stringify(inputs,null,2))}</pre></details>` : ''}${summary}${saved.length ? `<details><summary>All saved report data · ${saved.length} market snapshots</summary><p>Original prices, projections, model inputs, context and capture timestamps. Missing fields were not saved; nothing is reconstructed using the final result.</p><pre>${esc(JSON.stringify(saved,null,2))}</pre></details>` : '<p>No cloud snapshot was captured before kickoff. Any available device snapshot is shown above.</p>'}</section>`;
  }
  async function mount(host,sport,g,pred) {
    if (!host || !g) return;
    host.innerHTML = '<p class="ai-note">Loading saved pregame report…</p>';
    try {
      const rows = await root.SportsHubCloudAI.eventRows(sport,g.id);
      if (host.isConnected) host.innerHTML = html(rows,g,pred,sport);
    } catch (_) {
      if (host.isConnected) host.innerHTML = '<p class="ai-note">Saved report could not be loaded. Reopen this game to retry; its cloud history has not been deleted.</p>';
    }
  }
  root.SportsHubSavedGameReport = {html,mount};
  if (typeof module !== 'undefined') module.exports = {html,mount};
})(globalThis);

// Top ticker (v326): one rolling strip fixed to the top of every screen,
// carrying today's scores, the model's saved pregame picks, recently graded
// results, collector/record updates and league headlines.
//
// Sources, all existing and read-only:
//   - scores: the slate renderLiveRail refreshes every 30s (since v334 a
//     data-only refresh — the visible rail is gone) via SportsHubTicker.setScores,
//     so the ticker never makes its own ESPN scoreboard calls;
//   - v334: a filter panel (header "Ticker" button) hides leagues, sections,
//     or non-live scores; saved in localStorage sportshub:ticker:filter:v1;
//   - picks / results / updates: the public Supabase record (RLS read-only),
//     two small windowed queries every 5 minutes, current model versions only;
//   - news: ESPN league news via app.js fetchJSON (shares the Home headline cache).
// Pure item builders are exported for tests (tests/ticker.test.js).
(function ticker(root) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const HR = 3600000;
  const SPEED = 55;            // px per second
  const SCORE_CAP = 40, PICK_CAP = 14, RESULT_CAP = 12, NEWS_CAP = 10;
  const CLOUD_MS = 5 * 60000, NEWS_MS = 10 * 60000;
  const SPORT_LABEL = { nfl: 'NFL', cfb: 'CFB', mlb: 'MLB', nba: 'NBA' };
  const MARKET_LABEL = { moneyline: 'ML', spread: 'ATS', total: 'TOT' };

  // Official cohort per sport — the same rule nfl-live.js versionFor applies.
  function currentVersion(sport) {
    const nfl = root.SportsHubNFLLive?.VERSION || 'nfl-football-v1';
    return sport === 'nfl' ? nfl : sport === 'nba' ? 'nba-v1' : 'v239';
  }
  const isCurrent = (r) => r && r.model_version === currentVersion(r.sport);

  function pickText(r) {
    const mk = MARKET_LABEL[r.market] || r.market;
    const price = Number.isFinite(Number(r.price)) && r.price != null
      ? ` (${Number(r.price) > 0 ? '+' : ''}${Number(r.price)})` : '';
    const conf = r.market === 'moneyline' && r.confidence != null ? ` · ${Math.round(Number(r.confidence))}%` : '';
    return `${r.selection} ${mk}${price}${conf}`;
  }

  // Saved pregame picks for games starting in the next 30h (or just started),
  // tiered picks first, then by start time.
  function buildPickItems(rows, now = Date.now()) {
    const tierRank = { alert: 0, best: 1, edge: 2, lean: 3 };
    return (rows || [])
      .filter((r) => isCurrent(r) && r.result === 'pending')
      .filter((r) => { const t = Date.parse(r.starts_at); return t > now - 4 * HR && t < now + 30 * HR; })
      .sort((a, b) => (tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9)
        || Date.parse(a.starts_at) - Date.parse(b.starts_at) || String(a.event_id).localeCompare(String(b.event_id)))
      .slice(0, PICK_CAP)
      .map((r) => ({
        k: `p:${r.sport}:${r.event_id}:${r.market}`, kind: 'pick', sport: r.sport, id: r.event_id,
        html: `<span class="tk-lg">${esc(SPORT_LABEL[r.sport] || r.sport)}</span>`
          + `<span class="tk-mu">${esc(r.matchup)}</span> <b>${esc(pickText(r))}</b>`
          + (r.tier ? ` <span class="tk-tier tk-t-${esc(r.tier)}">${esc(r.tier === 'best' ? 'LARGEST GAP' : r.tier === 'alert' ? 'RED ALERT' : r.tier.toUpperCase())}</span>` : ''),
      }));
  }

  // Picks graded in the last 24h, newest first.
  function buildResultItems(rows, now = Date.now()) {
    return (rows || [])
      .filter((r) => isCurrent(r) && ['win', 'loss', 'push'].includes(r.result))
      .filter((r) => { const t = Date.parse(r.graded_at); return t > now - 24 * HR && t <= now + 60000; })
      .sort((a, b) => Date.parse(b.graded_at) - Date.parse(a.graded_at) || String(a.event_id).localeCompare(String(b.event_id)))
      .slice(0, RESULT_CAP)
      .map((r) => {
        const mark = r.result === 'win' ? '✓ HIT' : r.result === 'loss' ? '✗ MISS' : '= PUSH';
        return {
          k: `r:${r.sport}:${r.event_id}:${r.market}`, kind: 'result', sport: r.sport, id: r.event_id,
          html: `<span class="tk-res tk-${esc(r.result)}">${mark}</span><span class="tk-lg">${esc(SPORT_LABEL[r.sport] || r.sport)}</span>`
            + `<span class="tk-mu">${esc(r.matchup)}</span> ${esc(pickText(r))}`,
        };
      });
  }

  // W-L-P over every current-version pick graded in the last 24h (not capped).
  function recordSummary(rows, now = Date.now()) {
    const s = { win: 0, loss: 0, push: 0 };
    (rows || []).forEach((r) => {
      const t = Date.parse(r.graded_at);
      if (isCurrent(r) && s[r.result] != null && t > now - 24 * HR && t <= now + 60000) s[r.result] += 1;
    });
    return s;
  }

  function runAgo(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
  }
  function buildUpdateItems(rows, run, now = Date.now()) {
    const out = [];
    const s = recordSummary(rows, now);
    if (s.win + s.loss + s.push) {
      out.push({ k: 'u:record', kind: 'update',
        html: `<span class="tk-upd">MODEL</span> Last 24h: <b>${s.win}-${s.loss}${s.push ? `-${s.push}` : ''}</b> on graded picks` });
    }
    if (run?.started_at) {
      const at = Date.parse(run.finished_at || run.started_at);
      const st = run.status === 'ok' ? 'ok' : run.status === 'running' ? 'running' : run.status || 'unknown';
      const bits = [];
      if (Number(run.captured)) bits.push(`${run.captured} saved`);
      if (Number(run.graded)) bits.push(`${run.graded} graded`);
      out.push({ k: 'u:run', kind: 'update',
        html: `<span class="tk-upd">COLLECTOR</span> Last run ${esc(runAgo(now - at))} · <span class="tk-run tk-run-${esc(st)}">${esc(st)}</span>${bits.length ? ` · ${esc(bits.join(', '))}` : ''}` });
    }
    return out;
  }

  function buildNewsItems(perSport) {
    const all = [], seen = new Set();
    (perSport || []).forEach(({ sport, articles }) => {
      (articles || []).filter((a) => a && a.type !== 'Media' && a.headline).slice(0, 6)
        .forEach((a) => all.push({ sport, a }));
    });
    all.sort((x, y) => (Date.parse(y.a.published) || 0) - (Date.parse(x.a.published) || 0));
    const out = [];
    for (const { sport, a } of all) {
      const key = a.headline.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ k: `n:${key.slice(0, 60)}`, kind: 'news', sport, href: a.links?.web?.href || null,
        html: `<span class="tk-lg">${esc(SPORT_LABEL[sport] || sport)}</span>${esc(a.headline)}` });
      if (out.length >= NEWS_CAP) break;
    }
    return out;
  }

  // One score item from a normalized ESPN game (app.js normEvent shape).
  function buildScoreItem(sport, g, h = {}) {
    const state = h.gameState ? h.gameState(g) : (g.state === 'in' ? 'live' : g.state === 'post' ? 'final' : 'scheduled');
    const ab = (t) => t?.abbr || t?.name || 'TBD';
    const hs = Number(g.home?.score), as = Number(g.away?.score);
    const hasScore = state !== 'scheduled' && Number.isFinite(hs) && Number.isFinite(as);
    const lead = (mine, other) => hasScore && mine > other ? ' class="tk-lead"' : '';
    const fav = h.isFav ? h.isFav(sport, g) : false;
    let status;
    if (state === 'live') status = `<span class="tk-live"><i></i>${esc(g.statusText || 'LIVE')}</span>`;
    else if (state === 'final') status = '<span class="tk-final">FINAL</span>';
    else status = `<span class="tk-when">${esc(h.when ? h.when(g) : (g.statusText || ''))}</span>`;
    const teams = hasScore
      ? `<span${lead(as, hs)}>${esc(ab(g.away))} ${as}</span> <span${lead(hs, as)}>${esc(ab(g.home))} ${hs}</span>`
      : `${esc(ab(g.away))} @ ${esc(ab(g.home))}`;
    return {
      k: `s:${sport}:${g.id}`, kind: 'score', sport, id: g.id, g, state, fav,
      html: `<span class="tk-lg">${esc(SPORT_LABEL[sport] || sport)}</span>${teams} ${status}`,
    };
  }
  function buildScoreItems(list, h = {}) {
    const rank = { live: 0, scheduled: 1, final: 2 };
    return (list || []).filter((x) => x?.g?.id).map(({ sport, g }) => buildScoreItem(sport, g, h))
      .sort((a, b) => rank[a.state] - rank[b.state] || (b.fav ? 1 : 0) - (a.fav ? 1 : 0)
        || (Date.parse(a.g.date) || 0) - (Date.parse(b.g.date) || 0))
      .slice(0, SCORE_CAP);
  }

  // Sections in reading order. Empty sections are omitted; a ticker with
  // nothing at all says so instead of disappearing.
  function compose(sections) {
    const out = [];
    for (const [label, cls, items] of sections) {
      if (!items?.length) continue;
      out.push({ k: `h:${label}`, kind: 'head', html: `<span class="tk-sec ${cls}">${esc(label)}</span>` });
      out.push(...items);
    }
    return out;
  }

  // v334 — ticker filter (Jack: "still give me filter options for the ticker").
  // { off: [sports hidden], hide: [sections hidden], liveOnly: scores live only }.
  // Section keys: scores, picks, results, updates, news. Updates carry no sport,
  // so the league filter never hides them; news, picks, results and scores do.
  const SECTIONS = [['scores', 'SCORES', 'tk-sec-scores'], ['picks', 'MODEL PICKS', 'tk-sec-picks'],
    ['results', 'RESULTS', 'tk-sec-results'], ['updates', 'UPDATES', 'tk-sec-upd'], ['news', 'NEWS', 'tk-sec-news']];
  const FILTER_KEY = 'sportshub:ticker:filter:v1';
  function normFilter(f) {
    const okS = new Set(Object.keys(SPORT_LABEL)), okK = new Set(SECTIONS.map((x) => x[0]));
    const arr = (v, ok) => (Array.isArray(v) ? [...new Set(v.filter((x) => ok.has(x)))] : []);
    return { off: arr(f?.off, okS), hide: arr(f?.hide, okK), liveOnly: f?.liveOnly === true };
  }
  function applyFilter(byKey, f) {
    const flt = normFilter(f), off = new Set(flt.off), hide = new Set(flt.hide);
    return SECTIONS.filter(([key]) => !hide.has(key)).map(([key, label, cls]) => [label, cls,
      (byKey[key] || []).filter((it) => !(it.sport && off.has(it.sport)) && !(key === 'scores' && flt.liveOnly && it.state !== 'live'))]);
  }
  function filterCount(f) { const x = normFilter(f); return x.off.length + x.hide.length + (x.liveOnly ? 1 : 0); }

  // ----------------------------- DOM layer ---------------------------------
  const state = { scores: [], picks: [], results: [], updates: [], news: [], cloudRows: [], run: null };
  let deps = {}, bar = null, track = null, pending = null, keysNow = '', itemsNow = [];
  let resumeTimer = null, cloudTimer = null, newsTimer = null, warmUntil = 0;
  const reduced = () => !!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function itemHTML(it) {
    const tag = it.kind === 'news' && it.href ? 'a' : 'span';
    const attrs = tag === 'a' ? ` href="${esc(it.href)}" target="_blank" rel="noopener"` : '';
    return `<${tag} class="tk-it tk-${it.kind}${it.state ? ` tk-s-${it.state}` : ''}" data-k="${esc(it.k)}"${attrs}>${it.html}</${tag}>`;
  }
  function currentItems() {
    const items = compose(applyFilter(state, filter));
    if (items.length) return items;
    const anything = SECTIONS.some(([key]) => state[key]?.length);
    return [{ k: 'empty', kind: 'update', html: anything && filterCount(filter)
      ? 'Nothing matches your ticker filters — tap Ticker at the top to change them.'
      : 'Loading scores, picks and headlines…' }];
  }
  function build(items) {
    itemsNow = items;
    keysNow = items.map((i) => i.k).join('|');
    const one = items.map(itemHTML).join('');
    track.innerHTML = `<div class="tk-half">${one}</div>` + (reduced() ? '' : `<div class="tk-half" aria-hidden="true">${one}</div>`);
    requestAnimationFrame(() => {
      const w = track.firstElementChild?.scrollWidth || 0;
      const fits = w <= bar.clientWidth;
      bar.classList.toggle('tk-static', reduced() || fits);
      if (fits && track.children[1]) track.children[1].remove();
      track.style.setProperty('--tk-dur', `${Math.max(20, w / SPEED).toFixed(1)}s`);
    });
  }
  function paint() {
    if (!track) return;
    const items = currentItems();
    const keys = items.map((i) => i.k).join('|');
    if (keys === keysNow) {
      // Same items in the same order: update text in place so the scroll
      // position never jumps on the 30s score refresh.
      items.forEach((it, i) => {
        if (itemsNow[i]?.html === it.html && itemsNow[i]?.state === it.state) return;
        track.querySelectorAll(`[data-k="${CSS.escape(it.k)}"]`).forEach((n) => {
          n.innerHTML = it.html;
          n.className = `tk-it tk-${it.kind}${it.state ? ` tk-s-${it.state}` : ''}`;
        });
      });
      itemsNow = items;
      return;
    }
    // A changed item set rebuilds at the end of the current loop, so the
    // strip doesn't snap back mid-read. Static/first paints rebuild now.
    // During the first seconds after launch sources land one by one, so rebuild
    // straight away rather than waiting a full loop for the first complete strip.
    if (!keysNow || keysNow === 'empty' || Date.now() < warmUntil || bar.classList.contains('tk-static')) build(items);
    else pending = items;
  }

  function onClick(e) {
    const n = e.target.closest('.tk-it');
    if (!n) return;
    const it = itemsNow.find((i) => i.k === n.dataset.k);
    if (!it || it.kind === 'news') return;   // news anchors open natively
    if ((it.kind === 'score' || it.kind === 'pick' || it.kind === 'result') && it.id && deps.openGameDetail) {
      e.preventDefault();
      deps.openGameDetail(it.sport, String(it.id), it.g);
    }
  }
  function hold() {
    bar.classList.add('tk-hold');
    clearTimeout(resumeTimer);
  }
  function release() {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => bar.classList.remove('tk-hold'), 2500);
  }

  async function loadCloud() {
    const cfg = root.SPORTS_HUB_SUPABASE;
    if (!cfg?.url || !cfg?.key || document.hidden) return;
    const now = Date.now();
    const iso = (t) => new Date(t).toISOString();
    const cols = 'sport,market,model_version,event_id,matchup,selection,line,price,tier,confidence,result,starts_at,graded_at';
    const versions = `in.(v239,${currentVersion('nfl')},nba-v1)`;
    const req = (path) => fetch(`${cfg.url}/rest/v1/${path}`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }, cache: 'no-store',
    }).then((r) => { if (!r.ok) throw new Error(`ticker ${r.status}`); return r.json(); });
    const [pend, graded, runs] = await Promise.allSettled([
      req(`ai_predictions?select=${cols}&model_version=${versions}&result=eq.pending&starts_at=gt.${iso(now - 4 * HR)}&starts_at=lt.${iso(now + 30 * HR)}&order=starts_at.asc&limit=400`),
      req(`ai_predictions?select=${cols}&model_version=${versions}&graded_at=gt.${iso(now - 24 * HR)}&order=graded_at.desc&limit=400`),
      req('ai_job_runs?select=status,started_at,finished_at,captured,graded&order=started_at.desc&limit=1'),
    ]);
    if (pend.status === 'fulfilled') state.picks = buildPickItems(pend.value, now);
    if (graded.status === 'fulfilled') {
      state.cloudRows = graded.value;
      state.results = buildResultItems(graded.value, now);
    }
    if (runs.status === 'fulfilled') state.run = runs.value[0] || null;
    state.updates = buildUpdateItems(state.cloudRows, state.run, now);
    paint();
  }
  async function loadNews() {
    if (!deps.fetchJSON || !deps.sports || document.hidden) return;
    const sports = deps.sports().slice(0, 4);
    const res = await Promise.allSettled(sports.map((s) => deps.fetchJSON(`${deps.SITE}/${deps.LEAGUES[s].espnPath}/news`, NEWS_MS)));
    const per = res.map((r, i) => ({ sport: sports[i], articles: r.status === 'fulfilled' ? r.value?.articles : [] }));
    const items = buildNewsItems(per);
    if (items.length || !state.news.length) state.news = items;
    paint();
  }

  // ---- filter panel (header "Ticker" button) ----
  let filter = normFilter({}), panel = null, btn = null;
  function readFilter() {
    try {
      const raw = root.localStorage?.getItem(FILTER_KEY);
      if (raw) return normFilter(JSON.parse(raw));
      // First run after v334: carry over leagues hidden in the old score rail.
      const old = JSON.parse(root.localStorage?.getItem('sportshub:railoff') || '[]');
      return normFilter({ off: old });
    } catch (_) { return normFilter({}); }
  }
  function saveFilter() { try { root.localStorage?.setItem(FILTER_KEY, JSON.stringify(filter)); } catch (_) {} }
  function paintButton() {
    if (!btn) return;
    const n = filterCount(filter);
    btn.textContent = n ? `Ticker \u00b7 ${n}` : 'Ticker';
    btn.setAttribute('aria-expanded', String(!!panel && !panel.hidden));
    btn.title = n ? `${n} ticker filter${n === 1 ? '' : 's'} on` : 'Choose what the ticker shows';
  }
  function panelHTML() {
    const pill = (attr, val, label, on) => `<button type="button" class="tkf-pill${on ? ' on' : ''}" ${attr}="${val}" aria-pressed="${on}">${esc(label)}</button>`;
    return `<div class="tkf-head"><b>Ticker</b><button type="button" class="tkf-x" data-tkf-close aria-label="Close ticker filters">\u2715</button></div>
      <div class="tkf-lbl">Leagues</div><div class="tkf-row">${Object.entries(SPORT_LABEL).map(([k, l]) => pill('data-tkf-sport', k, l, !filter.off.includes(k))).join('')}</div>
      <div class="tkf-lbl">Show</div><div class="tkf-row">${SECTIONS.map(([k]) => pill('data-tkf-kind', k, ({ scores: 'Scores', picks: 'Model picks', results: 'Results', updates: 'Updates', news: 'News' })[k], !filter.hide.includes(k))).join('')}</div>
      <div class="tkf-row">${pill('data-tkf-live', '1', 'Live scores only', filter.liveOnly)}</div>
      ${filterCount(filter) ? '<button type="button" class="tkf-reset" data-tkf-reset>Show everything</button>' : ''}`;
  }
  function placePanel() {
    if (!panel || !btn) return;
    const r = btn.getBoundingClientRect();
    panel.style.top = `${Math.round(r.bottom + 8)}px`;
  }
  function openPanel(open) {
    if (!panel) return;
    panel.hidden = !open;
    if (open) { panel.innerHTML = panelHTML(); placePanel(); panel.querySelector('button')?.focus({ preventScroll: true }); }
    paintButton();
  }
  function onPanelClick(e) {
    // The panel re-renders on every toggle, which detaches e.target; stop here
    // so the document "click outside" handler never mistakes that for outside.
    e.stopPropagation();
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-tkf-close')) { openPanel(false); btn?.focus(); return; }
    if (t.hasAttribute('data-tkf-reset')) filter = normFilter({});
    else if (t.dataset.tkfSport) { const s = new Set(filter.off); s.has(t.dataset.tkfSport) ? s.delete(t.dataset.tkfSport) : s.add(t.dataset.tkfSport); filter = normFilter({ ...filter, off: [...s] }); }
    else if (t.dataset.tkfKind) { const s = new Set(filter.hide); s.has(t.dataset.tkfKind) ? s.delete(t.dataset.tkfKind) : s.add(t.dataset.tkfKind); filter = normFilter({ ...filter, hide: [...s] }); }
    else if (t.dataset.tkfLive) filter = normFilter({ ...filter, liveOnly: !filter.liveOnly });
    else return;
    saveFilter();
    const focusSel = t.dataset.tkfSport ? `[data-tkf-sport="${t.dataset.tkfSport}"]` : t.dataset.tkfKind ? `[data-tkf-kind="${t.dataset.tkfKind}"]` : t.dataset.tkfLive ? '[data-tkf-live]' : '[data-tkf-close]';
    panel.innerHTML = panelHTML();
    panel.querySelector(focusSel)?.focus({ preventScroll: true });
    paintButton();
    pending = null; build(currentItems());   // filters apply immediately, not at the end of the loop
  }
  function initFilter() {
    filter = readFilter();
    btn = document.getElementById('ticker-filter');
    if (!btn) return;
    panel = document.createElement('div');
    panel.id = 'tk-filter'; panel.className = 'tk-filter'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Ticker filters');
    document.body.appendChild(panel);
    panel.addEventListener('click', onPanelClick);
    btn.addEventListener('click', (e) => { e.stopPropagation(); openPanel(panel.hidden); });
    document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) openPanel(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { openPanel(false); btn.focus(); } });
    root.addEventListener('resize', placePanel);
    paintButton();
  }

  function setScores(list) {
    state.scores = buildScoreItems(list, deps);
    paint();
  }

  function init(d = {}) {
    deps = d;
    warmUntil = Date.now() + 20000;
    bar = document.getElementById('ticker');
    track = bar?.querySelector('.tk-track');
    if (!bar || !track) return;
    initFilter();
    track.addEventListener('animationiteration', () => { if (pending) { const p = pending; pending = null; build(p); } });
    bar.addEventListener('click', onClick);
    bar.addEventListener('pointerdown', hold);
    bar.addEventListener('pointerup', release);
    bar.addEventListener('pointercancel', release);
    bar.addEventListener('mouseenter', hold);
    bar.addEventListener('mouseleave', release);
    paint();
    const cloud = () => loadCloud().catch(() => {});
    const news = () => loadNews().catch(() => {});
    cloud(); news();
    cloudTimer = setInterval(cloud, CLOUD_MS);
    newsTimer = setInterval(news, NEWS_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { cloud(); news(); } });
    // A loop longer than a few minutes would hold a pending rebuild too long.
    setInterval(() => { if (pending && bar.classList.contains('tk-hold') === false) { const p = pending; pending = null; build(p); } }, 4 * 60000);
  }

  root.SportsHubTicker = Object.freeze({
    init, setScores,
    _pure: { applyFilter, normFilter, filterCount, buildPickItems, buildResultItems, recordSummary, buildUpdateItems, buildNewsItems, buildScoreItem, buildScoreItems, compose, currentVersion },
  });
})(globalThis);

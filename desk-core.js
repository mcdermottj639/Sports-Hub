// Personal desk utilities. No forecasts, bets, or collection writes happen here.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SportsHubDeskCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SPORTS = ['nfl', 'cfb', 'mlb', 'nba'];
  const PANELS = ['home', 'predictions', 'research', 'fantasy', 'watchlist', 'explore', 'leagues', 'eagles', 'redsox', 'nfl', 'cfb', 'nba', 'pickem', 'pulse', 'labs', 'about'];
  const aliases = { today: 'home', models: 'predictions', more: 'explore', news: 'pulse', tools: 'labs' };
  const names = { home: 'today', predictions: 'models', explore: 'more', pulse: 'news', labs: 'tools' };
  const subs = { picks: 'board', results: 'record', calibration: 'backtest', method: 'model', trends: 'trends', recent: 'recent' };
  const subNames = { board: 'picks', record: 'results', backtest: 'calibration', model: 'method', trends: 'trends', recent: 'recent' };
  const FANTASY_SECTIONS = ['matchup', 'gm', 'lineup', 'roster', 'season', 'waivers'];
  function route(hash) {
    if (String(hash).startsWith('#pk=')) return null;
    const parts = String(hash || '').replace(/^#\/?/, '').split('/');
    const panel = aliases[parts[0]] || parts[0] || 'home';
    if (!PANELS.includes(panel)) return null;
    if (panel === 'predictions') return { panel, aiSport: SPORTS.includes(parts[1]) ? parts[1] : 'all', aiSub: subs[parts[2]] || 'board' };
    if (panel === 'fantasy' && FANTASY_SECTIONS.includes(parts[1])) return { panel, section: parts[1] };
    if (['nfl', 'cfb'].includes(panel)) return { panel, sportView: parts[1] === 'research' ? 'research' : 'games' };
    return { panel };
  }
  function hashFor(r) {
    const path = names[r.panel] || r.panel;
    if (r.panel === 'predictions') return `#/models/${SPORTS.includes(r.aiSport) ? r.aiSport : 'all'}/${subNames[r.aiSub] || 'picks'}`;
    if (r.panel === 'fantasy' && FANTASY_SECTIONS.includes(r.section)) return `#/fantasy/${r.section}`;
    if (['nfl', 'cfb'].includes(r.panel) && r.sportView === 'research') return `#/${r.panel}/research`;
    return `#/${path}`;
  }
  function group(r) {
    if (r.panel === 'predictions') return 'predictions';
    if (r.panel === 'research' || r.sportView === 'research') return 'research';
    if (['leagues','nfl','cfb','nba'].includes(r.panel)) return 'leagues';
    return r.panel === 'home' ? 'home' : 'explore';
  }
  function key(sport, id) { return `${sport}:${id}`; }
  function normalizeWatch(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.filter(r => {
      if (!r || !SPORTS.includes(r.sport) || !/^\d{1,20}$/.test(String(r.id))) return false;
      const k = key(r.sport, r.id);
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).slice(0, 80).map(r => ({ sport: r.sport, id: String(r.id),
      away: String(r.away || 'Away').slice(0, 100), home: String(r.home || 'Home').slice(0, 100),
      date: Number.isFinite(Date.parse(r.date)) ? r.date : null,
      at: Number.isFinite(Date.parse(r.at)) ? r.at : null, note: String(r.note || '').slice(0, 800) }));
  }
  function toggleWatch(list, item, now = new Date().toISOString()) {
    const existing = normalizeWatch(list), k = key(item.sport, item.id);
    if (existing.some(r => key(r.sport, r.id) === k)) return existing.filter(r => key(r.sport, r.id) !== k);
    if (existing.length >= 80) return existing; // never evict the owner's notes
    return normalizeWatch([{ ...item, at: now, note: '' }, ...existing]);
  }
  function captureStatus(run, now = Date.now()) {
    const at = Date.parse(run?.finished_at || run?.started_at);
    if (!Number.isFinite(at) || at > now + 5 * 60e3) return { tone: 'muted', title: 'Capture status unavailable', at: null };
    if (run.status !== 'ok') return { tone: 'caution', title: 'Capture needs a check', at };
    if (now - at > 90 * 60e3) return { tone: 'caution', title: 'Capture is delayed', at };
    return { tone: 'good', title: 'Automatic capture active', at };
  }
  function savedSummary(rows, version, now = Date.now()) {
    const eligible = (rows || []).filter(r => r.model_version === version && Date.parse(r.captured_at) < Date.parse(r.starts_at));
    const pending = eligible.filter(r => r.result === 'pending');
    const upcoming = pending.filter(r => Date.parse(r.starts_at) > now);
    const due = pending.filter(r => Date.parse(r.starts_at) <= now);
    const games = new Set(upcoming.map(r => key(r.sport, r.event_id))).size;
    const priced = upcoming.filter(r => r.price != null && String(r.price).trim() !== '' && Number.isFinite(Number(r.price)) && Math.abs(Number(r.price)) >= 100).length;
    return { upcoming: upcoming.length, games, priced, due: due.length };
  }
  function gameForecasts(rows, version) {
    const result = new Map();
    for (const r of rows || []) {
      if (r.model_version !== version || r.result === 'void' || !SPORTS.includes(r.sport)
        || !['moneyline','spread','total'].includes(r.market)
        || !(Date.parse(r.captured_at) < Date.parse(r.starts_at))) continue;
      const k = key(r.sport, r.event_id);
      if (!result.has(k)) result.set(k, new Map());
      // A repeated response must not inflate the number of saved markets.
      if (!result.get(k).has(r.market)) result.get(k).set(r.market, r);
    }
    return result;
  }
  function agenda(games, watch, filter = 'all', now = Date.now()) {
    const pinned = new Set(normalizeWatch(watch).map(r => key(r.sport, r.id)));
    const unique = new Map();
    for (const item of games || []) {
      if (!item.g?.id || item.g.seasonType === 1 || !SPORTS.includes(item.sport)) continue;
      const k = key(item.sport, item.g.id);
      if (!unique.has(k)) unique.set(k, { ...item, pinned: pinned.has(k) });
    }
    const stateRank = g => g.state === 'in' ? 0 : g.state === 'pre' && Date.parse(g.date) >= now ? 1 : 2;
    return [...unique.values()].filter(x => filter === 'all' || (filter === 'watchlist' ? x.pinned : x.sport === filter))
      .sort((a,b) => stateRank(a.g) - stateRank(b.g) || Number(b.pinned) - Number(a.pinned) || (Date.parse(a.g.date) || 0) - (Date.parse(b.g.date) || 0));
  }
  function search(items, query) {
    const tokens = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    return items.filter(x => tokens.every(t => `${x.title} ${x.description || ''} ${x.keywords || ''}`.toLowerCase().includes(t))).slice(0, 30);
  }
  return Object.freeze({ route, hashFor, group, key, normalizeWatch, toggleWatch, captureStatus, savedSummary, gameForecasts, agenda, search });
});

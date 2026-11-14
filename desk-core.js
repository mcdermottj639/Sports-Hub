// Personal desk utilities. No forecasts, bets, or collection writes happen here.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SportsHubDeskCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SPORTS = ['nfl', 'cfb', 'mlb', 'nba', 'cbb'];
  const PANELS = ['home', 'predictions', 'research', 'matchup-lab', 'fantasy', 'watchlist', 'explore', 'leagues', 'eagles', 'redsox', 'nfl', 'cfb', 'nba', 'cbb', 'pickem', 'pulse', 'labs', 'about'];
  const aliases = { today: 'home', models: 'predictions', more: 'explore', news: 'pulse', tools: 'labs' };
  const names = { home: 'today', predictions: 'models', explore: 'more', pulse: 'news', labs: 'tools' };
  const subs = { picks: 'board', props: 'props', results: 'record', calibration: 'backtest', method: 'model', trends: 'trends', recent: 'recent' };
  const subNames = { board: 'picks', props: 'props', record: 'results', backtest: 'calibration', model: 'method', trends: 'trends', recent: 'recent' };
  const FANTASY_SECTIONS = ['matchup', 'gm', 'lineup', 'roster', 'season', 'waivers'];
  const LAB_SPORTS = ['nfl', 'nba'], LAB_TABS = ['matchups', 'accuracy', 'audit'], LAB_SCOPES = ['upcoming', 'completed', 'all'];
  const gameId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) ? value : null;
  function labSelection(value) {
    const v = value && typeof value === 'object' ? value : {}, out = {};
    if (LAB_SPORTS.includes(v.sport)) out.sport = v.sport;
    if (LAB_TABS.includes(v.tab)) out.tab = v.tab;
    if (LAB_SCOPES.includes(v.scope)) out.scope = v.scope;
    if (gameId(v.selected)) out.selected = v.selected;
    return out;
  }
  function labPreferences(value) {
    const v = value && typeof value === 'object' ? value : {};
    return { sport: LAB_SPORTS.includes(v.sport) ? v.sport : 'nfl', tab: LAB_TABS.includes(v.tab) ? v.tab : 'matchups',
      choices: Object.fromEntries(LAB_SPORTS.map(s => { const c = labSelection(v.choices?.[s]); return [s, { selected: c.selected || null, scope: c.scope || 'upcoming' }]; })) };
  }
  function agendaPreferences(value) {
    return { filter: ['all','today','watchlist',...SPORTS].includes(value?.filter) ? value.filter : 'all', edges: value?.edges === true };
  }
  function route(hash) {
    if (String(hash).startsWith('#pk=')) return null;
    const [path, query = ''] = String(hash || '').replace(/^#\/?/, '').split('?');
    const parts = path.split('/');
    const panel = aliases[parts[0]] || parts[0] || 'home';
    if (!PANELS.includes(panel)) return null;
    if (panel === 'matchup-lab' && query) {
      const p = new URLSearchParams(query), lab = labSelection({ sport:p.get('league'), tab:p.get('view'), scope:p.get('period'), selected:p.get('game') });
      return { panel, ...(Object.keys(lab).length ? { lab } : {}) };
    }
    if (panel === 'predictions') return { panel, aiSport: SPORTS.includes(parts[1]) ? parts[1] : 'all', aiSub: subs[parts[2]] || 'board' };
    if (panel === 'fantasy' && FANTASY_SECTIONS.includes(parts[1])) return { panel, section: parts[1] };
    if (['nfl', 'cfb', 'nba'].includes(panel)) return { panel, sportView: parts[1] === 'research' ? 'research' : 'games' };
    return { panel };
  }
  function hashFor(r) {
    const path = names[r.panel] || r.panel;
    if (r.panel === 'matchup-lab' && r.lab) {
      const lab = labSelection(r.lab), p = new URLSearchParams();
      for (const [key, name] of [['sport','league'],['tab','view'],['scope','period'],['selected','game']]) if (lab[key]) p.set(name,lab[key]);
      return '#/matchup-lab' + (p.size ? '?' + p.toString() : '');
    }
    if (r.panel === 'predictions') return `#/models/${SPORTS.includes(r.aiSport) ? r.aiSport : 'all'}/${subNames[r.aiSub] || 'picks'}`;
    if (r.panel === 'fantasy' && FANTASY_SECTIONS.includes(r.section)) return `#/fantasy/${r.section}`;
    if (['nfl', 'cfb', 'nba'].includes(r.panel) && r.sportView === 'research') return `#/${r.panel}/research`;
    return `#/${path}`;
  }
  function group(r) {
    if (r.panel === 'predictions') return 'predictions';
    // v351: Research has the bottom-bar slot; Fantasy opens from the top of More.
    if (r.panel === 'research' || r.panel === 'matchup-lab' || r.sportView === 'research') return 'research';
    if (r.panel === 'fantasy') return 'explore';
    if (['leagues','nfl','cfb','nba','cbb'].includes(r.panel)) return 'leagues';
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
    const eligible = (rows || []).filter(r => r.model_version === wanted(version, r.sport) && Date.parse(r.captured_at) < Date.parse(r.starts_at));
    const pending = eligible.filter(r => r.result === 'pending');
    const upcoming = pending.filter(r => Date.parse(r.starts_at) > now);
    const due = pending.filter(r => Date.parse(r.starts_at) <= now);
    const games = new Set(upcoming.map(r => key(r.sport, r.event_id))).size;
    const priced = upcoming.filter(r => r.price != null && String(r.price).trim() !== '' && Number.isFinite(Number(r.price)) && Math.abs(Number(r.price)) >= 100).length;
    return { upcoming: upcoming.length, games, priced, due: due.length };
  }
  // `version` is either one version string or a function sport -> official
  // version. v328: the desk passed the single string 'v239', so NFL
  // (nfl-football-v1) and NBA (nba-v1) official forecasts never reached it.
  const wanted = (version, sport) => (typeof version === 'function' ? version(sport) : version);
  function gameForecasts(rows, version) {
    const result = new Map();
    for (const r of rows || []) {
      if (r.model_version !== wanted(version, r.sport) || r.result === 'void' || !SPORTS.includes(r.sport)
        || !['moneyline','spread','total'].includes(r.market)
        || !(Date.parse(r.captured_at) < Date.parse(r.starts_at))) continue;
      const k = key(r.sport, r.event_id);
      if (!result.has(k)) result.set(k, new Map());
      // A repeated response must not inflate the number of saved markets.
      if (!result.get(k).has(r.market)) result.get(k).set(r.market, r);
    }
    return result;
  }
  // v328 — the "games ahead" read for one game. Display-only: everything here
  // comes from the ESPN line already on the game and the official saved
  // pregame forecast rows (`markets` = gameForecasts(...).get(key)). Nothing is
  // predicted, recorded or graded here.
  //   odds: normOdds() shape — spread is HOME-oriented (negative = home favored).
  const HOT = ['alert', 'best', 'edge'];
  const num = v => (v == null || String(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const signed = v => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : `${v}`);
  const tierName = t => (t ? t[0].toUpperCase() + t.slice(1) : null);
  function gameRead(markets, odds, g) {
    const ab = home => { const t = home ? g?.home : g?.away; return t?.abbr || t?.name || (home ? 'Home' : 'Away'); };
    const ml = markets?.get?.('moneyline') || null, sp = markets?.get?.('spread') || null, tot = markets?.get?.('total') || null;
    // Book line.
    const s = num(odds?.spread), ou = num(odds?.ou);
    let spreadTxt = null;
    if (s != null) spreadTxt = s === 0 ? 'Pick’em' : `${ab(s < 0)} −${Math.abs(s)}`;
    else if (typeof odds?.details === 'string' && odds.details.trim() && num(odds?.hML) == null && num(odds?.aML) == null) spreadTxt = odds.details.trim();
    const line = [spreadTxt, ou != null ? `O/U ${ou}` : null].filter(Boolean).join(' · ') || null;
    const price = v => (num(v) == null ? null : signed(num(v)));
    const moneyline = { away: price(odds?.aML), home: price(odds?.hML) };
    // Model chips (official saved pregame rows only).
    const chips = [];
    if (ml) {
      const pct = num(ml.confidence) ?? (num(ml.model_probability) != null ? num(ml.model_probability) * 100 : null);
      chips.push({ market: 'winner', label: 'ML', value: `${ab(!!ml.selection_home)}${pct != null ? ` ${Math.round(pct)}%` : ''}`, tier: ml.tier || null, hot: HOT.includes(ml.tier) });
    }
    if (sp) chips.push({ market: 'spread', label: 'Spread', value: String(sp.selection || '').replace(/ -(?=\d)/, ' −'), tier: sp.tier || null, hot: HOT.includes(sp.tier) });
    if (tot) {
      const over = /^over/i.test(String(tot.selection || ''));
      chips.push({ market: 'total', label: 'Total', value: `${over ? 'O' : 'U'} ${num(tot.line) ?? String(tot.selection || '').replace(/^\D+/, '')}`, tier: tot.tier || null, hot: HOT.includes(tot.tier) });
    }
    // Edge: model win chance minus the no-vig market chance for the same side.
    const mp = num(ml?.model_probability), mk = num(ml?.market_probability);
    const edge = ml && mp != null && mk != null
      ? { pts: Math.round((mp - mk) * 1000) / 10, tier: tierName(ml.tier), hot: HOT.includes(ml.tier) } : null;
    // Underdog flip — same rule as Performance (v327): book has plus money, model > 50%.
    const flip = !!(ml && num(ml.price) >= 100 && mp != null && mp > 0.5);
    // Projected score from the saved forecast (margin is HOME-oriented).
    const f = ml?.snapshot?.forecast || sp?.snapshot?.forecast || tot?.snapshot?.forecast || {};
    const margin = num(f.margin) ?? num(sp?.projection), total = num(f.total) ?? num(tot?.projection);
    let proj = null;
    if (margin != null && total != null && total > 0) {
      if (Math.abs(margin) < 1) proj = `Proj. about even · ${Math.round(total)} total`;
      else {
        const home = (total + margin) / 2, away = (total - margin) / 2, r1 = v => (Math.round(v * 10) / 10).toFixed(1);
        proj = margin > 0 ? `Proj. ${ab(true)} ${r1(home)} – ${ab(false)} ${r1(away)}` : `Proj. ${ab(false)} ${r1(away)} – ${ab(true)} ${r1(home)}`;
      }
    }
    // v329 — the chips are the SAVED pregame read; the line row is TODAY's.
    // Stamp when the forecast was saved, and where today's number has moved
    // off the saved one, say whether the saved projection still clears it.
    const caps = [ml, sp, tot].map(r => Date.parse(r?.captured_at)).filter(Number.isFinite);
    const savedAt = caps.length ? new Date(Math.min(...caps)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }) : null;
    const moves = [], r1 = v => (Math.round(v * 10) / 10).toFixed(1), same = (a, b) => Math.abs(a - b) < 0.01;
    const sLine = num(sp?.line);
    if (sp && sLine != null && s != null && !same(sLine, s)) {
      const home = !!sp.selection_home, side = v => { const x = home ? v : -v; return x > 0 ? `+${x}` : x < 0 ? `\u2212${Math.abs(x)}` : 'PK'; };
      const cushion = margin == null ? null : (home ? margin + s : -(margin + s));
      moves.push({ market: 'spread', saved: `${ab(home)} ${side(sLine)}`, current: `${ab(home)} ${side(s)}`, assessment: cushion == null ? 'Projection unavailable' : cushion >= 0 ? `Model covers by ${r1(cushion)} pts` : `Model misses by ${r1(-cushion)} pts`, text: `Spread ${ab(home)} ${side(sLine)} \u2192 ${side(s)} now${cushion == null ? '' : cushion >= 0 ? ` \u00b7 still covers by ${r1(cushion)}` : ` \u00b7 now short by ${r1(-cushion)}`}`, ok: cushion == null ? null : cushion >= 0 });
    }
    const tLine = num(tot?.line);
    if (tot && tLine != null && ou != null && !same(tLine, ou)) {
      const over = /^over/i.test(String(tot.selection || ''));
      const cushion = total == null ? null : (over ? total - ou : ou - total);
      moves.push({ market: 'total', saved: `${over ? 'Over' : 'Under'} ${tLine}`, current: `${over ? 'Over' : 'Under'} ${ou}`, assessment: cushion == null ? 'Projection unavailable' : cushion >= 0 ? `Model ${over ? 'over' : 'under'} by ${r1(cushion)} pts` : `Model misses by ${r1(-cushion)} pts`, text: `Total ${over ? 'O' : 'U'} ${tLine} \u2192 ${ou} now${cushion == null ? '' : cushion >= 0 ? ` \u00b7 still ${over ? 'over' : 'under'} by ${r1(cushion)}` : ` \u00b7 now short by ${r1(-cushion)}`}`, ok: cushion == null ? null : cushion >= 0 });
    }
    const hP = num(odds?.hML), aP = num(odds?.aML), savedP = num(ml?.price);
    if (ml && hP != null && aP != null && savedP != null) {
      const home = !!ml.selection_home, nowP = home ? hP : aP;
      if (!same(nowP, savedP)) {
        const imp = v => (v < 0 ? -v / (-v + 100) : 100 / (v + 100));
        const fair = imp(home ? hP : aP) / (imp(hP) + imp(aP));
        const edgeNow = mp == null ? null : Math.round((mp - fair) * 1000) / 10;
        moves.push({ market: 'moneyline', saved: `${ab(home)} ${signed(savedP)}`, current: `${ab(home)} ${signed(nowP)}`, assessment: edgeNow == null ? 'Win-chance comparison unavailable' : `Model win chance ${Math.abs(edgeNow).toFixed(1)} percentage points ${edgeNow >= 0 ? 'above' : 'below'} market`, text: `ML ${ab(home)} ${signed(savedP)} \u2192 ${signed(nowP)} now${edgeNow == null ? '' : ` \u00b7 edge now ${edgeNow > 0 ? '+' : edgeNow < 0 ? '\u2212' : ''}${Math.abs(edgeNow).toFixed(1)}`}`, ok: edgeNow == null ? null : edgeNow > 0 });
      }
    }
    moves.sort((a,b)=>['moneyline','spread','total'].indexOf(a.market)-['moneyline','spread','total'].indexOf(b.market));
    return { line, moneyline, chips, edge, flip, proj, savedAt, moves, hot: HOT.includes(ml?.tier) };
  }
  function slateSummary(reads) {
    const list = reads || [];
    return { games: list.length, edges: list.filter(r => r?.hot).length, flips: list.filter(r => r?.flip).length };
  }
  function agenda(games, watch, filter = 'all', now = Date.now()) {
    const day = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : null; };
    const today = day(now);
    const pinned = new Set(normalizeWatch(watch).map(r => key(r.sport, r.id)));
    const unique = new Map();
    for (const item of games || []) {
      if (!item.g?.id || item.g.seasonType === 1 || !SPORTS.includes(item.sport)) continue;
      const k = key(item.sport, item.g.id);
      if (!unique.has(k)) unique.set(k, { ...item, pinned: pinned.has(k) });
    }
    const stateRank = g => g.state === 'in' ? 0 : g.state === 'pre' && Date.parse(g.date) >= now ? 1 : 2;
    return [...unique.values()].filter(x => filter === 'all' || (filter === 'today' ? day(x.g.date) === today : filter === 'watchlist' ? x.pinned : x.sport === filter))
      .sort((a,b) => stateRank(a.g) - stateRank(b.g) || Number(b.pinned) - Number(a.pinned) || (Date.parse(a.g.date) || 0) - (Date.parse(b.g.date) || 0));
  }
  function search(items, query) {
    const tokens = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    return items.filter(x => tokens.every(t => `${x.title} ${x.description || ''} ${x.keywords || ''}`.toLowerCase().includes(t))).slice(0, 30);
  }
  return Object.freeze({ route, hashFor, group, labSelection, labPreferences, agendaPreferences, key, normalizeWatch, toggleWatch, captureStatus, savedSummary, gameForecasts, gameRead, slateSummary, agenda, search });
});

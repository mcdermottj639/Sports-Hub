(function cloudAI(root) {
  'use strict';
  const CACHE_KEY = 'sportshub:cloud-ai:v1';
  const cfg = root.SPORTS_HUB_SUPABASE;
  const empty = () => ({ at: null, rows: [], run: null });

  let memory = null;
  const eventRequests = new Map();

  // 🚨 v336 — the history cache lives in IndexedDB, NOT localStorage.
  // Jack hit "Could not save: this browser's storage is full" saving a game.
  // Measured 1 Nov 2026: this key held 1,271 rows ≈ 4.0M characters (~8 MB as
  // UTF-16; snapshot.features alone ≈ 70%) against Safari's ~5 MB per-origin
  // localStorage quota, so every other write on the origin failed — bookmarks,
  // forecast locks, the ESPN disk cache. IndexedDB has a far larger quota.
  // cached() stays synchronous: it serves `memory`, which is filled from
  // IndexedDB at boot (then 'sportshub:cloud-ai' fires so screens repaint) and
  // by every sync(). A legacy localStorage copy is read once, moved to
  // IndexedDB, then DELETED — that delete is what frees the quota.
  const IDB = root.indexedDB || null;
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = IDB.open('sportshub', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        let req;
        try { const tx = db.transaction('kv', mode); req = fn(tx.objectStore('kv'));
          tx.oncomplete = () => { db.close(); resolve(req?.result); };
          tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
        } catch (e) { db.close(); reject(e); }
      };
    });
  }
  const idbGet = (k) => idb('readonly', (st) => st.get(k));
  const idbSet = (k, v) => idb('readwrite', (st) => st.put(v, k));
  function dropLegacy() { try { localStorage.removeItem(CACHE_KEY); } catch (_) {} }
  function cached() {
    if (memory) return memory;
    try {
      const legacy = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (legacy) {
        memory = legacy;
        if (IDB) idbSet(CACHE_KEY, legacy).then(dropLegacy).catch(() => {});
        return legacy;
      }
    } catch (_) {}
    return empty();
  }
  if (IDB) {
    try { if (localStorage.getItem(CACHE_KEY) != null) cached(); } catch (_) {}
    idbGet(CACHE_KEY).then((v) => {
      if (v && !memory) { memory = v; root.dispatchEvent(new CustomEvent('sportshub:cloud-ai', { detail: v })); }
    }).catch(() => {});
  }
  function dateNum(value) { return Number(String(value || '').slice(0, 10).replace(/-/g, '')); }
  function keyFor(row) {
    return `${row.event_id}${row.market === 'spread' ? ':s' : row.market === 'total' ? ':t' : ''}`;
  }
  function evidence(row) {
    return {
      ...(row.snapshot || {}),
      v: row.model_version, app: row.app_version, at: row.captured_at,
      start: row.starts_at, market: row.market, home: row.selection_home,
      price: row.price, provider: row.provider, prob: row.model_probability,
      marketProb: row.market_probability, line: row.line, proj: row.projection,
      quality: row.quality || [], cloud: true,
    };
  }
  function legacy(row, settled) {
    const base = { s: row.sport, d: dateNum(row.slate_date), p: row.selection,
      m: row.matchup, q: evidence(row), cloud: 1 };
    if (row.market === 'spread') Object.assign(base, { a: 1, pm: row.projection });
    if (row.market === 'total') Object.assign(base, { t: 1, pt: row.projection, tr: row.tier });
    if (row.market === 'moneyline') Object.assign(base, { cf: row.confidence, tr: row.tier });
    if (settled) {
      if (row.result === 'push') base.pu = 1;
      else base.c = row.result === 'win' ? 1 : 0;
      if (base.q) { base.q.finalHome = row.final_home_score; base.q.finalAway = row.final_away_score; }
      return base;
    }
    return { sport: row.sport, date: String(base.d), pick: row.selection, m: row.matchup,
      conf: row.confidence, tr: row.tier, q: base.q,
      ...(row.market === 'spread' ? { a: 1, home: row.selection_home ? 1 : 0, hsp: row.line, proj: row.projection } : {}),
      ...(row.market === 'total' ? { t: 1, line: row.line, proj: row.projection } : {}) };
  }
  function maps(includeArchive = false) {
    const tally = {}, pending = {};
    const live = root.SportsHubNFLLive;
    const currentEvents = new Set((cached().rows || []).filter(r => live?.current(r)).map(r => `${r.sport}:${r.event_id}`));
    for (const row of cached().rows || []) {
      const replaced = row.sport === 'nfl' && live && row.model_version !== live.VERSION
        && (Date.parse(row.starts_at) >= Date.parse(live.ACTIVATED_AT) || currentEvents.has(`${row.sport}:${row.event_id}`));
      // An old pending spread must not masquerade as the new engine's pick
      // merely because the new model does not qualify (or withholds the game).
      if (replaced && !includeArchive) continue;
      const key = keyFor(row) + (replaced ? `:${row.model_version}` : '');
      if (row.result === 'pending') pending[key] = legacy(row, false);
      else if (row.result !== 'void') tally[key] = legacy(row, true);
    }
    return { tally, pending };
  }
  async function request(path) {
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Cloud history ${response.status}`);
    return response.json();
  }
  async function history() {
    const all = [];
    for (let offset = 0; ; offset += 500) {
      const versions = root.SportsHubNFLLive ? `in.(v239,${root.SportsHubNFLLive.VERSION},nba-v1)` : 'in.(v239,nba-v1)';
      const rows = await request(`ai_predictions?model_version=${versions}&select=*&order=starts_at.desc,id.asc&limit=500&offset=${offset}`);
      all.push(...rows);
      if (rows.length < 500) return all;
    }
  }
  async function sync() {
    if (!cfg?.url || !cfg?.key) return cached();
    const [rows, runs] = await Promise.all([
      history(),
      request('ai_job_runs?select=*&order=started_at.desc&limit=1'),
    ]);
    const value = { at: new Date().toISOString(), rows, run: runs[0] || null };
    memory = value;
    if (IDB) idbSet(CACHE_KEY, value).then(dropLegacy).catch(() => {});
    else { try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch (_) {} }
    root.dispatchEvent(new CustomEvent('sportshub:cloud-ai', { detail: value }));
    return value;
  }
  async function eventRows(sport, id) {
    if (!cfg?.url || !cfg?.key) return (cached().rows || []).filter(r => r.sport === sport && String(r.event_id) === String(id));
    const key = `${sport}:${id}`, old = eventRequests.get(key);
    if (old && Date.now() - old.at < 60000) return old.promise;
    const entry = {at:Date.now(), promise:null};
    entry.promise = request(`ai_predictions?sport=eq.${encodeURIComponent(sport)}&event_id=eq.${encodeURIComponent(id)}&select=*&order=captured_at.desc,id.asc`).catch(error => { eventRequests.delete(key); throw error; });
    eventRequests.set(key, entry);
    return entry.promise;
  }
  // v345 — last pregame quote per market for one event, from the odds
  // collector's immutable snapshots (public SELECT). One small request per
  // event (≤6 narrow rows, newest first; the first row per market wins);
  // callers cache the answer on device so each settled event is read once.
  async function lastPregameQuotes(sport, id, startsAt, provider) {
    if (!cfg?.url || !cfg?.key || !sport || !id || !Number.isFinite(Date.parse(startsAt))) return null;
    const q = `betting_quote_snapshots?sport=eq.${encodeURIComponent(sport)}&event_id=eq.${encodeURIComponent(id)}`
      + (provider ? `&provider_name=eq.${encodeURIComponent(provider)}` : '')
      + `&market=in.(spread,total)&observed_at=lt.${encodeURIComponent(new Date(startsAt).toISOString())}`
      + `&select=market,line,provider_name,observed_at&order=observed_at.desc&limit=6`;
    const rows = await request(q);
    const out = {};
    for (const row of rows || []) if (row?.market && !out[row.market]) out[row.market] = row;
    return out;
  }
  function recordsFor(rows, version) {
    return Object.fromEntries(rows.filter(r => r.model_version === version && r.result !== 'void').map(r => [keyFor(r), legacy(r, r.result !== 'pending')]));
  }
  root.SportsHubCloudAI = Object.freeze({ cached, maps, sync, eventRows, recordsFor, lastPregameQuotes });
})(globalThis);

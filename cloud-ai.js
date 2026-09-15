(function cloudAI(root) {
  'use strict';
  const CACHE_KEY = 'sportshub:cloud-ai:v1';
  const cfg = root.SPORTS_HUB_SUPABASE;
  const empty = () => ({ at: null, rows: [], run: null });

  function cached() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') || empty(); }
    catch (_) { return empty(); }
  }
  function dateNum(value) { return Number(String(value || '').slice(0, 10).replace(/-/g, '')); }
  function keyFor(row) {
    return `${row.event_id}${row.market === 'spread' ? ':s' : row.market === 'total' ? ':t' : ''}`;
  }
  function evidence(row) {
    return {
      v: row.model_version, app: row.app_version, at: row.captured_at,
      start: row.starts_at, market: row.market, home: row.selection_home,
      price: row.price, provider: row.provider, prob: row.model_probability,
      marketProb: row.market_probability, line: row.line, proj: row.projection,
      quality: row.quality || [], cloud: true, ...(row.snapshot || {}),
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
  function maps() {
    const tally = {}, pending = {};
    for (const row of cached().rows || []) {
      const key = keyFor(row);
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
  async function sync() {
    if (!cfg?.url || !cfg?.key) return cached();
    const [rows, runs] = await Promise.all([
      request('ai_predictions?model_version=eq.v239&select=*&order=starts_at.desc&limit=2000'),
      request('ai_job_runs?select=*&order=started_at.desc&limit=1'),
    ]);
    const value = { at: new Date().toISOString(), rows, run: runs[0] || null };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch (_) {}
    root.dispatchEvent(new CustomEvent('sportshub:cloud-ai', { detail: value }));
    return value;
  }
  root.SportsHubCloudAI = Object.freeze({ cached, maps, sync });
})(globalThis);

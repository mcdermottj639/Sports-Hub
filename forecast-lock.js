/* Display snapshots are separate from the immutable performance ledger. */
(function (root) {
  'use strict';
  const KEY = 'sportshub:forecast-lock:v1';
  const memory = new Map();
  const copy = (v) => v == null ? null : JSON.parse(JSON.stringify(v));
  const key = (sport, g) => `${sport}:${g.id}`;
  const eligible = (g, now = Date.now()) => g?.state === 'pre' && Date.parse(g.date) > now
    && g.seasonType !== 1 && !/postpon|cancel|suspend|delay/i.test(g.statusText || '');
  function valid(s, g) {
    return s && Number.isFinite(Date.parse(s.at)) && Date.parse(s.at) < Date.parse(s.start)
      && Date.parse(s.start) === Date.parse(g.date) && s.prediction;
  }
  function all() { try { return JSON.parse(root.localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } }
  function read(sport, g) {
    const k = key(sport, g), saved = memory.get(k) || all()[k];
    return valid(saved, g) ? copy(saved) : null;
  }
  function persist(sport, g, saved) {
    const k = key(sport, g); memory.set(k, copy(saved));
    try {
      const values = all(); values[k] = saved;
      const entries = Object.entries(values).sort((a,b) => Date.parse(b[1].at) - Date.parse(a[1].at)).slice(0, 300);
      let json = JSON.stringify(Object.fromEntries(entries));
      while (entries.length > 1 && json.length * 2 > 1024 * 1024) { entries.pop(); json = JSON.stringify(Object.fromEntries(entries)); }
      root.localStorage.setItem(KEY, json);
    } catch (_) { /* Memory still protects the current session when storage is full. */ }
    return copy(saved);
  }
  function capture(sport, g, prediction, odds, probabilities, now = Date.now()) {
    if (!eligible(g, now) || !prediction) return null;
    const old = read(sport,g);
    if (old && Date.parse(old.at) > now) return old;
    return persist(sport, g, { at:new Date(now).toISOString(), start:g.date, source:'device',
      prediction:copy({...prediction, features:null, winner:{name:prediction.winner?.name,abbr:prediction.winner?.abbr,logo:prediction.winner?.logo}}), odds:copy(odds), probabilities:copy(probabilities) });
  }
  function recover(sport, g, records) {
    const saved = read(sport,g); if (saved) return saved;
    const evidence = (suffix) => {
      const row = records?.[`${g.id}${suffix}`], q = row?.q;
      return row && (row.s || row.sport) === sport && q && Date.parse(q.at) < Date.parse(q.start)
        && Date.parse(q.start) === Date.parse(g.date) ? {row,q} : null;
    };
    const ml = evidence(''); if (!ml || ml.q.prob < 0 || ml.q.prob > 1 || !Number.isFinite(ml.q.prob) || typeof ml.q.home !== 'boolean') return null;
    const sameEngine = (record) => record && record.q.v === ml.q.v && !!record.q.cloud === !!ml.q.cloud ? record : null;
    const spread = sameEngine(evidence(':s')), total = sameEngine(evidence(':t'));
    const homePick = ml.q.home, probHome = homePick ? ml.q.prob : 1-ml.q.prob;
    const odds = copy(ml.q.odds);
    if (odds) { if (spread) { odds.spread = spread.q.line; odds.details = spread.q.odds?.details || null; } if (total) odds.ou = total.q.line; }
    const prediction = {
      winner: copy(homePick ? g.home : g.away), homePick, probHome,
      conf:ml.row.cf ?? ml.row.conf ?? Math.round(ml.q.prob*100),
      projMargin:spread?.q.proj ?? null, projTotal:total?.q.proj ?? null,
      breakdown:[], notes:['Restored from saved pregame evidence; missing projections are not recomputed.'],
      blockedReasons:ml.q.quality || [], thin:false, marginSat:false, rating:ml.q.rating || null,
      features:ml.q.features || null, sharp:null,
    };
    return persist(sport,g,{at:ml.q.at,start:ml.q.start,source:ml.q.cloud?'cloud':'saved record',prediction,odds,
      probabilities:{spread:spread?.q.probability || null,total:total?.q.probability || null}});
  }
  const api = Object.freeze({eligible,read,capture,recover});
  root.SportsHubForecastLock = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// Shared production arithmetic. No DOM, network, fitted weights or assumed prices.
(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SportsHubAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function build() {
  'use strict';
  const number = (v) => v == null || String(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  function american(v) {
    const n = number(v);
    return n != null && Math.abs(n) >= 100 ? n : null;
  }
  function implied(v) {
    const n = american(v);
    return n == null ? null : n < 0 ? -n / (100 - n) : 100 / (100 + n);
  }
  function priceFor(info, home) {
    const direct = american(home ? info?.hML : info?.aML);
    if (direct != null) return direct;
    // A favorite-only quote says NOTHING about the other team's price.
    return info?.favHome === home ? american(info?.dML) : null;
  }
  function noVigHome(info) {
    const h = implied(info?.hML), a = implied(info?.aML);
    return h == null || a == null ? null : h / (h + a);
  }
  function value(prob, price) {
    const p = number(prob), line = american(price);
    if (p == null || p < 0 || p > 1 || line == null) return null;
    const payout = line > 0 ? line / 100 : 100 / -line;
    return { prob: p, price: line, breakeven: implied(line), ev: p * payout - (1 - p) };
  }
  function innings(v) {
    const n = number(v);
    if (n == null || n < 0) return null;
    const whole = Math.floor(n), outs = Math.round((n - whole) * 10);
    if (outs > 2 || Math.abs(n * 10 - Math.round(n * 10)) > 1e-6) return null;
    return whole + outs / 3;
  }
  function pregame(g, now = Date.now()) {
    const start = Date.parse(g?.date);
    return g?.state === 'pre' && Number.isFinite(start) && start > now
      && !/postpon|cancel|suspend|delay/i.test(g?.statusText || '') && g?.seasonType !== 1;
  }
  function evaluate(records, version) {
    const out = { n: 0, w: 0, l: 0, pushes: 0, priced: 0, units: 0, probabilityN: 0, brier: 0, logLoss: 0, legacy: 0, probabilitySum: 0, impliedSum: 0 };
    records.forEach((r) => {
      const q = r.q;
      const expected = typeof version === 'function' ? version(r.s || r.sport) : version;
      if (!q || (expected && q.v !== expected) || !(Date.parse(q.at) < Date.parse(q.start))) { out.legacy++; return; }
      if (r.c !== 0 && r.c !== 1 && !r.pu) return;
      out.n++;
      if (r.pu) out.pushes++; else if (r.c) out.w++; else out.l++;
      const price = american(q.price);
      if (price != null) {
        out.priced++;
        out.impliedSum += implied(price);
        out.units += r.pu ? 0 : r.c ? (price > 0 ? price / 100 : 100 / -price) : -1;
      }
      const stamped = q.probability;
      const verifiedProbability = !stamped || (Date.parse(stamped.trainedThrough) < Date.parse(stamped.at) && Date.parse(stamped.at) < Date.parse(q.start));
      const prob = verifiedProbability ? number(q.prob) : null;
      if (!r.pu && prob != null && prob >= 0 && prob <= 1) {
        const p = Math.max(1e-6, Math.min(1 - 1e-6, prob));
        out.probabilityN++;
        out.probabilitySum += prob;
        out.brier += (prob - r.c) ** 2;
        out.logLoss -= r.c ? Math.log(p) : Math.log(1 - p);
      }
    });
    out.meanProbability = out.probabilityN ? out.probabilitySum / out.probabilityN : null;
    out.meanImplied = out.priced ? out.impliedSum / out.priced : null;
    out.roi = out.priced ? out.units / out.priced : null;
    out.brier = out.probabilityN ? out.brier / out.probabilityN : null;
    out.logLoss = out.probabilityN ? out.logLoss / out.probabilityN : null;
    return out;
  }
  // Evaluate only timestamped pregame evidence. Never recompute a finished forecast.
  function forecastGrade(record, market, version, start) {
    const q = record?.q, sport = record?.s || record?.sport;
    const expected = typeof version === 'function' ? version(sport) : version;
    const missing = (status) => ({ status, result: null, error: null });
    if (!q || (expected && q.v !== expected) || !(Date.parse(q.at) < Date.parse(q.start))
      || (start && Date.parse(start) !== Date.parse(q.start))) return missing('Missing pregame forecast');
    const h = number(q.finalHome), a = number(q.finalAway);
    if (market === 'moneyline') {
      if (typeof q.home !== 'boolean') return missing('Missing pregame forecast');
      return { status: h == null || a == null ? 'Awaiting result' : 'Forecast saved',
        result: h == null || a == null ? null : h === a ? 'push' : (h > a) === q.home ? 'win' : 'loss', error: null,
        selection: record.p || record.pick };
    }
    if (market === 'spread' && !['nfl', 'cfb', 'nba'].includes(sport)) return missing('Market not tracked');
    const projection = number(q.forecast?.[market === 'spread' ? 'margin' : 'total']);
    if (projection == null) return missing('Missing pregame projection');
    const actual = h == null || a == null ? null : market === 'spread' ? h - a : h + a;
    const error = actual == null ? null : projection - actual;
    const line = number(q.odds?.[market === 'spread' ? 'spread' : 'ou']);
    if (line == null) return { ...missing('Missing pregame line'), error, projection };
    const edge = market === 'spread' ? projection + line : projection - line;
    const selection = market === 'spread' ? `${edge > 0 ? 'Home' : 'Away'} ${edge > 0 ? line : -line}` : `${edge > 0 ? 'OVER' : 'UNDER'} ${line}`;
    if (edge === 0) return { ...missing('No directional edge'), error, projection, line };
    const outcome = actual == null ? null : market === 'spread' ? actual + line : actual - line;
    return { status: actual == null ? 'Awaiting result' : 'Forecast saved', projection, line, edge, error, selection,
      result: outcome == null ? null : outcome === 0 ? 'push' : (outcome > 0) === (edge > 0) ? 'win' : 'loss' };
  }
  function qualifyingBet(record) {
    return !!record && !record.q?.researchOnly && !(record.t && (record.s || record.sport) === 'cfb')
      && (!!record.a || !!record.t || ['lean', 'edge', 'best', 'alert'].includes(record.tr));
  }
  function missingBetReason(record, market, version, start) {
    const grade = forecastGrade(record, market, version, start), q = record?.q;
    if (!['Forecast saved', 'Awaiting result', 'No directional edge'].includes(grade.status)) return grade.status;
    if (q?.quality?.length) return 'Data quality blocked bet';
    if (market === 'moneyline') return number(q.price) == null ? 'Missing pregame price' : 'No qualifying edge';
    const sport = record.s || record.sport;
    if (sport === 'cfb' && market === 'total') return 'Research only';
    if (q?.decisions?.[market]) return q.decisions[market];
    const floor = market === 'spread' ? {nfl:2,cfb:3,nba:3}[sport] : {nfl:4,cfb:6,mlb:1.5,nba:6}[sport];
    if (grade.status === 'No directional edge' || Math.abs(grade.edge) < floor) return 'No qualifying edge';
    if (market === 'total' && Math.abs(grade.edge) > ({nfl:14,cfb:21,mlb:4,nba:20}[sport])) return 'Data quality blocked bet';
    return 'Qualifying pick missing';
  }
  return Object.freeze({ number, american, implied, priceFor, noVigHome, value, innings, pregame, evaluate, forecastGrade, qualifyingBet, missingBetReason });
});

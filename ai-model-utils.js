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
    const out = { n: 0, w: 0, l: 0, pushes: 0, priced: 0, units: 0, probabilityN: 0, brier: 0, logLoss: 0, legacy: 0 };
    records.forEach((r) => {
      const q = r.q;
      if (!q || (version && q.v !== version) || !(Date.parse(q.at) < Date.parse(q.start))) { out.legacy++; return; }
      if (r.c !== 0 && r.c !== 1 && !r.pu) return;
      out.n++;
      if (r.pu) out.pushes++; else if (r.c) out.w++; else out.l++;
      const price = american(q.price);
      if (price != null) {
        out.priced++;
        out.units += r.pu ? 0 : r.c ? (price > 0 ? price / 100 : 100 / -price) : -1;
      }
      const prob = number(q.prob);
      if (!r.pu && prob != null && prob >= 0 && prob <= 1) {
        const p = Math.max(1e-6, Math.min(1 - 1e-6, prob));
        out.probabilityN++;
        out.brier += (prob - r.c) ** 2;
        out.logLoss -= r.c ? Math.log(p) : Math.log(1 - p);
      }
    });
    out.roi = out.priced ? out.units / out.priced : null;
    out.brier = out.probabilityN ? out.brier / out.probabilityN : null;
    out.logLoss = out.probabilityN ? out.logLoss / out.probabilityN : null;
    return out;
  }
  return Object.freeze({ number, american, implied, priceFor, noVigHome, value, innings, pregame, evaluate });
});

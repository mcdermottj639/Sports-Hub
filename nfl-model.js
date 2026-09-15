// NFL market models fitted chronologically on completed ESPN regular/postseason
// games. Train: 2017-2023; model selection: 2024; untouched test: 2025.
//
// Keep this file dependency-free: the browser consumes the global and the
// Node test suite requires the same functions, so validation cannot drift from
// production arithmetic.
(function exposeNFLModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SportsHubNFLModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildNFLModel() {
  'use strict';

  const ORDER = ['record', 'margin', 'form', 'split', 'rest'];
  const ML = Object.freeze({
    intercept: 0.203692,
    record: 0.611511,
    margin: 0.407612,
    form: -0.027132,
    split: 0.119897,
    rest: 0.018756,
  });
  const SPREAD = Object.freeze({
    intercept: 1.595353,
    record: 1.405095,
    margin: 3.783585,
    form: -0.174039,
    split: 2.633208,
    rest: 0.083451,
  });
  const TOTAL = Object.freeze({ intercept: 28.832, slope: 0.3679 });
  const META = Object.freeze({
    train: '2017-2023', validation: '2024', test: '2025',
    spreadResidualSD: 13.3761,
  });

  const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const logistic = (z) => 1 / (1 + Math.exp(-z));
  const linear = (weights, features) => ORDER.reduce(
    (sum, key) => sum + weights[key] * finite(features?.[key]),
    features?.neutral ? 0 : weights.intercept,
  );

  function moneylineLogit(features) { return linear(ML, features); }
  function moneylineProbability(features) { return logistic(moneylineLogit(features)); }
  function spreadMargin(features) { return linear(SPREAD, features); }
  function projectedTotal(rawTotal) {
    if (rawTotal == null) return null;
    const v = Number(rawTotal);
    return Number.isFinite(v) ? TOTAL.intercept + TOTAL.slope * v : null;
  }
  function moneylineContributions(features) {
    return [
      { key: 'home', label: 'Home field', value: features?.neutral ? 0 : ML.intercept },
      ...ORDER.map((key) => ({ key, label: key, value: ML[key] * finite(features?.[key]) })),
    ];
  }

  return Object.freeze({ ORDER, ML, SPREAD, TOTAL, META,
    moneylineLogit, moneylineProbability, spreadMargin, projectedTotal,
    moneylineContributions });
});

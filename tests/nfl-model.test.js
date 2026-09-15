'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../nfl-model.js');

function loadProductionPickTier() {
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const start = source.indexOf('function pickTier(');
  const end = source.indexOf('\n}\n\n// The model\'s against-the-spread', start) + 2;
  assert.ok(start >= 0 && end > start, 'pickTier source must be discoverable');
  const sandbox = {
    EDGE_BAR: { best: 10, edge: 5, lean: 2 },
    ALERT_DOG_ML: 150,
    pickedPrice: (pred) => pred.price,
  };
  vm.runInNewContext(`${source.slice(start, end)}; this.pickTier = pickTier;`, sandbox);
  return sandbox.pickTier;
}

test('neutral teams receive the fitted NFL home edge', () => {
  const f = { record: 0, margin: 0, form: 0, split: 0, rest: 0 };
  assert.equal(model.moneylineLogit(f), model.ML.intercept);
  assert.ok(Math.abs(model.moneylineProbability(f) - 0.550747) < 0.00001);
  assert.ok(Math.abs(model.spreadMargin(f) - 1.595353) < 1e-9);
});

test('production contributions add exactly to the moneyline logit', () => {
  const f = { record: 0.35, margin: 1.2, form: -0.4, split: 0.15, rest: 2 };
  const sum = model.moneylineContributions(f).reduce((n, row) => n + row.value, 0);
  assert.ok(Math.abs(sum - model.moneylineLogit(f)) < 1e-12);
});

test('recent form is deliberately near zero instead of driving the pick', () => {
  const cold = model.moneylineProbability({ form: -3 });
  const hot = model.moneylineProbability({ form: 3 });
  assert.ok(Math.abs(hot - cold) < 0.05);
  assert.ok(hot < cold); // fitted sign; tiny and stable on untouched 2025
});

test('moneyline and spread are separate calibrated paths', () => {
  const f = { record: 1, margin: -0.9, form: 0, split: 0, rest: 0 };
  assert.equal(model.moneylineProbability(f) >= 0.5, true);
  assert.equal(model.spreadMargin(f) >= 0, false);
});

test('NFL total is shrunk toward the historical scoring center', () => {
  assert.ok(Math.abs(model.projectedTotal(45) - 45.3875) < 1e-9);
  assert.ok(model.projectedTotal(70) < 70);
  assert.ok(model.projectedTotal(25) > 25);
  assert.equal(model.projectedTotal(null), null);
});

test('invalid feature values cannot poison a slate', () => {
  const f = { record: undefined, margin: NaN, form: 'bad', split: null, rest: Infinity };
  assert.equal(model.moneylineLogit(f), model.ML.intercept);
  assert.equal(model.spreadMargin(f), model.SPREAD.intercept);
});

test('moneyline tier keeps value on a favorite the model and book both favor', () => {
  const pickTier = loadProductionPickTier();
  const pred = { winner: { name: 'Philadelphia Eagles' }, price: -150 };
  const info = { favName: 'Philadelphia Eagles' };
  assert.equal(pickTier(pred, info, 6), 'edge');
  assert.equal(pickTier(pred, info, 1), null);
});

test('red alert remains restricted to a true plus-money underdog', () => {
  const pickTier = loadProductionPickTier();
  const pred = { winner: { name: 'Giants' }, price: 160 };
  assert.equal(pickTier(pred, { favName: 'Eagles' }, 12), 'alert');
  assert.equal(pickTier({ ...pred, price: 140 }, { favName: 'Eagles' }, 12), 'best');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../ai-model-utils.js');

test('blank and invalid stats stay missing, true zero remains zero', () => {
  for (const v of [null, undefined, '', ' ', 'N/A', Infinity, NaN]) assert.equal(ai.number(v), null);
  assert.equal(ai.number('0.00'), 0);
});
test('baseball innings are outs, not decimal fractions', () => {
  assert.equal(ai.innings('12.2'), 12 + 2 / 3);
  assert.equal(ai.innings(12.1), 12 + 1 / 3);
  for (const v of [-1, '12.3', 4.55, null]) assert.equal(ai.innings(v), null);
});
test('American odds handle either side and reject non-prices', () => {
  assert.equal(ai.implied(-150), 0.6);
  assert.equal(ai.implied('150'), 0.4);
  for (const v of [0, '', null, 1.9, -99, Infinity]) assert.equal(ai.implied(v), null);
});
test('a favorite-only quote does not invent an underdog price or no-vig probability', () => {
  const info = { dML: -200, favHome: false };
  assert.equal(ai.priceFor(info, false), -200);
  assert.equal(ai.priceFor(info, true), null);
  assert.equal(ai.noVigHome(info), null);
  assert.equal(ai.noVigHome({ hML: -110, aML: -110 }), 0.5);
});
test('value can exist on an underdog below 50% without an outright winner call', () => {
  assert.ok(ai.value(0.47, 155).ev > 0);
  assert.ok(ai.value(0.6, -200).ev < 0);
  assert.equal(ai.value(0.6, null), null);
});
test('pregame logging checks status AND the current clock', () => {
  const now = Date.parse('2026-09-20T12:00Z');
  const g = { state: 'pre', date: '2026-09-20T17:00Z', seasonType: 2 };
  assert.ok(ai.pregame(g, now));
  for (const change of [{ state: 'in' }, { state: 'post' }, { date: '2026-09-20T11:00Z' }, { date: null }, { statusText: 'Postponed' }, { statusText: 'Canceled' }, { seasonType: 1 }]) assert.equal(ai.pregame({ ...g, ...change }, now), false);
});
test('ROI uses actual saved prices, includes pushes, excludes unverifiable history', () => {
  const q = { v: 'v232', at: '2026-09-20T12:00Z', start: '2026-09-20T17:00Z', prob: 0.6, price: 150 };
  const e = ai.evaluate([{ c: 1, q }, { c: 0, q: { ...q, price: -200 } }, { c: null, pu: 1, q }, { c: 1, q: { ...q, price: null } }, { c: 1 }, { c: 1, q: { ...q, at: q.start } }], 'v232');
  assert.equal(e.n, 4); assert.equal(e.priced, 3); assert.equal(e.units, 0.5);
  assert.equal(e.roi, 0.5 / 3); assert.equal(e.pushes, 1); assert.equal(e.legacy, 2);
  assert.equal(e.probabilityN, 3); assert.ok(Math.abs(e.brier - (0.16 + 0.36 + 0.16) / 3) < 1e-12);
});
test('evaluation does not mix model versions or assume prices', () => {
  const q = { v: 'v231', at: '2026-09-20T12:00Z', start: '2026-09-20T17:00Z' };
  assert.equal(ai.evaluate([{ c: 1, q }], 'v232').n, 0);
  assert.equal(ai.evaluate([{ c: 1, q }]).roi, null);
});

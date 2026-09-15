'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../cloud-ai.js'), 'utf8');

function load(rows) {
  const values = new Map([['sportshub:cloud-ai:v1', JSON.stringify({ at: '2026-09-15T00:00:00Z', rows, run: { status: 'ok' } })]]);
  const root = {
    SPORTS_HUB_SUPABASE: { url: 'https://example.supabase.co', key: 'publishable' },
    localStorage: { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, v) },
    dispatchEvent() {}, CustomEvent: class {}, fetch: async () => ({ ok: true, json: async () => [] }),
  };
  root.globalThis = root;
  vm.runInNewContext(source, root);
  return root.SportsHubCloudAI;
}

const base = {
  event_id: 'game-1', sport: 'nfl', model_version: 'v239', app_version: 'v239',
  matchup: 'AWY @ HOM', slate_date: '2026-09-20', starts_at: '2026-09-20T17:00:00Z',
  captured_at: '2026-09-15T22:00:00Z', price: -110, provider: 'ESPN', quality: [], snapshot: {},
};

test('cloud rows retain separate event-market keys', () => {
  const api = load([
    { ...base, market: 'moneyline', selection: 'Home', selection_home: true, confidence: 64, result: 'pending' },
    { ...base, market: 'spread', selection: 'HOM -3', selection_home: true, line: -3, projection: 6, result: 'pending' },
    { ...base, market: 'total', selection: 'OVER 45', selection_home: null, line: 45, projection: 50, result: 'pending' },
  ]);
  assert.deepEqual(Object.keys(api.maps().pending).sort(), ['game-1', 'game-1:s', 'game-1:t']);
});

test('settled cloud rows become legacy-compatible graded evidence', () => {
  const api = load([{ ...base, market: 'moneyline', selection: 'Home', selection_home: true,
    confidence: 64, model_probability: 0.64, result: 'win', final_home_score: 24, final_away_score: 17 }]);
  const row = api.maps().tally['game-1'];
  assert.equal(row.c, 1);
  assert.equal(row.q.cloud, true);
  assert.equal(row.q.finalHome, 24);
  assert.equal(row.d, 20260920);
});

test('void cloud rows never enter records', () => {
  const api = load([{ ...base, market: 'moneyline', selection: 'Home', result: 'void' }]);
  assert.equal(Object.keys(api.maps().tally).length, 0);
  assert.equal(Object.keys(api.maps().pending).length, 0);
});

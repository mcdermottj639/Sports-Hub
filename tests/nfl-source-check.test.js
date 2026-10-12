'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function client(responses) {
  const sandbox = { globalThis: null, Date, Promise, Map, Number, Object, AbortSignal: { timeout: () => undefined } };
  sandbox.globalThis = sandbox;
  sandbox.fetch = async (url) => {
    const hit = Object.entries(responses).find(([k]) => url.includes(k));
    if (!hit || hit[1] === 'fail') throw new TypeError('Failed to fetch');
    return { ok: true, status: 200, json: async () => hit[1] };
  };
  sandbox.SportsHubNFLLive = { evidence: (g, src) => ({
    sourceStatus: { homeDepth: src.homeDepth._sourceStatus, awayDepth: src.awayDepth._sourceStatus, injuries: src.injuries._sourceStatus },
    qb: { home: { depthUpdatedAt: src.homeDepth.timestamp || null, name: src.homeDepth.qb || null },
          away: { depthUpdatedAt: src.awayDepth.timestamp || null, name: src.awayDepth.qb || null } },
    candidate: { reasons: ['home: current QB evidence unavailable'] } }) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../nfl-live-client.js'), 'utf8'), sandbox);
  return sandbox.SportsHubNFLLiveClient;
}
const g = { id: '1', date: '2026-10-13T00:15Z', home: { id: 14, abbr: 'LAR' }, away: { id: 2, abbr: 'BUF' } };

test('v309: source check separates a failed request, a stale chart and a good one', async () => {
  const day = 864e5;
  const c = client({
    'teams/14/depthcharts': { timestamp: new Date(Date.now() - 40 * day).toISOString() },
    'teams/2/depthcharts': 'fail',
    'injuries': {}, 'nfl-football-live.json': {}, 'summary': {},
  });
  await c.load(g);
  const d = c.diagnostic(g);
  assert.match(d, /BUF depth chart: request failed/);
  assert.match(d, /LAR depth chart: loaded but 40d old \(needs under 2 days\)/);
  assert.match(d, /injury report: loaded/);
  assert.match(c.reason(g), /Source check:/);
});

test('v309: a fresh chart names the QB', async () => {
  const c = client({
    'teams/14/depthcharts': { timestamp: new Date(Date.now() - 3600e3).toISOString(), qb: 'Matthew Stafford' },
    'teams/2/depthcharts': { timestamp: new Date(Date.now() - 3600e3).toISOString(), qb: 'Josh Allen' },
    'injuries': {}, 'nfl-football-live.json': {}, 'summary': {},
  });
  await c.load(g);
  assert.match(c.diagnostic(g), /LAR QB: Matthew Stafford \(chart 1h old\)/);
  assert.match(c.diagnostic(g), /BUF QB: Josh Allen/);
});

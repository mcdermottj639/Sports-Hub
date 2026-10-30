'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
globalThis.SportsHubNFLLive = { VERSION: 'nfl-football-v1' };
require('../ticker.js');
const T = globalThis.SportsHubTicker._pure;
const NOW = Date.parse('2026-10-29T23:00:00Z');
const H = 3600000;
const row = (o) => ({ sport: 'nba', market: 'moneyline', model_version: 'nba-v1', event_id: '1', matchup: 'WSH @ CLE',
  selection: 'Cleveland Cavaliers', price: -395, tier: null, confidence: 82, result: 'pending',
  starts_at: new Date(NOW + 2 * H).toISOString(), graded_at: null, ...o });

test('picks: current versions only, pending, 30h window, tiered first', () => {
  const items = T.buildPickItems([
    row({ event_id: 'a' }),
    row({ event_id: 'b', tier: 'best', starts_at: new Date(NOW + 10 * H).toISOString() }),
    row({ event_id: 'c', sport: 'nfl', model_version: 'v239' }),            // old NFL baseline
    row({ event_id: 'd', starts_at: new Date(NOW + 40 * H).toISOString() }), // too far out
    row({ event_id: 'e', result: 'win' }),
  ], NOW);
  assert.deepEqual(items.map((i) => i.id), ['b', 'a']);
  assert.match(items[0].html, /LARGEST GAP/);
  assert.match(items[1].html, /Cleveland Cavaliers ML \(-395\) · 82%/);
});

test('results and 24h record count only graded current rows', () => {
  const rows = [
    row({ event_id: '1', result: 'win', graded_at: new Date(NOW - H).toISOString() }),
    row({ event_id: '2', result: 'loss', market: 'spread', selection: 'CLE -10.5', price: -105, graded_at: new Date(NOW - 2 * H).toISOString() }),
    row({ event_id: '3', result: 'push', graded_at: new Date(NOW - 3 * H).toISOString() }),
    row({ event_id: '4', result: 'win', graded_at: new Date(NOW - 30 * H).toISOString() }),
    row({ event_id: '5', result: 'void', graded_at: new Date(NOW - H).toISOString() }),
  ];
  const res = T.buildResultItems(rows, NOW);
  assert.deepEqual(res.map((i) => i.id), ['1', '2', '3']);
  assert.match(res[0].html, /✓ HIT/); assert.match(res[1].html, /✗ MISS.*CLE -10\.5 ATS/);
  assert.deepEqual(T.recordSummary(rows, NOW), { win: 1, loss: 1, push: 1 });
  const upd = T.buildUpdateItems(rows, { status: 'ok', started_at: new Date(NOW - 12 * 60000).toISOString(),
    finished_at: new Date(NOW - 11 * 60000).toISOString(), captured: 4, graded: 2 }, NOW);
  assert.match(upd[0].html, /1-1-1/);
  assert.match(upd[1].html, /11m ago.*ok.*4 saved, 2 graded/);
});

test('scores sort live, then upcoming, then finals; leader marked; text escaped', () => {
  const g = (id, state, a, h, extra = {}) => ({ id, state, date: '2026-10-29T23:00:00Z', statusText: 'Q3 4:12',
    away: { abbr: a, score: 10 }, home: { abbr: h, score: 17 }, ...extra });
  const items = T.buildScoreItems([
    { sport: 'nfl', g: g('f', 'post', 'DAL', 'PHI') },
    { sport: 'nfl', g: g('s', 'pre', 'NYG', 'WSH') },
    { sport: 'nba', g: g('l', 'in', 'BOS', '<b>') },
  ]);
  assert.deepEqual(items.map((i) => i.id), ['l', 's', 'f']);
  assert.match(items[0].html, /tk-live/); assert.match(items[0].html, /&lt;b&gt;/);
  assert.match(items[0].html, /class="tk-lead">&lt;b&gt; 17/);
  assert.match(items[1].html, /NYG @ WSH/); assert.doesNotMatch(items[1].html, /10/);
  assert.match(items[2].html, /FINAL/);
});

test('news dedupes, skips media, newest first; compose drops empty sections', () => {
  const n = T.buildNewsItems([
    { sport: 'nfl', articles: [{ headline: 'Eagles win', published: '2026-10-29T10:00:00Z', links: { web: { href: 'https://espn.com/a' } } },
      { headline: 'Clip', type: 'Media', published: '2026-10-29T12:00:00Z' }] },
    { sport: 'nba', articles: [{ headline: 'eagles win', published: '2026-10-29T09:00:00Z' }, { headline: 'Sixers 2-0', published: '2026-10-29T11:00:00Z' }] },
  ]);
  assert.deepEqual(n.map((i) => i.html.replace(/<[^>]+>[^<]*<\/span>/, '')), ['Sixers 2-0', 'Eagles win']);
  assert.equal(n[1].href, 'https://espn.com/a');
  const c = T.compose([['SCORES', 'x', []], ['NEWS', 'y', n]]);
  assert.equal(c[0].k, 'h:NEWS'); assert.equal(c.length, 3);
});

test('ticker is wired: markup first in body, assets versioned, rail feeds it', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const v = app.match(/const APP_VERSION = 'v(\d+)'/)[1];
  assert.ok(html.indexOf('id="ticker"') < html.indexOf('<header class="topbar"'));
  assert.match(html, new RegExp(`ticker\\.js\\?v=${v}`)); assert.match(html, new RegExp(`ticker\\.css\\?v=${v}`));
  assert.ok(html.indexOf('ticker.js') < html.indexOf('<script src="app.js'));
  assert.match(app, /SportsHubTicker\?\.setScores\(shown\)/);
  assert.match(app, /SportsHubTicker\?\.init\(/);
});

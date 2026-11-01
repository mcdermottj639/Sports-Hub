'use strict';
// v334: the visible score rail is gone. renderLiveRail is now a data-only
// slate refresh that feeds the ticker and the tab pips — and the ticker owns
// all league/section filtering (tests/ticker.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const src = require('node:fs').readFileSync(require.resolve('../app.js'), 'utf8');
function load(fail = false, games = [{ id: '1' }, { id: '2' }]) {
  const fed = [], pips = [];
  const s = { sortedSports: () => ['mlb', 'nfl'], getGames: async (sp) => { if (fail) throw Error('offline'); return games.map((g) => ({ ...g, sp })); },
    ymd: () => '', sportsDate: () => new Date(), gameState: (g) => (g.id === '1' ? 'live' : 'scheduled'), isFav: () => false,
    paintLivePips: (x) => pips.push(JSON.parse(JSON.stringify([...x]))) };
  s.SportsHubTicker = { setScores: (l) => fed.push(JSON.parse(JSON.stringify(l))) };
  vm.createContext(s);
  const a = src.indexOf('const RAIL_SPORT_CAP'), b = src.indexOf('// 🔴 pip on the tab');
  vm.runInContext('let liveFavSports;' + src.slice(a, b), s);
  return { s, fed, pips };
}
test('every followed league goes to the ticker unfiltered; live leagues pip', async () => {
  const { s, fed, pips } = load();
  await s.renderLiveRail();
  assert.equal(fed.length, 1);
  assert.deepEqual(fed[0].map((x) => `${x.sport}:${x.g.id}`), ['mlb:1', 'mlb:2', 'nfl:1', 'nfl:2']);
  assert.deepEqual(pips[0], ['mlb', 'nfl']);
});
test('a failed feed still updates the ticker (empty) instead of throwing', async () => {
  const { s, fed } = load(true);
  await s.renderLiveRail();
  assert.deepEqual(fed[0], []);
});
test('no rail DOM, league bubbles or SCORES toggle remain', () => {
  const html = require('node:fs').readFileSync(require.resolve('../index.html'), 'utf8');
  assert.doesNotMatch(html, /id="live-rail"|id="rail-wrap"|id="rail-toggle"/);
  assert.match(html, /id="ticker-filter"/);
  assert.doesNotMatch(src, /function liveRailCard|function paintRailLeagues|function paintRailToggle/);
});

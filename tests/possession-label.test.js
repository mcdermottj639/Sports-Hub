'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const src = require('node:fs').readFileSync(require.resolve('../app.js'), 'utf8');

function load() {
  const s = {
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    esc: (v) => String(v),
  };
  vm.createContext(s);
  const start = src.indexOf('function possessionAbbr(');
  const end = src.indexOf('function renderGameDetail(');
  vm.runInContext(src.slice(start, end), s);
  const r0 = src.indexOf('function mgcFootball(');
  const r1 = src.indexOf('// Everything else: pull a clock');
  vm.runInContext(src.slice(r0, r1), s);
  return s;
}

// BAL @ ATL, ATL ball on Baltimore's side: ESPN spots it "BAL 45".
const sit = { possession: '1', possessionText: 'BAL 45', shortDownDistanceText: '3rd & 5', yardLine: 55 };
const comp = { competitors: [
  { homeAway: 'home', team: { id: '1', abbreviation: 'ATL' } },
  { homeAway: 'away', team: { id: '33', abbreviation: 'BAL' } },
] };

test('game report labels the team with the ball, not the side of the field', () => {
  const s = load();
  const html = s.footballSituation(sit, comp);
  assert.match(html, /<b>ATL<\/b> ball/);
  assert.doesNotMatch(html, /<b>BAL<\/b> ball/);
});

test('score rail uses the same possession', () => {
  const s = load();
  const g = { home: { id: '1', abbr: 'ATL' }, away: { id: '33', abbr: 'BAL' } };
  const html = s.mgcFootball(g, sit);
  assert.match(html, /ATL 3rd &amp; 5|ATL 3rd & 5/);
});

test('missing possession id shows no team instead of guessing from the spot', () => {
  const s = load();
  const html = s.footballSituation({ ...sit, possession: undefined }, comp);
  assert.doesNotMatch(html, /ball ·/);
  assert.match(html, /3rd & 5/);
});

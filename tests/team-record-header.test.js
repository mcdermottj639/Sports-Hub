'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const src = require('node:fs').readFileSync(require.resolve('../app.js'), 'utf8');

function load() {
  const s = {};
  vm.createContext(s);
  const a = src.indexOf('function overallRecord(');
  const b = src.indexOf('function teamObj(');
  vm.runInContext(src.slice(a, b), s);
  return s;
}

test('scoreboard records: picks the overall entry', () => {
  const s = load();
  assert.equal(s.overallRecord({ records: [
    { type: 'home', summary: '3-0' }, { type: 'total', summary: '5-1' } ] }), '5-1');
});

test('summary header record shape (displayValue) is read too', () => {
  const s = load();
  assert.equal(s.overallRecord({ record: [{ type: 'total', displayValue: '4-2' }] }), '4-2');
});

test('no record from ESPN shows nothing, not 0-0', () => {
  const s = load();
  assert.equal(s.overallRecord({}), '');
  assert.equal(s.overallRecord({ records: [{ type: 'total', summary: 'N/A' }] }), '');
});

test('header renders record for every team and rank only for ranked college teams', () => {
  const start = src.indexOf('  const teamCell = (c, side) => {');
  const end = src.indexOf('  const st = comp.status?.type', start);
  const body = src.slice(start, end);
  const s = load();
  s.esc = (v) => String(v);
  const run = (sport, g, c, side) => vm.runInContext(
    `(function(sport,g,c,side){${body}; return teamCell(c, side);})`, s)(sport, g, c, side);
  const msst = { team: { shortDisplayName: 'Mississippi State' }, records: [{ type: 'total', summary: '3-3' }] };
  const lsu = { team: { shortDisplayName: 'LSU' }, curatedRank: { current: 9 } };
  const g = { home: { record: '5-1', rank: 9 }, away: { record: '3-3', rank: null } };
  const away = run('cfb', g, msst, 'away');
  assert.match(away, /3-3/);
  assert.doesNotMatch(away, /md-rank/);
  const home = run('cfb', g, lsu, 'home');
  assert.match(home, /#9<\/span> LSU/);
  assert.match(home, /5-1/); // filled from the scoreboard game
  const nfl = run('nfl', { home: { record: '4-1', rank: 3 } }, { team: { shortDisplayName: 'Falcons' } }, 'home');
  assert.match(nfl, /4-1/);
  assert.doesNotMatch(nfl, /md-rank/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const src = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const FX = require('./fixtures/boxscore-2026-11.json'); // trimmed real ESPN summaries

function load() {
  const s = { esc: (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
  vm.createContext(s);
  const a = src.indexOf('const BOX_GROUP'), b = src.indexOf('\n}\n', src.indexOf('function boxScoreHTML(')) + 3;
  vm.runInContext(src.slice(a, b) + ';this.boxScoreHTML=boxScoreHTML;', s);
  return s.boxScoreHTML;
}

test('NFL: away team first, passing/rushing/receiving up front, the rest folded, team totals', () => {
  const h = load()('nfl', FX.nfl, '401873026');
  assert.match(h, /Box Score/);
  assert.ok(h.indexOf('label for="bx-401873026-a" class="a">BAL') > 0, 'away (BAL) is the first toggle');
  assert.match(h, /label for="bx-401873026-h" class="h">BUF/);
  const pane = h.slice(h.indexOf('bx-pane a'), h.indexOf('bx-pane h'));
  assert.ok(pane.indexOf('>Passing<') < pane.indexOf('>Rushing<') && pane.indexOf('>Rushing<') < pane.indexOf('>Receiving<'));
  assert.ok(pane.indexOf('Defense, kicking and returns') < pane.indexOf('>Defense<'), 'defense is inside the fold');
  assert.match(pane, /<th scope="col">C\/ATT<\/th>/);
  assert.match(pane, /<tfoot><tr><th scope="row">Team<\/th><td>9\/17<\/td>/);
  assert.doesNotMatch(pane, /Punt returns/); // ESPN group with no players is skipped
});

test('NBA: one Players table, did-not-play listed separately', () => {
  const h = load()('nba', FX.nba, '401909896');
  assert.match(h, />Players</);
  assert.match(h, /<th scope="col">PTS<\/th>/);
  assert.match(h, /Did not play: J\. Bench/);
  assert.doesNotMatch(h, /Defense, kicking/);
});

test('MLB: batting and pitching, home pane can be pre-selected', () => {
  const h = load()('mlb', FX.mlb, '401817017', 'h');
  assert.match(h, />Batting</);
  assert.match(h, />Pitching</);
  assert.match(h, /id="bx-401817017-h" checked/);
  assert.doesNotMatch(h, /id="bx-401817017-a" checked/);
});

test('pregame or missing box score renders nothing; ids and names are escaped', () => {
  const f = load();
  assert.equal(f('nfl', {}, '1'), '');
  assert.equal(f('nfl', { boxscore: { players: [] } }, '1'), '');
  const evil = JSON.parse(JSON.stringify(FX.nba));
  evil.boxscore.players[0].statistics[0].athletes[0].athlete.shortName = '<img src=x>';
  const h = f('nba', evil, '"><script>');
  assert.doesNotMatch(h, /<img src=x>|<script>/);
});

test('home-first feed is reordered so the away team is always the first toggle', () => {
  const swapped = JSON.parse(JSON.stringify(FX.nfl));
  swapped.boxscore.players.reverse();
  const h = load()('nfl', swapped, '9');
  assert.ok(h.indexOf('class="a">BAL') > 0 && h.indexOf('class="h">BUF') > h.indexOf('class="a">BAL'));
});

test('v333: box score sits under Live Situation, above the Game Report, and only once live or final', () => {
  const fn = src.slice(src.indexOf('function renderGameDetail('), src.indexOf('const BOX_GROUP'));
  const box = fn.indexOf('id="md-boxscore"'), live = fn.indexOf('id="md-live-situation"'), report = fn.indexOf("html += report || ''");
  assert.ok(live > 0 && box > live && report > box, 'order: live situation, box score, game report');
  assert.match(fn, /\['in', 'post'\]\.includes\(st\.state\) \? boxScoreHTML\(/);
  const refresh = src.slice(src.indexOf('async function refreshOpenGameDetail('), src.indexOf('function liveSituationHTML('));
  assert.ok(refresh.indexOf("const bx = $('#md-boxscore')") < refresh.indexOf("if (!html && st.state !== 'post')"), 'box score refresh runs before the no-situation return');
});

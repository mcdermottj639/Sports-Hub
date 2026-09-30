'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
function load() {
  const s = vm.createContext({ AI_MATH: require('../ai-model-utils.js'),
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), esc: String,
    logoHTML: () => '', gradeHue: () => '', lineAtLabel: () => '',
    lineMoves: () => null, moveHistory: () => null, bookConsensus: () => null,
    splitsFor: () => null, ATS_SPORTS: new Set(), timeAgo: () => '3h ago',
  });
  vm.runInContext('const impliedP = (v) => AI_MATH.implied(v);', s);
  for (const name of ['fairML', 'fmtML']) {
    const at = source.indexOf(`const ${name} =`);
    let end = at, script;
    while (!script) {
      end = source.indexOf(';', end + 1);
      assert.ok(end > at);
      try { script = new vm.Script(source.slice(at, end + 1)); } catch (_) {}
    }
    script.runInContext(s);
  }
  for (const name of ['countMoves', 'marketHomeProb', 'priceGrade', 'gameReportHTML']) {
    vm.runInContext(source.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'))[0], s);
  }
  return s;
}
test('a lengthening quote does not fabricate a move toward an unchanged opponent', () => {
  const s = load();
  const c = s.countMoves([{ hML: -140, aML: 120 }, { hML: -130, aML: 120 }]);
  assert.equal(c.homeIn, 0); assert.equal(c.awayIn, 0);
  const d = s.countMoves([{ hML: -140, aML: 120 }, { hML: -130, aML: 110 }]);
  assert.equal(d.homeIn, 0); assert.equal(d.awayIn, 1);
});
test('shortenings use valid implied probability, including even-money transitions', () => {
  const s = load();
  assert.equal(s.countMoves([{ hML: 100 }, { hML: -100 }]).homeIn, 0);
  assert.equal(s.countMoves([{ hML: -100 }, { hML: -110 }]).homeIn, 1);
  assert.equal(s.countMoves([{ hML: 110 }, { hML: -110 }]).homeIn, 1);
  assert.equal(s.countMoves([{ hML: 0 }, { hML: -110 }]).homeIn, 0);
  assert.equal(s.countMoves([{ hML: '-110' }, { hML: -110 }]).homeIn, 0);
  const c = s.countMoves([{ hML: -110, aML: -110 }, { hML: -120, aML: -120 }]);
  assert.equal(c.homeIn, 1); assert.equal(c.awayIn, 1);
});
test('favorite-only quotes never infer the unquoted side or compare different teams', () => {
  const s = load();
  assert.equal(s.countMoves([{ dML: -140, fh: true }, { dML: -130, fh: true }]).awayIn, 0);
  assert.equal(s.countMoves([{ dML: -140, fh: false }, { dML: -150, fh: false }]).awayIn, 1);
  assert.equal(s.countMoves([{ dML: -140, fh: true }, { dML: -150, fh: false }]).awayIn, 0);
  assert.equal(s.countMoves([{ hML: -140, dML: -140, fh: true }, { hML: -150, dML: -150, fh: true }]).homeIn, 1);
});
test('totals and spreads compare numbers and still count round trips', () => {
  const c = load().countMoves([{ ou: '9', sp: '-2' }, { ou: 10, sp: -3 }, { ou: 9, sp: -2 }]);
  assert.equal(c.ouUp, 1); assert.equal(c.ouDown, 1);
  assert.equal(c.spHome, 1); assert.equal(c.spAway, 1);
});
const game = { id: 'bos-nyy', away: { abbr: 'BOS' }, home: { abbr: 'NYY' } };
const pred = { probHome: 240 / 340, projTotal: 6.6, notes: ['SP: Home vs Away'], blockedReasons: [] };
const odds = { hML: -136, aML: 113, ou: 6.5 };
test('screenshot model odds are arithmetically consistent and distinct from no-vig market', () => {
  const s = load(), html = s.gameReportHTML('mlb', game, pred, odds);
  assert.match(html, /\+240/); assert.match(html, /-240/);
  assert.match(html, /29.4% model/); assert.match(html, /70.6% model/);
  assert.match(html, /44.9% market/); assert.match(html, /55.1% market/);
  assert.match(html, /independent of Action/);
  assert.match(html, /not a confirmed batting lineup/);
  assert.match(html, /SP: Home vs Away/);
});
test('missing model inputs suppress grades; missing quote suppresses market probability', () => {
  const s = load();
  const html = s.gameReportHTML('mlb', game, { ...pred, blockedReasons: ['Missing starters'] }, odds);
  assert.match(html, /grades withheld/); assert.match(html, /Missing starters/);
  assert.doesNotMatch(html, /border-color:/);
  const missing = s.gameReportHTML('mlb', game, pred, { hML: -136 });
  assert.doesNotMatch(missing, /% market/); assert.doesNotMatch(missing, /border-color:/);
});
test('a round trip shows no net change while retaining observed price shortenings', () => {
  const s = load();
  const first = { hML: -136, aML: 113, t: 1 }, hist = [first, { hML: -140, aML: 120 }, first];
  s.lineMoves = () => ({ first, last: first, src: 'device' });
  s.moveHistory = () => ({ hist, src: 'device' });
  const html = s.gameReportHTML('mlb', game, pred, odds);
  assert.match(html, /No net price\/total change/);
  assert.match(html, /Observed line movement/);
  assert.match(html, /observed price shortenings/);
  assert.match(html, /not verified sharp money/);
  assert.doesNotMatch(html, /Sharp Action/);
});

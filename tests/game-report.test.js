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
    splitsFor: () => null, ATS_SPORTS: new Set(['nfl']), timeAgo: () => '3h ago',
    sharpSignals: () => [], lineRec: () => null,
    globalThis: { SportsHubForecastLock: { eligible: () => true, captureReport: () => {} } },
  });
  vm.runInContext('const impliedP = (v) => AI_MATH.implied(v);', s);
  for (const name of ['fairML', 'fmtML', 'ATS_EDGE_MIN', 'EDGE_BAR', 'TOT_EDGE_MIN', 'TOT_MAX_DIFF', 'HEAT_STEPS']) {
    const at = source.indexOf(`const ${name} =`);
    let end = at, script;
    while (!script) {
      end = source.indexOf(';', end + 1);
      assert.ok(end > at);
      try { script = new vm.Script(source.slice(at, end + 1)); } catch (_) {}
    }
    script.runInContext(s);
  }
  for (const name of ['countMoves', 'marketHomeProb', 'priceGrade', 'heatCls', 'atsRead', 'totalRead', 'gameReportHTML']) {
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
  // v315: the move counts live in the collapsed notes, not as bar charts.
  assert.doesNotMatch(html, /sa-pair|sa-bar/);
});

// v315 — one card per market, with the spread and total DK splits that the
// backend has parsed since b7 but the card never showed.
const nflGame = { id: 'wsh-sf', away: { abbr: 'WSH', name: 'Washington Commanders' }, home: { abbr: 'SF', name: 'San Francisco 49ers' } };
const nflPred = { probHome: 0.792, projMargin: 11.1, projTotal: 50.7, notes: [], blockedReasons: [] };
const nflOdds = { hML: -410, aML: 320, ou: 52.5, spread: -7.5 };
// Live VSiN rows for this game, 19 Oct 2026: six columns per side, totals on
// the away row = Over and the home row = Under.
const vsin = {
  away: { team: 'Wash Commanders', spread_handle: 57, spread_bets: 38, total_handle: 57, total_bets: 54, ml_handle: 27, ml_bets: 11 },
  home: { team: 'San Francisco 49ers', spread_handle: 43, spread_bets: 62, total_handle: 43, total_bets: 46, ml_handle: 73, ml_bets: 89 },
};
test('three market cards, each with model, book and that market\'s own money split', () => {
  const s = load();
  s.splitsFor = () => vsin;
  const html = s.gameReportHTML('nfl', nflGame, nflPred, nflOdds, { splits: { ok: true, book: 'DraftKings via VSiN', games: [vsin] } });
  const cards = html.match(/class="gr-mkt"/g) || [];
  assert.equal(cards.length, 3);
  for (const lbl of ['Moneyline', 'Spread', 'Total']) assert.match(html, new RegExp(`gr-mkt-lbl">${lbl}<`));
  // Moneyline: pick side headlined, both sides' model and market % present.
  assert.match(html, /SF -3\d\d/); assert.match(html, /79.2% model/); assert.match(html, /20.8% model/);
  assert.match(html, /77.2% market/); assert.match(html, /22.8% market/);
  assert.match(html, /73% \$/); assert.match(html, /89% bets/); assert.match(html, /27% \$/); assert.match(html, /11% bets/);
  // Spread: model SF -11.1 vs book SF -7.5, 3.6 pts to SF, spread splits (not ML's).
  assert.match(html, /SF -11\.1/); assert.match(html, /SF -7\.5/); assert.match(html, /3\.6 pts/);
  assert.match(html, /57% \$/); assert.match(html, /38% bets/); assert.match(html, /62% bets/);
  // Total: 50.7 vs 52.5 → Under by 1.8; Over = away row, Under = home row.
  assert.match(html, /Under 52\.5 · 1\.8 pts/);
  assert.match(html, /gr-mside">Over<[^]*?57% \$[^]*?54% bets/);
  assert.match(html, /gr-mside">Under<[^]*?43% \$[^]*?46% bets/);
  // Dollars-vs-bets flags: ML and spread lean WSH (27/11, 57/38); the total's
  // 57/54 and 43/46 are inside the 7-pt deadband so no total flag.
  assert.match(html, /Dollars lean WSH on the spread — 57% of \$ on 38% of bets/);
  assert.doesNotMatch(html, /Dollars lean the (Over|Under)/);
  // The old duplicate sections are gone; the notes toggle remains.
  assert.doesNotMatch(html, /gr-money-row|gr-head|💰 Big Money/);
  assert.match(html, /Model inputs, limitations/);
});
test('missing spread and total splits degrade per market, never blank the card', () => {
  const s = load();
  const mlOnly = { away: { team: 'A', ml_handle: 40, ml_bets: 30 }, home: { team: 'B', ml_handle: 60, ml_bets: 70 } };
  s.splitsFor = () => mlOnly;
  const html = s.gameReportHTML('nfl', nflGame, nflPred, nflOdds, { splits: { ok: true, games: [mlOnly] } });
  assert.equal((html.match(/class="gr-mkt"/g) || []).length, 3);
  assert.equal((html.match(/class="gr-money"/g) || []).length, 1);
  assert.match(html, /40% \$/);
  s.splitsFor = () => null;
  const none = s.gameReportHTML('nfl', nflGame, nflPred, { hML: -410, aML: 320 }, { splits: { ok: true, games: [] } });
  assert.match(none, /no spread posted/); assert.match(none, /no total posted/);
  assert.match(none, /No DK splits posted/);
});
test('movement sits under the book number for each market', () => {
  const s = load();
  s.lineMoves = () => ({ first: { hML: -380, aML: 300, ou: 51.5, sp: -7, t: 1 }, last: { hML: -410, aML: 320, ou: 52.5, sp: -7.5 }, src: 'device' });
  const html = s.gameReportHTML('nfl', nflGame, nflPred, nflOdds);
  assert.match(html, /gr-mv">-380 → -410/);
  assert.match(html, /gr-mv">-7\.0 → -7\.5/);
  assert.match(html, /gr-mv">51\.5 → 52\.5/);
});

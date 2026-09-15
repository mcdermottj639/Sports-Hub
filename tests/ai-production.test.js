'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const AI_MATH = require('../ai-model-utils.js');
const NFL_FIT = require('../nfl-model.js');
function load() {
  const storage = new Map();
  const s = vm.createContext({ AI_MATH, NFL_FIT, Date, console,
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), logistic: (z) => 1 / (1 + Math.exp(-z)),
    esc: (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    ymd: (d) => d.toISOString().slice(0, 10).replace(/-/g, ''),
    gameState: (g) => g.state === 'post' ? 'final' : g.state === 'in' ? 'live' : 'scheduled',
    winnerName: (g) => g.home.score === g.away.score ? 'TIE' : g.home.score > g.away.score ? g.home.name : g.away.name,
    matchupLabel: (sport, g) => `${g.away.name} @ ${g.home.name}`,
    getGames: async () => [], sharpSplit: () => null, lineAtLabel: () => '',
    LEAGUES: { nfl: { label: 'NFL' }, cfb: { label: 'CFB' }, mlb: { label: 'MLB' } },
  });
  for (const name of ['APP_VERSION', 'AI_MODEL_VERSION', 'PD_SCALE', 'HR_GAP', 'MODEL_W', 'MODEL_SHRINK', 'CONF_CAP', 'MLB_SP_ERA', 'SP_ERA_PRIOR_IP', 'PARK_WEIGHT', 'MLB_PARK', 'PD_SD', 'CFB_TIER_PTS', 'CFB_MARGIN_K', 'CFB_HFA', 'CFB_FORM_K', 'CFB_SHARP_PTS', 'CFB_P4_RE', 'CFB_ND_RE', 'ATS_SPORTS', 'ATS_EDGE_MIN', 'TOT_EDGE_MIN', 'TOT_MAX_DIFF', 'EDGE_BAR', 'ALERT_DOG_ML', 'TALLY_KEY', 'PENDING_KEY', 'getTally', 'getPending', 'setPending', 'stOf', 'impliedP', 'fmtML']) {
    const at = source.indexOf(`const ${name} =`);
    assert.ok(at >= 0, name);
    // Compile candidates so a semicolon in a comment or nested try block
    // cannot truncate a production declaration.
    let end = at, script;
    while (!script) {
      end = source.indexOf(';', end + 1);
      assert.ok(end > at && end - at < 10000, name);
      try { script = new vm.Script(source.slice(at, end + 1)); } catch (_) {}
    }
    script.runInContext(s);
  }
  for (const name of ['statVal', 'shrinkERA', 'cfbTierFromName', 'cfbRating', 'normCdf', 'invNorm', 'projMarginFor', 'predictGame', 'normOdds', 'marketHomeProb', 'pickedPrice', 'pickTier', 'marketGap', 'atsRead', 'atsCall', 'totalRead', 'recordResult', 'recordPick', 'recordAtsPick', 'recordTotalPick', 'atsResult', 'gradePending', 'tallyStats', 'pickSnapshot', 'commitRow', 'slateDateFor', 'savedPickForGame', 'comparisonGraphic', 'moneylineValuesHTML', 'marketRowsHTML']) {
    const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
    assert.ok(match, name); vm.runInContext(match[0], s);
  }
  return s;
}
const profile = { winPct: 0.6, pdpg: 7, form: 3, homeWP: 0.6, roadWP: 0.6, homeGP: 20, roadGP: 20, ppg: 24, papg: 20, lastDate: '2026-09-01' };
const game = () => ({ id: 'fixture', state: 'pre', date: new Date(Date.now() + 86400000).toISOString(), seasonType: 2, home: { id: 'h', name: 'Home', abbr: 'HOM' }, away: { id: 'a', name: 'Away', abbr: 'AWY' } });
const prediction = { winner: { name: 'Home' }, homePick: true, probHome: 0.65, conf: 65, projMargin: 7, projTotal: 47, blockedReasons: [] };
test('model explainer documents actual-price and two-quote requirements', () => {
  const s = load();
  s.el = () => ({ innerHTML: '', addEventListener: () => {} });
  s.sortedSports = () => ['nfl']; s.lgLabel = () => 'NFL';
  s.MODEL_NOTES = {}; s.THIN_N = 10;
  const fn = source.match(/^function modelPanel\([^]*?^}/m);
  assert.ok(fn); vm.runInContext(fn[0], s);
  const html = s.modelPanel(null).innerHTML;
  assert.match(html, /Both moneyline quotes/);
  assert.match(html, /positive expected value at the actual price/);
  assert.match(html, /lean <b>2–4<\/b>/);
  assert.match(html, /largest gap/);
  assert.doesNotMatch(html, /best bet/i);
});
test('league navigation clears stale cards before awaiting the next board', async () => {
  const container = { innerHTML: 'Old MLB cards' };
  const s = vm.createContext({ state: { aiSport: 'cfb', aiSub: 'board' }, aiViewToken: 0,
    $: (selector) => selector === '#ai-picks' ? container : null,
    LEAGUES: { cfb: { label: 'CFB' } }, esc: String,
    renderAiTally: () => {}, paintSportBoard: async () => 'loaded',
  });
  const fn = source.match(/^async function paintAiView\([^]*?^}/m);
  assert.ok(fn); vm.runInContext(fn[0], s);
  const painting = s.paintAiView();
  assert.match(container.innerHTML, /Loading CFB forecasts/);
  assert.doesNotMatch(container.innerHTML, /Old MLB/);
  assert.equal(await painting, 'loaded');
});
test('production odds preserve pick-em and do not turn missing spread into zero', () => {
  const s = load();
  assert.equal(s.normOdds({ spread: 0 }, 'Home', 'Away').spread, 0);
  assert.equal(s.normOdds({ overUnder: 40 }, 'Home', 'Away').spread, null);
  assert.equal(s.normOdds({ homeTeamOdds: { moneyLine: '-150' }, awayTeamOdds: { moneyLine: '130' } }, 'Home', 'Away').hML, -150);
});
test('missing conference team is unknown, not automatically FCS', async () => {
  const s = load(); s.cfbFpi = async () => ({ ok: false });
  s.cfbConfMap = async () => ({ ok: true, byId: new Map(), byName: new Map() });
  const r = await s.cfbRating({ id: 'missing', name: 'Unknown Team' }, null);
  assert.equal(r.tier, null); assert.equal(r.src, 'unknown'); assert.equal(r.r, 0);
});
test('CFB explicit FCS names and P4 conferences keep their proper priors', () => {
  const s = load();
  assert.equal(s.cfbTierFromName('Football Championship Subdivision', 'Example'), 'fcs');
  assert.equal(s.cfbTierFromName('Southeastern Conference', 'Example'), 'p4');
});
test('CFB neutral site removes exactly the home-field points', async () => {
  const s = load(); s.teamProfile = async () => profile;
  s.matchupFactor = async () => ({ factors: [], notes: [] });
  s.cfbRating = async () => ({ r: 12, tier: 'p4', src: 'tier' });
  const home = await s.predictGame('cfb', game());
  const neutral = await s.predictGame('cfb', { ...game(), neutralSite: true });
  assert.equal(home.projMargin - neutral.projMargin, 3);
  assert.ok(Math.abs(neutral.probHome - 0.5) < 1e-7);
});
test('CFB probability cap also governs value math without capping margin', async () => {
  const s = load(); s.teamProfile = async () => profile;
  s.matchupFactor = async () => ({ factors: [], notes: [] });
  s.cfbRating = async (t) => ({ r: t.id === 'h' ? 75 : 0, tier: 'p4', src: 'tier' });
  const p = await s.predictGame('cfb', game());
  assert.equal(p.conf, 90); assert.equal(p.probHome, 0.9); assert.ok(p.projMargin > 70);
});
test('MLB missing starter data blocks signals while retaining forecasts', async () => {
  const s = load(); s.teamProfile = async () => profile;
  s.matchupFactor = async () => ({ factors: [], notes: [], starters: null });
  const p = await s.predictGame('mlb', game());
  assert.ok(p.winner); assert.ok(p.blockedReasons.length);
  assert.equal(s.totalRead('mlb', { ...p, projTotal: 10 }, { ou: 8 }).qualifies, false);
});
test('ERA shrink uses outs and no longer invents innings from decisions', () => {
  const s = load();
  assert.equal(s.shrinkERA(8, [{ abbreviation: 'W', displayValue: '10' }]), 4.3);
  assert.equal(s.statVal([{ abbreviation: 'ERA', displayValue: '' }], ['ERA']), null);
  assert.equal(s.statVal([{ name: 'WHIP', abbreviation: 'WHIP', displayValue: '1.2' }], ['IP', 'inningsPitched']), null);
  const actual = s.shrinkERA(8, [{ abbreviation: 'IP', displayValue: '12.2' }]);
  assert.equal(actual, Math.round(((12 + 2 / 3) * 8 + 60 * 4.3) / (72 + 2 / 3) * 100) / 100);
});
test('moneyline tiers require positive actual-price EV and usable data', () => {
  const s = load();
  assert.equal(s.pickTier(prediction, { hML: -150, aML: 130 }, 6), 'edge');
  assert.equal(s.pickTier(prediction, { hML: -300 }, 6), null);
  assert.equal(s.pickTier({ ...prediction, blockedReasons: ['missing'] }, { hML: -150 }, 6), null);
});
test('integer pushes and half-point covers are distinct', () => {
  const s = load(), g = { home: { score: 24 }, away: { score: 21 } };
  assert.equal(s.atsResult(g, -3, true), null);
  assert.equal(s.atsResult(g, -2.5, true), true);
  assert.equal(s.atsResult(g, -3.5, true), false);
});
test('first pregame snapshot is immutable; markets coexist without collisions', () => {
  const s = load(), g = game();
  const r = { g, sport: 'nfl', p: prediction, info: { hML: -150, aML: 130 }, tier: 'edge', gap: 6,
    tot: { side: 'OVER', line: 43.5, proj: 47, tier: 'edge' }, ats: { home: true, label: 'HOM -3', homeSpread: -3, proj: 7 } };
  s.commitRow(r, '20260920');
  const before = s.localStorage.getItem('sportshub:pending');
  s.commitRow({ ...r, p: { ...prediction, conf: 80 }, shLive: true }, '20260920', { upgrade: true });
  assert.equal(s.localStorage.getItem('sportshub:pending'), before);
  const rows = JSON.parse(before);
  assert.deepEqual(Object.keys(rows).sort(), ['fixture', 'fixture:s', 'fixture:t']);
  assert.equal(rows.fixture.q.price, -150); assert.equal(rows['fixture:s'].q.price, null);
  assert.equal(rows.fixture.q.v, source.match(/AI_MODEL_VERSION = '([^']+)'/)[1]);
  assert.equal(rows.fixture.q.app, source.match(/APP_VERSION = '([^']+)'/)[1]);
});
test('saved results fall back to exact sport, date and matchup metadata', () => {
  const s = load(), g = game();
  const date = Number(s.slateDateFor(g));
  const saved = {
    'legacy-key': { s: 'nfl', d: date, p: 'Home', m: 'Away @ Home', c: 1 },
    'legacy-spread': { s: 'nfl', d: date, p: 'HOM -3', m: 'Away @ Home', c: 0, a: 1 },
  };
  assert.equal(s.savedPickForGame(saved, g, 'nfl'), saved['legacy-key']);
  assert.equal(s.savedPickForGame(saved, g, 'nfl', 'spread'), saved['legacy-spread']);
  assert.equal(s.savedPickForGame(saved, g, 'nfl', 'total'), null);
});
test('live, expired cached pregame and final views cannot manufacture a record', () => {
  const s = load();
  for (const change of [{ state: 'in' }, { state: 'post' }, { date: new Date(Date.now() - 1).toISOString() }]) s.commitRow({ g: { ...game(), ...change }, p: prediction, sport: 'nfl' }, '20260920');
  assert.equal(s.localStorage.getItem('sportshub:pending'), null);
  assert.equal(s.localStorage.getItem('sportshub:aitally'), null);
});
test('deferred grading preserves snapshot and keeps spread/total pushes out of losses', async () => {
  const s = load(); const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const q = { v: 'v232', at: new Date(Date.now() - 3600000).toISOString(), start: new Date(Date.now() - 1800000).toISOString(), price: -110 };
  s.recordAtsPick('fixture', 'nfl', date, { label: 'HOM -3', home: true, homeSpread: -3, proj: 7 }, 'AWY @ HOM', 2, q);
  s.recordTotalPick('fixture', 'nfl', date, 'OVER', 45, 50, 'edge', 'AWY @ HOM', 2, q);
  s.getGames = async () => [{ ...game(), state: 'post', home: { name: 'Home', score: 24 }, away: { name: 'Away', score: 21 } }];
  await s.gradePending(); const t = JSON.parse(s.localStorage.getItem('sportshub:aitally'));
  assert.equal(t['fixture:s'].pu, 1); assert.equal(t['fixture:t'].pu, 1);
  assert.equal(t['fixture:s'].q.finalHome, 24); assert.equal(t['fixture:s'].q.at, q.at);
  assert.equal(s.tallyStats('nfl').an, 0); assert.equal(s.tallyStats('nfl').tn, 0);
});
test('market graphics name the projected winner, not the side taking points', () => {
  const s = load(), g = game();
  const info = { hML: -150, aML: 130, spread: -10, ou: 43.5 };
  const atsR = s.atsRead('nfl', g, prediction, info);
  const html = s.marketRowsHTML({ g, sport: 'nfl', p: prediction, info, atsR, totR: s.totalRead('nfl', prediction, info) });
  assert.match(html, /AWY \+10/); assert.match(html, /Projected winner: HOM by 7.0/);
  assert.match(html, /Compare both moneyline prices/); assert.match(html, /role="img"/);
  assert.doesNotMatch(html, /NaN|undefined|guaranteed/i);
});
test('MLB starter enrichment reads pitching only and preserves scoreboard fallback', async () => {
  const s = load();
  vm.runInContext("const BBCORE = 'https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb';", s);
  vm.runInContext(source.match(/^async function starterSeasonStats\([^]*?^}/m)[0], s);
  s.safeJSON = async () => ({ splits: { categories: [
    { name: 'fielding', stats: [{ name: 'catcherERA', value: 0 }] },
    { name: 'pitching', stats: [{ abbreviation: 'IP', name: 'innings', displayValue: '99.1' }, { abbreviation: 'WHIP', displayValue: '1.24' }] },
  ] } });
  const stats = await s.starterSeasonStats({ athlete: { id: '42604' }, statistics: [{ abbreviation: 'ERA', displayValue: '3.99' }] }, '2026-09-20');
  assert.equal(s.statVal(stats, ['IP']), 99.1); assert.equal(s.statVal(stats, ['ERA']), 3.99);
  assert.equal(s.statVal(stats, ['WHIP']), 1.24);
});
test('grading cannot discard picks added while final scores load', async () => {
  const s = load(), date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  s.recordPick('fixture', 'nfl', date, 'Home', null, 65, false);
  s.getGames = async () => {
    s.recordPick('new-game', 'mlb', date, 'Other', null, 60, false);
    return [{ ...game(), state: 'post', home: { name: 'Home', score: 24 }, away: { name: 'Away', score: 21 } }];
  };
  await s.gradePending();
  const pending = JSON.parse(s.localStorage.getItem('sportshub:pending'));
  assert.ok(pending['new-game']); assert.equal(pending.fixture, undefined);
});

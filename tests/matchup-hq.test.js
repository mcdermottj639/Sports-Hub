'use strict';
// Matchup HQ model checks against the real Week 7 2026 snapshot (Death Dont
// Hurts Very Long vs Pepperoni TDs, read Fri 23 Oct 2026 3:15 PM ET).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const HQ = require('../matchup-hq.js');
const M = HQ.model;
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'matchup-hq-week7.json'), 'utf8'));
const players = () => M.buildPlayers(fx.L, fx.games);
const score = { me: 36.2, opp: 0 };
const teams = fx.L.season.teams;

test('buildPlayers reads both rosters with slots, game context and lines', () => {
  const p = players();
  assert.equal(p.filter((x) => x.side === 'me').length, 17);
  assert.equal(p.filter((x) => x.side === 'opp').length, 17);
  const maye = p.find((x) => x.player === 'Drake Maye');
  assert.equal(maye.slot, 'QB'); assert.equal(maye.starter, true); assert.equal(maye.played, true); assert.equal(maye.points, 26.6);
  const likely = p.find((x) => x.player === 'Isaiah Likely');
  assert.equal(likely.slot, 'FLEX'); assert.equal(likely.pos, 'TE'); assert.equal(likely.played, false);
  const knight = p.find((x) => x.player === 'Bam Knight');
  assert.equal(knight.game, 'DEN @ ARI'); assert.equal(knight.vs, 'vs DEN'); assert.equal(knight.window, 'Sun 4:05');
  assert.equal(knight.implied, 19.5); assert.equal(knight.spread, 4.5); assert.equal(knight.gameTotal, 43.5);
  const dst = p.find((x) => x.player === 'Broncos D/ST');
  assert.equal(dst.pos, 'D/ST'); assert.equal(dst.oppImplied, 19.5);
  const little = p.find((x) => x.player === 'Cam Little');
  assert.equal(little.bye, true); assert.equal(little.bench, true);
  const pittman = p.find((x) => x.player === 'Michael Pittman Jr.');
  assert.equal(pittman.starter, false); assert.equal(pittman.bench, false); assert.equal(pittman.injury, 'IR');
});

test('outlook: banked + remaining projections, win chance and P10/P90', () => {
  const o = M.outlook(players(), score, teams);
  assert.equal(o.me.banked, 36.2); assert.equal(o.me.remaining, 57.55); assert.equal(o.me.projFinal, 93.75); assert.equal(o.me.left, 6);
  assert.equal(o.opp.projFinal, 95.88); assert.equal(o.opp.left, 9);
  assert.equal(o.me.leagueSd, 19.06);
  assert.equal(o.me.winPct, 46.5); assert.equal(o.opp.winPct, 53.5);
  assert.equal(o.me.margin, -2.13);
  assert.equal(o.me.p10, 75); assert.equal(o.me.p90, 112.5);
  assert.equal(o.opp.p10, 71.5); assert.equal(o.opp.p90, 120.3);
});

test('outlook: a scenario override moves the win chance, and nothing without it', () => {
  const base = M.outlook(players(), score, teams);
  const o = M.outlook(players(), score, teams, { 'Christian McCaffrey': 30 });
  assert.equal(o.opp.projFinal, 106.6); assert.equal(o.me.projFinal, base.me.projFinal);
  assert.equal(o.me.winPct, 29.6);
  // A played player cannot be overridden: his points are final.
  const o2 = M.outlook(players(), score, teams, { 'Drake Maye': 60 });
  assert.equal(o2.me.projFinal, base.me.projFinal);
});

test('outlook: no projections yet means banked points only and no NaN', () => {
  const p = players().map((x) => Object.assign({}, x, { proj: 0 }));
  const o = M.outlook(p, { me: 0, opp: 0 }, teams);
  assert.equal(o.me.projFinal, 0); assert.ok(Number.isFinite(o.me.winPct)); assert.equal(o.me.winPct, 50);
  const o3 = M.outlook(p, { me: 10, opp: 0 }, []);
  assert.equal(o3.me.winPct, 100);
});

test('edges pair each slot and point the bar at the leader', () => {
  const e = M.edges(players());
  const qb = e.find((r) => r.slot === 'QB');
  assert.equal(qb.mine, 'Drake Maye'); assert.equal(qb.mineVal, 26.6); assert.equal(qb.theirs, 'Jordan Love'); assert.equal(qb.theirsVal, 19.42); assert.equal(qb.edge, 7.18);
  assert.ok(e.some((r) => r.slot === 'RB1') && e.some((r) => r.slot === 'RB2') && e.some((r) => r.slot === 'WR1'));
  const fl = e.find((r) => r.slot === 'FLEX');
  assert.equal(fl.theirs, 'Christian McCaffrey'); assert.equal(fl.edge, -7.79);
});

test('stacks and drivers name the DEN @ ARI concentration and both anchors', () => {
  const st = M.stacks(players());
  assert.equal(st[0].game, 'DEN @ ARI'); assert.equal(st[0].count, 4); assert.equal(st[0].share, 64);
  const d = M.drivers(players()).map((x) => x.key);
  assert.deepEqual(d.slice(0, 4), ['theirAnchor', 'myAnchor', 'stack', 'theirLowTotal']);
  assert.ok(!d.includes('injury'), 'every remaining starter is listed active in the fixture');
});

test('benchCompare: no upgrade, bye and IR players never offered', () => {
  const b = M.benchCompare(players());
  assert.equal(b.length, 6);
  assert.ok(b.every((r) => r.change == null || r.change <= 0));
  const k = b.find((r) => r.slot === 'K');
  assert.equal(k.alt, null, 'Cam Little is on bye and must not be offered');
  const wr = b.find((r) => r.slot === 'WR');
  assert.equal(wr.alt, 'Malik Washington'); assert.equal(wr.change, -1.81);
  assert.ok(!b.some((r) => r.alt === 'Michael Pittman Jr.'));
});

test('weekly and consistency read the season table', () => {
  const w = M.weekly(teams, 'Death Dont Hurts Very Long', 'Pepperoni TDs');
  assert.equal(w.length, 6); assert.equal(w[4].me, 125.1); assert.equal(w[5].opp, 97.9); assert.equal(w[0].leagueAvg, 111.4);
  const c = M.consistency(teams, 'Death Dont Hurts Very Long', 'Pepperoni TDs');
  assert.deepEqual([c.me.p10, c.me.p50, c.me.p90], [63.9, 80.6, 108.1]);
  assert.deepEqual([c.opp.p10, c.opp.p50, c.opp.p90], [73.9, 88.8, 94.1]);
  assert.equal(c.me.last3, 101.4);
});

test('parseGamelog + usage read ESPN game-log stats by column name', () => {
  const rows = M.parseGamelog(fx.gamelogMcBride);
  assert.equal(rows.length, 6); assert.equal(rows[0].week, 1); assert.equal(rows[0].targets, 13); assert.equal(rows[0].recYds, 95); assert.equal(rows[0].td, 1);
  const u = M.usage(rows);
  assert.equal(u.qb, false); assert.equal(u.touchesAvg, 10.8); assert.equal(u.touchesLast3, 10.3); assert.equal(u.ydsAvg, 60.2); assert.equal(u.tdTotal, 3);
  assert.equal(M.usage([]), null);
  assert.deepEqual(M.parseGamelog(null), []);
});

test('rivalry reads League History PAIRS from either orientation', () => {
  const stats = { PAIRS: [{ a: 'Hyman', b: 'McD', aw: 1, bw: 5, games: [
    { yr: 2025, kind: 'fin', rd: 'FINAL', xs: 107.28, ys: 124.04, xt: 'Cheeky_Clapz', yt: 'JMcD6' },
    { yr: 2017, kind: 'plc', rd: '', xs: 111.6, ys: 93.4, xt: "Pepperoni TD's", yt: 'The Great Wentz' }] }] };
  const r = M.rivalry(stats, 'McD', 'Hyman');
  assert.equal(r.aWins, 1); assert.equal(r.bWins, 1);
  assert.equal(r.games[0].year, 2025); assert.equal(r.games[0].aScore, 124.04); assert.equal(r.games[0].winner, 'McD');
  assert.equal(M.roundLabel('fin'), 'Championship');
  assert.deepEqual(M.rivalry(stats, 'McD', 'Nobody').games, []);
});

test('parseLine handles favourite strings, pick-ems and missing odds', () => {
  const g = { home: { abbr: 'ARI' }, away: { abbr: 'DEN' }, odds: { details: 'DEN -4.5', overUnder: 43.5 } };
  const l = M.parseLine(g);
  assert.equal(l.spread.DEN, -4.5); assert.equal(l.spread.ARI, 4.5); assert.equal(l.implied.DEN, 24); assert.equal(l.implied.ARI, 19.5);
  assert.equal(M.parseLine({ home: { abbr: 'A' }, away: { abbr: 'B' }, odds: null }), null);
  const pk = M.parseLine({ home: { abbr: 'A' }, away: { abbr: 'B' }, odds: { details: 'EVEN', overUnder: 40 } });
  assert.equal(pk.implied.A, 20);
  const bad = M.parseLine({ home: { abbr: 'A' }, away: { abbr: 'B' }, odds: { details: 'XYZ -3', overUnder: 40 } });
  assert.equal(bad.implied.A, null);
});

test('release wiring: script tag, version and service worker agree', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const v = app.match(/const APP_VERSION = 'v(\d+)'/)[1];
  assert.match(html, new RegExp(`matchup-hq\\.js\\?v=${v}`));
  assert.ok(html.indexOf('<script src="matchup-hq.js') < html.indexOf('<script src="app.js'));
  assert.match(app, /footballView === 'hq' \? renderMatchupHQ\(\)/);
  assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /\.mhq \{/);
});

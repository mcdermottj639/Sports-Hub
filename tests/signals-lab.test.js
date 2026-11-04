'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../signals-lab.js');
const L = globalThis.SportsHubSignalsLab._pure;

const g = (o) => ({ week: 1, away: { team: 'AAA', signals: [] }, home: { team: 'BBB', signals: [] }, spreadAway: 3, awayScore: 20, homeScore: 21, ...o });

test('grade: away covers, home covers, push', () => {
  assert.deepEqual(L.grade(g()), { away: 'W', home: 'L' });                       // 20-21 with +3 → away covers
  assert.deepEqual(L.grade(g({ awayScore: 10 })), { away: 'L', home: 'W' });
  assert.deepEqual(L.grade(g({ spreadAway: 1 })), { away: 'P', home: 'P' });
  assert.equal(L.grade(g({ awayScore: null })), null);
});

test('record and summarize count only the side a signal sits on, pushes excluded', () => {
  const games = [
    g({ away: { team: 'A', signals: ['S'] }, home: { team: 'B', signals: ['B'] } }),               // away covers → S W, B L
    g({ away: { team: 'C', signals: ['S', 'Y'] }, home: { team: 'D', signals: [] }, awayScore: 10 }), // home covers → S L, Y L
    g({ away: { team: 'E', signals: ['S'] }, home: { team: 'F', signals: [] }, spreadAway: 1 }),      // push
  ];
  const s = L.summarize(games);
  assert.equal(s.graded, 3);
  assert.equal(s.bySig.S.all.text, '1-1-1');
  assert.equal(s.bySig.S.all.pct, 50);
  assert.equal(s.bySig.S.alone.text, '1-0-1');
  assert.equal(s.bySig.B.all.text, '0-1');
  assert.equal(s.bySig.B.fade.text, '1-0');
  assert.equal(s.bySig.Y.all.text, '0-1');
  assert.equal(s.pairs.find((p) => p.a === 'S' && p.b === 'Y').rec.text, '0-1');
  // head to head: S on one side, B on the other → S side 1-0
  assert.equal(s.h2h.find((h) => h.a === 'S' && h.b === 'B').rec.text, '1-0');
  assert.equal(s.moreSide.text, '0-1-1');   // game 2 (C side, 2 sigs vs 0) lost; game 3 (E, 1 vs 0) pushed
  assert.equal(s.byWeek.length, 1);
});

test('sharp move buckets and strength use only sides carrying a count', () => {
  const games = [
    g({ away: { team: 'A', signals: ['S'], sharpMoves: 7, sharpStrength: 'Strong' }, home: { team: 'B', signals: [] } }),
    g({ away: { team: 'C', signals: ['S'] }, home: { team: 'D', signals: [] } }),
  ];
  const s = L.summarize(games);
  assert.deepEqual(s.moveBuckets.map((b) => [b.label, b.rec.text]), [['6+ moves', '1-0']]);
  assert.deepEqual(s.strength.map((b) => [b.label, b.rec.text]), [['Sharp "Strong"', '1-0']]);
});

test('parseEntry validates and attaches sharp moves only to the sharp side', () => {
  const ok = L.parseEntry({ week: '9', away: 'phi', home: 'gb', spreadAway: '+2.5', awaySignals: ['S', 'E'], homeSignals: ['B'], sharpMoves: '4', sharpSide: 'away', sharpStrength: 'Strong', awayScore: '', homeScore: '' });
  assert.equal(ok.error, undefined);
  assert.equal(ok.game.away.team, 'PHI');
  assert.deepEqual(ok.game.away.signals, ['S', 'E']);
  assert.equal(ok.game.away.sharpMoves, 4);
  assert.equal(ok.game.away.sharpStrength, 'Strong');
  assert.equal(ok.game.awayScore, null);
  assert.equal(L.grade(ok.game), null);
  const noSharp = L.parseEntry({ week: '9', away: 'PHI', home: 'GB', spreadAway: '2.5', awaySignals: [], homeSignals: [], sharpMoves: '4', sharpSide: 'home' });
  assert.equal(noSharp.game.home.sharpMoves, undefined);
  assert.match(L.parseEntry({ week: '9', away: 'PHI', home: 'PHI', spreadAway: '2.5' }).error, /different/);
  assert.match(L.parseEntry({ week: '0', away: 'PHI', home: 'GB', spreadAway: '2.5' }).error, /Week/);
  assert.match(L.parseEntry({ week: '9', away: 'PHI', home: 'GB', spreadAway: 'x' }).error, /spread/);
  assert.match(L.parseEntry({ week: '9', away: 'PHI', home: 'GB', spreadAway: '2.5', awayScore: '1.5' }).error, /whole/);
});

test('fillScores matches completed ESPN events, including JAX/LAR/WSH aliases', () => {
  const games = [
    { week: 9, away: { team: 'JAC', signals: [] }, home: { team: 'BAL', signals: [] }, spreadAway: 3 },
    { week: 9, away: { team: 'LA', signals: [] }, home: { team: 'WAS', signals: [] }, spreadAway: -3, awayScore: 1, homeScore: 2 },
    { week: 9, away: { team: 'MIA', signals: [] }, home: { team: 'NE', signals: [] }, spreadAway: 7 },
  ];
  const ev = (a, h, as, hs, done = true) => ({ competitions: [{ status: { type: { completed: done } }, competitors: [
    { homeAway: 'home', team: { abbreviation: h }, score: String(hs) }, { homeAway: 'away', team: { abbreviation: a }, score: String(as) }] }] });
  const n = L.fillScores(games, [ev('JAX', 'BAL', 17, 24), ev('LAR', 'WSH', 30, 10), ev('MIA', 'NE', 3, 7, false)]);
  assert.equal(n, 1);
  assert.deepEqual([games[0].awayScore, games[0].homeScore], [17, 24]);
  assert.deepEqual([games[1].awayScore, games[1].homeScore], [1, 2]); // already scored, untouched
  assert.equal(games[2].awayScore, undefined);                        // not completed
});

test('seed data: 116 games, every row grades, headline records match the Nov 4 review', () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'an-signals.json'), 'utf8'));
  assert.equal(seed.games.length, 116);
  for (const row of seed.games) {
    assert.ok(L.grade(row), `${row.away.team}@${row.home.team} wk${row.week} grades`);
    for (const s of [row.away, row.home]) for (const k of s.signals) assert.ok(L.KEYS.includes(k), `signal ${k}`);
  }
  const s = L.summarize(seed.games);
  assert.equal(s.graded, 116);
  assert.equal(s.bySig.B.all.text, '25-27-2');
  assert.equal(s.bySig.S.all.text, '41-44-2');
  assert.equal(s.bySig.Y.all.text, '18-14-1');
  assert.equal(s.bySig.P.all.text, '9-16-1');
  assert.equal(s.bySig.E.all.text, '44-44-1');
  assert.equal(s.bySig.S.alone.text, '14-25-1');
  assert.equal(s.moreSide.text, '39-52-2');
  assert.equal(s.h2h.find((h) => h.a === 'B' && h.b === 'S').rec.text, '9-9-2');
  assert.equal(s.byCount.find((c) => c.n === 0).rec.text, '33-21-1');
});

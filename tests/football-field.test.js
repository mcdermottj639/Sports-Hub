'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../football-field.js');

// Real ESPN situations from 1 Nov 2026 (yardLine = yards from the HOME goal line).
const NYJ = { id: '20', abbr: 'NYJ', color: '115740' }, LV = { id: '13', abbr: 'LV', color: '000000' };
const DET = { id: '8', abbr: 'DET', color: '0076b6' }, MIN = { id: '16', abbr: 'MIN', color: '4f2683' };
const JAX = { id: '30', abbr: 'JAX', color: '007487' }, IND = { id: '11', abbr: 'IND', color: '003b75' };

test('away offense: LV ball at LV 16 sits near the LEFT (away) end, going right, line to gain LV 26', () => {
  const m = F.build({ home: NYJ, away: LV, situation: { yardLine: 84, down: 1, distance: 10, possession: '13', possessionText: 'LV 16', shortDownDistanceText: '1st & 10', downDistanceText: '1st & 10 at LV 16' }, winHome: 0.572 });
  assert.equal(m.ballX, 16);
  assert.equal(m.dir, 1);
  assert.equal(m.gainX, 26);
  assert.equal(m.possAbbr, 'LV');
  assert.equal(m.downText, '1st & 10');
  assert.deepEqual(m.win, { home: 57, away: 43 });
  assert.match(F.fullHTML(m), /aria-label="Field: LV ball at LV 16 going right"/);
});

test('home offense: DET ball at DET 35 is 35 yards from the RIGHT (home) end, going left', () => {
  const m = F.build({ home: DET, away: MIN, situation: { yardLine: 35, down: 1, distance: 10, possession: '8', possessionText: 'DET 35' } });
  assert.equal(m.ballX, 65);
  assert.equal(m.dir, -1);
  assert.equal(m.gainX, 55);
});

test('goal to go puts the line to gain on the goal line and shades the red zone being attacked', () => {
  const m = F.build({ home: JAX, away: IND, situation: { yardLine: 4, down: 2, distance: 4, possession: '11', possessionText: 'JAX 4', isRedZone: true, shortDownDistanceText: '2nd & Goal', downDistanceText: '2nd & Goal at JAX 4' } });
  assert.equal(m.ballX, 96);
  assert.equal(m.gainX, 100);
  assert.equal(m.goal, true);
  assert.equal(m.redZone, true);
  assert.match(F.fullHTML(m), /Goal line/);
  assert.match(F.fullHTML(m), /x="256\.4"[^>]*fill="#d9363e"/); // red zone on the right (home) end
});

test('between plays (kickoff, timeout): no down, no line to gain, says so', () => {
  const m = F.build({ home: { id: '2', abbr: 'BUF' }, away: { id: '33', abbr: 'BAL' }, situation: { yardLine: 65, down: -1, distance: 0, possession: '33', isRedZone: true }, lastPlay: 'Official Timeout at 11:28.' });
  assert.equal(m.downText, 'Between plays');
  assert.equal(m.gainX, null);
  assert.equal(m.ballX, 35);
  assert.match(F.fullHTML(m), /Official Timeout/);
});

test('drives: finished drive reads "Last drive · Field goal"; open drive reads "This drive"', () => {
  const done = F.build({ home: { id: '2', abbr: 'BUF' }, away: { id: '33', abbr: 'BAL' }, situation: { yardLine: 65, down: -1 }, drive: { startYL: 69, endYL: 8, description: '8 plays, 61 yards, 3:32', result: 'FG' } });
  assert.equal(done.drive.label, 'Last drive · Field goal');
  assert.equal(done.drive.description, '8 plays, 61 yds');
  assert.equal(done.drive.fromX, 31);
  assert.equal(done.drive.toX, 92);
  const open = F.build({ home: NYJ, away: LV, situation: { yardLine: 71, down: 1, distance: 10, possession: '13' }, drive: { startYL: 84, description: '1 play, 13 yards' } });
  assert.equal(open.drive.label, 'This drive');
  assert.equal(open.drive.toX, 29);
});

test('compact strip and win line; no possession id -> no direction and no invented team', () => {
  const m = F.build({ home: NYJ, away: LV, situation: { yardLine: 84, down: 1, distance: 10, possession: '13', possessionText: 'LV 16', shortDownDistanceText: '1st & 10' }, winHome: 0.572, model: { abbr: 'NYJ', pct: 60.3 } });
  const h = F.stripHTML(m);
  assert.match(h, /LV ball · 1st &amp; 10 at LV 16/);
  assert.match(h, /Live win \(ESPN\) NYJ 57%/);
  assert.match(h, /Model pregame NYJ 60%/);
  assert.doesNotMatch(h, /<div/); // lives inside a <button>
  const anon = F.build({ home: NYJ, away: LV, situation: { yardLine: 50, down: 1, distance: 10 } });
  assert.equal(anon.dir, 0);
  assert.equal(anon.possAbbr, null);
  assert.equal(anon.gainX, null);
  assert.equal(F.build({}), null);
  assert.equal(F.build({ home: NYJ, away: LV, situation: { yardLine: 50 }, winHome: 1.4 }).win, null);
});

test('team names and colors are escaped / validated', () => {
  const m = F.build({ home: { id: '1', abbr: '<x>', color: 'red;url(x)' }, away: { id: '2', abbr: 'A' }, situation: { yardLine: 50, down: 1, distance: 10, possession: '1' } });
  assert.equal(m.home.color, '#3b4a47');
  assert.doesNotMatch(F.fullHTML(m), /<x>/);
});

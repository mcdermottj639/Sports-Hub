'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
  const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
  const start = source.indexOf('const FB_CORE =');
  const end = source.indexOf('\nasync function renderFootballLive', start);
  assert.ok(start >= 0 && end > start, 'GM engine source must be discoverable');
  const sandbox = {
    esc: (x) => String(x ?? '').replace(/&/g, '&').replace(/</g, '<').replace(/"/g, '"'),
    nflBucket: (p) => String((p && p.pos) || '').toUpperCase(),
    isReserve: (p) => (p && p.status) === 'il',
    isBenched: (p) => (p && p.status) === 'bench',
    fbWeeks: (p) => Array.isArray(p && p.weeks) ? p.weeks : [],
    fbTrend: () => null,
    fbMatchupBadge: () => '',
  };
  vm.runInNewContext(
    `${source.slice(start, end)}; this.FB_CORE = FB_CORE; this.FB_FLEX = FB_FLEX; this.fbRules = fbRules; this.fbCanReplace = fbCanReplace; this.fbAcquisitionLabel = fbAcquisitionLabel; this.fbValueLabel = fbValueLabel; this.fbValue = fbValue; this.fbNeeds = fbNeeds; this.fbPickWaivers = fbPickWaivers; this.fbPairDrop = fbPairDrop; this.fbGMHTML = fbGMHTML;`,
    sandbox,
  );
  return sandbox;
}

const p = (name, pos, avg, extra = {}) => ({ name, pos, avg, status: extra.status || 'active', owned: extra.owned ?? 20, ...extra });

test('waiver plan keeps at most one QB and fills the rest with flex', () => {
  const s = load();
  const roster = [
    p('My QB', 'QB', 18),
    p('RB1', 'RB', 16), p('RB2', 'RB', 12), p('RB3', 'RB', 8, { status: 'bench' }),
    p('WR1', 'WR', 15), p('WR2', 'WR', 13), p('WR3', 'WR', 11),
    p('Michael Pittman Jr.', 'WR', 7, { status: 'bench' }),
    p('TE1', 'TE', 9),
  ];
  const freeAgents = [
    p('Bryce Young', 'QB', 27.3, { owned: 34 }),
    p('Tyler Shough', 'QB', 24.1, { owned: 50 }),
    p('Kyler Murray', 'QB', 19.9, { owned: 50 }),
    p('Jordan Love', 'QB', 16.0, { owned: 45 }),
    p('C.J. Stroud', 'QB', 16.2, { owned: 29 }),
    p('Sam Darnold', 'QB', 16.1, { owned: 20 }),
    p('Bhayshul Tuten', 'RB', 12.4, { owned: 18 }),
    p('Kimani Vidal', 'RB', 11.1, { owned: 12 }),
    p('Jaylen Warren', 'RB', 13.6, { owned: 41 }),
    p('Wan\'Dale Robinson', 'WR', 12.8, { owned: 36 }),
    p('Romeo Doubs', 'WR', 11.4, { owned: 22 }),
    p('Rashid Shaheed', 'WR', 10.9, { owned: 15 }),
    p('Dalton Kincaid', 'TE', 10.2, { owned: 28 }),
  ];
  const { plan } = s.fbPickWaivers(roster, freeAgents);
  assert.ok(plan.length >= 5, 'plan should fill several slots');
  assert.equal(plan.filter((x) => x.pos === 'QB').length, 0, 'a healthy starting QB is not a hole — no QB copies');
  assert.ok(plan.every((x) => ['RB', 'WR', 'TE'].includes(x.pos)), 'the whole plan is flex');
  assert.ok(plan.some((x) => x.pos === 'RB') && plan.some((x) => x.pos === 'WR'), 'mixes running backs and receivers');
});

test('a missing QB becomes the single featured offer, then flex', () => {
  const s = load();
  const { plan } = s.fbPickWaivers(
    [p('RB1', 'RB', 16), p('WR1', 'WR', 14), p('TE1', 'TE', 9)],
    [
      p('Bryce Young', 'QB', 27.3, { owned: 34 }),
      p('Tyler Shough', 'QB', 24.1, { owned: 50 }),
      p('Jaylen Warren', 'RB', 13.6, { owned: 41 }),
      p('Wan\'Dale Robinson', 'WR', 12.8, { owned: 36 }),
      p('Kimani Vidal', 'RB', 11.1, { owned: 12 }),
      p('Romeo Doubs', 'WR', 11.4, { owned: 22 }),
    ],
  );
  assert.equal(plan[0].pos, 'QB');
  assert.equal(plan[0].p.name, 'Bryce Young');
  assert.equal(plan.filter((x) => x.pos === 'QB').length, 1);
  assert.ok(plan.slice(1).every((x) => x.pos === 'RB' || x.pos === 'WR'));
});

test('a QB add never drops a receiver', () => {
  const s = load();
  const add = { p: { name: 'Bryce Young' }, pos: 'QB', value: 27.3 };
  const drops = [
    { p: { name: 'Michael Pittman Jr.' }, pos: 'WR', value: 7 },
    { p: { name: 'Backup QB' }, pos: 'QB', value: 8 },
  ];
  const cut = s.fbPairDrop(add, drops, new Set());
  assert.equal(cut.p.name, 'Backup QB');
  assert.equal(s.fbPairDrop(add, drops.slice(0, 1), new Set()), null);
});

test('flex adds can cut a weaker flex player, but not reuse the same drop', () => {
  const s = load();
  const used = new Set();
  const drops = [
    { p: { name: 'Michael Pittman Jr.' }, pos: 'WR', value: 7 },
    { p: { name: 'Cold RB' }, pos: 'RB', value: 6 },
  ];
  const first = s.fbPairDrop({ p: { name: 'Jaylen Warren' }, pos: 'RB', value: 13.6, flex: true }, drops, used);
  used.add(first.p.name);
  const second = s.fbPairDrop({ p: { name: 'Romeo Doubs' }, pos: 'WR', value: 11.4, flex: true }, drops, used);
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.p.name, second.p.name);
});

test('GM HTML leads with one offer then a flex-options section', () => {
  const s = load();
  const html = s.fbGMHTML(
    [p('My QB', 'QB', 18), p('RB1', 'RB', 14), p('WR1', 'WR', 13), p('Michael Pittman Jr.', 'WR', 7, { status: 'bench' })],
    [
      p('Bryce Young', 'QB', 27, { owned: 34 }),
      p('Tyler Shough', 'QB', 24, { owned: 50 }),
      p('Jaylen Warren', 'RB', 13.6, { owned: 41 }),
      p('Wan\'Dale Robinson', 'WR', 12.8, { owned: 36 }),
      p('Kimani Vidal', 'RB', 11.1, { owned: 12 }),
      p('Romeo Doubs', 'WR', 11.4, { owned: 22 }),
    ],
    { teams: [] },
  );
  assert.match(html, /The offer/);
  assert.match(html, /Flex options/);
  const offer = html.match(/<div class="gm-move offer">[\s\S]*?(?=<div class="gm-sub">)/)[0];
  assert.doesNotMatch(offer, /ADD over Michael Pittman/);
  assert.equal((html.match(/Tyler Shough/g) || []).length, 0);
  const pittmanCuts = [...html.matchAll(/ADD over Michael Pittman Jr/g)];
  assert.ok(pittmanCuts.length <= 1, 'the same WR is not the drop for every add');
});

const rules = { lineupSlotCounts: { 0: 1, 2: 2, 4: 2, 6: 1, 23: 1, 20: 7 } };
test('league rules include TE flex and allocate only actual bench capacity', () => {
  const s = load(), config = s.fbRules(rules);
  assert.ok(config.flex.includes('TE'));
  assert.equal(Object.values(config.targets).reduce((a, n) => a + n, 0), 14);
  assert.equal(config.targets.QB, 1);
  const small = s.fbRules({ lineupSlotCounts: { 0: 2, 2: 1, 4: 1, 6: 1, 20: 2 } });
  assert.equal(Object.values(small.targets).reduce((a, n) => a + n, 0), 7);
  assert.equal(small.flex.length, 0);
  assert.equal(s.fbRules(null).verified, false);
});
test('TE is a flex option while unavailable players are not pickup recommendations', () => {
  const s = load();
  const { plan } = s.fbPickWaivers([p('QB', 'QB', 25)], [p('Healthy TE', 'TE', 15), p('Injured WR', 'WR', 40, { injuryStatus: 'IR' })], rules);
  assert.ok(plan.some((x) => x.p.name === 'Healthy TE' && x.flex));
  assert.ok(!plan.some((x) => x.p.name === 'Injured WR'));
  const narrow = s.fbPickWaivers([], [p('TE', 'TE', 15)], { lineupSlotCounts: { 3: 1, 6: 1, 20: 1 } });
  assert.equal(narrow.plan[0].flex, false);
});
test('cross-position drops preserve required starters', () => {
  const s = load(), te = p('Only TE', 'TE', 3, { status: 'bench' });
  assert.equal(s.fbCanReplace([te], te, p('WR', 'WR', 20), rules), false);
  assert.equal(s.fbCanReplace([te, p('Starting TE', 'TE', 15)], te, p('WR', 'WR', 20), rules), true);
});
test('waiver times and scoring labels distinguish known facts from projections', () => {
  const s = load();
  assert.equal(s.fbAcquisitionLabel({ acquisitionState: 'free_agent' }), 'Free agent');
  assert.match(s.fbAcquisitionLabel({ acquisitionState: 'waivers', waiverClearsAt: '2026-10-03T07:00:00Z' }), /Oct 3.*3:00 AM ET/);
  assert.match(s.fbAcquisitionLabel({ acquisitionState: 'waivers', waiverClearsAt: 'bad' }), /unavailable/);
  assert.match(s.fbAcquisitionLabel({}), /unconfirmed/);
  assert.match(s.fbValueLabel({ avg: 12, projected: 20 }), /season/);
  assert.match(s.fbValueLabel({ projected: 20 }), /weekly projection/);
});
test('trade leads explain a complementary roster need without promising fair value', () => {
  const s = load();
  const my = [p('QB', 'QB', 20), ...Array.from({length: 8}, (_, i) => p('WR' + i, 'WR', 12))];
  const other = [...Array.from({length: 8}, (_, i) => p('RB' + i, 'RB', 12)), p('QB', 'QB', 20)];
  const html = s.fbGMHTML(my, [], { teams: [{ team: 'Partner', roster: other }] }, rules);
  assert.match(html, /They need WR; you have depth to discuss/);
  assert.doesNotMatch(html, /estimated \+/);
});

'use strict';

// v372 — iPhone Duo half-fold layouts. The pose layer must stay inert unless
// the browser reports two viewport segments, and must stay layout only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('duo.js sets a pose only from two viewport segments, and only when folded', () => {
  const js = read('duo.js');
  assert.match(js, /s && s\.length === 2/);
  assert.match(js, /dp\.type !== 'folded'/);
  assert.match(js, /root\.removeAttribute\('data-duo-pose'\)/);
});

test('every v372 rule in duo.css is keyed to data-duo-pose or the featured pane', () => {
  const css = read('duo.css');
  const block = css.slice(css.indexOf('v372 · Half-fold poses'));
  assert.ok(block.length > 100, 'v372 block present');
  const selectors = block.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g)
    .map((s) => s.trim()).filter((s) => s && !s.startsWith('@media'));
  for (const sel of selectors) {
    assert.ok(/data-duo-pose|#duo-feature/.test(sel), `unscoped selector: ${sel}`);
  }
});

test('seated Today forwards taps from the featured copy instead of duplicating handlers', () => {
  const js = read('duo.js');
  assert.match(js, /target\.click\(\)/);
  assert.match(js, /document\.addEventListener\('click', onListClick, true\)/);
  assert.match(js, /removeAttribute\('id'\)/);
});

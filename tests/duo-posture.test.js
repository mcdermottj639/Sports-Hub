'use strict';

// iPhone Duo half-fold layouts. The pose layer is activated by a manual Duo
// choice or valid automatic fold geometry, and must stay layout only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

// Pose guards and sensor events are exercised behaviorally in
// duo-detection.test.js; avoid tying coverage to the implementation's spelling.

test('every v372 rule in duo.css is keyed to data-duo-pose or the featured pane', () => {
  const css = read('duo.css');
  const block = css.slice(css.indexOf('v372 · Half-fold poses'));
  assert.ok(block.length > 100, 'v372 block present');
  const selectors = block.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g)
    .map((s) => s.trim()).filter((s) => s && !s.startsWith('@media'));
  for (const sel of selectors) {
    assert.ok(/data-duo-pose|#duo-feature|\.duo-diag/.test(sel), `unscoped selector: ${sel}`);
  }
});

test('seated Today forwards taps from the featured copy instead of duplicating handlers', () => {
  const js = read('duo.js');
  assert.match(js, /target\.click\(\)/);
  assert.match(js, /document\.addEventListener\('click', onListClick, true\)/);
  assert.match(js, /removeAttribute\('id'\)/);
});

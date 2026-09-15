'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('release version is synchronized across app, HTML assets and service worker', () => {
  const app = read('app.js');
  const html = read('index.html');
  const sw = read('sw.js');
  const version = app.match(/const APP_VERSION = 'v(\d+)'/)?.[1];
  assert.ok(version);
  assert.match(html, new RegExp(`styles\\.css\\?v=${version}`));
  assert.match(html, new RegExp(`nfl-model\\.js\\?v=${version}`));
  assert.match(html, new RegExp(`app\\.js\\?v=${version}`));
  assert.match(sw, new RegExp(`sportshub-v${version}`));
});

test('NFL model loads before the main application', () => {
  const html = read('index.html');
  const modelScript = html.indexOf('<script src="nfl-model.js');
  const appScript = html.indexOf('<script src="app.js');
  assert.ok(modelScript >= 0 && modelScript < appScript);
});

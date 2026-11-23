'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function activateWithCacheNames(names) {
  const deleted = [];
  let activate;
  let claimed = false;
  const self = {
    addEventListener(type, handler) {
      if (type === 'activate') activate = handler;
    },
    clients: {
      claim() { claimed = true; return Promise.resolve(); }
    },
    skipWaiting() { return Promise.resolve(); }
  };
  const caches = {
    keys() { return Promise.resolve(names); },
    delete(name) { deleted.push(name); return Promise.resolve(true); }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  vm.runInNewContext(source, { self, caches, console }, { filename: 'sw.js' });
  assert.equal(typeof activate, 'function');

  let activation;
  activate({ waitUntil(promise) { activation = promise; } });
  await activation;
  return { deleted, claimed };
}

test('Sports Hub activation only removes its own stale versioned caches', async () => {
  const { deleted, claimed } = await activateWithCacheNames([
    'sportshub-v390', 'sportshub-v391', 'sportshub-v392',
    'card-vault-v72', 'card-vault-fonts', 'caddiehq-v297',
    'portfolio-v217', 'some-other-cache', 'sportshub-debug'
  ]);
  assert.deepEqual(deleted, ['sportshub-v390', 'sportshub-v391']);
  assert.equal(claimed, true);
});

test('Sports Hub preserves other apps and current cache when no old versions exist', async () => {
  const { deleted } = await activateWithCacheNames([
    'sportshub-v392', 'card-vault-v73', 'caddiehq-v297', 'user-cache'
  ]);
  assert.deepEqual(deleted, []);
});

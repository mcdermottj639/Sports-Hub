#!/usr/bin/env node
/* Run every Family Survivor suite.
   ------------------------------------------------------------------
   Usage:  node survivor/tests/run.js            — all of them
           node survivor/tests/run.js a11y ios   — just these
   It starts the static server itself if nothing is listening on 8099,
   and stops it again on the way out.

   ⚠️ These drive the REAL app in headless Chromium. The sandbox reaches
   neither ESPN nor Supabase and blocks a.espncdn.com, so the demo season is
   the fixture and a blank team logo is the network, not a bug. */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), http = require('http');

const DIR = __dirname;
const PORT = 8099;
const only = process.argv.slice(2);
const suites = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.js') && f !== 'run.js')
  .map((f) => f.replace(/\.js$/, ''))
  .filter((n) => !only.length || only.includes(n))
  .sort();

const up = () => new Promise((res) => {
  const r = http.get({ host: '127.0.0.1', port: PORT, path: '/', timeout: 800 }, (x) => { x.destroy(); res(true); });
  r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); });
});

(async () => {
  let server = null;
  if (!await up()) {
    server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', path.dirname(DIR)],
      { stdio: 'ignore', detached: true });
    for (let i = 0; i < 40 && !await up(); i++) await new Promise((r) => setTimeout(r, 250));
    if (!await up()) { console.error(`could not start a server on ${PORT}`); process.exit(2); }
  }

  let pass = 0, fail = 0, broke = [];
  for (const s of suites) {
    const r = spawnSync('node', [path.join(DIR, `${s}.js`)], { encoding: 'utf8', timeout: 180000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = out.match(/(\d+) passed, (\d+) failed/);
    if (m) {
      pass += +m[1]; fail += +m[2];
      const bad = +m[2] > 0;
      if (bad) broke.push(s);
      console.log(`${bad ? '✗' : '✓'} ${s.padEnd(12)} ${m[1].padStart(3)} passed${bad ? `, ${m[2]} FAILED` : ''}`);
      if (bad) out.split('\n').filter((l) => l.includes('✗')).forEach((l) => console.log(`      ${l.trim()}`));
    } else {
      // nana.js prints a report rather than a tally; anything else is a crash.
      const ok = r.status === 0;
      if (!ok) { broke.push(s); fail++; }
      console.log(`${ok ? '·' : '✗'} ${s.padEnd(12)} ${ok ? 'report, no tally' : 'CRASHED'}`);
      if (!ok) console.log(out.split('\n').slice(-6).map((l) => `      ${l}`).join('\n'));
    }
  }

  if (server) { try { process.kill(-server.pid); } catch (e) {} }
  console.log(`\n${suites.length} suites · ${pass} checks passed · ${fail} failed`);
  if (broke.length) console.log(`failing: ${broke.join(', ')}`);
  process.exit(fail ? 1 : 0);
})();

/* Does the app FIT the phone — including for the commissioner?
   ------------------------------------------------------------------
   🚨 Why this suite exists. Every earlier layout pass was run signed in as a
   relative, who sees FOUR tabs. The commissioner sees FIVE, and five nowrap
   labels in a fixed grid made the whole PAGE 376px wide on a 320px phone —
   so the Admin tab, the one control he actually needs, rendered entirely
   off-screen with no scrollbar and nothing hinting the page could move
   sideways. Three more elements (week winners, most-picked teams, the My
   Picks rows) had the same fault from the same cause: a grid track that
   cannot shrink pushes the DOCUMENT wider instead of clipping locally.

   So this suite checks the thing the user experiences — "is any of it
   off the edge of my phone" — rather than any one selector, and it checks
   it AS ADMIN, at the smallest size, in Bigger Text, on every screen. */
const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SIZES = [[320, 568, 'SE'], [375, 812, '13 mini'], [390, 844, '15'], [430, 932, '15 Pro Max']];
const SCREENS = ['pick', 'standings', 'history', 'stats', 'admin'];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  try {
    for (const big of [false, true]) {
      for (const [w, h, name] of SIZES) {
        const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
        // The helmets come from a.espncdn.com, which the sandbox blocks. An
        // unfulfilled image is 0x0 and hides real width, so serve a 34px one.
        await ctx.route('https://a.espncdn.com/**', (r) => r.fulfill({
          status: 200, contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"/>' }));
        const p = await ctx.newPage(); const errs = [];
        p.on('pageerror', (e) => errs.push(e.message));
        await p.goto('http://127.0.0.1:8099/', { waitUntil: 'networkidle' });
        if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
        if (big) { await p.evaluate(() => document.documentElement.setAttribute('data-big', '1')); await sleep(200); }
        await sleep(1200);

        const label = `${name} ${w}px${big ? ' · Bigger Text' : ''}`;
        console.log(`\n— ${label} —`);

        // The commissioner is who this is about: five tabs, not four.
        const tabs = await p.evaluate(() => [...document.querySelectorAll('.tab')].filter((t) => t.offsetParent).length);
        ok(tabs === 5, `signed in as the commissioner — ${tabs} tabs showing`);

        for (const sc of SCREENS) {
          await p.click(`.tab[data-screen="${sc}"]`);
          await sleep(600);
          const r = await p.evaluate(() => {
            const vw = document.documentElement.clientWidth;
            // Anything whose painted box ends past the viewport. Text nodes are
            // measured too — a nowrap span overflows its parent silently.
            const over = [];
            for (const e of document.querySelectorAll('body *')) {
              if (!e.offsetParent && e.tagName !== 'BODY') continue;
              const b = e.getBoundingClientRect();
              if (b.width === 0 && b.height === 0) continue;
              if (b.right > vw + 1) {
                // A box inside a legitimately scrollable strip is fine.
                let n = e.parentElement, inScroller = false;
                while (n && n !== document.body) {
                  const o = getComputedStyle(n).overflowX;
                  if (o === 'auto' || o === 'scroll') { inScroller = true; break; }
                  n = n.parentElement;
                }
                if (!inScroller) over.push((e.className || e.tagName) + ' → ' + Math.round(b.right));
              }
            }
            return { doc: document.documentElement.scrollWidth, vw, over: over.slice(0, 4) };
          });
          ok(r.doc <= r.vw, `${sc}: the page itself is not wider than the phone (${r.doc} vs ${r.vw})`);
          ok(r.over.length === 0, `${sc}: nothing painted past the right edge${r.over.length ? ' — ' + r.over.join(', ') : ''}`);
        }

        // The tab the whole finding was about, measured directly.
        await p.click('.tab[data-screen="pick"]'); await sleep(300);
        const admin = await p.evaluate(() => {
          const t = document.getElementById('tab-admin'), b = t.getBoundingClientRect();
          return { right: Math.round(b.right), left: Math.round(b.left), vw: document.documentElement.clientWidth,
                   h: Math.round(b.height) };
        });
        ok(admin.right <= admin.vw && admin.left >= 0, `the Admin tab is fully on screen (${admin.left}–${admin.right} of ${admin.vw})`);
        ok(admin.h >= 56, `and still a ${admin.h}px tap target`);
        ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
        await ctx.close();
      }
    }

    // ---- the three data-losing cases, named, at the size that broke them ----
    const ctx = await b.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:8099/', { waitUntil: 'networkidle' });
    if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
    await sleep(1200);
    await p.click('.tab[data-screen="stats"]'); await sleep(1500);
    console.log('\n— the three that were losing real information —');

    // A Range measures the TEXT, not the box: a nowrap span whose box is
    // clipped still reports its box, so only the text tells you what is lost.
    const cut = await p.evaluate((sel) => {
      const vw = document.documentElement.clientWidth, bad = [];
      for (const e of document.querySelectorAll(sel)) {
        const rg = document.createRange(); rg.selectNodeContents(e);
        for (const r of rg.getClientRects()) if (r.right > vw + 1) { bad.push(e.textContent.trim() + ' → ' + Math.round(r.right)); break; }
      }
      return bad;
    }, '.wp-res, .wp-nm, .wp-team');
    ok(cut.length === 0, `every week-winner result is readable${cut.length ? ' — ' + cut.slice(0, 3).join(', ') : ''}`);

    const collide = await p.evaluate(() => {
      const bad = [];
      for (const row of document.querySelectorAll('.popr')) {
        const t = row.querySelector('.pop-t'), bar = row.querySelector('.pop-bar');
        if (!t || !bar) continue;
        const a = t.getBoundingClientRect(), c = bar.getBoundingClientRect();
        const rg = document.createRange(); rg.selectNodeContents(t);
        const tr = [...rg.getClientRects()].reduce((m, r) => Math.max(m, r.right), a.left);
        if (tr > c.left + 1) bad.push(t.textContent.trim());
      }
      return bad;
    });
    ok(collide.length === 0, `no team name printed over its bar${collide.length ? ' — ' + collide.join(', ') : ''}`);

    // A name is the one thing in a table that must never be cut. Give someone
    // a plausible long one and check all four places that render a name.
    await p.evaluate(() => { S.players[1].display_name = 'Grandpa Bartholomew'; window.render(); });
    await sleep(800);
    await p.click('.tab[data-screen="standings"]'); await sleep(900);
    if (await p.locator('.vtog button').count() > 1) { await p.click('.vtog button:nth-child(2)'); await sleep(700); }
    const clipped = await p.evaluate(() => {
      const bad = [];
      for (const e of document.querySelectorAll('.gnm, .wp-nm, .cw-nm, .pn, .stname')) {
        if (!e.offsetParent) continue;
        if (e.scrollWidth > e.clientWidth + 1) bad.push(e.className + ': ' + e.textContent.trim());
      }
      return bad;
    });
    ok(clipped.length === 0, `"Grandpa Bartholomew" is never truncated${clipped.length ? ' — ' + clipped.slice(0, 3).join(' | ') : ''}`);
    ok(!(await p.locator('#s-standings').innerText()).includes('…'), 'and no ellipsis anywhere on the standings screen');
    await ctx.close();
  } finally { await b.close(); }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

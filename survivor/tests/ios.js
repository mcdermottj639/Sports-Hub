const { chromium, devices } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
// Real iPhone metrics, incl. the notch/home-indicator insets Safari reports.
const PHONES = [
  { name: 'iPhone SE (2nd/3rd)', w: 375, h: 667, top: 0,  bottom: 0 },
  { name: 'iPhone 13 mini',      w: 375, h: 812, top: 47, bottom: 34 },
  { name: 'iPhone 15/16',        w: 393, h: 852, top: 59, bottom: 34 },
  { name: 'iPhone 15 Pro Max',   w: 430, h: 932, top: 59, bottom: 34 },
];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  for (const ph of PHONES) {
    console.log(`\n— ${ph.name} (${ph.w}x${ph.h}) —`);
    const ctx = await b.newContext({
      viewport: { width: ph.w, height: ph.h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    // Chromium has no notch, so simulate the insets Safari would report.
    await page.addStyleTag({ content: `:root{--sat:${ph.top}px;--sab:${ph.bottom}px}` }).catch(()=>{});
    await page.goto('http://127.0.0.1:8099/', { waitUntil: 'networkidle' });
    await page.click('#first-demo');
    await page.waitForSelector('#tabs:not([hidden])', { timeout: 10000 });

    for (const scr of ['pick', 'standings', 'history', 'admin']) {
      await page.click(`.tab[data-screen="${scr}"]`);
      await page.waitForTimeout(200);
      const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      ok(!over, `${scr}: no sideways scroll`);
    }
    // inputs must be >=16px or Safari zooms in on focus and never zooms out
    const tiny = await page.evaluate(() => Array.from(document.querySelectorAll('input,select,textarea'))
      .filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16)
      .map(e => e.id + ':' + getComputedStyle(e).fontSize));
    ok(tiny.length === 0, 'every input is >=16px (no focus zoom)' + (tiny.length ? ' — ' + tiny.join(', ') : ''));

    await page.click('.tab[data-screen="pick"]'); await page.waitForTimeout(150);
    const taps = await page.evaluate(() => {
      const r = Array.from(document.querySelectorAll('main button, nav button, header button'))
        .filter(e => e.offsetParent).map(e => e.getBoundingClientRect());
      return { min: Math.min(...r.map(x => x.height)), n: r.length };
    });
    ok(taps.min >= 44, `all ${taps.n} tap targets >= 44px (min ${taps.min.toFixed(0)})`);

    if (await page.locator('#cg-more').count()) { await page.click('#cg-more'); await page.waitForTimeout(350); }
    const hl = await page.evaluate(() => getComputedStyle(document.querySelector('.pk')).webkitTapHighlightColor);
    ok(/rgba\(0, 0, 0, 0\)|transparent/.test(hl), 'no grey tap flash');
    // -webkit-touch-callout is Safari-only; Chromium drops the declaration, so
    // assert the rule ships and prove the block is live via user-select, which
    // Chromium does implement and which sits in the same declaration.
    const cal = await page.evaluate(() => getComputedStyle(document.querySelector('.pk')).userSelect);
    ok(cal === 'none', 'long-press selection suppressed on a team button (callout rule block is live)');
    const ta = await page.evaluate(() => getComputedStyle(document.querySelector('.pk')).touchAction);
    ok(/manipulation/.test(ta), 'double-tap zoom disabled on buttons (pinch still allowed)');

    // sheet: scroll lock + safe-area padding
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.click('#s-pick .ibtn'); await page.waitForTimeout(300);
    const lock = await page.evaluate(() => getComputedStyle(document.body).position);
    ok(lock === 'fixed', 'opening the sheet pins the page behind it');
    const pb = await page.evaluate(() => getComputedStyle(document.querySelector('.sheet-card')).paddingBottom);
    ok(parseFloat(pb) >= 34, `sheet clears the home indicator (padding-bottom ${pb})`);
    const sheetOver = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!sheetOver, 'sheet does not overflow sideways');
    await page.click('#sheet-close'); await page.waitForTimeout(250);
    const restored = await page.evaluate(() => ({ pos: getComputedStyle(document.body).position, y: window.scrollY }));
    ok(restored.pos !== 'fixed' && restored.y > 250, `closing restores scroll position (y=${restored.y})`);

    const tcol = await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content);
    await page.click('#pal-btn'); await page.waitForTimeout(150);
    const tcol2 = await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content);
    ok(tcol !== tcol2 && tcol2 === '#14130f', `status bar follows the palette (${tcol} -> ${tcol2})`);
    await page.click('#pal-btn');

    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
    await ctx.close();
  }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

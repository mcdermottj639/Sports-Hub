/* "Best chance" ordering on the Pick screen.
   ------------------------------------------------------------------
   The owner: current and future weeks sort by kickoff BY DEFAULT, and can
   be re-sorted by chance to win, which "sorts out the ones they already
   picked and gives the remaining options with highest % to win".

   Three claims worth pinning, because each fails silently if it breaks:
   1. Kickoff order is still the default and is untouched.
   2. The ranked view is a list of TEAMS you can still pick — a spent team
      is absent, not greyed out. Showing it would answer the question wrong.
   3. The number is the same one the team button and the ⓘ card already show
      (the de-vigged moneyline, v39), so the three can never disagree, and a
      team with no line is moved to the end rather than dropped. */
const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/New_York' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  try {
    await p.goto('http://127.0.0.1:8099/', { waitUntil: 'networkidle' });
    if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
    await sleep(1500);

    /* ⚠️ Walk to a week that can still be PICKED. The demo opens on week 10
       with the player's pick already kicked off, and a decided week is
       decided — so there is nothing to choose there and no sort control, by
       design (asserted at the end). Measuring the ranked list needs a week
       where the options are real. */
    await p.evaluate(async () => {
      for (let w = S.liveWeek; w <= 18; w++) {
        await ensureWeeks([w]);
        const cur = pickIn(S.me.id, w);
        if (cur && new Date(cur.kickoff) <= new Date()) continue;
        if (!(S.games[w] || []).some((g) => g.state === 'pre')) continue;
        S.week = w; S.weekPinned = true; break;
      }
      render();
    });
    await sleep(700);
    ok(await p.locator('[data-psort]').count() === 2, 'landed on a week with something to pick');

    console.log('\n— kickoff order is the default, and unchanged —');
    ok(await p.evaluate(() => S.pickSort) === 'time', 'the app starts on kickoff order');
    ok(await p.locator('[data-psort="time"].on').count() === 1, 'and the toggle shows it');
    ok(await p.locator('.oplist').count() === 0, 'no ranked list until it is asked for');
    const chrono = await p.evaluate(() => [...document.querySelectorAll('#s-pick .game:not(.started) .game-when span')].map((e) => e.textContent.trim()));
    ok(chrono.length > 1, `${chrono.length} matchup cards, as before`);
    // ⚠️ Read the RENDERED order. `S.games[w]` is the fetch order — renderPick
    // sorts a copy — so asserting on the state array tests nothing about
    // what the person actually sees.
    const times = await p.evaluate(() => {
      const by = {}; for (const g of (S.games[S.week] || [])) by[g.id] = +new Date(g.date);
      return [...document.querySelectorAll('#s-pick .game:not(.started) .ibtn[data-info]')].map((e) => by[e.dataset.info]);
    });
    ok(times.length > 1 && times.every((t, i) => i === 0 || t >= times[i - 1]), `the cards are in real kickoff order (${times.length} of them)`);

    console.log('\n— switching to best chance —');
    await p.click('[data-psort="odds"]'); await sleep(600);
    ok(await p.evaluate(() => S.pickSort) === 'odds', 'the app is on the ranked view');
    ok(await p.locator('[data-psort="odds"].on').count() === 1, 'and the toggle says so');
    const rows = await p.locator('.oplist .op').count();
    ok(rows > 0, `${rows} options listed`);
    ok(await p.locator('#s-pick .game:not(.started)').count() === 0, 'the un-started matchup cards give way to the list');

    const model = await p.evaluate(() => {
      const used = usedTeams(S.me.id, S.week);
      const open = (S.games[S.week] || []).filter((g) => g.state === 'pre');
      const want = [];
      for (const g of open) {
        const r = matchupRead(g);
        for (const side of ['away', 'home']) {
          if (used[g[side].abbr]) continue;
          want.push({ t: g[side].abbr, p: r.pHome == null ? null : (side === 'home' ? r.pHome : 1 - r.pHome) });
        }
      }
      const shown = [...document.querySelectorAll('.oplist .op')].map((el) => ({
        t: el.querySelector('[data-team]').dataset.team,
        pct: (el.querySelector('.pk-win') || {}).textContent || null,
        meta: (el.querySelector('.op-vs') || {}).textContent || '',
        disabled: el.querySelector('[data-team]').disabled,
      }));
      return { want, shown, used: Object.keys(used), openTeams: open.flatMap((g) => [g.away.abbr, g.home.abbr]) };
    });

    console.log('\n— the ones already picked are SORTED OUT, not greyed out —');
    const shownTeams = model.shown.map((x) => x.t);
    const usedPlaying = model.used.filter((t) => model.openTeams.includes(t));
    ok(usedPlaying.length > 0, `${usedPlaying.length} already-used teams are playing this week (so this is a real test)`);
    ok(usedPlaying.every((t) => !shownTeams.includes(t)), `none of them is in the list (${usedPlaying.join(', ')})`);
    ok(await p.locator('.oplist .pk.used').count() === 0, 'and nothing in the list is marked USED');
    ok(model.shown.every((x) => !x.disabled), 'every row can actually be tapped');
    ok(shownTeams.length === model.want.length, `one row per remaining option (${shownTeams.length})`);
    ok(new Set(shownTeams).size === shownTeams.length, 'no team listed twice');

    console.log('\n— highest chance first —');
    const pcts = model.shown.map((x) => (x.pct ? parseInt(x.pct, 10) : null));
    const priced = pcts.filter((v) => v != null);
    ok(priced.length > 1, `${priced.length} of them carry a percentage`);
    ok(priced.every((v, i) => i === 0 || v <= priced[i - 1]), `sorted highest first: ${priced.slice(0, 5).join('% · ')}%`);
    const best = model.want.filter((x) => x.p != null).sort((a, b) => b.p - a.p)[0];
    ok(shownTeams[0] === best.t, `the top row is the best remaining option (${best.t}, ${Math.round(best.p * 100)}%)`);
    // ⚠️ Same source as the button and the ⓘ card — the de-vigged moneyline,
    // and nothing else. If these ever disagree one of them is inventing a number.
    const byTeam = Object.fromEntries(model.want.map((x) => [x.t, x.p]));
    ok(model.shown.every((x) => (byTeam[x.t] == null) === (x.pct == null)
      && (x.pct == null || parseInt(x.pct, 10) === Math.round(byTeam[x.t] * 100))),
      'every percentage matches matchupRead exactly — the list cannot disagree with the ⓘ card');

    console.log('\n— a team with no line is moved, never dropped —');
    const unpriced = model.want.filter((x) => x.p == null).map((x) => x.t);
    ok(unpriced.every((t) => shownTeams.includes(t)), `all ${unpriced.length} unpriced options are still listed`);
    if (unpriced.length) {
      const firstUn = Math.min(...unpriced.map((t) => shownTeams.indexOf(t)));
      ok(firstUn >= priced.length, 'and they sit after everything that has a number');
      ok(/no moneyline posted/i.test(await p.locator('#s-pick').innerText()), 'with a line saying why they have no percentage');
    }

    console.log('\n— each row still says who and when, and opens the same card —');
    ok(model.shown.every((x) => /\bat\b|\bvs\b/.test(x.meta) && x.meta.length > 8), 'every row names the opponent and the kickoff');
    ok(await p.locator('.oplist .ibtn[data-info]').count() === rows, 'and every row has its own ⓘ');
    await p.click('.oplist .ibtn'); await sleep(500);
    ok(await p.locator('#sheet').isVisible(), 'which opens the matchup card');
    await p.keyboard.press('Escape'); await sleep(400);

    console.log('\n— tapping one goes through the SAME confirmation —');
    const before = await p.evaluate(() => (pickIn(S.me.id, S.week) || {}).team || null);
    const top = shownTeams[0];
    await p.click(`.oplist [data-team="${top}"]`); await sleep(500);
    ok(await p.locator('#confirm').isVisible(), 'a tap confirms first — it is not a second way to save a pick');
    ok(await p.evaluate(() => (pickIn(S.me.id, S.week) || {}).team || null) === before, 'nothing saved yet');
    await p.click('#cf-yes'); await sleep(900);
    ok(await p.evaluate(() => (pickIn(S.me.id, S.week) || {}).team) === top, `and answering yes saves it (${top})`);
    await sleep(400);
    ok(await p.locator('.oplist .pk.chosen').count() === 1, 'the chosen row is marked in the list');
    ok(await p.evaluate(() => S.pickSort) === 'odds', 'and the view stays where you left it');

    console.log('\n— the spent team leaves the list immediately —');
    const after = await p.evaluate(() => [...document.querySelectorAll('.oplist [data-team]')].map((e) => e.dataset.team));
    ok(after.includes(top), 'your own pick stays — it is still your pick, not a spent team');
    await p.click('[data-psort="time"]'); await sleep(500);
    ok(await p.locator('.oplist').count() === 0 && await p.locator('#s-pick .game:not(.started)').count() > 0, 'and switching back restores the matchup cards');

    console.log('\n— it is not offered where it would mean nothing —');
    const past = await p.evaluate(async () => {
      S.week = Math.max(1, S.liveWeek - 2); S.weekPinned = true; await ensureWeeks([S.week]); render();
      return S.week;
    });
    await sleep(700);
    ok(await p.locator('[data-psort]').count() === 0, `no sort control on a past week (week ${past}) — there is nothing left to choose`);
    const fut = await p.evaluate(async () => {
      S.week = Math.min(18, S.liveWeek + 1); S.weekPinned = true; await ensureWeeks([S.week]); render();
      return S.week;
    });
    await sleep(700);
    ok(await p.locator('[data-psort]').count() === 2, `but it is there on a future week (week ${fut})`);
    await p.click('[data-psort="odds"]'); await sleep(600);
    ok(await p.locator('.oplist .op').count() > 0, 'and it ranks that week too');

    console.log('\n— it fits, and it is readable —');
    for (const w of [320, 390]) {
      await p.setViewportSize({ width: w, height: 844 }); await sleep(400);
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `no sideways scroll at ${w}px`);
      // ⚠️ `.lg-fb` is exempt: it is the two-or-three letters that stand IN
      // for a helmet when the image fails, sized to sit inside the image's
      // own 34px box. It is a logo, not something anybody reads. (In the
      // sandbox every helmet fails, so it is always present here and never
      // on a real phone with a network.)
      const small = await p.evaluate(() => [...document.querySelectorAll('.op *')].filter((e) => {
        if (e.classList.contains('lg-fb')) return false;
        const t = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        return t && parseFloat(getComputedStyle(e).fontSize) < 15.5;
      }).map((e) => e.className + ':' + Math.round(parseFloat(getComputedStyle(e).fontSize))));
      ok(small.length === 0, `nothing under the 15.5px floor at ${w}px${small.length ? ' — ' + small.join(', ') : ''}`);
      const tap = await p.evaluate(() => [...document.querySelectorAll('.oplist [data-team], [data-psort]')]
        .map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h < 56));
      ok(tap.length === 0, `every control clears 56px at ${w}px${tap.length ? ' — ' + tap.join(', ') : ''}`);
    }
    console.log('\n— a decided week offers nothing to sort, and nothing to tap —');
    await p.setViewportSize({ width: 390, height: 844 }); await sleep(300);
    const lockedWeek = await p.evaluate(async () => {
      for (let w = 1; w <= 18; w++) {
        await ensureWeeks([w]);
        const cur = pickIn(S.me.id, w);
        if (cur && cur.kickoff && new Date(cur.kickoff) <= new Date()) { S.week = w; S.weekPinned = true; S.fullWeek = w; render(); return w; }
      }
      return null;
    });
    await sleep(700);
    ok(lockedWeek != null, `found a week whose pick has kicked off (week ${lockedWeek})`);
    ok(await p.locator('[data-psort]').count() === 0, 'no sort control — the week is decided, so there is nothing to choose');
    const live = await p.evaluate(() => [...document.querySelectorAll('#s-pick .pk')].filter((e) => !e.disabled).length);
    ok(live === 0, `and every team button is disabled (${live} live) — the store would refuse the tap, so the UI must not offer it`);

    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  } finally { await b.close(); }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

/* Move the app to a week that can actually be PICKED.
   ------------------------------------------------------------------
   🚨 The demo opens on week 10 with the signed-in player's pick already
   kicked off. Since v41 a decided week is decided — the store refuses a
   change — and since v44 the UI stops offering it, so every team button on
   that week is disabled and there is no sort control.

   That is correct, and it broke three suites at once, all of which did
   `[...document.querySelectorAll('#s-pick .pk')].find(x => !x.disabled)`
   and got `undefined`. A suite that reaches for a control the app has
   correctly stopped drawing is measuring nothing — the failure mode this
   repo has recorded four times now. So the setup lives in ONE place: call
   this first in any suite that needs to make a pick. */
module.exports = async function pickableWeek(p, sleep) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const week = await p.evaluate(async () => {
    for (let w = S.liveWeek; w <= 18; w++) {
      await ensureWeeks([w]);
      const cur = pickIn(S.me.id, w);
      if (cur && cur.kickoff && new Date(cur.kickoff) <= new Date()) continue;  // decided
      if (!(S.games[w] || []).some((g) => g.state === 'pre')) continue;         // nothing left
      S.week = w; S.weekPinned = true; S.fullWeek = w; render();
      return w;
    }
    return null;
  });
  await wait(700);
  const n = await p.evaluate(() => [...document.querySelectorAll('#s-pick .pk')].filter((x) => !x.disabled).length);
  if (!n) throw new Error(`pickableWeek: landed on week ${week} with no pickable team buttons — the fixture cannot test what follows`);
  return week;
};

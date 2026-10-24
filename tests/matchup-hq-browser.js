/* Browser-only fixture runner. Open matchup-hq-browser.html through a static
   preview; it never changes localStorage, fetches ESPN or writes account data. */
(async () => {
  'use strict';
  if (!new URLSearchParams(location.search).has('frame')) {
    const frame = document.querySelector('#qa-frame'), output = document.querySelector('#qa-result');
    document.querySelector('#qa-width').onchange = e => { frame.width = e.target.value; };
    document.querySelector('#qa-run').onclick = async () => {
      const button = document.querySelector('#qa-run'); button.disabled = true; output.textContent = '';
      try {
        for (const width of [320, 390, 768, 1280]) {
          frame.width = width;
          await new Promise(r => setTimeout(r, 40));
          const results = await frame.contentWindow.runHQChecks();
          output.textContent += `${width}px: ${results.length} checks passed\n`;
        }
        frame.width = document.querySelector('#qa-width').value;
        output.textContent += 'PASS — all responsive and interaction checks';
      } catch (e) { output.textContent += `FAIL — ${e.stack}`; }
      finally { button.disabled = false; }
    };
    return;
  }
  document.body.className = 'qa-frame-body desk-shell';
  document.body.innerHTML = '<p class="qa-label">LOCAL QA · saved matchup / stubbed game logs</p><div id="qa-mount"></div>';
  const fx = await fetch('fixtures/matchup-hq-week7.json').then(r => r.json()), box = document.querySelector('#qa-mount');
  const L = structuredClone(fx.L); L.syncedAt = L.coreSyncedAt = Date.now();
  let page = 'intel', fail = false, refreshCount = 0, logDelay = null;
  const ctx = { L, games: fx.games, weekLabel: 'Week 7', season: 2026,
    fetchJSON: async () => { if (logDelay) await logDelay; if (fail) throw new Error('test outage'); return fx.gamelogMcBride; },
    timeAgo: () => 'just now', onPage: p => { page = p; }, onResync: () => { refreshCount++; }, onBack: () => {},
    loadHistory: async () => ({stats:{PAIRS:[]},mgrFor:n=>n,career:()=>null}) };
  const mount = () => SportsHubMatchupHQ.render(box, {...ctx,page});
  const tick = () => new Promise(r => setTimeout(r, 40));
  mount();
  window.runHQChecks = async () => {
    const passed = [];
    const ok = (v, message) => { if (!v) throw new Error(message); passed.push(message); document.body.dataset.qaLastCheck=message; };
    const click = s => { const e=box.querySelector(s); if(!e)throw new Error('Missing '+s); e.click(); };
    const select = name => { const s=box.querySelector('#mhq-player-select');s.value=name;s.dispatchEvent(new Event('change',{bubbles:true})); };
    page = 'overview'; mount(); await tick();
    for (const name of ['overview','lab','intel','history']) {
      click(`[data-page="${name}"]`); await tick();
      ok(document.documentElement.scrollWidth <= innerWidth + 1, name+' does not overflow the viewport');
      ok(box.querySelector(`[data-page="${name}"]`).getAttribute('aria-selected')==='true',name+' selected');
      const btns=[...box.querySelectorAll('.mhq-tabs button')];
      ok(new Set(btns.map(b=>Math.round(b.getBoundingClientRect().top))).size===1,'all tabs share one row');
      ok(btns.every(b=>b.scrollWidth<=b.clientWidth+1),'tab labels fit their buttons');
    }
    click('[data-page="intel"]'); await tick();
    const expected=SportsHubMatchupHQ.model.buildPlayers(L,fx.games).filter(p=>!['D/ST','K'].includes(p.pos));
    ok(box.querySelectorAll('#mhq-player-select option').length===expected.length,'every skill player remains selectable');
    ok(box.querySelector('.mhq-player-picker').getBoundingClientRect().height<=50,'picker takes one compact row');
    ok(box.querySelector('#mhq-intel-body').getBoundingClientRect().top-box.querySelector('.mhq-intel').getBoundingClientRect().top<250,'analysis immediately follows the picker and profile');
    select('Michael Pittman Jr.'); await tick();
    ok(box.querySelector('.mhq-player-profile').textContent.includes('Reserve'),'IR is identified separately from bench');
    ok(box.querySelector('#mhq-intel-body').textContent.includes('link unavailable'),'missing athlete ID retains player details');
    select('Trey McBride');await tick();click('[data-act="next-player"]');await tick();
    const picked=box.querySelector('#mhq-player-select').value;
    ok(picked!=='Trey McBride','next changes the selected player');
    mount();await tick();
    ok(box.querySelector('#mhq-player-select').value===picked,'same-matchup refresh keeps selected player');
    click('[data-act="prev-player"]');await tick();
    ok(box.querySelector('#mhq-player-select').value==='Trey McBride','previous returns to the player');
    click('[data-page="lab"]'); await tick(); click('[data-lab-side="opp"]');
    let range=box.querySelector('[data-player="Christian McCaffrey"]');
    const oldRange=box.querySelector('[data-scenario-range]').textContent;
    range.value='30';range.dispatchEvent(new Event('input',{bubbles:true}));
    ok(box.querySelector('[data-k="win"]').textContent==='29.6%','scenario result matches the tested model');
    ok(box.querySelector('[data-scenario-range]').textContent!==oldRange,'range chart updates with the slider');
    mount();await tick();
    ok(box.querySelector('[data-k="win"]').textContent==='29.6%','same-matchup refresh keeps the scenario');
    // A refreshed live score cannot leave a retained final-score slider below
    // points already scored, and its visible output must agree with the control.
    const liveL = structuredClone(L), liveGames = structuredClone(fx.games);
    const cmc = liveL.opponent.roster.find(p=>p.name==='Christian McCaffrey'); cmc.points=35;
    liveGames.find(g=>g.home.abbr==='SF'||g.away.abbr==='SF').state='in';
    SportsHubMatchupHQ.render(box,{...ctx,L:liveL,games:liveGames,page});await tick();
    const liveRange=box.querySelector('[data-player="Christian McCaffrey"]');
    ok(Number(liveRange.value)===35&&liveRange.parentElement.querySelector('output').textContent==='35.0','refreshed live points bound a retained final-score scenario');
    mount();await tick();
    click('[data-act="reset"]');await tick();
    ok(box.querySelector('[data-k="win"]').textContent==='46.5%','reset restores baseline');
    ok(!box.querySelector('[data-player="Drake Maye"]'),'finished players cannot be adjusted');
    box.querySelector('[data-page="lab"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await tick();
    ok(box.querySelector('[data-page="intel"]').getAttribute('tabindex')==='0','keyboard tabs move selection and focus');
    // Clear the log cache via a fresh successful core, fail then retry.
    fail=true;L.coreSyncedAt++;mount();await tick();
    ok(!!box.querySelector('[data-act="retry-intel"]'),'failed log offers retry');
    fail=false;click('[data-act="retry-intel"]');await tick();
    ok(!!box.querySelector('[data-usage-chart] svg'),'retry recovers without reopening');
    // A late response must never replace the newly selected player.
    let release;logDelay=new Promise(r=>{release=r;});L.coreSyncedAt++;mount();
    select('Michael Wilson');logDelay=null;select('Trey McBride');await tick();release();await tick();
    ok(box.querySelector('.mhq-player-profile h3').textContent==='Trey McBride','late requests cannot replace the current player');
    for(let i=0;i<5;i++)mount();await tick();
    const before=refreshCount;click('[data-act="resync"]');
    ok(refreshCount-before===1,'one refresh after repeated mounts');
    page='overview';const missing={...L,opponent:null};SportsHubMatchupHQ.render(box,{...ctx,L:missing,page});await tick();
    ok(!box.querySelector('.mhq-board')&&box.textContent.includes('Waiting for a complete matchup'),'missing opponent never produces a forecast');
    // Returning to valid data must render normally, and a new week resets the player.
    page='intel';mount();await tick();select('Michael Wilson');await tick();
    SportsHubMatchupHQ.render(box,{...ctx,page,season:2027});await tick();
    ok(box.querySelector('#mhq-player-select').value!=='Michael Wilson','new season resets old selection');
    mount();await tick();
    return passed;
  };
})().catch(e => { document.body.append(String(e.stack)); });

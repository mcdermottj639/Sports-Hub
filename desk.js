// Sports Hub personal desk. Reuses the existing feeds, model, and saved records.
// Loaded before app.js; app.js calls init after its own declarations are ready.
(function (root) {
  'use strict';
  const C = root.SportsHubDeskCore;
  const WATCH_KEY = 'sportshub:desk:watch:v1';
  const $d = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    predictions: '<path d="M4 20V10m8 10V4m8 16v-7"/><path d="m3 5 4-2 5 4 8-4"/>',
    research: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
    fantasy: '<path d="M8 3h8v7a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 14v6m-5 0h10"/>',
    explore: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    watchlist: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
    eagles: '<path d="m3 5 9 5 9-5-4 10-5 5-5-5Z"/>',
    redsox: '<circle cx="12" cy="12" r="9"/><path d="M6 5c7 3 7 11 0 14M18 5c-7 3-7 11 0 14"/>',
    nfl: '<path d="M3 15C1 4 11 1 19 3c2 8-1 18-12 17Z"/><path d="m7 16 9-9M8 11l5 5m-2-8 5 5"/>',
    cfb: '<path d="m2 8 10-5 10 5-10 5Zm4 3v6l6 3 6-3v-6m4-3v9"/>',
    pickem: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 9 2 2 5-5m-7 11h8"/>',
    pulse: '<path d="M3 5h18v15H3ZM7 9h4v4H7Zm8 0h3m-3 4h3M7 17h11"/>',
    labs: '<path d="M9 3h6m-5 0v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10"/>',
    about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    refresh: '<path d="M20 8a9 9 0 1 0 0 8M20 3v5h-5"/>',
  };
  function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.explore}</svg>`; }
  const CLUBS = {
    eagles:{name:'Philadelphia Eagles',short:'Eagles',abbr:'PHI',sport:'nfl',logo:'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png'},
    redsox:{name:'Boston Red Sox',short:'Red Sox',abbr:'BOS',sport:'mlb',logo:'https://a.espncdn.com/i/teamlogos/mlb/500/bos.png'},
  };
  function teamMark(team,cls='') {
    const logo = typeof team?.logo==='string' && /^https:\/\/[^\s]+$/i.test(team.logo) ? team.logo : '';
    return `<span class="desk-team-mark ${cls}" aria-hidden="true"><span>${escape(team?.abbr || String(team?.name||'').slice(0,3))}</span>${logo?`<img src="${escape(logo)}" alt="" loading="lazy" decoding="async" data-team-logo />`:''}</span>`;
  }
  function paintClubs() {
    const host=$d('desk-follow-teams');if(!host)return;
    host.innerHTML=Object.entries(CLUBS).map(([path,team])=>{
      const game=C.agenda(games,[],team.sport).find(x=>[x.g.home.name,x.g.away.name].includes(team.name));
      const g=game?.g, opponent=g && (g.home.name===team.name?g.away:g.home);
      const context=g ? `${g.state==='in'?'Live · ':g.state==='post'?'Final · ':''}${team.abbr} ${g.home.name===team.name?'vs':'at'} ${opponent.abbr||opponent.name}` : `${team.name} · ${LEAGUES[team.sport].label}`;
      return `<button type="button" class="desk-club-card desk-club-${path}" data-desk-route="${path}">${teamMark(team)}<span><small>${path==='eagles'?'GO BIRDS':'FENWAY FAITHFUL'}</small><b>${team.short}</b><span>${escape(context)}</span><small>${g?escape(dateText(g.date)):'News, roster & season'}</small></span>${icon('arrow')}</button>`;
    }).join('');
  }
  const meta = {
    home: ['Your clubhouse', 'Your daily brief. Every angle. All yours.'],
    predictions: ['Model board', 'Forecasts, prices and a record you can inspect.'],
    research: ['Research desk', 'Follow the evidence. Find what holds up.'],
    fantasy: ['Fantasy HQ', 'Your matchup, your needs, your next move.'],
    explore: ['Your workspace', 'Everything you follow. One place to find it.'],
    watchlist: ['Your watchlist', 'Games on your radar. Notes in your own words.'],
    eagles: ['Philadelphia Eagles', 'Your team, from the next matchup to the full season.'],
    redsox: ['Boston Red Sox', 'The season, the roster, and what comes next.'],
    nfl: ['NFL', 'The full week, with your model beside the market.'],
    cfb: ['College football', 'The Top 25, with context beyond the score.'],
    pickem: ['Weekly Pick’em', 'Your locked pool lines. Your picks. Your season.'],
    pulse: ['Around the leagues', 'Headlines, your teams, and the wider sports day.'],
    labs: ['Tools & experiments', 'Draft simulators, trivia, and more ways to play.'],
    about: ['About & data', 'Know where the numbers come from.'],
  };
  const links = [
    ['today', 'Today', 'Your personal daily brief', 'home'],
    ['models/all/picks', 'Model board', 'Winner, spread and total forecasts', 'predictions'],
    ['models/all/results', 'Model results', 'Official record, saved odds and paper ROI', 'predictions'],
    ['research', 'Research desk', 'Compare official models and experimental challengers', 'research'],
    ['nfl/research', 'NFL research', 'Saved betting systems, odds history and football development', 'nfl'],
    ['cfb/research', 'College research', 'Top 25 systems and the FPI challenger', 'cfb'],
    ['fantasy', 'Fantasy HQ', 'Roster, matchup, waivers, trade targets and lineup', 'fantasy'],
    ['fantasy/gm', 'Waiver & trade plan', 'Waivers and trade targets based on your roster needs and league rules', 'fantasy'],
    ['fantasy/lineup', 'Start / sit', 'Your starters, bench alternatives and injury alerts', 'fantasy'],
    ['fantasy/season', 'Fantasy season', 'Weekly scoring, all-play, luck and standings', 'fantasy'],
    ['watchlist', 'Watchlist', 'Saved games and your personal notes', 'watchlist'],
    ['pickem', 'Weekly Pick’em', 'ATS pool, key picks, weekly results and import', 'pickem'],
    ['eagles', 'Eagles', 'Philadelphia news, depth chart, schedule and standings', 'eagles'],
    ['redsox', 'Red Sox', 'Boston news, roster, schedule and standings', 'redsox'],
    ['nfl', 'NFL games', 'This week’s schedule, betting board and playoff picture', 'nfl'],
    ['cfb', 'College football', 'Ranked games, Top 25 and playoff field', 'cfb'],
    ['models/mlb/picks', 'MLB model', 'Baseball predictions and saved results', 'redsox'],
    ['models/nba/picks', 'NBA model', 'Basketball predictions and saved results', 'predictions'],
    ['news', 'News & scores', 'Headlines around the leagues', 'pulse'],
    ['models/all/calibration', 'Calibration', 'Probability accuracy and model diagnostics', 'research'],
    ['models/all/method', 'How the models work', 'Inputs, formulas, data and limitations', 'about'],
    ['tools', 'Tools & experiments', 'Mock drafts, trivia and workout tools', 'labs'],
    ['about', 'About & data', 'Data sources, collection and cached responses', 'about'],
  ];
  let games = [], agendaFilter = 'all', agendaLimit = 6, agendaErrors = [], agendaLoaded = false;
  let agendaPending = null, agendaAt = 0, boardPending = null, boardAt = 0;
  let currentRoute = { panel: 'home' }, routing = false, searchItems = [], searchInvoker = null;
  let toastTimer, cloudFailed = false, undoItem = null, sectionPending = false;
  function readWatch() {
    try { return C.normalizeWatch(JSON.parse(localStorage.getItem(WATCH_KEY) || '[]')); } catch (_) { return []; }
  }
  function saveWatch(value) {
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(C.normalizeWatch(value))); }
    catch (_) { toast('Could not save: this browser’s storage is full or unavailable.'); return false; }
    paintWatchButtons(); paintWatchlist(); paintBrief(); paintAgenda(); return true;
  }
  function toast(message, undo = false) {
    const box = $d('desk-toast'); if (!box) return;
    box.textContent = message; box.hidden = false;
    if(undo){const b=document.createElement('button');b.type='button';b.dataset.watchUndo='';b.textContent='Undo';box.appendChild(b);}
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { box.hidden = true; }, undo?8000:4000);
  }
  function pinned(sport, id) { return readWatch().some(r => C.key(r.sport,r.id) === C.key(sport,id)); }
  function toggleGame(sport, g) {
    if (!g?.id) return;
    const list = readWatch(), was = pinned(sport,g.id);
    if (!was && list.length >= 80) { toast('Your watchlist has 80 games. Remove a game before adding another.'); return; }
    const removed=list.find(r=>C.key(r.sport,r.id)===C.key(sport,g.id));
    if (saveWatch(C.toggleWatch(list, { sport, id: g.id, away: g.away?.name, home: g.home?.name, date: g.date }))) { if(was)undoItem=removed;toast(was ? 'Removed from your watchlist.' : 'Saved to your watchlist.',was); }
  }
  function addWatchControl(card, sport, g) {
    if (!g?.id || !['nfl','cfb','mlb','nba'].includes(sport)) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'desk-save';
    button.dataset.watchSport = sport; button.dataset.watchId = g.id;
    const paint = () => { const on = pinned(sport,g.id); button.innerHTML = icon('watchlist'); button.setAttribute('aria-pressed',String(on)); button.setAttribute('aria-label',`${on ? 'Remove from' : 'Save to'} watchlist: ${g.away?.name || 'Away'} at ${g.home?.name || 'Home'}`); button.title = on ? 'Saved to watchlist' : 'Save to watchlist'; };
    button.addEventListener('click', e => { e.stopPropagation(); toggleGame(sport,g); paint(); });
    button.addEventListener('keydown', e => e.stopPropagation());
    paint(); card.appendChild(button);
  }
  function paintWatchButtons() {
    document.querySelectorAll('[data-watch-id]').forEach(b => {
      const on = pinned(b.dataset.watchSport,b.dataset.watchId);
      b.setAttribute('aria-pressed',String(on)); b.title = on ? 'Saved to watchlist' : 'Save to watchlist';
      const label = b.getAttribute('aria-label') || '';
      b.setAttribute('aria-label',label.replace(/^(Save to|Remove from)/,on ? 'Remove from' : 'Save to'));
    });
    document.querySelectorAll('[data-watch-count]').forEach(b => { b.textContent = readWatch().length; });
  }
  function button(route, label, cls = 'desk-link') { return `<button type="button" class="${cls}" data-desk-route="${route}">${label}${icon('arrow')}</button>`; }
  function dateText(date, full = false) {
    if (!date || !Number.isFinite(typeof date === 'number' ? date : Date.parse(date))) return 'Time to be announced';
    return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(full ? { weekday: 'short' } : {}) });
  }
  function ago(at) { return at ? timeAgo(typeof at === 'number' ? at : Date.parse(at)) : 'time unavailable'; }
  function onTab(name, opts = {}) {
    sectionPending = !!opts.section;
    currentRoute = { panel:name, ...(name === 'predictions' ? { aiSport: state.aiSport, aiSub:state.aiSub } : {}), ...(opts.sportView ? { sportView:opts.sportView } : {}), ...(opts.section ? {section:opts.section} : {}) };
    const activeGroup = C.group(currentRoute);
    document.querySelectorAll('[data-desk-group]').forEach(b => {
      const on = b.dataset.deskGroup === activeGroup;
      b.classList.toggle('active',on); if (on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('#tabs button[data-tab]').forEach(b => {
      const on = b.dataset.tab === name; b.classList.toggle('active',on); b.setAttribute('aria-selected',String(on));
    });
    const m = meta[name] || meta.home;
    $d('desk-page-title').textContent = m[0]; $d('desk-page-desc').textContent = m[1];
    $d('desk-breadcrumb').textContent = ['home','predictions','research','fantasy'].includes(activeGroup) ? ({ home:'Today', predictions:'Models', research:'Research', fantasy:'Fantasy' })[activeGroup] : 'Workspace';
    document.title = `${m[0]} · Sports Hub`;
    $d('desk-page-title').tabIndex = -1;
    $d('desk-page-title').focus({preventScroll:true});
    document.querySelectorAll('[data-desk-refresh]').forEach(b => { b.hidden = ['explore','labs','about'].includes(name); b.setAttribute('aria-label', `Refresh ${m[0]}`); });
    document.body.dataset.deskPanel = name;
    const art=$d('desk-heading-art');
    if(art) art.innerHTML=(CLUBS[name]?[name]:['eagles','redsox']).map(path=>`<button type="button" class="desk-hero-crest desk-crest-${path}" data-desk-route="${path}" aria-label="Open ${CLUBS[path].name}">${teamMark(CLUBS[path])}</button>`).join('');
    if (!routing) {
      const hash = C.hashFor(currentRoute);
      if (location.hash !== hash) history[opts.replace ? 'replaceState' : 'pushState'](null,'',hash);
    }
    paintWatchButtons();
  }
  function navigate(path, opts = {}) {
    const r = typeof path === 'string' ? C.route(path.startsWith('#') ? path : '#/' + path) : path;
    if (!r) return false;
    showTab(r.panel, { ...r, ...opts });
    if (opts.scroll !== false) window.scrollTo({top:0, behavior:'instant'});
    return true;
  }
  function syncAI() { if (currentTab === 'predictions') onTab('predictions',{replace:true}); }
  function syncResearch(sport,view) { if (currentTab === sport) onTab(sport,{ sportView:view,replace:true }); }
  function restoreRoute() {
    if (!location.hash || location.hash.startsWith('#pk=')) return false;
    const r = C.route(location.hash); if (!r) return false;
    routing = true; navigate(r,{scroll:false}); routing = false; return true;
  }
  function focusSection() {
    if (!sectionPending || currentRoute.panel !== 'fantasy' || !currentRoute.section) return;
    const node = $d(`desk-fantasy-${currentRoute.section}`);
    if (node && node.offsetParent !== null) {
      node._accSet?.(true, true);
      node.scrollIntoView({block:'start',behavior:'instant'});
      sectionPending = false;
    }
  }
  function gameContext(sport, g) {
    const rows = C.gameForecasts(root.SportsHubCloudAI?.cached?.().rows, AI_MODEL_VERSION).get(C.key(sport,g.id));
    const parts = [];
    if (rows?.size) parts.push(`<span class="desk-saved-signal">${rows.size} saved ${rows.size===1?'forecast':'forecasts'}</span>`);
    if (g.tv) parts.push(`<span>${escape(Array.isArray(g.tv) ? g.tv.join(' · ') : g.tv)}</span>`);
    return parts.length ? `<span class="desk-game-context">${parts.join('')}</span>` : '';
  }
  async function loadAgenda(force = false) {
    if (agendaPending) return agendaPending;
    if (!force && agendaLoaded && Date.now() - agendaAt < 60000) { paintAgenda(); return; }
    agendaPending = (async () => {
      const sports = ['nfl','cfb','mlb','nba'];
      const results = await Promise.allSettled(sports.map(async sport => ({ sport, list: WEEK_SPORTS.has(sport) ? (await weekSlate(sport)).games : await getGames(sport,ymd(sportsDate())) })));
      const next = [], errors = [];
      results.forEach((r,i) => { if (r.status === 'fulfilled') next.push(...r.value.list.map(g => ({ sport:r.value.sport,g }))); else errors.push(sports[i].toUpperCase()); });
      // Keep the last known schedule for an unavailable league and disclose it.
      games = [...next,...games.filter(x=>errors.includes(x.sport.toUpperCase()))]; agendaErrors = errors; agendaLoaded = true; agendaAt = Date.now();
      setMode(errors.length < sports.length);
      paintAgenda(); paintWatchlist(); paintBrief();paintClubs();
    })().finally(() => { agendaPending = null; });
    return agendaPending;
  }
  function paintAgenda() {
    const host = $d('desk-agenda'); if (!host) return;
    const list = C.agenda(games,readWatch(),agendaFilter);
    const filters = [['all','All'],['watchlist','Saved'],['nfl','NFL'],['cfb','CFB'],['mlb','MLB'],['nba','NBA']];
    const chips = $d('desk-agenda-filters');
    chips.innerHTML = filters.map(([k,label]) => `<button type="button" data-agenda-filter="${k}" aria-pressed="${agendaFilter===k}">${label}</button>`).join('');
    if (!agendaLoaded) { host.innerHTML='<div class="desk-empty" role="status">Loading your game radar…</div>'; return; }
    host.replaceChildren();
    if (agendaErrors.length) host.insertAdjacentHTML('beforeend',`<div class="desk-inline-note">${escape(agendaErrors.join(', '))} feed unavailable. <button type="button" data-desk-refresh>Retry</button></div>`);
    if (!list.length) host.insertAdjacentHTML('beforeend',`<div class="desk-empty"><b>${agendaFilter==='watchlist' ? 'Give your radar a personal touch.' : agendaErrors.length ? 'Waiting for the schedule.' : 'No games in this view.'}</b><p>${agendaFilter==='watchlist' ? 'Save a game with the bookmark icon. It will be easy to find here and in your watchlist.' : agendaErrors.length ? 'Your saved results and notes are still available.' : 'Football covers this week; baseball and basketball cover today. Try another league or explore saved model results.'}</p>${button('models/all/results','View saved results')}</div>`);
    list.slice(0,agendaLimit).forEach(({sport,g}) => {
      const row = document.createElement('div'); row.className = 'desk-game';
      const status = gameState(g), started = status !== 'scheduled';
      const tag = status === 'live' ? (g.statusText || 'Live') : status === 'final' ? 'Final' : dateText(g.date);
      row.innerHTML = `<button type="button" class="desk-game-main" data-desk-game="${escape(sport+':'+g.id)}" aria-label="Open ${escape(g.away.name)} at ${escape(g.home.name)} game report"><span class="desk-game-meta"><span class="desk-sport">${escape(LEAGUES[sport].label)}</span><span class="${status==='live'?'desk-live':''}">${escape(tag)}</span></span><span class="desk-matchup"><span class="desk-match-team">${teamMark(g.away)}<span><b>${escape(g.away.abbr || g.away.name)}</b><small>${escape(g.away.name)}</small></span>${started?`<strong>${escape(g.away.score??'–')}</strong>`:''}</span><span class="desk-versus">${started?'–':'at'}</span><span class="desk-match-team">${teamMark(g.home)}<span><b>${escape(g.home.abbr || g.home.name)}</b><small>${escape(g.home.name)}</small></span>${started?`<strong>${escape(g.home.score??'–')}</strong>`:''}</span></span>${gameContext(sport,g)}</button>`;
      addWatchControl(row,sport,g); host.appendChild(row);
    });
    if (list.length > agendaLimit) host.insertAdjacentHTML('beforeend',`<button class="desk-show-more" type="button" data-agenda-more>Show ${Math.min(12,list.length-agendaLimit)} more games <span>(${list.length} in this view)</span></button>`);
  }
  function paintBrief() {
    const cloud = root.SportsHubCloudAI?.cached?.() || {rows:[]};
    const summary = C.savedSummary(cloud.rows,AI_MODEL_VERSION);
    const known = !!cloud.at;
    const capture = C.captureStatus(cloud.run);
    const watch = readWatch();
    const status = $d('desk-capture');
    if (status) { status.className=`desk-status ${capture.tone}`; status.textContent=capture.title; status.title=capture.at ? `Last run ${dateText(capture.at,true)}` : 'No saved job status is available.'; }
    const date = $d('desk-date'); if (date) date.textContent = new Date().toLocaleDateString('en-US',{ weekday:'long',month:'long',day:'numeric' });
    const stats = $d('desk-stats');
    if (stats) stats.innerHTML = [
      [known?summary.games:'—','Upcoming games','with frozen forecasts','models/all/picks'],
      [known?summary.upcoming:'—','Saved forecasts',known?`${summary.priced} have saved odds`:'History not loaded','models/all/results'],
      [known?summary.due:'—','Awaiting grading','started games · saved forecasts','models/all/results'],
      [watch.length,'On your watchlist','your games & notes','watchlist'],
    ].map(([n,label,note,path]) => `<button type="button" data-desk-route="${path}" class="desk-stat"><span>${label}</span><strong>${n}</strong><small>${note}</small></button>`).join('');
    const focus = $d('desk-focus');
    const L = (typeof fanState !== 'undefined' && fanState.league?.football) || (typeof leagueSnap === 'function' && leagueSnap('football'));
    const starterFlags = (L?.rosterFull || []).filter(p => isStarting(p) && fbUnavailable(p));
    if (focus) focus.innerHTML = `
      <div class="desk-focus-row"><span class="desk-focus-icon">${icon('predictions')}</span><div><b>${summary.upcoming ? `${summary.upcoming} forecasts ready to review` : 'Start with the model’s record'}</b><p>${summary.upcoming ? `${summary.priced} include a saved quote. Check the market and price before acting.` : 'See results by winner, spread and total, with saved-odds coverage.'}</p></div>${button(summary.upcoming?'models/all/picks':'models/all/results','Review')}</div>
      <div class="desk-focus-row"><span class="desk-focus-icon">${icon('fantasy')}</span><div><b>${starterFlags.length ? `${starterFlags.length} starter${starterFlags.length===1?'':'s'} to check` : L?.team ? escape(L.team) : 'Make your next fantasy move'}</b><p>${starterFlags.length ? escape(starterFlags.map(p=>p.name).join(', ')) : L ? 'Matchup, roster needs, waiver options and trade targets.' : 'Open Fantasy HQ for your real league, lineup and waiver plan.'}${L?.syncedAt ? ` <span class="desk-source">Saved ${escape(ago(L.syncedAt))}.</span>` : ''}</p></div>${button(starterFlags.length?'fantasy/lineup':'fantasy/gm','Open')}</div>
      <div class="desk-focus-row"><span class="desk-focus-icon">${icon('research')}</span><div><b>What is actually improving?</b><p>Compare the official model with saved NFL and college challengers on the same games.</p></div>${button('research','Explore')}</div>`;
    const results = $d('desk-results');
    if (results) {
      const records = Object.values(root.SportsHubCloudAI?.maps?.().tally || {});
      results.innerHTML = [['Winner',r=>!r.a&&!r.t],['Spread',r=>!!r.a],['Total',r=>!!r.t]].map(([label,filter]) => {
        const e = AI_MATH.evaluate(records.filter(filter),AI_MODEL_VERSION);
        return `<div class="desk-result"><span><b>${label}</b><small>${e.n} settled · ${e.priced} priced</small></span><span><strong>${e.n ? `${e.w}–${e.l}${e.pushes ? `–${e.pushes}P` : ''}` : 'Collecting'}</strong><small class="${e.roi!=null&&e.roi>=0?'desk-positive':''}">${e.roi==null ? 'ROI awaiting odds' : `${e.roi>=0?'+':''}${(e.roi*100).toFixed(1)}% paper ROI`}</small></span></div>`;
      }).join('') + `<p class="desk-caption">Official saved record · one unit risked at each saved quote. Unpriced results do not enter ROI. Football totals remain research only.</p>`;
    }
    const updated = $d('desk-data-note'); if(updated) updated.textContent = cloud.at ? `History refreshed ${ago(cloud.at)} · ${capture.at ? 'last collection '+ago(capture.at) : 'capture status unavailable'}${cloudFailed?' · refresh unavailable; showing saved history':''}` : cloudFailed ? 'Saved history could not load. Use Refresh to retry. Your device records remain available in Models.' : 'Saved history is loading. Collection runs even with the app closed.';
    paintWatchButtons();
  }
  async function renderHome() {
    paintBrief(); paintAgenda();paintClubs();
    if (!boardPending && Date.now()-boardAt > 60000) {
      boardPending = renderHomeBoard().then(() => { boardAt=Date.now(); }).catch(() => {
        $d('home-board').innerHTML='<div class="desk-empty">The model board could not refresh. Your saved results are still available.</div>';
      }).finally(() => { boardPending=null; });
    }
    await loadAgenda();
  }
  function paintWatchlist() {
    const host=$d('desk-watch-items'); if(!host)return;
    // A background feed refresh must never replace a note being edited.
    if(host.contains(document.activeElement) && document.activeElement.matches('textarea'))return;
    const list=readWatch();
    host.innerHTML=list.length?'':`<div class="desk-empty desk-empty-large">${icon('watchlist')}<h3>A shortlist that’s yours.</h3><p>Bookmark games from Today or the model board. Keep the matchups you care about together, and add your own notes.</p>${button('today','Find a game','desk-primary')}</div>`;
    list.forEach(item=>{
      const card=document.createElement('article');card.className='desk-watch-card';
      const current=games.find(x=>C.key(x.sport,x.g.id)===C.key(item.sport,item.id));
      const status=current ? gameState(current.g) : null;
      card.innerHTML=`<div class="desk-watch-head"><div><span class="desk-eyebrow">${escape(LEAGUES[item.sport].label)} · ${escape(dateText(item.date,true))}</span><h3>${escape(item.away)} <span>at</span> ${escape(item.home)}</h3>${status && status!=='scheduled' ? `<p>${escape(current.g.away.score??'–')} – ${escape(current.g.home.score??'–')} · ${escape(current.g.statusText || status)}</p>`:''}</div><button type="button" class="desk-remove" data-watch-remove="${escape(C.key(item.sport,item.id))}" aria-label="Remove ${escape(item.away+' at '+item.home)} from watchlist">Remove</button></div><label class="desk-note-label" for="note-${item.sport}-${item.id}">Your note <span data-note-status>Saved on this device</span></label><textarea id="note-${item.sport}-${item.id}" data-watch-note="${escape(C.key(item.sport,item.id))}" maxlength="800" rows="2" placeholder="What are you watching for?">${escape(item.note)}</textarea><button type="button" class="desk-link" data-desk-game="${escape(C.key(item.sport,item.id))}">Open game report ${icon('arrow')}</button>`;
      if(current){const marks=document.createElement('div');marks.className='desk-watch-crests';marks.innerHTML=teamMark(current.g.away)+`<span>vs</span>`+teamMark(current.g.home);card.prepend(marks);}
      host.appendChild(card);
    });
  }
  async function renderWatchlist() { paintWatchlist(); await loadAgenda(); }
  function renderResearch() {
    const host=$d('desk-research-comparisons');
    if (!host.dataset.ready) { host.dataset.ready='1'; ['nfl','cfb'].forEach(s=>root.SportsHubFootballDevelopment?.mountSummary(host,s,'append')); }
  }
  function tile(path,title,desc,i) { return `<button type="button" class="desk-tile${CLUBS[path]?' desk-team-tile desk-tile-'+path:''}" data-desk-route="${path}"><span class="desk-tile-icon">${CLUBS[path]?teamMark(CLUBS[path]):icon(i)}</span><b>${title}</b><p>${desc}</p><span class="desk-tile-arrow">${icon('arrow')}</span></button>`; }
  function renderExplore() {
    const host=$d('desk-explore-grid');
    const groups = [
      ['Make a decision','models/all/picks','models/all/results','watchlist','fantasy/gm','fantasy/lineup','pickem'],
      ['Follow your sports','eagles','redsox','nfl','cfb','models/mlb/picks','models/nba/picks','news'],
      ['Go deeper','nfl/research','cfb/research','fantasy/season','models/all/calibration','models/all/method','tools','about'],
    ];
    host.innerHTML=groups.map(([title,...paths])=>`<section class="desk-explore-section"><h2>${title}</h2><div class="desk-explore-grid">${paths.map(path=>links.find(x=>x[0]===path)).filter(Boolean).map(x=>tile(...x)).join('')}</div></section>`).join('');
  }
  function openSearch() {
    const dialog=$d('desk-search-dialog');searchInvoker=document.activeElement;
    dialog.showModal();$d('desk-search-input').value='';paintSearch('');$d('desk-search-input').focus();
  }
  function closeSearch() { $d('desk-search-dialog').close(); }
  function paintSearch(query) {
    const source=links.map(([path,title,description,i])=>({path,title,description,i}));
    const byGame=new Map();
    C.agenda(games,readWatch()).forEach(({sport,g})=>byGame.set(C.key(sport,g.id),{ game:C.key(sport,g.id),title:`${g.away.name} at ${g.home.name}`,description:`${LEAGUES[sport].label} · ${dateText(g.date)}`,i:'watchlist' }));
    readWatch().forEach(r=>{const k=C.key(r.sport,r.id);if(!byGame.has(k))byGame.set(k,{game:k,title:`${r.away} at ${r.home}`,description:`Saved game · ${r.note}`,i:'watchlist'});else if(r.note)byGame.get(k).description+=` · ${r.note}`;});
    searchItems=C.search([...source,...byGame.values()],query);
    $d('desk-search-results').innerHTML=searchItems.length ? searchItems.map((x,i)=>`<button type="button" class="desk-search-result" data-search-index="${i}"><span>${icon(x.i)}</span><span><b>${escape(x.title)}</b><small>${escape(x.description)}</small></span>${icon('arrow')}</button>`).join('') : '<div class="desk-empty">No matches. Try “waivers”, “results”, “NFL” or a team name.</div>';
    $d('desk-search-count').textContent=`${searchItems.length} destination${searchItems.length===1?'':'s'}`;
  }
  async function openSavedGame(k) {
    const item=games.find(x=>C.key(x.sport,x.g.id)===k);
    if(item){openGameDetail(item.sport,item.g.id,item.g);return;}
    const saved=readWatch().find(x=>C.key(x.sport,x.id)===k);
    if(saved){
      // A bookmark is not a score feed. Resolve the real event before calculating.
      const data=await safeJSON(`${SITE}/${LEAGUES[saved.sport].espnPath}/summary?event=${saved.id}`,30000);
      const header=data?.header;
      const g=header?.competitions?.[0]?.competitors?.length ? normEvent({...header,id:saved.id,date:header.competitions[0].date||saved.date}) : null;
      await openGameDetail(saved.sport,saved.id,g);
    }
  }
  async function refresh() {
    document.querySelectorAll('[data-desk-refresh]').forEach(b=>b.disabled=true);
    const panel=currentTab;
    try {
      cache.clear(); boardAt=0;
      if(panel==='fantasy') { fanState.synced={}; fanState.forceSync=true; }
      const outcomes=await Promise.allSettled([loadAgenda(true),root.SportsHubCloudAI?.sync?.()]);
      cloudFailed=outcomes[1].status==='rejected';paintBrief();
      if(currentTab===panel) {
        if(panel==='research') { const host=$d('desk-research-comparisons');host.replaceChildren();delete host.dataset.ready; }
        await renderers[panel]?.();injectJumpNav(panel);applySections(panel);paintStaleNote();
      }
      toast(cloudFailed||agendaErrors.length?'Refresh finished. Some feeds are unavailable; saved information is shown.':'Updated from the available feeds.');
    }
    catch (_) { toast('This view could not refresh. Your saved information is still available.'); }
    finally {document.querySelectorAll('[data-desk-refresh]').forEach(b=>b.disabled=false);}
  }
  function init() {
    document.querySelectorAll('[data-desk-icon]').forEach(n=>n.innerHTML=icon(n.dataset.deskIcon));
    Object.entries(CLUBS).forEach(([path,club])=>{const node=document.querySelector(`#tab-${path} .ic`);if(node)node.innerHTML=teamMark(club);});
    // Keep an abbreviation if a feed logo is missing or cannot load.
    document.addEventListener('error',e=>{if(e.target.matches?.('img[data-team-logo]'))e.target.hidden=true;},true);
    renderExplore();paintBrief();paintWatchButtons();
    document.addEventListener('click',e=>{
      const route=e.target.closest('[data-desk-route]'); if(route){navigate(route.dataset.deskRoute);return;}
      if(e.target.closest('[data-desk-search]')){openSearch();return;}
      if(e.target.closest('[data-search-close]')){closeSearch();return;}
      const sr=e.target.closest('[data-search-index]');if(sr){const x=searchItems[Number(sr.dataset.searchIndex)];closeSearch();if(x?.game)openSavedGame(x.game);else if(x)navigate(x.path);return;}
      const game=e.target.closest('[data-desk-game]');if(game){openSavedGame(game.dataset.deskGame);return;}
      const filter=e.target.closest('[data-agenda-filter]');if(filter){agendaFilter=filter.dataset.agendaFilter;agendaLimit=6;paintAgenda();$d('desk-agenda-filters').querySelector(`[data-agenda-filter="${agendaFilter}"]`)?.focus();return;}
      if(e.target.closest('[data-agenda-more]')){agendaLimit+=12;paintAgenda();return;}
      if(e.target.closest('[data-desk-refresh]')){refresh();return;}
      const remove=e.target.closest('[data-watch-remove]');if(remove){const list=readWatch(),item=list.find(r=>C.key(r.sport,r.id)===remove.dataset.watchRemove);if(saveWatch(list.filter(r=>r!==item))){undoItem=item;toast('Removed from your watchlist.',true);}}
      if(e.target.closest('[data-watch-undo]')&&undoItem){const list=readWatch();if(list.length>=80){toast('Your watchlist is full. Remove another game to restore this one.');return;}if(saveWatch([undoItem,...list.filter(r=>C.key(r.sport,r.id)!==C.key(undoItem.sport,undoItem.id))])){undoItem=null;toast('Game and note restored.');}}
    });
    document.addEventListener('input',e=>{
      if(e.target.id==='desk-search-input')paintSearch(e.target.value);
      const note=e.target.closest('[data-watch-note]');if(note){const list=readWatch();const row=list.find(r=>C.key(r.sport,r.id)===note.dataset.watchNote);if(row){row.note=note.value;const ok=saveWatch(list);note.closest('article').querySelector('[data-note-status]').textContent=ok?'Saved on this device':'Could not save';}}
    });
    document.addEventListener('keydown',e=>{
      const editing=e.target.matches('input,textarea,select')||e.target.isContentEditable;
      if((e.key.toLowerCase()==='k'&&(e.metaKey||e.ctrlKey))||(e.key==='/'&&!editing)){e.preventDefault();openSearch();}
      const dialog=$d('desk-search-dialog');if(!dialog.open)return;
      if(e.key==='Escape'){e.preventDefault();closeSearch();return;}
      const items=[...dialog.querySelectorAll('[data-search-index]')],at=items.indexOf(document.activeElement);
      if(e.key==='ArrowDown'){e.preventDefault();items[Math.min(at+1,items.length-1)]?.focus();}
      if(e.key==='ArrowUp'){e.preventDefault();if(at<=0)$d('desk-search-input').focus();else items[at-1]?.focus();}
      if(e.key==='Enter'&&e.target.id==='desk-search-input'){e.preventDefault();items[0]?.click();}
    });
    $d('desk-search-dialog').addEventListener('click',e=>{if(e.target===$d('desk-search-dialog'))closeSearch();});
    $d('desk-search-dialog').addEventListener('close',()=>searchInvoker?.focus?.());
    $d('tabs').addEventListener('keydown',e=>{
      if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
      const tabs=[...$d('tabs').querySelectorAll('[role="tab"]')],at=tabs.indexOf(e.target.closest('[role="tab"]'));
      if(at<0)return;e.preventDefault();
      const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(at+(e.key==='ArrowDown'?1:-1)+tabs.length)%tabs.length;
      tabs[next].focus();
    });
    window.addEventListener('popstate',restoreRoute);
    window.addEventListener('hashchange',()=>{if(location.hash!==C.hashFor(currentRoute))restoreRoute();});
    window.addEventListener('sportshub:cloud-ai',()=>{cloudFailed=false;paintBrief();paintAgenda();});
    window.addEventListener('sportshub:cloud-error',()=>{cloudFailed=true;paintBrief();});
    window.addEventListener('sportshub:fantasy-rendered',focusSection);
    window.addEventListener('sportshub:league-updated',paintBrief);
    window.addEventListener('storage',e=>{if(e.key===WATCH_KEY){paintWatchButtons();paintWatchlist();paintAgenda();paintBrief();}});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentTab==='home'){paintBrief();loadAgenda();}});
    $d('desk-board-fold').addEventListener('toggle',e=>{try{localStorage.setItem('sportshub:desk:board-open',String(e.target.open));}catch(_){}});
    try{$d('desk-board-fold').open=localStorage.getItem('sportshub:desk:board-open')==='true';}catch(_){}
  }
  root.SportsHubDesk=Object.freeze({init,renderHome,renderResearch,renderWatchlist,renderExplore,addWatchControl,onTab,restoreRoute,navigate,syncAI,syncResearch,paintBrief,focusSection});
})(globalThis);

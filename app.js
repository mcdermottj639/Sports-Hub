// Sports-Hub — pure browser app. Live data comes straight from ESPN's free
// public sports feed (no key, no server). Edit LEAGUES below to make it yours.

const APP_VERSION = 'v7';

const LEAGUES = {
  nfl:    { label: 'NFL',    emoji: '🏈', espnPath: 'football/nfl',   fav: ['Philadelphia Eagles'] },
  nba:    { label: 'NBA',    emoji: '🏀', espnPath: 'basketball/nba', fav: ['Philadelphia 76ers'] },
  mlb:    { label: 'MLB',    emoji: '⚾', espnPath: 'baseball/mlb',    fav: ['Philadelphia Phillies'] },
  soccer: { label: 'World Cup', emoji: '🌎', espnPath: 'soccer/fifa.world', fav: ['USA'] }, // FIFA World Cup
};
const FEATURED = { sport: 'nfl', name: 'Philadelphia Eagles' };

// Eagles tab config. ESPN team id for PHI = 21. Coaching staff isn't in the
// public live feed, so it's set here — update if the staff changes.
const EAGLES = {
  teamId: 21,
  staff: [
    { role: 'Head Coach', name: 'Nick Sirianni' },
    { role: 'Offensive Coordinator', name: 'Kevin Patullo' },
    { role: 'Defensive Coordinator', name: 'Vic Fangio' },
  ],
};

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const CORE = 'https://site.api.espn.com/apis/v2/sports';

const state = { scoresSport: FEATURED.sport, standingsSport: FEATURED.sport, liveOK: true };

// --- tiny utils -----------------------------------------------------------
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const cache = new Map();
async function fetchJSON(url, ttl = 60000) {
  const hit = cache.get(url);
  if (hit && Date.now() < hit.exp) return hit.data;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    cache.set(url, { data, exp: Date.now() + ttl });
    return data;
  } finally {
    clearTimeout(t);
  }
}
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const fmtTime = (date) => {
  const d = new Date(date);
  return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// --- ESPN normalizers -----------------------------------------------------
function teamObj(c) {
  const t = c?.team || {};
  return {
    name: t.displayName || t.name,
    abbr: t.abbreviation,
    logo: t.logo || t.logos?.[0]?.href || null,
    score: c?.score != null && c.score !== '' ? Number(c.score) : null,
  };
}
function normEvent(ev) {
  const comp = ev.competitions?.[0] || {};
  const cs = comp.competitors || [];
  const home = cs.find((c) => c.homeAway === 'home') || cs[0] || {};
  const away = cs.find((c) => c.homeAway === 'away') || cs[1] || {};
  const st = ev.status?.type || comp.status?.type || {};
  return {
    id: ev.id,
    date: ev.date,
    state: st.state, // 'pre' | 'in' | 'post'
    statusText: st.shortDetail || st.detail || st.description,
    home: teamObj(home),
    away: teamObj(away),
  };
}
function getStat(stats, names) {
  for (const n of names) {
    const s = (stats || []).find((x) => x.name === n || x.type === n || x.abbreviation === n);
    if (s) return s.displayValue ?? s.value;
  }
  return null;
}
function normStandings(json) {
  const rows = [];
  const children = json.children || (json.standings ? [json] : []);
  children.forEach((child) => {
    const groupName = child.name || child.abbreviation || 'Standings';
    const entries = child.standings?.entries || child.entries || [];
    entries.forEach((e, i) => {
      const t = e.team || {};
      const stats = e.stats || [];
      rows.push({
        group: groupName,
        rank: getStat(stats, ['rank', 'playoffSeed']) ?? i + 1,
        team: t.displayName || t.name,
        logo: t.logos?.[0]?.href || t.logo || null,
        wins: getStat(stats, ['wins']),
        losses: getStat(stats, ['losses']),
        points: getStat(stats, ['points']),
        gp: getStat(stats, ['gamesPlayed']),
      });
    });
  });
  return rows.filter((r) => r.team);
}

// --- data access ----------------------------------------------------------
async function getGames(sport, dateStr) {
  const path = LEAGUES[sport].espnPath;
  const q = dateStr ? `?dates=${dateStr}` : '';
  const json = await fetchJSON(`${SITE}/${path}/scoreboard${q}`);
  return (json.events || []).map(normEvent);
}
async function getStandings(sport) {
  const path = LEAGUES[sport].espnPath;
  const json = await fetchJSON(`${CORE}/${path}/standings`, 5 * 60000);
  return normStandings(json);
}

// --- game helpers ---------------------------------------------------------
const gameState = (g) => (g.state === 'in' ? 'live' : g.state === 'post' ? 'final' : 'scheduled');
function winnerName(g) {
  if (gameState(g) !== 'final' || g.home.score == null || g.away.score == null) return null;
  if (g.home.score === g.away.score) return 'TIE';
  return g.home.score > g.away.score ? g.home.name : g.away.name;
}
const favSet = (sport) => (LEAGUES[sport].fav || []).map((t) => t.toLowerCase());
const isFav = (sport, g) =>
  favSet(sport).includes((g.home.name || '').toLowerCase()) || favSet(sport).includes((g.away.name || '').toLowerCase());

function logoHTML(team) {
  if (team.logo) return `<img class="logo" src="${team.logo}" alt="" onerror="this.style.display='none'"/>`;
  const initials = (team.abbr || (team.name || '?').split(' ').pop()).slice(0, 3).toUpperCase();
  return `<span class="logo placeholder">${initials}</span>`;
}

function gameCard(sport, g) {
  const st = gameState(g);
  const cfg = LEAGUES[sport];
  const win = winnerName(g);
  const card = el('div', 'game-card' + (isFav(sport, g) ? ' fav' : ''));
  const label = st === 'live' ? (g.statusText || 'LIVE') : st === 'final' ? 'FINAL' : g.statusText || fmtTime(g.date) || 'Scheduled';
  const cls = st === 'live' ? 'status live' : st === 'final' ? 'status final' : 'status';
  const row = (team) => {
    const w = win && win !== 'TIE' && win === team.name;
    return `<div class="team-row ${w ? 'winner' : ''}">
      <span class="team">${logoHTML(team)}${team.name || 'TBD'}</span>
      <span class="score">${team.score != null ? team.score : '–'}</span></div>`;
  };
  card.innerHTML = `
    <div class="game-meta">
      <span class="game-league">${cfg.emoji} ${cfg.label}</span>
      <span class="${cls}">${label}</span>
    </div>${row(g.away)}${row(g.home)}
    <div class="tap-hint">tap for live stats →</div>`;
  if (g.id) card.onclick = () => openGameDetail(sport, g.id);
  return card;
}

// --- game detail modal ----------------------------------------------------
const modal = () => $('#game-modal');
function closeModal() { modal().classList.add('hidden'); }
$('#modal-close').addEventListener('click', closeModal);
$('#modal-x').addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

async function openGameDetail(sport, id) {
  modal().classList.remove('hidden');
  $('#modal-body').innerHTML = '<div class="empty">Loading live stats…</div>';
  try {
    const path = LEAGUES[sport].espnPath;
    const data = await fetchJSON(`${SITE}/${path}/summary?event=${id}`, 30000);
    $('#modal-body').innerHTML = renderGameDetail(sport, data);
  } catch (_) {
    $('#modal-body').innerHTML = '<div class="empty">Live stats aren’t available for this game right now.</div>';
  }
}

function renderGameDetail(sport, data) {
  const comp = data.header?.competitions?.[0] || data.competitions?.[0] || {};
  const cs = comp.competitors || [];
  const home = cs.find((c) => c.homeAway === 'home') || cs[0] || {};
  const away = cs.find((c) => c.homeAway === 'away') || cs[1] || {};
  const teamCell = (c) => {
    const t = c.team || {};
    const logo = t.logos?.[0]?.href || t.logo;
    return `<div class="md-team">${logo ? `<img src="${logo}" alt=""/>` : ''}
      <div class="nm">${t.shortDisplayName || t.displayName || t.abbreviation || 'TBD'}</div>
      <div class="sc">${c.score ?? '–'}</div></div>`;
  };
  const st = comp.status?.type || {};
  const live = st.state === 'in';
  let html = `<div class="md-head">${teamCell(away)}<div style="color:var(--muted);font-weight:700">@</div>${teamCell(home)}</div>
    <div class="md-status ${live ? 'live' : ''}">${st.detail || st.shortDetail || ''}</div>`;

  // line score (innings / quarters)
  const aLine = away.linescores || [], hLine = home.linescores || [];
  if (aLine.length || hLine.length) {
    const n = Math.max(aLine.length, hLine.length);
    const cols = Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('');
    const cell = (arr, i) => `<td>${arr[i]?.displayValue ?? arr[i]?.value ?? ''}</td>`;
    const rowFor = (c, arr) => `<tr><td>${c.team?.abbreviation || c.team?.shortDisplayName || ''}</td>${Array.from({ length: n }, (_, i) => cell(arr, i)).join('')}<td><b>${c.score ?? ''}</b></td></tr>`;
    html += `<div class="md-section-title">${sport === 'mlb' ? 'By Inning' : 'By Period'}</div>
      <table class="md-line"><thead><tr><th></th>${cols}<th>T</th></tr></thead>
      <tbody>${rowFor(away, aLine)}${rowFor(home, hLine)}</tbody></table>`;
  }

  // leaders / top performers
  const leadersHTML = [];
  (data.leaders || []).forEach((teamBlock) => {
    (teamBlock.leaders || []).slice(0, 2).forEach((cat) => {
      const top = cat.leaders?.[0];
      if (!top) return;
      const ath = top.athlete || {};
      leadersHTML.push(`<div class="md-leader">
        ${ath.headshot?.href ? `<img src="${ath.headshot.href}" alt=""/>` : '<img alt=""/>'}
        <div><div class="cat">${cat.displayName || cat.name} · ${teamBlock.team?.abbreviation || ''}</div>
        <div class="who">${ath.displayName || ath.shortName || ''}</div></div>
        <div class="val">${top.displayValue || top.value || ''}</div></div>`);
    });
  });
  if (leadersHTML.length) html += `<div class="md-section-title">Top Performers</div>${leadersHTML.join('')}`;

  // team stats comparison (a few key rows)
  const teams = data.boxscore?.teams || [];
  if (teams.length === 2 && (teams[0].statistics || []).length) {
    const a = teams.find((t) => (t.homeAway || '') === 'away') || teams[0];
    const h = teams.find((t) => (t.homeAway || '') === 'home') || teams[1];
    const byName = (t) => Object.fromEntries((t.statistics || []).map((s) => [s.name || s.label, s.displayValue]));
    const sa = byName(a), sh = byName(h);
    const keys = Object.keys(sa).slice(0, 6);
    if (keys.length) {
      html += `<div class="md-section-title">Team Stats</div><table class="md-line"><thead><tr><th>${a.team?.abbreviation || 'Away'}</th><th></th><th>${h.team?.abbreviation || 'Home'}</th></tr></thead><tbody>`;
      keys.forEach((k) => { html += `<tr><td style="text-align:center">${sa[k] ?? ''}</td><td>${k}</td><td>${sh[k] ?? ''}</td></tr>`; });
      html += '</tbody></table>';
    }
  }

  if (!aLine.length && !hLine.length && !leadersHTML.length && !teams.length) {
    html += '<div class="empty" style="margin-top:14px">Detailed stats will appear once the game is underway.</div>';
  }
  return html;
}

function renderGames(container, bySport) {
  container.innerHTML = '';
  const all = [];
  for (const [sport, games] of Object.entries(bySport)) (games || []).forEach((g) => all.push({ sport, g }));
  all.sort((a, b) => (isFav(b.sport, b.g) ? 1 : 0) - (isFav(a.sport, a.g) ? 1 : 0));
  if (!all.length) {
    container.appendChild(el('div', 'empty', 'No games for this selection.'));
    return;
  }
  all.forEach(({ sport, g }) => container.appendChild(gameCard(sport, g)));
}

// --- demo fallback (only if the network is unavailable) -------------------
const DEMO = {
  nfl: [{ id: 'd1', date: new Date().toISOString(), state: 'in', statusText: 'Q3 04:12',
    home: { name: 'Philadelphia Eagles', abbr: 'PHI', logo: null, score: 21 },
    away: { name: 'Dallas Cowboys', abbr: 'DAL', logo: null, score: 17 } }],
  nba: [{ id: 'd2', date: new Date().toISOString(), state: 'pre', statusText: '7:00 PM',
    home: { name: 'Philadelphia 76ers', abbr: 'PHI', logo: null, score: null },
    away: { name: 'Boston Celtics', abbr: 'BOS', logo: null, score: null } }],
  mlb: [{ id: 'd3', date: new Date().toISOString(), state: 'in', statusText: 'Top 6',
    home: { name: 'Philadelphia Phillies', abbr: 'PHI', logo: null, score: 4 },
    away: { name: 'Atlanta Braves', abbr: 'ATL', logo: null, score: 3 } }],
  soccer: [{ id: 'd4', date: new Date().toISOString(), state: 'pre', statusText: 'Tomorrow',
    home: { name: 'Arsenal', abbr: 'ARS', logo: null, score: null },
    away: { name: 'Manchester City', abbr: 'MCI', logo: null, score: null } }],
};

// --- HOME -----------------------------------------------------------------
async function renderHome() {
  const sports = Object.keys(LEAGUES);
  const results = await Promise.allSettled(sports.map((s) => getGames(s, ymd(new Date()))));
  const games = {};
  let anyOK = false;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { games[sports[i]] = r.value; anyOK = true; }
    else { games[sports[i]] = DEMO[sports[i]] || []; }
  });
  setMode(anyOK);

  const featName = FEATURED.name.toLowerCase();
  const fg = (games[FEATURED.sport] || []).find(
    (g) => (g.home.name || '').toLowerCase() === featName || (g.away.name || '').toLowerCase() === featName
  );
  let html = `<h2>🦅 ${FEATURED.name}</h2>`;
  try {
    const st = await getStandings(FEATURED.sport);
    const row = st.find((r) => (r.team || '').toLowerCase() === featName);
    if (row) html += `<div class="muted">${row.group ? row.group + ' • ' : ''}#${row.rank} • ${row.wins ?? 0}-${row.losses ?? 0}</div>`;
  } catch (_) {}
  html += '<div class="featured-line">';
  if (fg) {
    const s = gameState(fg);
    const lbl = s === 'live' ? (fg.statusText || 'LIVE') : s === 'final' ? 'Final' : fg.statusText || fmtTime(fg.date);
    html += `<div class="featured-game"><div><strong>${fg.away.name}</strong> ${fg.away.score ?? ''} @ <strong>${fg.home.name}</strong> ${fg.home.score ?? ''}</div>
      <span class="status ${s === 'live' ? 'live' : s === 'final' ? 'final' : ''}">${lbl}</span></div>`;
  } else {
    html += `<div class="muted">No game today. Check the Scores tab for the full slate.</div>`;
  }
  html += '</div>';
  $('#featured').innerHTML = html;
  renderGames($('#home-games'), games);
}

// --- SCORES ---------------------------------------------------------------
function buildChips(container, current, onPick) {
  container.innerHTML = '';
  for (const [sport, cfg] of Object.entries(LEAGUES)) {
    const chip = el('button', 'chip' + (sport === current ? ' active' : ''), `${cfg.emoji} ${cfg.label}`);
    chip.onclick = () => onPick(sport);
    container.appendChild(chip);
  }
}
async function renderScores() {
  const dateInput = $('#scores-date');
  if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  buildChips($('#sport-filter'), state.scoresSport, (s) => { state.scoresSport = s; renderScores(); });
  const container = $('#scores-games');
  container.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const games = await getGames(state.scoresSport, dateInput.value.replaceAll('-', ''));
    renderGames(container, { [state.scoresSport]: games });
  } catch (_) {
    renderGames(container, { [state.scoresSport]: DEMO[state.scoresSport] });
  }
}

// --- STANDINGS ------------------------------------------------------------
async function renderStandings() {
  buildChips($('#standings-filter'), state.standingsSport, (s) => { state.standingsSport = s; renderStandings(); });
  const content = $('#standings-content');
  content.innerHTML = '<div class="empty">Loading…</div>';
  let rows = [];
  try { rows = await getStandings(state.standingsSport); } catch (_) {}
  if (!rows.length) { content.innerHTML = '<div class="empty">Standings unavailable right now.</div>'; return; }

  const soccer = state.standingsSport === 'soccer';
  const groups = {};
  rows.forEach((r) => (groups[r.group || 'Standings'] = groups[r.group || 'Standings'] || []).push(r));
  content.innerHTML = '';
  const favs = favSet(state.standingsSport);
  for (const [name, grows] of Object.entries(groups)) {
    content.appendChild(el('div', 'standings-group', name));
    const table = el('table');
    table.innerHTML = `<thead><tr><th>#</th><th>Team</th><th class="num">W</th><th class="num">L</th><th class="num">${soccer ? 'Pts' : 'GP'}</th></tr></thead>`;
    const tbody = el('tbody');
    grows.forEach((r) => {
      const tr = el('tr', favs.includes((r.team || '').toLowerCase()) ? 'fav' : '');
      const last = soccer ? (r.points ?? '–') : (r.gp ?? '–');
      const logo = r.logo ? `<img class="tlogo" src="${r.logo}" onerror="this.style.display='none'"/>` : '';
      tr.innerHTML = `<td>${r.rank}</td><td>${logo}${r.team}</td><td class="num">${r.wins ?? '–'}</td><td class="num">${r.losses ?? '–'}</td><td class="num">${last}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    content.appendChild(table);
  }
}

// --- PREDICTIONS ----------------------------------------------------------
const PRED_KEY = 'sportshub:predictions';
const getPreds = () => JSON.parse(localStorage.getItem(PRED_KEY) || '{}');
const savePreds = (p) => localStorage.setItem(PRED_KEY, JSON.stringify(p));

async function renderPredictions() {
  const sports = Object.keys(LEAGUES);
  const results = await Promise.allSettled(sports.map((s) => getGames(s, ymd(new Date()))));
  const preds = getPreds();
  const up = $('#pred-upcoming'); const res = $('#pred-results');
  up.innerHTML = ''; res.innerHTML = '';
  let correct = 0, decided = 0, upCount = 0, resCount = 0;

  results.forEach((r, idx) => {
    if (r.status !== 'fulfilled') return;
    const sport = sports[idx];
    for (const g of r.value) {
      if (!g.id) continue;
      const st = gameState(g);
      if (st === 'scheduled') {
        upCount++;
        const card = gameCard(sport, g);
        const btns = el('div', 'pick-btns');
        [g.away, g.home].forEach((team) => {
          const b = el('button', preds[g.id] === team.name ? 'picked' : '', team.name);
          b.onclick = (e) => { e.stopPropagation(); const p = getPreds(); p[g.id] = team.name; savePreds(p); renderPredictions(); };
          btns.appendChild(b);
        });
        card.appendChild(btns);
        up.appendChild(card);
      } else if (st === 'final' && preds[g.id]) {
        resCount++; decided++;
        const win = winnerName(g);
        const got = win === preds[g.id];
        if (got) correct++;
        const card = gameCard(sport, g);
        card.appendChild(el('div', 'pred-outcome ' + (got ? 'win' : 'loss'),
          got ? `✅ You picked ${preds[g.id]} — correct!` : `❌ You picked ${preds[g.id]} — ${win || 'no result'}`));
        res.appendChild(card);
      }
    }
  });
  if (!upCount) up.appendChild(el('div', 'empty', 'No upcoming games to pick today.'));
  if (!resCount) res.appendChild(el('div', 'empty', 'No graded picks yet. Make some picks above!'));
  $('#pred-score').textContent = decided ? `${correct}/${decided} correct (${Math.round((correct / decided) * 100)}%)` : '';
}

// --- FANTASY --------------------------------------------------------------
const MLB_TEAMS = ['Arizona Diamondbacks','Athletics','Atlanta Braves','Baltimore Orioles','Boston Red Sox','Chicago Cubs','Chicago White Sox','Cincinnati Reds','Cleveland Guardians','Colorado Rockies','Detroit Tigers','Houston Astros','Kansas City Royals','Los Angeles Angels','Los Angeles Dodgers','Miami Marlins','Milwaukee Brewers','Minnesota Twins','New York Mets','New York Yankees','Philadelphia Phillies','Pittsburgh Pirates','San Diego Padres','San Francisco Giants','Seattle Mariners','St. Louis Cardinals','Tampa Bay Rays','Texas Rangers','Toronto Blue Jays','Washington Nationals'];
const NFL_TEAMS = ['Arizona Cardinals','Atlanta Falcons','Baltimore Ravens','Buffalo Bills','Carolina Panthers','Chicago Bears','Cincinnati Bengals','Cleveland Browns','Dallas Cowboys','Denver Broncos','Detroit Lions','Green Bay Packers','Houston Texans','Indianapolis Colts','Jacksonville Jaguars','Kansas City Chiefs','Las Vegas Raiders','Los Angeles Chargers','Los Angeles Rams','Miami Dolphins','Minnesota Vikings','New England Patriots','New Orleans Saints','New York Giants','New York Jets','Philadelphia Eagles','Pittsburgh Steelers','San Francisco 49ers','Seattle Seahawks','Tampa Bay Buccaneers','Tennessee Titans','Washington Commanders'];

// Pre-loaded from the Duran Duran ESPN roster (teams pre-filled where known;
// set the rest with the dropdown to enable live game tracking).
const DEFAULT_ROSTERS = {
  baseball: [
    { name: 'C. Jensen', slot: 'C', pos: 'C, DH', status: 'active', team: '' },
    { name: 'K. Clemens', slot: '1B', pos: '1B, 2B, OF', status: 'active', team: '' },
    { name: 'O. Lopez', slot: '2B', pos: 'SS, 2B', status: 'active', team: '' },
    { name: 'E. Suarez', slot: '3B', pos: '3B, DH', status: 'active', team: 'Arizona Diamondbacks' },
    { name: 'M. Betts', slot: 'SS', pos: 'SS', status: 'active', team: 'Los Angeles Dodgers' },
    { name: 'L. Garcia Jr.', slot: '2B/SS', pos: '2B, 1B', status: 'active', team: 'Washington Nationals' },
    { name: 'S. Antonacci', slot: '1B/3B', pos: '2B, 3B, OF', status: 'active', team: '' },
    { name: 'J. Caballero', slot: 'OF', pos: 'OF, 2B, 3B, SS', status: 'active', team: 'Tampa Bay Rays' },
    { name: 'C. Carroll', slot: 'OF', pos: 'OF', status: 'active', team: 'Arizona Diamondbacks' },
    { name: 'J. Duran', slot: 'OF', pos: 'OF', status: 'active', team: 'Boston Red Sox' },
    { name: 'J. Lee', slot: 'OF', pos: 'OF', status: 'active', team: '' },
    { name: 'K. Schwarber', slot: 'UTIL', pos: 'DH', status: 'active', team: 'Philadelphia Phillies' },
    { name: 'S. Baz', slot: 'SP', pos: 'SP', status: 'active', team: 'Tampa Bay Rays' },
    { name: 'D. Bednar', slot: 'RP', pos: 'RP', status: 'active', team: 'Pittsburgh Pirates' },
    { name: 'J. Duran', slot: 'RP', pos: 'RP', status: 'active', team: 'Minnesota Twins' },
    { name: 'F. Griffin', slot: 'SP', pos: 'SP', status: 'active', team: '' },
    { name: 'D. Martin', slot: 'SP', pos: 'SP', status: 'active', team: '' },
    { name: 'J. Ritchie', slot: 'SP', pos: 'SP', status: 'active', team: '' },
    { name: 'E. Rodriguez', slot: 'SP', pos: 'SP', status: 'active', team: 'Arizona Diamondbacks' },
    { name: 'B. Young', slot: 'SP', pos: 'SP', status: 'active', team: '' },
    { name: 'J. Wilson', slot: 'BE', pos: 'SS', status: 'bench', team: '' },
    { name: 'Z. Gallen', slot: 'BE', pos: 'SP', status: 'bench', team: 'Arizona Diamondbacks' },
    { name: 'J. Leiter', slot: 'BE', pos: 'SP', status: 'bench', team: 'Texas Rangers' },
    { name: 'C. Rodon', slot: 'BE', pos: 'SP', status: 'bench', team: 'New York Yankees' },
    { name: 'R. Sasaki', slot: 'BE', pos: 'SP', status: 'bench', team: 'Los Angeles Dodgers' },
    { name: 'R. Anthony', slot: 'IL', pos: 'OF, DH', status: 'il', team: 'Boston Red Sox' },
    { name: 'M. Murakami', slot: 'IL', pos: '3B, 1B', status: 'il', team: '' },
    { name: 'C. Estevez', slot: 'IL', pos: 'RP', status: 'il', team: '' },
  ],
  football: [],
};

const fanState = { sport: 'baseball', gamesByTeam: {} };
const fanKey = (s) => `sportshub:fantasy:${s}`;
function loadRoster(sport) {
  const saved = localStorage.getItem(fanKey(sport));
  if (saved) { try { return JSON.parse(saved); } catch (_) {} }
  return JSON.parse(JSON.stringify(DEFAULT_ROSTERS[sport]));
}
const saveRoster = (sport, roster) => localStorage.setItem(fanKey(sport), JSON.stringify(roster));

// Map every team playing today -> its game, so we can attach a game to each player.
function buildGameIndex(games) {
  const idx = {};
  (games || []).forEach((g) => {
    if (g.home.name) idx[g.home.name] = { g, side: 'home', opp: g.away };
    if (g.away.name) idx[g.away.name] = { g, side: 'away', opp: g.home };
  });
  return idx;
}
function playerGame(player) {
  if (!player.team) return null;
  return fanState.gamesByTeam[player.team] || null;
}
function gameLabel(pg) {
  if (!pg) return { text: 'No game today', cls: 'off' };
  const st = gameState(pg.g);
  const vs = (pg.side === 'home' ? 'vs ' : '@ ') + (pg.opp.abbr || pg.opp.name || 'TBD');
  if (st === 'live') return { text: `${vs} · ${pg.g.statusText || 'LIVE'}`, cls: 'live' };
  if (st === 'final') {
    const me = pg.side === 'home' ? pg.g.home.score : pg.g.away.score;
    const them = pg.side === 'home' ? pg.g.away.score : pg.g.home.score;
    const res = me != null && them != null ? (me > them ? 'W' : me < them ? 'L' : 'T') : '';
    return { text: `${vs} · Final ${res} ${me ?? ''}-${them ?? ''}`.trim(), cls: 'final' };
  }
  return { text: `${vs} · ${fmtTime(pg.g.date) || 'Today'}`, cls: '' };
}

// Per-player live stat lines from each game's box score (baseball).
function parseName(name) {
  const parts = (name || '').replace(/\b(Jr\.?|Sr\.?|II|III|IV)\b/g, '').trim().split(/\s+/).filter(Boolean);
  return { init: (parts[0] || '')[0] || '', last: (parts[parts.length - 1] || '') };
}
function nameMatches(full, init, last) {
  const f = parseName(full);
  return f.last.toLowerCase() === last.toLowerCase() && f.init.toLowerCase() === init.toLowerCase();
}
function parseBoxscore(data) {
  const out = [];
  (data.boxscore?.players || []).forEach((tb) => {
    (tb.statistics || []).forEach((grp) => {
      const labels = grp.labels || grp.names || [];
      const type = (grp.type || grp.name || '').toLowerCase();
      (grp.athletes || []).forEach((a) => {
        const dict = {};
        labels.forEach((l, i) => (dict[l] = (a.stats || [])[i]));
        out.push({ name: a.athlete?.displayName || a.athlete?.shortName || '', type, dict });
      });
    });
  });
  return out;
}
async function loadStatLines(roster) {
  const ids = new Set();
  roster.forEach((p) => { const pg = playerGame(p); if (pg && gameState(pg.g) !== 'scheduled' && pg.g.id) ids.add(pg.g.id); });
  const path = LEAGUES['mlb'].espnPath;
  const map = {};
  await Promise.allSettled([...ids].map(async (id) => {
    try { map[id] = parseBoxscore(await fetchJSON(`${SITE}/${path}/summary?event=${id}`, 30000)); } catch (_) { map[id] = []; }
  }));
  return map;
}
const isPitcher = (p) => /\b(SP|RP|P)\b/.test(p.pos || '') || ['SP', 'RP', 'P'].includes(p.slot);
function playerLine(p, entries) {
  const { init, last } = parseName(p.name);
  const want = isPitcher(p) ? 'pitching' : 'batting';
  const e = (entries || []).find((x) => x.type === want && nameMatches(x.name, init, last));
  if (!e) return null;
  const d = e.dict;
  if (want === 'pitching') return { text: `${d.IP ?? '0.0'} IP · ${d.K ?? 0} K · ${d.ER ?? 0} ER`, d, pitcher: true };
  const hr = Number(d.HR || 0), rbi = Number(d.RBI || 0);
  return { text: `${d.H ?? 0}-${d.AB ?? 0}${hr ? `, ${hr} HR` : ''}${rbi ? `, ${rbi} RBI` : ''}`, d, pitcher: false };
}

async function renderFantasy() {
  // sport chips
  const chips = $('#fantasy-sport');
  chips.innerHTML = '';
  [['baseball', '⚾ Baseball'], ['football', '🏈 Football']].forEach(([s, label]) => {
    const c = el('button', 'chip' + (s === fanState.sport ? ' active' : ''), label);
    c.onclick = () => { fanState.sport = s; renderFantasy(); };
    chips.appendChild(c);
  });

  const leagueKey = fanState.sport === 'baseball' ? 'mlb' : 'nfl';
  let games = [];
  try { games = await getGames(leagueKey, ymd(new Date())); } catch (_) {}
  fanState.gamesByTeam = buildGameIndex(games);

  const roster = loadRoster(fanState.sport);

  // live per-player stat lines (baseball only) + team totals
  const statMap = fanState.sport === 'baseball' ? await loadStatLines(roster) : {};
  const lineFor = (p) => {
    const pg = playerGame(p);
    if (!pg || !pg.g.id || gameState(pg.g) === 'scheduled') return null;
    return playerLine(p, statMap[pg.g.id]);
  };
  const tot = { H: 0, HR: 0, RBI: 0, R: 0, K: 0 };
  let hasTotals = false;
  roster.filter((p) => p.status === 'active').forEach((p) => {
    const ln = lineFor(p);
    if (!ln) return;
    hasTotals = true;
    if (ln.pitcher) tot.K += Number(ln.d.K || 0);
    else { tot.H += Number(ln.d.H || 0); tot.HR += Number(ln.d.HR || 0); tot.RBI += Number(ln.d.RBI || 0); tot.R += Number(ln.d.R || 0); }
  });

  // analytics
  const starters = roster.filter((p) => p.status === 'active');
  const startersWithTeam = starters.filter((p) => p.team);
  const startersPlaying = startersWithTeam.filter((p) => playerGame(p));
  const idleStarters = startersWithTeam.filter((p) => !playerGame(p));
  const benchPlaying = roster.filter((p) => p.status === 'bench' && playerGame(p));
  const needTeam = roster.filter((p) => !p.team).length;
  const ilCount = roster.filter((p) => p.status === 'il').length;

  const card = (val, lbl, cls) => `<div class="fan-card ${cls || ''}"><div class="big">${val}</div><div class="lbl">${lbl}</div></div>`;
  $('#fantasy-analytics').innerHTML =
    card(`${startersPlaying.length}/${starters.length}`, 'Starters in action today', 'good') +
    (hasTotals ? card(`${tot.H} H · ${tot.HR} HR`, `Today: ${tot.RBI} RBI, ${tot.R} R, ${tot.K} K`, 'good') : '') +
    card(idleStarters.length, 'Starters idle (off day)', idleStarters.length ? 'warn' : '') +
    card(benchPlaying.length, 'Bench guys playing', benchPlaying.length ? 'warn' : '') +
    card(ilCount, 'On IL') +
    (needTeam ? card(needTeam, 'Need team set', 'warn') : '');

  // recommendations
  const recs = [];
  benchPlaying.forEach((b) => {
    const idleMatch = idleStarters.find((s) => s.pos && b.pos && s.pos.split(',')[0].trim() === b.pos.split(',')[0].trim());
    if (idleMatch) recs.push(`🔁 Consider starting <b>${b.name}</b> (playing today) over <b>${idleMatch.name}</b> (off today).`);
    else recs.push(`▶️ <b>${b.name}</b> is on your bench but has a game today — consider activating.`);
  });
  idleStarters.forEach((s) => {
    if (!benchPlaying.length) recs.push(`💤 <b>${s.name}</b> has no game today (off day) — you may be leaving a slot empty.`);
  });
  roster.filter((p) => p.status === 'il' && p.slot !== 'IL').forEach((p) => recs.push(`🩹 <b>${p.name}</b> is marked IL but sitting in a starting slot — swap them out.`));
  const probableSP = starters.filter((p) => /SP/.test(p.pos) && playerGame(p) && gameState(playerGame(p).g) !== 'final');
  if (probableSP.length) recs.push(`⚾ Pitchers with games today: ${probableSP.map((p) => `<b>${p.name}</b>`).join(', ')}.`);
  if (needTeam) recs.push(`⚙️ Set the team for ${needTeam} player(s) below to unlock their live tracking.`);

  $('#fantasy-recs').innerHTML = `<h3>Recommendations</h3>` +
    (recs.length ? `<ul>${recs.map((r) => `<li>${r}</li>`).join('')}</ul>` : `<div class="none">Your lineup looks set — everyone active has a game today. 🔥</div>`);

  // roster (grouped)
  const teamOpts = (fanState.sport === 'baseball' ? MLB_TEAMS : NFL_TEAMS);
  const groups = { active: 'Starters', bench: 'Bench', il: 'Injured List' };
  const container = $('#fantasy-roster');
  container.innerHTML = '';
  if (!roster.length) {
    container.appendChild(el('div', 'empty', 'No players yet. Tap “Add player” to build your roster.'));
  }
  Object.entries(groups).forEach(([statusKey, label]) => {
    const rows = roster.map((p, i) => ({ p, i })).filter(({ p }) => p.status === statusKey);
    if (!rows.length) return;
    container.appendChild(el('div', 'roster-group', label));
    rows.forEach(({ p, i }) => {
      const pg = playerGame(p);
      const gl = gameLabel(pg);
      const ln = lineFor(p);
      const lineHTML = ln ? ` <b style="color:var(--accent)">— ${ln.text}</b>` : '';
      const row = el('div', 'fan-row');
      const teamSel = `<select data-i="${i}" data-f="team"><option value="">— set team —</option>${teamOpts.map((t) => `<option ${t === p.team ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
      const statSel = `<select data-i="${i}" data-f="status">${['active','bench','il'].map((s) => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${s === 'active' ? 'Starter' : s === 'bench' ? 'Bench' : 'IL'}</option>`).join('')}</select>`;
      row.innerHTML = `
        <div><div class="pname">${p.name}</div><div class="ppos">${p.slot} · ${p.pos || ''}</div>
          <div class="pgame ${gl.cls}">${gl.text}${lineHTML}</div></div>
        <div>${teamSel}</div>
        <div>${statSel}</div>
        <button class="rm" data-i="${i}" title="Remove">×</button>`;
      container.appendChild(row);
    });
  });

  // wire row controls
  container.querySelectorAll('select').forEach((sel) => {
    sel.onchange = () => {
      const r = loadRoster(fanState.sport);
      r[+sel.dataset.i][sel.dataset.f] = sel.value;
      saveRoster(fanState.sport, r);
      renderFantasy();
    };
  });
  container.querySelectorAll('.rm').forEach((btn) => {
    btn.onclick = () => {
      const r = loadRoster(fanState.sport);
      r.splice(+btn.dataset.i, 1);
      saveRoster(fanState.sport, r);
      renderFantasy();
    };
  });
}

$('#fan-add').addEventListener('click', () => {
  const name = prompt('Player name?');
  if (!name) return;
  const r = loadRoster(fanState.sport);
  r.push({ name: name.trim(), slot: 'BE', pos: '', status: 'bench', team: '' });
  saveRoster(fanState.sport, r);
  renderFantasy();
});
$('#fan-reset').addEventListener('click', () => {
  if (!confirm('Reset this roster to the default? Your edits will be lost.')) return;
  localStorage.removeItem(fanKey(fanState.sport));
  renderFantasy();
});

// --- EAGLES ---------------------------------------------------------------
const NFL_TEAM = `${SITE}/football/nfl/teams/${EAGLES.teamId}`;

async function renderEagles() {
  const [teamR, rosterR, newsR] = await Promise.allSettled([
    fetchJSON(NFL_TEAM, 5 * 60000),
    fetchJSON(`${NFL_TEAM}/roster`, 30 * 60000),
    fetchJSON(`${SITE}/football/nfl/news?team=${EAGLES.teamId}`, 10 * 60000),
  ]);

  // hero
  const t = teamR.status === 'fulfilled' ? teamR.value.team : null;
  const logo = t?.logos?.[0]?.href;
  const rec = t?.record?.items?.[0]?.summary;
  const standing = t?.standingSummary;
  const next = t?.nextEvent?.[0];
  let hero = `<h2>${logo ? `<img src="${logo}" style="height:30px;vertical-align:middle;margin-right:8px">` : '🦅 '}${t?.displayName || 'Philadelphia Eagles'}</h2>`;
  if (rec || standing) hero += `<div class="muted">${[rec ? `Record ${rec}` : '', standing].filter(Boolean).join(' • ')}</div>`;
  hero += '<div class="featured-line">';
  if (next) {
    const nm = next.name || next.shortName || '';
    const when = next.date ? new Date(next.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + fmtTime(next.date) : '';
    hero += `<div class="featured-game"><div><strong>Next:</strong> ${nm}</div><span class="status">${when}</span></div>`;
  } else {
    hero += `<div class="muted">No game scheduled — schedule fills in as the season approaches.</div>`;
  }
  hero += '</div>';
  $('#eagles-hero').innerHTML = hero;

  // coaching staff
  $('#eagles-staff').innerHTML = EAGLES.staff
    .map((s) => `<div class="staff-card"><div class="role">${s.role}</div><div class="who">${s.name}</div></div>`)
    .join('');

  // roster / depth chart
  const groups = rosterR.status === 'fulfilled' ? (rosterR.value.athletes || []) : [];
  const allPlayers = [];
  const depthEl = $('#eagles-depth');
  if (!groups.length) {
    depthEl.innerHTML = '<div class="empty">Roster unavailable right now.</div>';
  } else {
    depthEl.innerHTML = '';
    groups.forEach((grp) => {
      const items = grp.items || [];
      items.forEach((a) => allPlayers.push(a));
      const byPos = {};
      items.forEach((a) => {
        const pos = a.position?.abbreviation || a.position?.name || '—';
        (byPos[pos] = byPos[pos] || []).push(a);
      });
      const block = el('div', 'depth-group');
      const title = (grp.position || '').replace(/^\w/, (c) => c.toUpperCase()).replace('Specialteam', 'Special Teams');
      block.innerHTML = `<h4>${title || 'Players'}</h4>` + Object.entries(byPos).map(([pos, players]) =>
        `<div class="depth-pos"><div class="pos-label">${pos}</div>${players.map((p) =>
          `<span class="depth-player"><span class="jersey">${p.jersey ? '#' + p.jersey : ''}</span> ${p.displayName || p.fullName}${p.age ? ` <span class="age">${p.age}y</span>` : ''}</span>`).join('')}</div>`
      ).join('');
      depthEl.appendChild(block);
    });
  }

  // analytics (by the numbers)
  const ages = allPlayers.map((a) => a.age).filter((n) => typeof n === 'number');
  const avgAge = ages.length ? (ages.reduce((s, n) => s + n, 0) / ages.length).toFixed(1) : '–';
  const youngest = allPlayers.filter((a) => a.age).sort((a, b) => a.age - b.age)[0];
  const oldest = allPlayers.filter((a) => a.age).sort((a, b) => b.age - a.age)[0];
  const card = (val, lbl) => `<div class="fan-card"><div class="big">${val}</div><div class="lbl">${lbl}</div></div>`;
  $('#eagles-analytics').innerHTML = allPlayers.length
    ? card(allPlayers.length, 'Players on roster') +
      card(avgAge, 'Average age') +
      (youngest ? card(`${youngest.age}`, `Youngest · ${youngest.displayName}`) : '') +
      (oldest ? card(`${oldest.age}`, `Oldest · ${oldest.displayName}`) : '')
    : card('–', 'Roster loading');

  // news
  const articles = newsR.status === 'fulfilled' ? (newsR.value.articles || []) : [];
  const newsEl = $('#eagles-news');
  if (!articles.length) {
    newsEl.innerHTML = '<div class="empty">No recent Eagles news right now — check back as camp opens.</div>';
  } else {
    newsEl.innerHTML = articles.slice(0, 10).map((a) => {
      const href = a.links?.web?.href || a.links?.mobile?.href || '#';
      const img = a.images?.[0]?.url;
      const when = a.published ? new Date(a.published).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
      return `<a class="news-item" href="${href}" target="_blank" rel="noopener">
        ${img ? `<img src="${img}" alt="" onerror="this.style.display='none'">` : ''}
        <div><div class="nh">${a.headline || ''}</div><div class="nd">${a.description || ''}</div><div class="nt">${when}</div></div></a>`;
    }).join('');
  }
}

// --- mode badge + tabs + boot --------------------------------------------
function setMode(live) {
  state.liveOK = live;
  const b = $('#mode-badge');
  if (live) { b.textContent = 'LIVE'; b.className = 'badge live'; $('#about-status').textContent = ''; }
  else { b.textContent = 'OFFLINE'; b.className = 'badge demo'; $('#about-status').textContent = 'Status: could not reach ESPN — showing sample data.'; }
}

const renderers = { home: renderHome, eagles: renderEagles, scores: renderScores, standings: renderStandings, predictions: renderPredictions, fantasy: renderFantasy, about: () => {} };
function showTab(name) {
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === name));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  Promise.resolve(renderers[name]()).catch((e) => console.error(e));
}
$('#tabs').addEventListener('click', (e) => { if (e.target.dataset.tab) showTab(e.target.dataset.tab); });
$('#scores-date').addEventListener('change', renderScores);

const verEl = $('#app-version');
if (verEl) verEl.textContent = APP_VERSION;
showTab('home');

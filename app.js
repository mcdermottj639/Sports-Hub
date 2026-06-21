// Sports-Hub — pure browser app. Live data comes straight from ESPN's free
// public sports feed (no key, no server). Edit LEAGUES below to make it yours.

const LEAGUES = {
  nfl:    { label: 'NFL',    emoji: '🏈', espnPath: 'football/nfl',   fav: ['Philadelphia Eagles'] },
  nba:    { label: 'NBA',    emoji: '🏀', espnPath: 'basketball/nba', fav: ['Philadelphia 76ers'] },
  mlb:    { label: 'MLB',    emoji: '⚾', espnPath: 'baseball/mlb',    fav: ['Philadelphia Phillies'] },
  soccer: { label: 'Soccer', emoji: '⚽', espnPath: 'soccer/eng.1',   fav: [] }, // eng.1 = Premier League
};
const FEATURED = { sport: 'nfl', name: 'Philadelphia Eagles' };

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
    </div>${row(g.away)}${row(g.home)}`;
  return card;
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
          b.onclick = () => { const p = getPreds(); p[g.id] = team.name; savePreds(p); renderPredictions(); };
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

// --- mode badge + tabs + boot --------------------------------------------
function setMode(live) {
  state.liveOK = live;
  const b = $('#mode-badge');
  if (live) { b.textContent = 'LIVE'; b.className = 'badge live'; $('#about-status').textContent = ''; }
  else { b.textContent = 'OFFLINE'; b.className = 'badge demo'; $('#about-status').textContent = 'Status: could not reach ESPN — showing sample data.'; }
}

const renderers = { home: renderHome, scores: renderScores, standings: renderStandings, predictions: renderPredictions, about: () => {} };
function showTab(name) {
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === name));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  Promise.resolve(renderers[name]()).catch((e) => console.error(e));
}
$('#tabs').addEventListener('click', (e) => { if (e.target.dataset.tab) showTab(e.target.dataset.tab); });
$('#scores-date').addEventListener('change', renderScores);

showTab('home');

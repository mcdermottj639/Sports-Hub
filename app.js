// Sports-Hub — pure browser app. Live data comes straight from ESPN's free
// public sports feed (no key, no server). Edit LEAGUES below to make it yours.

const APP_VERSION = 'v13';

const LEAGUES = {
  nfl:    { label: 'NFL',    emoji: '🏈', espnPath: 'football/nfl',   fav: ['Philadelphia Eagles'], type: 'team' },
  mlb:    { label: 'MLB',    emoji: '⚾', espnPath: 'baseball/mlb',    fav: ['Philadelphia Phillies'], type: 'team' },
  nba:    { label: 'NBA',    emoji: '🏀', espnPath: 'basketball/nba', fav: ['Philadelphia 76ers'], type: 'team' },
  soccer: { label: 'World Cup', emoji: '🌎', espnPath: 'soccer/fifa.world', fav: ['USA'], type: 'team' }, // FIFA World Cup
  golf:   { label: 'Golf',   emoji: '⛳', espnPath: 'golf/pga', fav: [], type: 'golf' },
};
const FEATURED = { sport: 'nfl', name: 'Philadelphia Eagles' };

// Roughly which months each sport is active, used to sort in-season first.
const SEASON_MONTHS = {
  nfl: [8, 9, 10, 11, 0, 1], mlb: [2, 3, 4, 5, 6, 7, 8, 9], nba: [9, 10, 11, 0, 1, 2, 3, 4, 5],
  soccer: [5, 6], golf: [0, 1, 2, 3, 4, 5, 6, 7],
};
const BASE_ORDER = ['nfl', 'mlb', 'nba', 'soccer', 'golf'];
function sortedSports(opts = {}) {
  const m = new Date().getMonth();
  let list = Object.keys(LEAGUES);
  if (opts.teamOnly) list = list.filter((s) => LEAGUES[s].type === 'team');
  const active = (s) => ((SEASON_MONTHS[s] || []).includes(m) ? 0 : 1);
  return list.sort((a, b) => active(a) - active(b) || BASE_ORDER.indexOf(a) - BASE_ORDER.indexOf(b));
}

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
    id: t.id,
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
  if (g.id) card.onclick = () => openGameDetail(sport, g.id, g);
  return card;
}

// --- game detail modal ----------------------------------------------------
const modal = () => $('#game-modal');
function closeModal() { modal().classList.add('hidden'); }
$('#modal-close').addEventListener('click', closeModal);
$('#modal-x').addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

async function openGameDetail(sport, id, g) {
  modal().classList.remove('hidden');
  $('#modal-body').innerHTML = '<div class="empty">Loading live stats…</div>';
  try {
    const path = LEAGUES[sport].espnPath;
    const [data, pred] = await Promise.all([
      fetchJSON(`${SITE}/${path}/summary?event=${id}`, 30000),
      g ? predictGame(sport, g).catch(() => null) : Promise.resolve(null),
    ]);
    $('#modal-body').innerHTML = renderGameDetail(sport, data, pred);
  } catch (_) {
    $('#modal-body').innerHTML = '<div class="empty">Live stats aren’t available for this game right now.</div>';
  }
}

function renderGameDetail(sport, data, pred) {
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

  html += aiPickBlock(pred);

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
  const sports = sortedSports({ teamOnly: true }); // in-season first
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
  if (SEASON_MONTHS.golf.includes(new Date().getMonth())) addGolfHomeCard();
}

async function addGolfHomeCard() {
  const ev = await getGolfEvent();
  if (!ev) return;
  const leader = (ev.competitions?.[0]?.competitors || [])[0];
  const lname = leader?.athlete?.displayName || '';
  const lscore = leader?.score?.displayValue ?? leader?.score ?? '';
  const card = el('div', 'game-card');
  card.innerHTML = `<div class="game-meta"><span class="game-league">⛳ Golf</span><span class="status">${ev.status?.type?.shortDetail || ''}</span></div>
    <div style="font-weight:700;margin:4px 0">${ev.name || 'PGA Tour'}</div>
    <div class="muted">Leader: <b style="color:var(--text)">${lname || 'TBD'}</b> ${lscore}</div>
    <div class="tap-hint">tap for leaderboard →</div>`;
  card.onclick = () => { state.scoresSport = 'golf'; showTab('scores'); };
  const grid = $('#home-games');
  grid.insertBefore(card, grid.firstChild);
}

// --- SCORES ---------------------------------------------------------------
function buildChips(container, current, onPick, sports) {
  container.innerHTML = '';
  (sports || sortedSports()).forEach((sport) => {
    const cfg = LEAGUES[sport];
    const chip = el('button', 'chip' + (sport === current ? ' active' : ''), `${cfg.emoji} ${cfg.label}`);
    chip.onclick = () => onPick(sport);
    container.appendChild(chip);
  });
}
async function renderScores() {
  const dateInput = $('#scores-date');
  const isGolf = LEAGUES[state.scoresSport].type === 'golf';
  dateInput.style.display = isGolf ? 'none' : '';
  if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  buildChips($('#sport-filter'), state.scoresSport, (s) => { state.scoresSport = s; renderScores(); });
  const container = $('#scores-games');
  container.innerHTML = '<div class="empty">Loading…</div>';
  if (isGolf) { renderGolfLeaderboard(container); return; }
  try {
    const games = await getGames(state.scoresSport, dateInput.value.replaceAll('-', ''));
    renderGames(container, { [state.scoresSport]: games });
  } catch (_) {
    renderGames(container, { [state.scoresSport]: DEMO[state.scoresSport] });
  }
}

// Golf: render the current/most-recent PGA tournament leaderboard.
async function getGolfEvent() {
  const data = await fetchJSON(`${SITE}/golf/pga/scoreboard`, 5 * 60000).catch(() => null);
  const events = data?.events || [];
  return events.find((e) => e.status?.type?.state === 'in') || events[0] || null;
}
async function renderGolfLeaderboard(container) {
  const ev = await getGolfEvent();
  if (!ev) { container.innerHTML = '<div class="empty">No PGA tournament data right now.</div>'; return; }
  const comp = ev.competitions?.[0] || {};
  const players = comp.competitors || [];
  const statusTxt = ev.status?.type?.detail || ev.status?.type?.shortDetail || '';
  const rows = players.slice(0, 30).map((c) => {
    const pos = c.status?.position?.displayName || c.order || '';
    const name = c.athlete?.displayName || '';
    const toPar = c.score?.displayValue ?? c.score ?? '';
    const thru = c.status?.thru != null ? (c.status.thru === 18 ? 'F' : `thru ${c.status.thru}`) : (c.status?.teeTime ? fmtTime(c.status.teeTime) : '');
    const fav = (LEAGUES.golf.fav || []).some((f) => f.toLowerCase() === name.toLowerCase());
    return `<tr class="${fav ? 'fav' : ''}"><td>${pos}</td><td>${name}</td><td class="num">${toPar}</td><td class="num">${thru}</td></tr>`;
  }).join('');
  container.innerHTML = `<div class="golf-head"><div class="golf-name">⛳ ${ev.name || 'PGA Tour'}</div><div class="muted">${statusTxt}</div></div>
    <table class="md-line golf-board"><thead><tr><th>Pos</th><th>Player</th><th class="num">Score</th><th class="num">Thru</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// --- STANDINGS ------------------------------------------------------------
async function renderStandings() {
  buildChips($('#standings-filter'), state.standingsSport, (s) => { state.standingsSport = s; renderStandings(); }, sortedSports({ teamOnly: true }));
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

// --- AI PICKS (multi-factor model) ---------------------------------------
// Each team's profile is built from its game-by-game schedule: scoring
// margin, recent form, home/road splits and rest. Factors combine in
// log-odds, so every pick comes with an explainable breakdown.
const logistic = (z) => 1 / (1 + Math.exp(-z));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const PD_SCALE = { nfl: 7, nba: 6, mlb: 1.3, soccer: 1.0 }; // typical per-game margin

async function teamProfile(sport, teamId) {
  if (!teamId) return null;
  const path = LEAGUES[sport].espnPath;
  const data = await fetchJSON(`${SITE}/${path}/teams/${teamId}/schedule`, 3 * 3600000).catch(() => null);
  const games = [];
  (data?.events || []).forEach((ev) => {
    const comp = ev.competitions?.[0]; if (!comp?.status?.type?.completed) return;
    const me = (comp.competitors || []).find((c) => String(c.team?.id) === String(teamId));
    const opp = (comp.competitors || []).find((c) => String(c.team?.id) !== String(teamId));
    const ms = Number(me?.score?.value ?? me?.score?.displayValue);
    const os = Number(opp?.score?.value ?? opp?.score?.displayValue);
    if (!me || isNaN(ms) || isNaN(os)) return;
    games.push({ date: ev.date, margin: ms - os, home: me.homeAway === 'home', win: me.winner === true || ms > os });
  });
  if (!games.length) return null;
  games.sort((a, b) => new Date(a.date) - new Date(b.date));
  const gp = games.length;
  const sum = (f) => games.reduce((s, g) => s + f(g), 0);
  const recent = games.slice(-5);
  let wsum = 0, wtot = 0;
  recent.forEach((g, i) => { const w = i + 1; wsum += g.margin * w; wtot += w; });
  const homeG = games.filter((g) => g.home), roadG = games.filter((g) => !g.home);
  const wp = (arr) => (arr.length ? arr.filter((g) => g.win).length / arr.length : null);
  return {
    gp,
    winPct: sum((g) => (g.win ? 1 : 0)) / gp,
    pdpg: sum((g) => g.margin) / gp,
    form: wtot ? wsum / wtot : 0,
    homeWP: wp(homeG),
    roadWP: wp(roadG),
    lastDate: games[gp - 1].date,
  };
}

async function predictGame(sport, g) {
  const [hf, af] = await Promise.all([teamProfile(sport, g.home.id), teamProfile(sport, g.away.id)]);
  const scale = PD_SCALE[sport] || 5;
  const factors = []; // { label, c (log-odds toward home), detail }
  let z = 0;
  const add = (label, c, detail) => { if (c && isFinite(c)) { z += c; factors.push({ label, c, detail }); } };

  if (hf && af) {
    add('Record', 1.1 * (hf.winPct - af.winPct), `${(hf.winPct * 100).toFixed(0)}% vs ${(af.winPct * 100).toFixed(0)}% win`);
    add('Scoring margin', 0.9 * clamp((hf.pdpg - af.pdpg) / scale, -3, 3), `${hf.pdpg >= 0 ? '+' : ''}${hf.pdpg.toFixed(1)} vs ${af.pdpg >= 0 ? '+' : ''}${af.pdpg.toFixed(1)} per game`);
    add('Recent form', 0.6 * clamp((hf.form - af.form) / scale, -3, 3), `last 5: ${hf.form >= 0 ? '+' : ''}${hf.form.toFixed(1)} vs ${af.form >= 0 ? '+' : ''}${af.form.toFixed(1)}`);
    if (hf.homeWP != null && af.roadWP != null) {
      add('Home/road split', 1.0 * (hf.homeWP - af.roadWP), `home ${(hf.homeWP * 100).toFixed(0)}% vs road ${(af.roadWP * 100).toFixed(0)}%`);
    } else { add('Home field', 0.28, 'standard home edge'); }
    const day = 86400000;
    const hr = g.date && hf.lastDate ? clamp(Math.round((new Date(g.date) - new Date(hf.lastDate)) / day), 0, 10) : null;
    const ar = g.date && af.lastDate ? clamp(Math.round((new Date(g.date) - new Date(af.lastDate)) / day), 0, 10) : null;
    if (hr != null && ar != null && hr !== ar) add('Rest', 0.05 * clamp(hr - ar, -5, 5), `${hr}d vs ${ar}d rest`);
  } else {
    add('Home field', 0.3, 'limited data — home edge only');
  }

  const pHome = logistic(z);
  const homePick = pHome >= 0.5;
  const winner = homePick ? g.home : g.away;
  const conf = clamp(Math.round((homePick ? pHome : 1 - pHome) * 100), 50, 92);
  // per-factor probability impact toward the home team
  const breakdown = factors.map((f) => {
    const pct = Math.round((logistic(z) - logistic(z - f.c)) * 100);
    return { label: f.label, detail: f.detail, favor: f.c >= 0 ? g.home.name : g.away.name, pct: Math.abs(pct) };
  }).filter((b) => b.pct > 0).sort((a, b) => b.pct - a.pct);
  return { winner, conf, homePick, breakdown, thin: !(hf && af) };
}

function aiPickBlock(pred) {
  if (!pred) return '';
  const rows = pred.breakdown.map((b) =>
    `<div class="fac-row"><span class="fac-l">${b.label}</span><span class="fac-d">${b.detail}</span><span class="fac-p">${b.favor.split(' ').slice(-1)[0]} +${b.pct}%</span></div>`).join('');
  return `<div class="md-section-title">🤖 AI Pick</div>
    <div class="ai-pick">Pick: <b>${pred.winner.name}</b> <span class="ai-conf">${pred.conf}%</span></div>
    <div class="conf-bar"><span style="width:${pred.conf}%"></span></div>
    <div class="fac-list">${rows || '<div class="ai-why">Limited data — leaning on home-field edge.</div>'}</div>
    ${pred.thin ? '<div class="ai-why">Not enough games played yet for full analysis.</div>' : ''}`;
}

async function renderPredictions() {
  const sport = state.aiSport || FEATURED.sport;
  buildChips($('#ai-sport'), sport, (s) => { state.aiSport = s; renderPredictions(); }, sortedSports({ teamOnly: true }));
  const container = $('#ai-picks');
  container.innerHTML = '<div class="empty">Crunching the numbers…</div>';

  const games = await getGames(sport, ymd(new Date())).catch(() => []);
  const playable = games.filter((g) => g.id);
  if (!playable.length) { container.innerHTML = ''; container.appendChild(el('div', 'empty', 'No games today for this sport.')); $('#ai-score').textContent = ''; return; }

  const preds = await Promise.all(playable.map((g) => predictGame(sport, g).catch(() => null)));
  container.innerHTML = '';
  let right = 0, graded = 0;
  playable.forEach((g, i) => {
    const p = preds[i];
    const card = gameCard(sport, g);
    if (p) {
      const block = el('div', 'ai-block');
      let resultTag = '';
      if (gameState(g) === 'final') {
        const actual = winnerName(g);
        if (actual && actual !== 'TIE') { graded++; const hit = actual === p.winner.name; if (hit) right++; resultTag = `<div class="ai-result ${hit ? 'win' : 'loss'}">${hit ? '✅ Model nailed it' : '❌ Model missed'}</div>`; }
      }
      const top = p.breakdown.slice(0, 2).map((b) => `${b.label} (${b.favor.split(' ').slice(-1)[0]} +${b.pct}%)`).join(' · ');
      block.innerHTML = `
        <div class="ai-pick">🤖 Pick: <b>${p.winner.name}</b> <span class="ai-conf">${p.conf}%</span></div>
        <div class="conf-bar"><span style="width:${p.conf}%"></span></div>
        <div class="ai-why">${top || 'Home-field edge'}${resultTag ? '' : ''}</div>
        <div class="ai-why" style="margin-top:4px;opacity:.8">Tap the game for the full breakdown</div>${resultTag}`;
      card.appendChild(block);
    }
    container.appendChild(card);
  });
  $('#ai-score').textContent = graded ? `Model today: ${right}/${graded} correct` : '';
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
const FBCORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const STAT_SEASON = 2025; // last completed season (stats/leaders/depth)
const SCHEDULE_SEASON = 2026; // upcoming 2026-27 season schedule
const refId = (ref) => (ref || '').match(/\/(?:athletes|teams)\/(\d+)/)?.[1];
const safeJSON = (url, ttl) => fetchJSON(url, ttl).catch(() => null);

async function renderEagles() {
  const id = EAGLES.teamId;
  const [teamR, rosterR, newsR] = await Promise.allSettled([
    fetchJSON(NFL_TEAM, 5 * 60000),
    fetchJSON(`${NFL_TEAM}/roster`, 30 * 60000),
    fetchJSON(`${SITE}/football/nfl/news?team=${id}`, 10 * 60000),
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

  // roster map (id -> player) used by depth chart + leaders
  const groups = rosterR.status === 'fulfilled' ? (rosterR.value.athletes || []) : [];
  const allPlayers = [];
  const idMap = {};
  groups.forEach((grp) => (grp.items || []).forEach((a) => {
    allPlayers.push(a);
    if (a.id) idMap[a.id] = a;
  }));
  const card = (val, lbl) => `<div class="fan-card"><div class="big">${val}</div><div class="lbl">${lbl}</div></div>`;

  // analytics (by the numbers)
  const ages = allPlayers.map((a) => a.age).filter((n) => typeof n === 'number');
  const avgAge = ages.length ? (ages.reduce((s, n) => s + n, 0) / ages.length).toFixed(1) : '–';
  const youngest = allPlayers.filter((a) => a.age).sort((a, b) => a.age - b.age)[0];
  const oldest = allPlayers.filter((a) => a.age).sort((a, b) => b.age - a.age)[0];
  $('#eagles-analytics').innerHTML = allPlayers.length
    ? card(allPlayers.length, 'Players on roster') + card(avgAge, 'Average age') +
      (youngest ? card(`${youngest.age}`, `Youngest · ${youngest.displayName}`) : '') +
      (oldest ? card(`${oldest.age}`, `Oldest · ${oldest.displayName}`) : '')
    : card('–', 'Roster loading');

  // news
  const articles = newsR.status === 'fulfilled' ? (newsR.value.articles || []) : [];
  const newsEl = $('#eagles-news');
  newsEl.innerHTML = !articles.length
    ? '<div class="empty">No recent Eagles news right now — check back as camp opens.</div>'
    : articles.slice(0, 10).map((a) => {
        const href = a.links?.web?.href || a.links?.mobile?.href || '#';
        const img = a.images?.[0]?.url;
        const when = a.published ? new Date(a.published).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
        return `<a class="news-item" href="${href}" target="_blank" rel="noopener">
          ${img ? `<img src="${img}" alt="" onerror="this.style.display='none'">` : ''}
          <div><div class="nh">${a.headline || ''}</div><div class="nd">${a.description || ''}</div><div class="nt">${when}</div></div></a>`;
      }).join('');

  // quick-jump nav widgets
  const navItems = [['sec-stats', 'Stats'], ['sec-leaders', 'Leaders'], ['sec-nextopp', 'Next Opp'], ['sec-schedule', 'Schedule'], ['sec-depth', 'Depth'], ['sec-news', 'News'], ['sec-staff', 'Staff']];
  const navEl = $('#eagles-nav');
  navEl.innerHTML = navItems.map(([t, l]) => `<button class="chip" data-target="${t}">${l}</button>`).join('');
  navEl.querySelectorAll('button').forEach((b) =>
    (b.onclick = () => document.getElementById(b.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));

  // fire off the heavier analytics in parallel; each renders independently
  renderEaglesDepth(idMap, groups);
  renderEaglesTeamStats();
  renderEaglesLeaders(idMap);
  renderEaglesSchedule();
  renderEaglesNextOpp(teamR.status === 'fulfilled' ? teamR.value.team : null);
}

// Classify a position abbreviation into offense / defense / special teams.
const DEPTH_OFF = new Set(['QB', 'RB', 'FB', 'HB', 'WR', 'TE', 'OL', 'OT', 'OG', 'C', 'G', 'T', 'LT', 'LG', 'RG', 'RT']);
const DEPTH_DEF = new Set(['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB', 'WLB', 'SLB', 'DB', 'CB', 'S', 'FS', 'SS', 'NB', 'LCB', 'RCB', 'WDE', 'SDE']);
const DEPTH_SPEC = new Set(['K', 'PK', 'P', 'LS', 'H', 'KR', 'PR', 'ST']);
function unitOf(pos) {
  const u = (pos || '').toUpperCase();
  if (DEPTH_SPEC.has(u)) return 'special';
  if (DEPTH_DEF.has(u)) return 'defense';
  if (DEPTH_OFF.has(u)) return 'offense';
  if (/CB|LB|DT|DE|NT|FS|SS|DB|SAF/.test(u)) return 'defense';
  if (/^K$|PK|^P$|LS|RET|^H$/.test(u)) return 'special';
  return 'offense';
}

// Field-view layout: rows top->bottom per unit, and L->R order within a row.
const FIELD_ROWS = {
  offense: [['WR', 'TE', 'SLOT', 'SWR', 'LWR', 'RWR', 'FL', 'SE'], ['LT', 'LG', 'C', 'RG', 'RT', 'OL', 'OT', 'OG', 'G', 'T'], ['QB'], ['RB', 'FB', 'HB']],
  defense: [['FS', 'SS', 'S', 'DB', 'SAF'], ['LCB', 'CB', 'RCB', 'NB', 'WLB', 'MLB', 'SLB', 'LB', 'ILB', 'OLB'], ['LDE', 'DE', 'DT', 'NT', 'DI', 'DL', 'RDE', 'EDGE', 'WDE', 'SDE']],
  special: [['PK', 'K', 'P', 'H', 'LS', 'KR', 'PR', 'ST']],
};
const FIELD_ORDER = { LT: 1, LG: 2, C: 3, RG: 4, RT: 5, LCB: 0, CB: 4, RCB: 9, FS: 4, SS: 5, WLB: 3, MLB: 4, SLB: 5, LB: 4, LDE: 1, DE: 2, DT: 3, NT: 4, DI: 4, RDE: 9, EDGE: 2 };
const expandCount = (label) => { const u = label.toUpperCase(); if (/WR/.test(u)) return 3; if (/^CB$/.test(u)) return 2; if (/^LB$|^S$|^DL$|^EDGE$/.test(u)) return 2; return 1; };
function rowIndex(unit, label) {
  const rows = FIELD_ROWS[unit] || FIELD_ROWS.offense;
  const u = label.toUpperCase();
  const i = rows.findIndex((keys) => keys.includes(u));
  return i >= 0 ? i : Math.min(1, rows.length - 1);
}
function fieldHTML(entries, unit) {
  const spots = [];
  entries.filter((e) => e.unit === unit).forEach((e) =>
    e.players.slice(0, expandCount(e.label)).forEach((p) => spots.push({ label: e.label, name: p.name, jersey: p.jersey })));
  const rows = (FIELD_ROWS[unit] || [[]]).map(() => []);
  const extra = [];
  spots.forEach((s) => { const r = rowIndex(unit, s.label); (rows[r] || extra).push(s); });
  rows.forEach((r) => r.sort((a, b) => (FIELD_ORDER[a.label.toUpperCase()] ?? 50) - (FIELD_ORDER[b.label.toUpperCase()] ?? 50)));
  const spot = (s) => `<div class="field-spot"><div class="pl">${s.label}</div><div class="pn">${(s.name || '').split(' ').slice(-1)[0]}</div>${s.jersey ? `<div class="pj">#${s.jersey}</div>` : ''}</div>`;
  let html = '<div class="field">';
  rows.concat([extra]).forEach((r) => { if (r.length) html += `<div class="field-row">${r.map(spot).join('')}</div>`; });
  return html + '</div>';
}

// Ordered depth chart from ESPN core API; falls back to roster-by-position.
// Rendered as Offense / Defense / Special Teams sub-tabs, Field or List view.
async function renderEaglesDepth(idMap, groups) {
  const elx = $('#eagles-depth');
  const dc = await safeJSON(`${FBCORE}/seasons/${STAT_SEASON}/teams/${EAGLES.teamId}/depthcharts`, 24 * 3600000);
  let entries = []; // { unit, label, ordered, players:[{name,jersey}] }
  const seen = new Set();
  (dc?.items || []).forEach((u) => {
    Object.values(u.positions || {}).forEach((pos) => {
      const label = pos.position?.abbreviation || pos.position?.displayName || '';
      if (!label || seen.has(label)) return;
      const players = (pos.athletes || []).sort((a, b) => (a.rank || 99) - (b.rank || 99))
        .map((a) => idMap[refId(a.athlete?.$ref)]).filter(Boolean)
        .map((p) => ({ name: p.displayName, jersey: p.jersey }));
      if (players.length) { seen.add(label); entries.push({ unit: unitOf(label), label, ordered: true, players }); }
    });
  });

  if (!entries.length) {
    // fallback: roster grouped by position (unit from the roster group)
    groups.forEach((grp) => {
      const unit = /def/i.test(grp.position) ? 'defense' : /special/i.test(grp.position) ? 'special' : 'offense';
      const byPos = {};
      (grp.items || []).forEach((a) => { const p = a.position?.abbreviation || '—'; (byPos[p] = byPos[p] || []).push(a); });
      Object.entries(byPos).forEach(([label, players]) =>
        entries.push({ unit, label, ordered: false, players: players.map((p) => ({ name: p.displayName || p.fullName, jersey: p.jersey })) }));
    });
  }

  if (!entries.length) { elx.innerHTML = '<div class="empty">Depth chart unavailable right now.</div>'; return; }

  const units = [['offense', 'Offense'], ['defense', 'Defense'], ['special', 'Special Teams']].filter(([u]) => entries.some((e) => e.unit === u));
  elx.innerHTML = `<div class="chips depth-tabs" id="depth-tabs"></div><div id="depth-content"></div>`;
  const tabsEl = $('#depth-tabs');
  let current = units[0][0];
  let view = 'field';
  const draw = () => {
    tabsEl.innerHTML = '';
    units.forEach(([u, label]) => {
      const c = el('button', 'chip' + (u === current ? ' active' : ''), label);
      c.onclick = () => { current = u; draw(); };
      tabsEl.appendChild(c);
    });
    const content = $('#depth-content');
    const toggle = `<div class="depth-toggle"><button class="chip ${view === 'field' ? 'active' : ''}" data-v="field">Field</button><button class="chip ${view === 'list' ? 'active' : ''}" data-v="list">List</button></div>`;
    if (view === 'field') {
      content.innerHTML = toggle + fieldHTML(entries, current);
    } else {
      const list = entries.filter((e) => e.unit === current);
      content.innerHTML = toggle + '<div class="depth-group">' + list.map((e) =>
        `<div class="depth-pos"><div class="pos-label">${e.label}</div>${e.players.map((p, i) =>
          `<span class="depth-player"><span class="jersey">${e.ordered ? (i === 0 ? '★' : i + 1) : (p.jersey ? '#' + p.jersey : '')}</span> ${p.name}${e.ordered && p.jersey ? ` #${p.jersey}` : ''}</span>`).join('')}</div>`).join('') + '</div>';
    }
    content.querySelectorAll('.depth-toggle button').forEach((b) => (b.onclick = () => { view = b.dataset.v; draw(); }));
  };
  draw();
}

// Team stats with league rankings.
async function renderEaglesTeamStats() {
  $('#eagles-stats-season').textContent = `(${STAT_SEASON})`;
  const elx = $('#eagles-teamstats');
  const data = await safeJSON(`${FBCORE}/seasons/${STAT_SEASON}/types/2/teams/${EAGLES.teamId}/statistics`, 6 * 3600000);
  const cats = data?.splits?.categories || [];
  const flat = [];
  cats.forEach((c) => (c.stats || []).forEach((s) => { if (s.rank) flat.push(s); }));
  const want = ['totalPointsPerGame', 'yardsPerGame', 'netPassingYardsPerGame', 'rushingYardsPerGame', 'totalTakeaways', 'sacks', 'thirdDownConvPct', 'totalGiveaways'];
  let picked = flat.filter((s) => want.includes(s.name));
  if (picked.length < 4) picked = flat.slice(0, 8);
  if (!picked.length) { elx.innerHTML = '<div class="empty">Team stats will appear once the season is underway.</div>'; return; }
  elx.innerHTML = picked.slice(0, 8).map((s) => {
    const rank = s.rank;
    const rc = rank <= 8 ? 'top' : rank >= 25 ? 'bot' : '';
    return `<div class="stat-row"><div class="sname">${s.displayName || s.name}</div>
      <div class="sval"><span class="v">${s.perGameDisplayValue || s.displayValue}</span>
      <span class="rank ${rc}">${s.rankDisplayValue || ('#' + rank)}</span></div></div>`;
  }).join('');
}

// Statistical leaders (passing/rushing/receiving, etc).
async function renderEaglesLeaders(idMap) {
  const elx = $('#eagles-leaders');
  const data = await safeJSON(`${FBCORE}/seasons/${STAT_SEASON}/types/2/teams/${EAGLES.teamId}/leaders`, 6 * 3600000);
  const cats = (data?.categories || []).filter((c) => (c.leaders || []).length);
  if (!cats.length) { elx.innerHTML = '<div class="empty">Player leaders will appear during the season.</div>'; return; }
  const rows = cats.slice(0, 8).map((c) => {
    const top = c.leaders[0];
    const who = idMap[refId(top.athlete?.$ref)]?.displayName || '';
    return `<div class="leader-row"><span class="cat">${c.displayName || c.name}</span>
      <span class="who">${who || '—'}</span><span class="val">${top.displayValue || top.value || ''}</span></div>`;
  });
  elx.innerHTML = rows.join('');
}

// Full schedule + results + W/L trend.
async function renderEaglesSchedule() {
  $('#eagles-sched-season').textContent = '(2026-27)';
  const elx = $('#eagles-schedule');
  let data = await safeJSON(`${SITE}/football/nfl/teams/${EAGLES.teamId}/schedule?season=${SCHEDULE_SEASON}`, 6 * 3600000);
  if (!data?.events?.length) data = await safeJSON(`${SITE}/football/nfl/teams/${EAGLES.teamId}/schedule`, 6 * 3600000);
  const events = data?.events || [];
  if (!events.length) { elx.innerHTML = '<div class="empty">Schedule not available yet.</div>'; return; }
  let wins = 0, losses = 0;
  const trend = [];
  const rowsHTML = events.map((ev) => {
    const comp = ev.competitions?.[0] || {};
    const me = (comp.competitors || []).find((c) => String(c.team?.id) === String(EAGLES.teamId));
    const opp = (comp.competitors || []).find((c) => String(c.team?.id) !== String(EAGLES.teamId));
    const wk = ev.week?.number ? `W${ev.week.number}` : '';
    const oppName = opp?.team?.abbreviation || opp?.team?.displayName || 'TBD';
    const home = me?.homeAway === 'home';
    const done = comp.status?.type?.completed;
    const when = ev.date ? new Date(ev.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
    let res = `<span class="res up">${when || '—'}</span>`;
    if (done && me) {
      const win = me.winner === true;
      if (win) { wins++; trend.push('w'); } else { losses++; trend.push('l'); }
      const ms = me.score?.displayValue ?? me.score?.value ?? '';
      const os = opp?.score?.displayValue ?? opp?.score?.value ?? '';
      res = `<span class="res ${win ? 'w' : 'l'}">${win ? 'W' : 'L'} ${ms}-${os}</span>`;
    }
    return `<div class="sched-row"><span class="wk">${wk}</span><span class="opp">${home ? 'vs' : '@'} ${oppName}</span>${res}</div>`;
  }).join('');
  const trendHTML = trend.length
    ? `<div class="trend"><span class="rec">${wins}-${losses}</span>${trend.map((r) => `<span class="pill ${r}">${r.toUpperCase()}</span>`).join('')}</div>`
    : '';
  elx.innerHTML = trendHTML + rowsHTML;
}

// Next opponent scouting (from the team's nextEvent).
async function renderEaglesNextOpp(team) {
  const elx = $('#eagles-nextopp');
  const next = team?.nextEvent?.[0];
  const comp = next?.competitions?.[0];
  const opp = (comp?.competitors || []).find((c) => String(c.team?.id) !== String(EAGLES.teamId));
  if (!opp?.team) { elx.innerHTML = '<div class="empty">No upcoming opponent yet — the 2026 schedule will populate this.</div>'; return; }
  const oid = opp.team.id;
  const od = await safeJSON(`${SITE}/football/nfl/teams/${oid}`, 60 * 60000);
  const ot = od?.team;
  const rec = ot?.record?.items?.[0]?.summary;
  const standing = ot?.standingSummary;
  const logo = ot?.logos?.[0]?.href || opp.team.logo;
  const when = next.date ? new Date(next.date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) : '';
  elx.innerHTML = `<div class="opp-card">${logo ? `<img src="${logo}" alt="">` : ''}
    <div><div class="on">${ot?.displayName || opp.team.displayName}</div>
    <div class="od">${[rec ? `Record ${rec}` : '', standing].filter(Boolean).join(' • ') || 'Season not started'}</div>
    <div class="od">${next.name || ''}${when ? ' · ' + when : ''}</div></div></div>`;
}

// --- mode badge + tabs + boot --------------------------------------------
function setMode(live) {
  state.liveOK = live;
  const b = $('#mode-badge');
  if (live) { b.textContent = 'LIVE'; b.className = 'badge live'; $('#about-status').textContent = ''; }
  else { b.textContent = 'OFFLINE'; b.className = 'badge demo'; $('#about-status').textContent = 'Status: could not reach ESPN — showing sample data.'; }
}

// Build a "jump to section" widget bar at the top of a tab from its headings.
// (Eagles has its own curated nav, so it's skipped here.)
function injectJumpNav(name) {
  const panel = document.getElementById(name);
  if (!panel || name === 'eagles') return;
  const titles = [...panel.querySelectorAll('.section-title')];
  const items = titles.map((h, i) => {
    if (!h.id) h.id = `${name}-sec-${i}`;
    return { id: h.id, label: h.textContent.trim().replace(/\s+/g, ' ').replace(/[🤖🦅]/g, '').trim() };
  }).filter((x) => x.label);
  let nav = panel.querySelector(':scope > .jump-nav');
  if (items.length < 2) { if (nav) nav.remove(); return; }
  if (!nav) { nav = el('div', 'jump-nav'); panel.insertBefore(nav, panel.firstChild); }
  nav.innerHTML = items.map((it) => `<button class="chip" data-target="${it.id}">${it.label}</button>`).join('');
  nav.querySelectorAll('button').forEach((b) =>
    (b.onclick = () => document.getElementById(b.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
}

const renderers = { home: renderHome, eagles: renderEagles, scores: renderScores, standings: renderStandings, predictions: renderPredictions, fantasy: renderFantasy, about: () => {} };
function showTab(name) {
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === name));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  Promise.resolve(renderers[name]()).then(() => injectJumpNav(name)).catch((e) => console.error(e));
}
$('#tabs').addEventListener('click', (e) => { if (e.target.dataset.tab) showTab(e.target.dataset.tab); });
$('#scores-date').addEventListener('change', renderScores);

// default the sport selectors to whatever's in season right now
state.scoresSport = sortedSports()[0];
state.standingsSport = sortedSports({ teamOnly: true })[0];
state.aiSport = sortedSports({ teamOnly: true })[0];

const verEl = $('#app-version');
if (verEl) verEl.textContent = APP_VERSION;

// back-to-top button
const toTop = $('#to-top');
if (toTop) {
  const onScroll = () => toTop.classList.toggle('show', window.scrollY > 300);
  window.addEventListener('scroll', onScroll, { passive: true });
  toTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  onScroll();
}

showTab('home');

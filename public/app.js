// Sports-Hub frontend. Talks only to our own /api/* backend, which handles
// API-Sports + caching. No keys ever touch the browser.

const state = {
  config: null,
  scoresSport: 'nfl',
  standingsSport: 'nfl',
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// --- status helpers -------------------------------------------------------
const FINAL = ['FT', 'AET', 'PEN', 'AOT', 'FINAL', 'F', 'Final'];
const SCHEDULED = ['NS', 'TBD', 'PST', 'CANC', 'Not Started'];

function gameState(g) {
  const s = (g.status || '').toUpperCase();
  const long = (g.statusLong || '').toLowerCase();
  if (FINAL.includes(s) || long.includes('finished') || long.includes('final')) return 'final';
  if (SCHEDULED.includes(s) || long.includes('not started') || long.includes('scheduled')) return 'scheduled';
  if (g.home.score != null || g.away.score != null) return 'live';
  return 'scheduled';
}

function favoriteSet(sport) {
  return (state.config?.sports?.[sport]?.favoriteTeams || []).map((t) => t.toLowerCase());
}
function isFav(sport, g) {
  const favs = favoriteSet(sport);
  return favs.includes((g.home.name || '').toLowerCase()) || favs.includes((g.away.name || '').toLowerCase());
}

function winnerName(g) {
  if (gameState(g) !== 'final' || g.home.score == null || g.away.score == null) return null;
  if (g.home.score === g.away.score) return 'TIE';
  return g.home.score > g.away.score ? g.home.name : g.away.name;
}

function fmtTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function logoEl(team) {
  if (team.logo) return `<img class="logo" src="${team.logo}" alt="" onerror="this.style.display='none'"/>`;
  const initials = (team.name || '?').split(' ').pop().slice(0, 3).toUpperCase();
  return `<span class="logo placeholder">${initials}</span>`;
}

// --- game card ------------------------------------------------------------
function gameCard(sport, g) {
  const st = gameState(g);
  const sportCfg = state.config.sports[sport];
  const win = winnerName(g);
  const card = el('div', 'game-card' + (isFav(sport, g) ? ' fav' : ''));

  const statusLabel =
    st === 'live' ? (g.statusLong || 'LIVE') : st === 'final' ? 'FINAL' : fmtTime(g.date) || 'Scheduled';
  const statusCls = st === 'live' ? 'status live' : st === 'final' ? 'status final' : 'status';

  const teamRow = (team, side) => {
    const isWin = win && win !== 'TIE' && win === team.name;
    return `<div class="team-row ${isWin ? 'winner' : ''}">
        <span class="team">${logoEl(team)}${team.name || 'TBD'}</span>
        <span class="score">${team.score != null ? team.score : '–'}</span>
      </div>`;
  };

  card.innerHTML = `
    <div class="game-meta">
      <span class="game-league">${sportCfg.emoji} ${sportCfg.label}</span>
      <span class="${statusCls}">${statusLabel}</span>
    </div>
    ${teamRow(g.away, 'away')}
    ${teamRow(g.home, 'home')}
  `;
  return card;
}

function renderGamesInto(container, gamesBySport) {
  container.innerHTML = '';
  let any = false;
  // favorites first
  const all = [];
  for (const [sport, games] of Object.entries(gamesBySport)) {
    (games || []).forEach((g) => all.push({ sport, g }));
  }
  all.sort((a, b) => (isFav(b.sport, b.g) ? 1 : 0) - (isFav(a.sport, a.g) ? 1 : 0));
  for (const { sport, g } of all) {
    container.appendChild(gameCard(sport, g));
    any = true;
  }
  if (!any) container.appendChild(el('div', 'empty', 'No games for this selection.'));
}

// --- HOME -----------------------------------------------------------------
async function renderHome() {
  const data = await fetchJSON('/api/dashboard');
  const featSport = data.featuredTeam.sport;
  const featName = data.featuredTeam.name.toLowerCase();

  // find featured team's game today + standings line
  const featGames = data.games[featSport] || [];
  const featGame = featGames.find(
    (g) => (g.home.name || '').toLowerCase() === featName || (g.away.name || '').toLowerCase() === featName
  );
  const row = (data.featuredStandings || []).find((r) => (r.team || '').toLowerCase() === featName);

  let featHTML = `<h2>🦅 ${data.featuredTeam.name}</h2>`;
  if (row) {
    featHTML += `<div class="muted">${row.group ? row.group + ' • ' : ''}Rank #${row.rank ?? '–'} • ${row.wins ?? 0}-${row.losses ?? 0}${row.points != null ? ' • ' + row.points + ' pts' : ''}</div>`;
  }
  featHTML += '<div class="featured-line">';
  if (featGame) {
    const st = gameState(featGame);
    const label = st === 'live' ? (featGame.statusLong || 'LIVE') : st === 'final' ? 'Final' : 'Today ' + fmtTime(featGame.date);
    featHTML += `<div class="featured-game">
      <div><strong>${featGame.away.name}</strong> ${featGame.away.score ?? ''} @ <strong>${featGame.home.name}</strong> ${featGame.home.score ?? ''}</div>
      <span class="status ${st === 'live' ? 'live' : st === 'final' ? 'final' : ''}">${label}</span>
    </div>`;
  } else {
    featHTML += `<div class="muted">No game scheduled today. Check the Scores tab for the full slate.</div>`;
  }
  featHTML += '</div>';
  $('#featured').innerHTML = featHTML;

  renderGamesInto($('#home-games'), data.games);
}

// --- SCORES ---------------------------------------------------------------
function buildSportChips(container, current, onPick) {
  container.innerHTML = '';
  for (const [sport, cfg] of Object.entries(state.config.sports)) {
    const chip = el('button', 'chip' + (sport === current ? ' active' : ''), `${cfg.emoji} ${cfg.label}`);
    chip.onclick = () => onPick(sport);
    container.appendChild(chip);
  }
}

async function renderScores() {
  const dateInput = $('#scores-date');
  if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  buildSportChips($('#sport-filter'), state.scoresSport, (s) => {
    state.scoresSport = s;
    renderScores();
  });
  const container = $('#scores-games');
  container.innerHTML = '<div class="empty">Loading…</div>';
  const data = await fetchJSON(`/api/games?sport=${state.scoresSport}&date=${dateInput.value}`);
  renderGamesInto(container, { [state.scoresSport]: data.games });
}

// --- STANDINGS ------------------------------------------------------------
async function renderStandings() {
  buildSportChips($('#standings-filter'), state.standingsSport, (s) => {
    state.standingsSport = s;
    renderStandings();
  });
  const content = $('#standings-content');
  content.innerHTML = '<div class="empty">Loading…</div>';
  const data = await fetchJSON(`/api/standings?sport=${state.standingsSport}`);
  const rows = data.standings || [];
  if (!rows.length) {
    content.innerHTML = '<div class="empty">No standings available.</div>';
    return;
  }
  // group rows
  const groups = {};
  rows.forEach((r) => {
    const g = r.group || 'Standings';
    (groups[g] = groups[g] || []).push(r);
  });
  content.innerHTML = '';
  const favs = favoriteSet(state.standingsSport);
  for (const [groupName, grows] of Object.entries(groups)) {
    content.appendChild(el('div', 'standings-group', groupName));
    const table = el('table');
    table.innerHTML = `<thead><tr><th>#</th><th>Team</th><th class="num">W</th><th class="num">L</th><th class="num">${state.standingsSport === 'soccer' ? 'Pts' : 'GP'}</th></tr></thead>`;
    const tbody = el('tbody');
    grows.forEach((r) => {
      const fav = favs.includes((r.team || '').toLowerCase());
      const tr = el('tr', fav ? 'fav' : '');
      const lastCol = state.standingsSport === 'soccer' ? (r.points ?? '–') : (r.played ?? '–');
      tr.innerHTML = `<td>${r.rank ?? ''}</td><td>${r.team}</td><td class="num">${r.wins ?? '–'}</td><td class="num">${r.losses ?? '–'}</td><td class="num">${lastCol}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    content.appendChild(table);
  }
}

// --- PREDICTIONS ----------------------------------------------------------
const PRED_KEY = 'sportshub:predictions';
const getPredictions = () => JSON.parse(localStorage.getItem(PRED_KEY) || '{}');
const savePredictions = (p) => localStorage.setItem(PRED_KEY, JSON.stringify(p));

async function renderPredictions() {
  const data = await fetchJSON('/api/dashboard');
  const preds = getPredictions();
  const upcoming = el('div');
  const results = $('#pred-results');
  const upContainer = $('#pred-upcoming');
  upContainer.innerHTML = '';
  results.innerHTML = '';

  let correct = 0;
  let decided = 0;
  let upcomingCount = 0;
  let resultCount = 0;

  for (const [sport, games] of Object.entries(data.games)) {
    for (const g of games || []) {
      if (!g.id) continue;
      const st = gameState(g);
      const cfg = state.config.sports[sport];

      if (st === 'scheduled') {
        upcomingCount++;
        const card = gameCard(sport, g);
        const btns = el('div', 'pick-btns');
        [g.away, g.home].forEach((team) => {
          const b = el('button', preds[g.id] === team.name ? 'picked' : '', team.name);
          b.onclick = () => {
            const p = getPredictions();
            p[g.id] = team.name;
            savePredictions(p);
            renderPredictions();
          };
          btns.appendChild(b);
        });
        card.appendChild(btns);
        upContainer.appendChild(card);
      } else if (st === 'final' && preds[g.id]) {
        resultCount++;
        decided++;
        const win = winnerName(g);
        const got = win === preds[g.id];
        if (got) correct++;
        const card = gameCard(sport, g);
        const out = el('div', 'pred-outcome ' + (got ? 'win' : 'loss'),
          got ? `✅ You picked ${preds[g.id]} — correct!` : `❌ You picked ${preds[g.id]} — ${win || 'no result'}`);
        card.appendChild(out);
        results.appendChild(card);
      }
    }
  }

  if (!upcomingCount) upContainer.appendChild(el('div', 'empty', 'No upcoming games to pick today.'));
  if (!resultCount) results.appendChild(el('div', 'empty', 'No graded picks yet. Make some picks above!'));
  $('#pred-score').textContent = decided ? `${correct}/${decided} correct (${Math.round((correct / decided) * 100)}%)` : '';
}

// --- tabs + boot ----------------------------------------------------------
const renderers = {
  home: renderHome,
  scores: renderScores,
  standings: renderStandings,
  predictions: renderPredictions,
  setup: () => {},
};

function showTab(name) {
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === name));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  Promise.resolve(renderers[name]()).catch((e) => console.error(e));
}

$('#tabs').addEventListener('click', (e) => {
  if (e.target.dataset.tab) showTab(e.target.dataset.tab);
});
$('#scores-date').addEventListener('change', renderScores);

async function boot() {
  try {
    state.config = await fetchJSON('/api/config');
    const badge = $('#mode-badge');
    if (state.config.live) {
      badge.textContent = 'LIVE'; badge.className = 'badge live';
    } else {
      badge.textContent = 'DEMO'; badge.className = 'badge demo';
      $('#setup-status').innerHTML = '<p class="muted">Status: currently in <strong>DEMO</strong> mode.</p>';
    }
    state.scoresSport = state.config.featuredTeam.sport;
    state.standingsSport = state.config.featuredTeam.sport;
    showTab('home');
  } catch (e) {
    document.querySelector('main').innerHTML = `<div class="empty">Could not reach the backend. Is the server running? (${e.message})</div>`;
  }
}

boot();

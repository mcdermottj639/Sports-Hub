// Sports-Hub — pure browser app. Live data comes straight from ESPN's free
// public sports feed (no key, no server). Edit LEAGUES below to make it yours.

const APP_VERSION = 'v65';

// Optional backend that syncs the owner's REAL ESPN fantasy leagues (the static
// app can't read private-league endpoints itself — CORS + cookie gated). When
// reachable, the Fantasy tab loads the real roster/matchup from here; when not,
// it falls back to the locally-saved/manual roster. See server/ in the repo.
const FANTASY_API = 'https://sports-hub-production.up.railway.app';

const LEAGUES = {
  nfl:    { label: 'NFL',    emoji: '🏈', espnPath: 'football/nfl',   fav: ['Philadelphia Eagles'], type: 'team' },
  mlb:    { label: 'MLB',    emoji: '⚾', espnPath: 'baseball/mlb',    fav: ['Boston Red Sox'], type: 'team' },
  nba:    { label: 'NBA',    emoji: '🏀', espnPath: 'basketball/nba', fav: [], type: 'team' },
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
const ymdDash = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The sports "day" doesn't roll over to tomorrow until 4 AM ET, so late games
// (and the slate) stay on the current day while they're still live overnight.
const sportsDate = () => {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  et.setHours(et.getHours() - 4);
  return et;
};
const fmtTime = (date) => {
  const d = new Date(date);
  return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
const timeAgo = (date) => {
  const d = new Date(date); if (isNaN(d)) return '';
  const m = Math.max(0, Math.round((Date.now() - d) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24); return days === 1 ? 'yesterday' : `${days}d ago`;
};
// Pre-game label: ESPN sometimes returns a generic "Scheduled"/"TBD" string
// instead of a kickoff time (common for soccer), so fall back to the time.
const scheduledLabel = (g) => {
  const t = (g.statusText || '').trim();
  if (t && !/scheduled|tbd|pre[- ]?game/i.test(t)) return t;
  return fmtTime(g.date) || t || 'Scheduled';
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
    probables: c?.probables || null, // MLB probable starters
    leaders: c?.leaders || null,     // NFL/NBA team leaders
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
    situation: comp.situation || null,
    home: teamObj(home),
    away: teamObj(away),
    odds: comp.odds?.[0] || null,
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
  const buildRow = (e, i, league, division) => {
    const t = e.team || {};
    const stats = e.stats || [];
    return {
      league: league || '', division: division || 'Standings', group: division || league || 'Standings',
      rank: getStat(stats, ['rank', 'playoffSeed']) ?? i + 1,
      team: t.displayName || t.name,
      logo: t.logos?.[0]?.href || t.logo || null,
      wins: Number(getStat(stats, ['wins'])) || 0,
      losses: Number(getStat(stats, ['losses'])) || 0,
      points: getStat(stats, ['points']),
      gp: getStat(stats, ['gamesPlayed']),
    };
  };
  // Only emit rows from the deepest node that holds entries — when a league
  // node also carries its own aggregated standings, we want the division
  // children, not the lumped-together league list.
  const visit = (node, ancestors) => {
    const path = [...ancestors, node];
    const kids = node.children || [];
    if (kids.length) { kids.forEach((ch) => visit(ch, path)); return; }
    const entries = node.standings?.entries || node.entries;
    if (entries && entries.length) {
      const division = node.name || node.displayName || node.abbreviation || 'Standings';
      // Prefer a real league ancestor; otherwise infer it from the division
      // name (e.g. "American League East" -> "American League", "NFC East" -> "NFC").
      let league = path.length > 1 ? (path[0].name || path[0].displayName || '') : '';
      if (!league) { const m = division.match(/^(.*?)\s+(East|West|North|South|Central)$/i); league = m ? m[1] : division; }
      entries.forEach((e, i) => rows.push(buildRow(e, i, league, division)));
    }
  };
  (json.children || []).forEach((c) => visit(c, []));
  if (!rows.length && json.standings?.entries) json.standings.entries.forEach((e, i) => rows.push(buildRow(e, i, '', 'Standings')));
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
  // level=3 asks ESPN to nest by division (MLB East/Central/West, NFL divisions,
  // soccer groups). Fall back to the default grouping if that comes back empty.
  let rows = [];
  try { rows = normStandings(await fetchJSON(`${CORE}/${path}/standings?level=3`, 5 * 60000)); } catch (_) {}
  if (!rows.length) { try { rows = normStandings(await fetchJSON(`${CORE}/${path}/standings`, 5 * 60000)); } catch (_) {} }
  return rows;
}

// --- game helpers ---------------------------------------------------------
const gameState = (g) => (g.state === 'in' ? 'live' : g.state === 'post' ? 'final' : 'scheduled');
function winnerName(g) {
  if (gameState(g) !== 'final' || g.home.score == null || g.away.score == null) return null;
  if (g.home.score === g.away.score) return 'TIE';
  return g.home.score > g.away.score ? g.home.name : g.away.name;
}
// 2026 World Cup hosts — the only soccer sides with a true home field; every
// other World Cup game is on a neutral pitch, so home/away carries no edge.
const WC_HOSTS = ['usa', 'united states', 'united states of america', 'mexico', 'canada'];
const isWorldCupHost = (name) => WC_HOSTS.includes((name || '').trim().toLowerCase());
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
  const label = st === 'live' ? (g.statusText || 'LIVE') : st === 'final' ? 'FINAL' : scheduledLabel(g);
  const cls = st === 'live' ? 'status live' : st === 'final' ? 'status final' : 'status';
  const row = (team) => {
    const w = win && win !== 'TIE' && win === team.name;
    const score = st === 'scheduled' ? '–' : (team.score != null ? team.score : '–');
    return `<div class="team-row ${w ? 'winner' : ''}">
      <span class="team">${logoHTML(team)}${team.name || 'TBD'}</span>
      <span class="score">${score}</span></div>`;
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

// News: in-app extractive summary popup (condenses the article text).
const stripHTML = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
const summarize = (text, max = 5) => { const t = stripHTML(text); if (!t) return ''; const s = t.match(/[^.!?]+[.!?]+/g) || [t]; return s.slice(0, max).join(' ').trim(); };
async function openNewsSummary(a) {
  if (!a) return;
  modal().classList.remove('hidden');
  const img = a.images?.[0]?.url;
  const when = a.published ? new Date(a.published).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const by = a.byline || '';
  const href = a.links?.web?.href || a.links?.mobile?.href || '#';
  $('#modal-body').innerHTML = `${img ? `<img class="news-hero" src="${img}" onerror="this.style.display='none'">` : ''}
    <h2 class="news-title">${a.headline || ''}</h2>
    <div class="news-by">${[by, when].filter(Boolean).join(' · ')}</div>
    <div class="md-section-title">Summary</div>
    <div class="news-summary" id="news-sum">${a.description || 'Summarizing…'}</div>
    <a class="fan-btn" href="${href}" target="_blank" rel="noopener" style="display:inline-block;margin-top:14px;text-decoration:none">Read full article ↗</a>
    <div class="ai-why" style="margin-top:8px;opacity:.7">Auto-condensed from the article text.</div>`;
  const apiHref = a.links?.api?.self?.href || a.links?.api?.news?.href;
  if (apiHref) {
    const d = await fetchJSON(apiHref.replace(/^http:/, 'https:'), 6 * 3600000).catch(() => null);
    const story = d?.story || d?.headlines?.[0]?.story || d?.content || (d?.articles && d.articles[0]?.story);
    const sum = summarize(story, 5);
    const elx = document.getElementById('news-sum');
    if (sum && elx) elx.textContent = sum;
  }
}

async function openGameDetail(sport, id, g) {
  modal().classList.remove('hidden');
  $('#modal-body').innerHTML = '<div class="empty">Loading live stats…</div>';
  try {
    const path = LEAGUES[sport].espnPath;
    const [data, pred, hitters] = await Promise.all([
      fetchJSON(`${SITE}/${path}/summary?event=${id}`, 30000),
      g ? predictGame(sport, g).catch(() => null) : Promise.resolve(null),
      g && sport === 'mlb' ? Promise.all([topHitters(g.home.id), topHitters(g.away.id)]).catch(() => null) : Promise.resolve(null),
    ]);
    let extra = '';
    if (g && sport === 'mlb') {
      extra = startersHTML(g) + (hitters ? hittersHTML(g, hitters[0], hitters[1]) : '');
    } else if (g && sport === 'nfl') {
      extra = nflKeyHTML(g);
    }
    $('#modal-body').innerHTML = renderGameDetail(sport, data, pred, extra, g);
    makeAccordion($('#modal-body'), '.md-section-title', 0);
  } catch (_) {
    $('#modal-body').innerHTML = '<div class="empty">Live stats aren’t available for this game right now.</div>';
  }
}

// Normalize a raw odds object (from summary.pickcenter or scoreboard) and
// figure out the market favorite by name.
function normOdds(o, homeName, awayName) {
  if (!o) return null;
  const hML = o.homeTeamOdds?.moneyLine, aML = o.awayTeamOdds?.moneyLine;
  const favName = o.homeTeamOdds?.favorite ? homeName : o.awayTeamOdds?.favorite ? awayName
    : (typeof hML === 'number' && typeof aML === 'number') ? (hML < aML ? homeName : awayName) : null;
  const has = (o.details != null || o.spread != null || o.overUnder != null || hML != null || aML != null);
  return has ? { details: o.details ?? o.spread ?? null, ou: o.overUnder ?? o.total ?? null, hML, aML, favName, provider: o.provider?.name || null } : null;
}
function marketCompare(pred, favName) {
  if (!pred || !favName) return '';
  return pred.winner.name === favName
    ? `✅ Model agrees with the line (${favName})`
    : `⚡ Model sees value — likes ${pred.winner.name}, market favors ${favName}`;
}
function oddsSectionHTML(info, awayAbbr, homeAbbr, pred) {
  if (!info) return '';
  const cmp = marketCompare(pred, info.favName);
  const ml = (v) => (v == null ? '—' : (Number(v) > 0 ? `+${v}` : `${v}`));
  return `<div class="md-section-title acc-open">Betting Odds${info.provider ? ` · ${info.provider}` : ''}</div>
    <div class="odds-grid">
      <div><div class="ol">Spread</div><div class="ov">${info.details ?? '—'}</div></div>
      <div><div class="ol">O/U</div><div class="ov">${info.ou ?? '—'}</div></div>
      <div><div class="ol">${awayAbbr || 'Away'} ML</div><div class="ov">${ml(info.aML)}</div></div>
      <div><div class="ol">${homeAbbr || 'Home'} ML</div><div class="ov">${ml(info.hML)}</div></div>
    </div>${cmp ? `<div class="market-cmp">${cmp}</div>` : ''}
    <div class="ai-why" style="opacity:.7;margin-top:2px">Odds for reference only — not betting advice.</div>`;
}

// Live game situation panel — baseball gets a bases diamond with count/outs;
// other sports show the last play. Pulls from the summary feed (freshest),
// falling back to the scoreboard situation carried on the game object.
function liveSituationHTML(sport, data, comp, g) {
  const sit = data.situation || comp.situation || g?.situation;
  // soccer's live detail comes from the boxscore (possession/shots), not a
  // `situation` object — so handle it before the early bail below.
  if (sport === 'soccer') return soccerSituation(sit, data, comp);
  if (!sit) return '';
  if (sport === 'mlb') {
    const on1 = !!sit.onFirst, on2 = !!sit.onSecond, on3 = !!sit.onThird;
    const b = sit.balls ?? 0, s = sit.strikes ?? 0, o = sit.outs ?? 0;
    const batter = sit.batter?.athlete?.shortName || sit.batter?.athlete?.displayName;
    const pitcher = sit.pitcher?.athlete?.shortName || sit.pitcher?.athlete?.displayName;
    const last = sit.lastPlay?.text;
    const dots = [0, 1, 2].map((i) => `<span class="out-dot ${i < o ? 'on' : ''}"></span>`).join('');
    return `<div class="md-section-title acc-open">🔴 Live Situation</div>
      <div class="sit-wrap">
        <div class="diamond">
          <span class="base second ${on2 ? 'on' : ''}"></span>
          <span class="base third ${on3 ? 'on' : ''}"></span>
          <span class="base first ${on1 ? 'on' : ''}"></span>
        </div>
        <div class="sit-counts">
          <div class="sit-bs"><span>B</span> <b>${b}</b> &nbsp; <span>S</span> <b>${s}</b></div>
          <div class="sit-outs">${dots}<span class="sit-outl">${o} out${o === 1 ? '' : 's'}</span></div>
        </div>
      </div>
      ${(batter || pitcher) ? `<div class="sit-mu">${pitcher ? `Pitching: <b>${pitcher}</b>` : ''}${pitcher && batter ? ' · ' : ''}${batter ? `At bat: <b>${batter}</b>` : ''}</div>` : ''}
      ${last ? `<div class="sit-last">Last play: ${last}</div>` : ''}`;
  }
  if (sport === 'nfl') return footballSituation(sit, comp);
  // basketball & anything else: last play text (no positional widget exists)
  const last = sit.lastPlay?.text;
  if (!last) return '';
  return `<div class="md-section-title acc-open">🔴 Live Situation</div>
    <div class="sit-last">Last play: ${last}</div>`;
}

// Football: a field-position bar with the ball spot, possession + down/distance.
function footballSituation(sit, comp) {
  const dd = sit.shortDownDistanceText || sit.downDistanceText;
  const last = sit.lastPlay?.text;
  const cs = comp.competitors || [];
  const possId = sit.possession;
  const possTeam = cs.find((c) => String(c.id) === String(possId) || String(c.team?.id) === String(possId));
  const possAbbr = (sit.possessionText || '').split(' ')[0] || possTeam?.team?.abbreviation || '';
  const yl = Number(sit.yardLine);
  const rz = !!sit.isRedZone;
  if (!dd && isNaN(yl) && !last) return '';
  const field = !isNaN(yl) ? `<div class="ff-field ${rz ? 'rz' : ''}">
      <div class="ez">EZ</div>
      <div class="grass"><span class="fifty"></span><span class="ball" style="left:${clamp(yl, 1, 99)}%">🏈</span></div>
      <div class="ez">EZ</div>
    </div>` : '';
  return `<div class="md-section-title acc-open">🔴 Live Situation</div>
    ${dd ? `<div class="sit-mu">${possAbbr ? `<b>${possAbbr}</b> ball · ` : ''}${dd}${rz ? ` · <span class="rz-tag">RED ZONE</span>` : ''}</div>` : ''}
    ${field}
    ${last ? `<div class="sit-last">Last play: ${last}</div>` : ''}`;
}

// Soccer: possession split bar + shots, falling back to the last play. Stats
// can live on the boxscore team or the scoreboard competitor, so check both.
function soccerSituation(sit, data, comp) {
  const teams = data.boxscore?.teams || [];
  const cs = comp.competitors || [];
  const last = sit?.lastPlay?.text;
  const findStat = (sources, keys) => {
    for (const src of sources) {
      for (const s of (src?.statistics || [])) {
        const n = `${s.name || ''} ${s.abbreviation || ''} ${s.label || ''}`.toLowerCase();
        if (keys.some((k) => n.includes(k))) return s.displayValue ?? s.value;
      }
    }
    return null;
  };
  const side = (ha) => [teams.find((t) => (t.homeAway || '') === ha), cs.find((c) => c.homeAway === ha)].filter(Boolean);
  const aS = side('away'), hS = side('home');
  const aAbbr = cs.find((c) => c.homeAway === 'away')?.team?.abbreviation || 'Away';
  const hAbbr = cs.find((c) => c.homeAway === 'home')?.team?.abbreviation || 'Home';
  const aPos = parseFloat(findStat(aS, ['possession']));
  const hPos = parseFloat(findStat(hS, ['possession']));
  const aShots = findStat(aS, ['totalshots', 'shots']);
  const hShots = findStat(hS, ['totalshots', 'shots']);
  const aOn = findStat(aS, ['shotson', 'ontarget']);
  const hOn = findStat(hS, ['shotson', 'ontarget']);
  let html = '';
  if (!isNaN(aPos) && !isNaN(hPos)) {
    html += `<div class="poss-head"><span>${aAbbr} ${aPos.toFixed(0)}%</span><span>Possession</span><span>${hPos.toFixed(0)}% ${hAbbr}</span></div>
      <div class="poss-bar"><span class="poss-a" style="width:${clamp(aPos, 0, 100)}%"></span></div>`;
  }
  if (aShots != null && hShots != null) {
    html += `<div class="sit-mu">Shots: <b>${aShots}</b>${aOn != null ? ` (${aOn} on)` : ''} — <b>${hShots}</b>${hOn != null ? ` (${hOn} on)` : ''}</div>`;
  }
  if (last) html += `<div class="sit-last">Last play: ${last}</div>`;
  if (!html) html = '<div class="sit-last">Match underway — live stats updating.</div>';
  return `<div class="md-section-title acc-open">🔴 Live Situation</div>${html}`;
}

function renderGameDetail(sport, data, pred, extra, g) {
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
  // neutral-site World Cup games read "vs" rather than away @ home
  const neutral = sport === 'soccer' && !isWorldCupHost(home.team?.displayName || home.team?.name);
  const sep = neutral ? 'vs' : '@';
  let html = `<div class="md-head">${teamCell(away)}<div style="color:var(--muted);font-weight:700">${sep}</div>${teamCell(home)}</div>
    <div class="md-status ${live ? 'live' : ''}">${st.detail || st.shortDetail || ''}</div>`;

  // live situation (bases/count for baseball, last play otherwise)
  if (live) html += liveSituationHTML(sport, data, comp, g);

  // AI pick headline first (open), then collapsible detail sections
  html += aiPickHead(pred);
  html += aiFactors(pred);

  const rawO = (data.pickcenter || []).find((x) => x.spread != null || x.details || x.homeTeamOdds) || (data.odds || [])[0] || g?.odds;
  const oddsInfo = normOdds(rawO, home.team?.displayName, away.team?.displayName);
  html += oddsSectionHTML(oddsInfo, away.team?.abbreviation, home.team?.abbreviation, pred);
  html += extra || '';

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

  // team stats comparison — flatten nested categories (MLB) or flat list (NFL)
  const teams = data.boxscore?.teams || [];
  if (teams.length === 2) {
    const a = teams.find((t) => (t.homeAway || '') === 'away') || teams[0];
    const h = teams.find((t) => (t.homeAway || '') === 'home') || teams[1];
    const flat = (t) => {
      const out = {};
      (t.statistics || []).forEach((s) => {
        if (Array.isArray(s.stats)) s.stats.forEach((x) => { const k = x.label || x.displayName || x.name; if (k) out[k] = x.displayValue ?? x.value; });
        else { const k = s.label || s.displayName || s.name; if (k) out[k] = s.displayValue ?? s.value; }
      });
      return out;
    };
    const sa = flat(a), sh = flat(h);
    const keys = Object.keys(sh).filter((k) => k in sa && sh[k] != null && sa[k] != null && sh[k] !== '').slice(0, 8);
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
  const entries = [];
  all.forEach(({ sport, g }) => { const c = gameCard(sport, g); entries.push({ sport, g, card: c }); container.appendChild(c); });
  tagEdges(entries); // progressively flag games where the model disagrees with the line
}

// Does the model disagree with the betting favorite? If so there's a value
// "edge" worth surfacing before you tap in. Pre-game only — odds come right
// off the scoreboard event, so no extra request just to know the favorite.
async function gameEdge(sport, g) {
  if (gameState(g) !== 'scheduled') return null;
  if (!g.home?.id || !g.away?.id) return null;
  const info = normOdds(g.odds, g.home.name, g.away.name);
  if (!info || !info.favName) return null;
  let pred = null;
  try { pred = await predictGame(sport, g); } catch (_) { return null; }
  if (!pred || pred.thin) return null;
  if (pred.winner.name === info.favName) return null; // model agrees with the line
  const side = pred.winner.name === g.home.name ? g.home : g.away;
  return { abbr: side.abbr || (side.name || '').split(' ').pop(), name: side.name, conf: pred.conf, fav: info.favName };
}

// Run gameEdge across a list of {sport, g, card} with light concurrency and
// stamp an edge badge onto any card where the model bucks the favorite.
async function tagEdges(entries) {
  let i = 0;
  const worker = async () => {
    while (i < entries.length) {
      const { sport, g, card } = entries[i++];
      let edge = null;
      try { edge = await gameEdge(sport, g); } catch (_) {}
      if (edge && card.isConnected) {
        const b = el('div', 'edge-badge', `⚡ Model edge: ${edge.abbr} <span class="edge-conf">${edge.conf}%</span>`);
        b.title = `Model likes ${edge.name} (${edge.conf}%) — market favors ${edge.fav}`;
        const meta = card.querySelector('.game-meta');
        if (meta) meta.insertAdjacentElement('afterend', b); else card.appendChild(b);
        card.classList.add('has-edge');
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
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
  const results = await Promise.allSettled(sports.map((s) => getGames(s, ymd(sportsDate()))));
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
    const lbl = s === 'live' ? (fg.statusText || 'LIVE') : s === 'final' ? 'Final' : scheduledLabel(fg);
    html += `<div class="featured-game"><div><strong>${fg.away.name}</strong> ${fg.away.score ?? ''} @ <strong>${fg.home.name}</strong> ${fg.home.score ?? ''}</div>
      <span class="status ${s === 'live' ? 'live' : s === 'final' ? 'final' : ''}">${lbl}</span></div>`;
  } else {
    html += `<div class="muted">No game today. Check the Scores tab for the full slate.</div>`;
  }
  html += '</div>';
  $('#featured').innerHTML = html;
  renderHomeByLeague($('#home-games'), games);
  renderHomeHeadline();
}

// Top 3 sports headlines up top, numbered 1-2-3 so they scan left to right.
// ESPN orders each league's news with its lead story first, so we take those
// (newest first) for variety, then backfill — the biggest stuff going now.
async function renderHomeHeadline() {
  const box = $('#home-headline');
  if (!box) return;
  const sports = sortedSports({ teamOnly: true });
  const results = await Promise.allSettled(
    sports.map((s) => fetchJSON(`${SITE}/${LEAGUES[s].espnPath}/news`, 10 * 60000))
  );
  const newest = (x, y) => new Date(y.a.published || 0) - new Date(x.a.published || 0);
  const leads = [], more = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const arts = (r.value.articles || []).filter((a) => a.type !== 'Media' && (a.headline || a.description));
    if (arts[0]) leads.push({ sport: sports[i], a: arts[0] });
    arts.slice(1, 3).forEach((a) => more.push({ sport: sports[i], a }));
  });
  leads.sort(newest); more.sort(newest);
  const picks = [], seen = new Set();
  for (const p of [...leads, ...more]) {
    const k = (p.a.headline || '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k); picks.push(p);
    if (picks.length >= 3) break;
  }
  if (!picks.length) { box.innerHTML = ''; return; }

  const row = el('div', 'headline-row');
  picks.forEach(({ sport, a }, idx) => {
    const cfg = LEAGUES[sport];
    const img = a.images?.[0]?.url;
    const when = a.published ? timeAgo(a.published) : '';
    const card = el('div', 'hl-card');
    card.innerHTML = `
      <div class="hl-img" style="${img ? `background-image:url('${img}')` : ''}"><span class="hl-num">${idx + 1}</span></div>
      <div class="hl-body">
        <div class="hl-eyebrow">${cfg.emoji} ${cfg.label}${when ? ` · ${when}` : ''}</div>
        <div class="hl-title">${a.headline || ''}</div>
      </div>`;
    card.onclick = () => openNewsSummary(a);
    row.appendChild(card);
  });
  box.innerHTML = '<div class="section-title" style="margin:6px 0 8px">📰 Top Headlines</div>';
  box.appendChild(row);
}

// Today's games grouped by league, with a jump-nav to each league section.
function renderHomeByLeague(container, games) {
  container.className = 'home-games';
  container.innerHTML = '';
  const nav = el('div', 'jump-nav');
  container.appendChild(nav);
  const addChip = (id, label) => {
    const b = el('button', 'chip', label);
    b.onclick = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nav.appendChild(b);
  };
  const addSection = (id, label, cards) => {
    addChip(id, label);
    const head = el('h3', 'games-league-head'); head.id = id; head.innerHTML = label;
    container.appendChild(head);
    const grid = el('div', 'games-grid');
    cards.forEach((c) => grid.appendChild(c));
    container.appendChild(grid);
  };

  const teamSports = sortedSports({ teamOnly: true });
  const favFirst = (s) => (a, b) => (isFav(s, b) ? 1 : 0) - (isFav(s, a) ? 1 : 0);

  // live games across all leagues, pulled to the top
  const live = [];
  teamSports.forEach((s) => (games[s] || []).forEach((g) => { if (gameState(g) === 'live') live.push({ s, g }); }));
  if (live.length) {
    live.sort((a, b) => (isFav(b.s, b.g) ? 1 : 0) - (isFav(a.s, a.g) ? 1 : 0));
    addSection('home-live', '🔴 Live', live.map(({ s, g }) => gameCard(s, g)));
  }

  // the rest, grouped by league (in-season first)
  const sportsWithGames = teamSports.filter((s) => (games[s] || []).some((g) => gameState(g) !== 'live'));
  sportsWithGames.forEach((s) => {
    const cards = [...(games[s] || [])].filter((g) => gameState(g) !== 'live').sort(favFirst(s)).map((g) => gameCard(s, g));
    addSection(`home-${s}`, `${LEAGUES[s].emoji} ${LEAGUES[s].label}`, cards);
  });
  if (!live.length && !sportsWithGames.length) container.appendChild(el('div', 'empty', 'No games today for your sports.'));

  // golf as its own section (it's a leaderboard, not team games)
  if (SEASON_MONTHS.golf.includes(new Date().getMonth())) addGolfHomeSection(addSection);
}

async function addGolfHomeSection(addSection) {
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
  addSection('home-golf', '⛳ Golf', [card]);
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
  if (!dateInput.value) dateInput.value = ymdDash(sportsDate());
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
const winPct = (r) => { const g = (r.wins || 0) + (r.losses || 0); return g ? r.wins / g : 0; };
const gamesBack = (lead, r) => (((lead.wins || 0) - (r.wins || 0)) + ((r.losses || 0) - (lead.losses || 0))) / 2;

async function renderStandings() {
  const sport = state.standingsSport;
  buildChips($('#standings-filter'), sport, (s) => { state.standingsSport = s; renderStandings(); }, sortedSports({ teamOnly: true }));
  const content = $('#standings-content');
  content.innerHTML = '<div class="empty">Loading…</div>';
  let rows = [];
  try { rows = await getStandings(sport); } catch (_) {}
  if (!rows.length) { content.innerHTML = '<div class="empty">Standings unavailable right now.</div>'; return; }

  const soccer = sport === 'soccer';
  const favs = favSet(sport);
  const logoFor = (r) => (r.logo ? `<img class="tlogo" src="${r.logo}" onerror="this.style.display='none'"/>` : '');

  // build a table for a set of rows
  const table = (teams, lastCol, lastVal) => {
    const t = el('table');
    t.innerHTML = `<thead><tr><th>#</th><th>Team</th><th class="num">W</th><th class="num">L</th><th class="num">${lastCol}</th></tr></thead>`;
    const tbody = el('tbody');
    teams.forEach((r, i) => {
      const tr = el('tr', favs.includes((r.team || '').toLowerCase()) ? 'fav' : '');
      tr.innerHTML = `<td>${r._rank ?? r.rank ?? i + 1}</td><td>${logoFor(r)}${r.team}</td><td class="num">${r.wins ?? '–'}</td><td class="num">${r.losses ?? '–'}</td><td class="num">${lastVal(r)}</td>`;
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    return t;
  };

  content.innerHTML = '';

  // group by league -> division
  const byLeague = {};
  rows.forEach((r) => { const lg = r.league || 'Standings'; (byLeague[lg] = byLeague[lg] || {}); (byLeague[lg][r.division] = byLeague[lg][r.division] || []).push(r); });
  const wildcardSport = sport === 'mlb' || sport === 'nfl';
  const wcSpots = sport === 'nfl' ? 3 : 3;

  const multiLeague = Object.keys(byLeague).length > 1;
  Object.entries(byLeague).forEach(([league, divs]) => {
    const multiDiv = Object.keys(divs).length > 1;
    // Show a league heading when it actually groups several divisions.
    if (multiLeague || multiDiv) content.appendChild(el('div', 'standings-league', league));
    // division tables
    Object.entries(divs).forEach(([divName, teams]) => {
      teams.sort((a, b) => winPct(b) - winPct(a) || (b.wins || 0) - (a.wins || 0));
      teams.forEach((r, i) => (r._rank = i + 1));
      // strip the league prefix so "American League East" reads as "East"
      const shortDiv = (multiLeague || multiDiv) ? divName.replace(league, '').trim() || divName : divName;
      content.appendChild(el('div', 'standings-group', shortDiv));
      content.appendChild(table(teams, soccer ? 'Pts' : 'GB', (r) => soccer ? (r.points ?? '–') : (r._rank === 1 ? '—' : gamesBack(teams[0], r).toFixed(1))));
    });

    // wildcard table (non-division-leaders ranked by win %)
    if (wildcardSport && Object.keys(divs).length >= 2) {
      const pool = [];
      Object.values(divs).forEach((teams) => teams.slice(1).forEach((r) => pool.push(r)));
      pool.sort((a, b) => winPct(b) - winPct(a) || (b.wins || 0) - (a.wins || 0));
      pool.forEach((r, i) => (r._rank = i + 1));
      if (pool.length) {
        content.appendChild(el('div', 'standings-group wc', `${league} Wild Card`));
        const cutoff = pool[wcSpots - 1] || pool[pool.length - 1];
        const t = table(pool, 'GB', (r) => r._rank <= wcSpots ? (r._rank === wcSpots ? '—' : `+${(-gamesBack(cutoff, r)).toFixed(1)}`) : gamesBack(cutoff, r).toFixed(1));
        t.querySelectorAll('tbody tr').forEach((tr, i) => { if (i === wcSpots) tr.classList.add('wc-cut'); });
        content.appendChild(t);
      }
    }
  });
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
    games.push({ date: ev.date, margin: ms - os, pf: ms, pa: os, home: me.homeAway === 'home', win: me.winner === true || ms > os });
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
  const last10arr = games.slice(-10);
  const last10 = { w: last10arr.filter((g) => g.win).length, l: last10arr.filter((g) => !g.win).length };
  // current streak: + for wins, - for losses
  let streak = 0;
  for (let i = gp - 1; i >= 0; i--) { const w = games[i].win; if (i === gp - 1) { streak = w ? 1 : -1; } else if ((w && streak > 0) || (!w && streak < 0)) { streak += w ? 1 : -1; } else break; }
  return {
    gp,
    winPct: sum((g) => (g.win ? 1 : 0)) / gp,
    pdpg: sum((g) => g.margin) / gp,
    ppg: sum((g) => g.pf) / gp,
    papg: sum((g) => g.pa) / gp,
    form: wtot ? wsum / wtot : 0,
    homeWP: wp(homeG),
    roadWP: wp(roadG),
    last10, streak,
    lastDate: games[gp - 1].date,
  };
}

// Pull a numeric stat from a probable pitcher's stat line.
function statVal(arr, keys) {
  const s = (arr || []).find((x) => {
    const a = (x.abbreviation || '').toUpperCase(), n = (x.name || '').toLowerCase();
    return keys.some((k) => a === k.toUpperCase() || n.includes(k.toLowerCase()));
  });
  if (!s) return null;
  const v = Number(s.displayValue ?? s.value);
  return isNaN(v) ? null : v;
}
const BBCORE = 'https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb';
const ops3 = (v) => v.toFixed(3).replace(/^0/, ''); // 0.790 -> ".790"
// Team OPS from ESPN's core baseball stats — best available proxy for lineup
// hitting, since posted starting-lineup OPS isn't reliably public pregame.
async function teamOPS(teamId) {
  if (!teamId) return null;
  const data = await safeJSON(`${BBCORE}/seasons/${new Date().getFullYear()}/types/2/teams/${teamId}/statistics`, 6 * 3600000);
  for (const c of (data?.splits?.categories || [])) {
    const s = (c.stats || []).find((x) => (x.abbreviation || '').toUpperCase() === 'OPS' || /on-base plus slugging/i.test(x.displayName || x.name || ''));
    if (s) { const v = Number(s.value ?? s.displayValue); if (!isNaN(v)) return v; }
  }
  return null;
}

const ops3n = (v) => { const n = parseFloat(v); return isNaN(n) ? (v ?? '') : ops3(n); };
// Top 3 hitters by OPS for a team (with AVG/HR/RBI when available), injured out.
async function topHitters(teamId, n = 3) {
  if (!teamId) return [];
  const y = new Date().getFullYear();
  const [lead, roster] = await Promise.all([
    safeJSON(`${BBCORE}/seasons/${y}/types/2/teams/${teamId}/leaders`, 6 * 3600000),
    safeJSON(`${SITE}/baseball/mlb/teams/${teamId}/roster`, 6 * 3600000),
  ]);
  const info = {};
  (roster?.athletes || []).forEach((grp) => (grp.items || grp.athletes || [grp]).forEach((a) => {
    if (!a?.id) return;
    const stat = `${a.status?.name || a.status?.type || a.status?.abbreviation || ''}`;
    const injured = (Array.isArray(a.injuries) && a.injuries.length > 0) || /injur|^il$|\bil\b|day-to-day|out|\d+-day/i.test(stat);
    info[a.id] = { name: a.displayName || a.fullName, injured };
  }));
  const cats = lead?.categories || [];
  const findCat = (re) => cats.find((c) => re.test(`${c.abbreviation || ''}|${c.name || ''}|${c.displayName || ''}`));
  const map = { ops: findCat(/ops/i), avg: findCat(/batting average|^avg$/i), hr: findCat(/home runs|^hr$|homeruns/i), rbi: findCat(/\brbi\b|runs batted/i) };
  if (!map.ops) return [];
  const players = {};
  Object.entries(map).forEach(([k, c]) => (c?.leaders || []).forEach((L) => {
    const id = refId(L.athlete?.$ref); if (!id) return;
    (players[id] = players[id] || { id })[k] = L.displayValue ?? L.value;
  }));
  return Object.values(players)
    .map((p) => ({ ...p, name: info[p.id]?.name || '', injured: info[p.id]?.injured }))
    .filter((p) => p.name && p.ops != null && !p.injured)
    .sort((a, b) => parseFloat(b.ops) - parseFloat(a.ops))
    .slice(0, n);
}
function hittersHTML(g, ht, at) {
  const line = (p) => {
    const extra = [p.avg != null ? `${ops3n(p.avg)} AVG` : '', p.hr != null ? `${p.hr} HR` : '', p.rbi != null ? `${p.rbi} RBI` : ''].filter(Boolean).join(' · ');
    return `<div class="hit-row"><span class="hit-n">${p.name}</span><span class="hit-s">${ops3n(p.ops)} OPS${extra ? ' · ' + extra : ''}</span></div>`;
  };
  const block = (label, arr) => `<div class="hit-team">${label}</div>${arr.length ? arr.map(line).join('') : '<div class="ai-why">Not available</div>'}`;
  return `<div class="md-section-title">Top 3 Hitters (OPS · healthy)</div>${block(g.away.abbr || 'Away', at)}${block(g.home.abbr || 'Home', ht)}`;
}
// NFL key players (QB/RB/WR leaders) from the scoreboard feed.
function nflKeyHTML(g) {
  const pick = (lead, re) => {
    const c = (lead || []).find((x) => re.test(`${x.name}${x.displayName}`));
    const t = c?.leaders?.[0];
    return t ? { name: t.athlete?.displayName || t.athlete?.shortName, val: t.displayValue } : null;
  };
  const side = (lead) => [['QB', /passing/i], ['RB', /rushing/i], ['WR', /receiving/i]]
    .map(([pos, re]) => { const p = pick(lead, re); return p ? { pos, ...p } : null; }).filter(Boolean);
  const h = side(g.home.leaders), a = side(g.away.leaders);
  if (!h.length && !a.length) return '<div class="md-section-title">Key Players</div><div class="ai-why">Season stats appear once the season starts.</div>';
  const rows = (arr) => arr.length ? arr.map((p) => `<div class="hit-row"><span class="hit-n">${p.pos} · ${p.name}</span><span class="hit-s">${p.val}</span></div>`).join('') : '<div class="ai-why">Not available</div>';
  return `<div class="md-section-title">Key Players</div><div class="hit-team">${g.away.abbr || 'Away'}</div>${rows(a)}<div class="hit-team">${g.home.abbr || 'Home'}</div>${rows(h)}`;
}
// Projected starting pitchers with their key stats (from the scoreboard feed).
function startersHTML(g) {
  const sp = (side) => {
    const p = side.probables?.[0]; if (!p) return null;
    const a = p.athlete || {};
    const era = statVal(p.statistics, ['ERA', 'earnedRunAverage']);
    const whip = statVal(p.statistics, ['WHIP', 'walksHitsPerInningPitched']);
    const k = statVal(p.statistics, ['K', 'SO', 'strikeouts']);
    const get = (keys) => { const s = (p.statistics || []).find((x) => keys.includes((x.abbreviation || '').toUpperCase()) || keys.includes(x.name)); return s ? (s.displayValue ?? s.value) : null; };
    const wl = get(['W-L', 'wins-losses', 'record']);
    const bits = [era != null ? `${era.toFixed(2)} ERA` : '', whip != null ? `${whip.toFixed(2)} WHIP` : '', wl ? `${wl}` : '', k != null ? `${k} K` : ''].filter(Boolean).join(' · ');
    return { name: a.displayName || a.shortName || 'TBD', bits: bits || 'season stats pending' };
  };
  const h = sp(g.home), a = sp(g.away);
  if (!h && !a) return '<div class="md-section-title">Projected Starters</div><div class="ai-why">Not announced yet.</div>';
  const row = (label, p) => p ? `<div class="hit-row"><span class="hit-n">${label} · ${p.name}</span><span class="hit-s">${p.bits}</span></div>` : '';
  return `<div class="md-section-title">Projected Starters</div>${row(g.away.abbr || 'Away', a)}${row(g.home.abbr || 'Home', h)}`;
}

// Player-matchup signal: MLB starting pitchers (ERA + WHIP) and team OPS;
// football/basketball key player. Returns weighted factors + display notes.
async function matchupFactor(sport, g) {
  const notes = [], factors = [];
  if (sport === 'mlb') {
    const hp = g.home.probables?.[0], ap = g.away.probables?.[0];
    const hn = hp?.athlete?.displayName || hp?.athlete?.shortName;
    const an = ap?.athlete?.displayName || ap?.athlete?.shortName;
    if (hn && an) {
      const hERA = statVal(hp?.statistics, ['ERA', 'earnedRunAverage']);
      const aERA = statVal(ap?.statistics, ['ERA', 'earnedRunAverage']);
      const hWHIP = statVal(hp?.statistics, ['WHIP', 'walksHitsPerInningPitched']);
      const aWHIP = statVal(ap?.statistics, ['WHIP', 'walksHitsPerInningPitched']);
      const fmt = (era, whip) => [era != null ? `${era} ERA` : '', whip != null ? `${whip} WHIP` : ''].filter(Boolean).join(', ');
      notes.push(`SP: ${hn}${fmt(hERA, hWHIP) ? ` (${fmt(hERA, hWHIP)})` : ''} vs ${an}${fmt(aERA, aWHIP) ? ` (${fmt(aERA, aWHIP)})` : ''}`);
      const parts = [];
      if (hERA != null && aERA != null) parts.push(clamp((aERA - hERA) / 1.5, -2, 2)); // lower ERA = home edge
      if (hWHIP != null && aWHIP != null) parts.push(clamp((aWHIP - hWHIP) / 0.25, -2, 2)); // lower WHIP = home edge
      if (parts.length) factors.push({ label: 'Starting pitcher', c: 0.24 * (parts.reduce((s, v) => s + v, 0) / parts.length), detail: 'ERA/WHIP edge' });
    }
    const [hOPS, aOPS] = await Promise.all([teamOPS(g.home.id), teamOPS(g.away.id)]);
    if (hOPS != null && aOPS != null) {
      notes.push(`Team OPS: ${ops3(hOPS)} vs ${ops3(aOPS)}`);
      factors.push({ label: 'Lineup OPS', c: 0.18 * clamp((hOPS - aOPS) / 0.05, -2, 2), detail: `${ops3(hOPS)} vs ${ops3(aOPS)}` }); // higher OPS = home edge
    }
  } else {
    const key = (lead) => {
      const cat = (lead || []).find((x) => /passing|rating|points|qb/i.test(`${x.name}${x.displayName}`));
      const top = cat?.leaders?.[0];
      return top ? { name: top.athlete?.displayName || top.athlete?.shortName, val: top.displayValue } : null;
    };
    const h = key(g.home.leaders), a = key(g.away.leaders);
    if (h && a) notes.push(`${sport === 'nfl' ? 'QB' : 'Leader'}: ${h.name} (${h.val}) vs ${a.name} (${a.val})`);
  }
  return { factors, notes };
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
    add('Recent form', 0.4 * clamp((hf.form - af.form) / scale, -3, 3), `last 5: ${hf.form >= 0 ? '+' : ''}${hf.form.toFixed(1)} vs ${af.form >= 0 ? '+' : ''}${af.form.toFixed(1)}`);
    if (sport === 'soccer') {
      // World Cup is played on neutral fields, so there's no real home edge —
      // except the host nations (USA, Mexico, Canada in 2026) actually playing
      // at home. Everyone else: no home/road advantage either way.
      if (isWorldCupHost(g.home.name)) add('Host nation', 0.30, `${g.home.name} at home`);
    } else if (hf.homeWP != null && af.roadWP != null) {
      add('Home/road split', 1.0 * (hf.homeWP - af.roadWP), `home ${(hf.homeWP * 100).toFixed(0)}% vs road ${(af.roadWP * 100).toFixed(0)}%`);
    } else { add('Home field', 0.28, 'standard home edge'); }
    const day = 86400000;
    const hr = g.date && hf.lastDate ? clamp(Math.round((new Date(g.date) - new Date(hf.lastDate)) / day), 0, 10) : null;
    const ar = g.date && af.lastDate ? clamp(Math.round((new Date(g.date) - new Date(af.lastDate)) / day), 0, 10) : null;
    if (hr != null && ar != null && hr !== ar) add('Rest', 0.05 * clamp(hr - ar, -5, 5), `${hr}d vs ${ar}d rest`);
  } else {
    add('Home field', 0.3, 'limited data — home edge only');
  }

  // player matchup (starting pitchers ERA/WHIP, team OPS, QBs)
  const mu = await matchupFactor(sport, g);
  mu.factors.forEach((f) => add(f.label, f.c, f.detail));

  const pHome = logistic(z);
  const homePick = pHome >= 0.5;
  const winner = homePick ? g.home : g.away;
  const conf = clamp(Math.round((homePick ? pHome : 1 - pHome) * 100), 50, 92);
  // Calibrated attribution: split the actual edge over 50% across factors in
  // proportion to each factor's log-odds, so the parts add up to the pick.
  const edge = (pHome - 0.5) * 100; // home edge in points (can be negative)
  const breakdown = factors.map((f) => {
    const pts = Math.abs(z) > 1e-6 ? (f.c / z) * edge : 0; // toward home if positive
    return { label: f.label, detail: f.detail, favor: f.c >= 0 ? g.home.name : g.away.name, pct: Math.abs(pts) };
  }).filter((b) => b.pct >= 0.1).sort((a, b) => b.pct - a.pct);
  return { winner, conf, homePick, breakdown, notes: mu.notes, thin: !(hf && af) };
}

function aiPickHead(pred) {
  if (!pred) return '';
  return `<div class="md-section-title acc-open">🤖 AI Pick</div>
    <div class="ai-pick">Pick: <b>${pred.winner.name}</b> <span class="ai-conf">${pred.conf}%</span></div>
    <div class="conf-bar"><span style="width:${pred.conf}%"></span></div>
    ${pred.thin ? '<div class="ai-why">Not enough games played yet for full analysis.</div>' : ''}`;
}
function aiFactors(pred) {
  if (!pred || !pred.breakdown.length) return '';
  const rows = pred.breakdown.map((b) =>
    `<div class="fac-row"><span class="fac-l">${b.label}</span><span class="fac-d">${b.detail}</span><span class="fac-p">${b.favor.split(' ').slice(-1)[0]} +${b.pct.toFixed(1)}%</span></div>`).join('');
  return `<div class="md-section-title">Why — Factor Breakdown</div>
    <div class="fac-list">${rows}</div>
    <div class="ai-why" style="margin-top:6px">Factors above the 50% coin-flip add up to the ${pred.conf}% pick.</div>`;
}

// Persistent model performance tally (vs results and vs the betting line).
const TALLY_KEY = 'sportshub:aitally';
const getTally = () => { try { return JSON.parse(localStorage.getItem(TALLY_KEY) || '{}'); } catch (_) { return {}; } };
function recordResult(id, correct, edge) {
  const t = getTally();
  t[id] = { c: correct ? 1 : 0, e: edge }; // e: 'h' edge-hit, 'm' edge-miss, null agreed
  localStorage.setItem(TALLY_KEY, JSON.stringify(t));
}
function tallyStats() {
  const t = getTally(); let w = 0, n = 0, eh = 0, en = 0;
  Object.values(t).forEach((r) => { n++; if (r.c) w++; if (r.e === 'h') { eh++; en++; } else if (r.e === 'm') en++; });
  return { w, l: n - w, n, eh, el: en - eh, en };
}

// Pending picks: every prediction is stashed so the running record keeps
// building even if you're not on the AI Picks tab when a game ends. On load
// we look up each pending game's final result and fold it into the tally.
const PENDING_KEY = 'sportshub:pending';
const getPending = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}'); } catch (_) { return {}; } };
const setPending = (p) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch (_) {} };
function recordPick(id, sport, date, pick, fav) {
  if (!id || !pick) return;
  if (getTally()[id]) return; // already graded
  const p = getPending();
  if (p[id]) return;
  p[id] = { sport, date, pick, fav: fav || null };
  setPending(p);
}
async function gradePending() {
  const p = getPending();
  const tally = getTally();
  const groups = {};
  let changed = false;
  const cutoff = Number(ymd(new Date(Date.now() - 14 * 86400000))); // purge stale (>14d)
  Object.keys(p).forEach((id) => {
    if (tally[id]) { delete p[id]; changed = true; return; }            // already graded
    const { sport, date } = p[id];
    if (Number(date) < cutoff) { delete p[id]; changed = true; return; } // too old to chase
    (groups[`${sport}|${date}`] = groups[`${sport}|${date}`] || []).push(id);
  });
  await Promise.all(Object.entries(groups).map(async ([key, ids]) => {
    const [sport, date] = key.split('|');
    let games = [];
    try { games = await getGames(sport, date); } catch (_) { return; }
    const byId = {}; games.forEach((g) => (byId[g.id] = g));
    ids.forEach((id) => {
      const g = byId[id]; if (!g || gameState(g) !== 'final') return;
      const actual = winnerName(g);
      if (!actual || actual === 'TIE') { delete p[id]; changed = true; return; }
      const { pick, fav } = p[id];
      const hit = actual === pick;
      recordResult(id, hit, fav && pick !== fav ? (hit ? 'h' : 'm') : null);
      delete p[id]; changed = true;
    });
  }));
  if (changed) setPending(p);
}

async function renderPredictions() {
  const sport = state.aiSport || FEATURED.sport;
  buildChips($('#ai-sport'), sport, (s) => { state.aiSport = s; renderPredictions(); }, sortedSports({ teamOnly: true }));
  const container = $('#ai-picks');
  container.innerHTML = '<div class="empty">Crunching the numbers…</div>';

  const games = await getGames(sport, ymd(sportsDate())).catch(() => []);
  const playable = games.filter((g) => g.id);
  const renderTally = (todayTxt) => {
    const ts = tallyStats();
    const parts = [];
    if (ts.n) parts.push(`All-time ${ts.w}-${ts.l} (${Math.round((ts.w / ts.n) * 100)}%)`);
    if (ts.en) parts.push(`vs line ${ts.eh}-${ts.el}`);
    if (todayTxt) parts.push(todayTxt);
    $('#ai-score').textContent = parts.join(' · ');
  };
  // Full-width tracking panel: overall model record, record when the model
  // bucked the book, and how many edges it sees today.
  const statBar = (edgeCount) => {
    const ts = tallyStats();
    const tile = (val, label, sub, cls) =>
      `<div class="ai-stat ${cls || ''}"><div class="ai-stat-v">${val}</div><div class="ai-stat-l">${label}</div><div class="ai-stat-s">${sub}</div></div>`;
    const bar = el('div', 'ai-statbar');
    bar.innerHTML =
      tile(ts.n ? `${ts.w}-${ts.l}` : '—', 'Model record', ts.n ? `${Math.round((ts.w / ts.n) * 100)}% all-time` : 'no graded games yet') +
      tile(ts.en ? `${ts.eh}-${ts.el}` : '—', 'vs the line', ts.en ? `${Math.round((ts.eh / ts.en) * 100)}% off the book` : 'edges not graded yet') +
      tile(String(edgeCount), 'Edges today', edgeCount ? 'model disagrees w/ book' : 'model in line w/ book', edgeCount ? 'edge' : '');
    return bar;
  };
  if (!playable.length) { container.innerHTML = ''; container.appendChild(statBar(0)); container.appendChild(el('div', 'empty', 'No games today for this sport.')); renderTally(''); return; }

  const dateStr = ymd(sportsDate());
  const preds = await Promise.all(playable.map((g) => predictGame(sport, g).catch(() => null)));
  container.innerHTML = '';
  let right = 0, graded = 0;

  // Build a record per game and flag where the model bucks the betting favorite.
  const rows = playable.map((g, i) => {
    const p = preds[i];
    const info = p ? normOdds(g.odds, g.home.name, g.away.name) : null;
    const isEdge = !!(p && info && info.favName && p.winner.name !== info.favName);
    let resultTag = '';
    if (p && gameState(g) === 'final') {
      const actual = winnerName(g);
      if (actual && actual !== 'TIE') {
        graded++; const hit = actual === p.winner.name; if (hit) right++;
        const edge = info && info.favName ? (isEdge ? (hit ? 'h' : 'm') : null) : null;
        recordResult(g.id, hit, edge);
        resultTag = `<div class="ai-result ${hit ? 'win' : 'loss'}">${hit ? '✅ Model nailed it' : '❌ Model missed'}</div>`;
      }
    } else if (p) {
      // stash the pick so it gets graded later even if the tab isn't open
      recordPick(g.id, sport, dateStr, p.winner.name, info?.favName);
    }
    return { g, p, info, isEdge, resultTag };
  });

  const upcomingEdges = rows.filter((r) => r.isEdge && gameState(r.g) !== 'final').length;
  container.appendChild(statBar(upcomingEdges));
  renderTally(graded ? `today ${right}-${graded - right}` : '');

  const buildCard = ({ g, p, info, isEdge, resultTag }) => {
    const card = gameCard(sport, g);
    if (isEdge) {
      const abbr = (g.home.name === p.winner.name ? g.home.abbr : g.away.abbr) || (p.winner.name || '').split(' ').pop();
      const b = el('div', 'edge-badge', `⚡ Model edge: ${abbr} <span class="edge-conf">${p.conf}%</span>`);
      const meta = card.querySelector('.game-meta');
      if (meta) meta.insertAdjacentElement('afterend', b); else card.appendChild(b);
      card.classList.add('has-edge');
    }
    if (p) {
      const cmp = info ? marketCompare(p, info.favName) : '';
      const top = p.breakdown.slice(0, 2).map((b) => `${b.label} (${b.favor.split(' ').slice(-1)[0]} +${b.pct.toFixed(1)}%)`).join(' · ');
      const oddsLine = info ? `<div class="card-odds">📊 ${info.details ?? 'line n/a'}${info.ou != null ? ` · O/U ${info.ou}` : ''}</div>` : '';
      const block = el('div', 'ai-block');
      block.innerHTML = `
        <div class="ai-pick">🤖 Pick: <b>${p.winner.name}</b> <span class="ai-conf">${p.conf}%</span></div>
        <div class="conf-bar"><span style="width:${p.conf}%"></span></div>
        ${cmp ? `<div class="market-cmp small">${cmp}</div>` : ''}
        ${oddsLine}
        <div class="ai-why">${top || 'Home-field edge'}</div>
        <div class="ai-why" style="margin-top:4px;opacity:.8">Tap for full breakdown →</div>${resultTag}`;
      card.appendChild(block);
    }
    return card;
  };

  // Only show games where the model disagrees with the book — the full slate
  // already lives in the Scores tab. The rest of the space goes to trends.
  const edges = rows.filter((r) => r.isEdge).sort((a, b) => (b.p?.conf || 0) - (a.p?.conf || 0));
  if (edges.length) {
    container.appendChild(el('div', 'ai-section-head edge', `⚡ Model Edges — off the book (${edges.length})`));
    edges.forEach((r) => container.appendChild(buildCard(r)));
  } else {
    container.appendChild(el('div', 'ai-note', '✅ No model edges today — the model agrees with the betting favorite on every game. Check the trends below.'));
  }

  renderAiTrends(container, sport, playable, rows);
}

// "Trends to pay attention to" — team form/scoring pulled from cached profiles,
// plus MLB starting-pitcher and hot-hitter props. Fills the space under the
// edges so AI Picks is useful even on a day with no edges.
const TOTALS = { mlb: [7.5, 9.5, 'runs'], nba: [216, 233, 'pts'], nfl: [40.5, 48.5, 'pts'], soccer: [1.8, 3.2, 'goals'] };
async function renderAiTrends(container, sport, games, rows) {
  if (!games.length) return;
  // unique teams in today's slate
  const teams = [], seenT = new Set();
  games.forEach((g) => [g.home, g.away].forEach((t) => { if (t.id && !seenT.has(t.id)) { seenT.add(t.id); teams.push(t); } }));
  const profs = await Promise.all(teams.map((t) => teamProfile(sport, t.id).catch(() => null)));

  // ---- team trends ----
  const tot = TOTALS[sport];
  const teamTrends = [];
  teams.forEach((t, i) => {
    const p = profs[i]; if (!p || p.gp < 6) return;
    const nm = t.name;
    const { w, l } = p.last10 || { w: 0, l: 0 };
    if (w - l >= 4) teamTrends.push({ s: (w - l) + Math.abs(p.streak), t: `🔥 <b>${nm}</b> — ${w}-${l} last 10${p.streak >= 3 ? `, won ${p.streak} straight` : ''}` });
    else if (l - w >= 4) teamTrends.push({ s: (l - w) + Math.abs(p.streak), t: `❄️ <b>${nm}</b> — ${w}-${l} last 10${p.streak <= -3 ? `, lost ${-p.streak} straight` : ''}` });
    else if (p.streak >= 4) teamTrends.push({ s: p.streak, t: `🔥 <b>${nm}</b> — riding a ${p.streak}-game win streak` });
    else if (p.streak <= -4) teamTrends.push({ s: -p.streak, t: `❄️ <b>${nm}</b> — ${-p.streak}-game skid` });
    if (tot && p.ppg != null && p.papg != null) {
      const g = p.ppg + p.papg;
      if (g >= tot[1]) teamTrends.push({ s: (g - tot[1]) * 2, t: `📈 <b>${nm}</b> games averaging ${g.toFixed(1)} ${tot[2]} — overs trending` });
      else if (g <= tot[0]) teamTrends.push({ s: (tot[0] - g) * 2, t: `📉 <b>${nm}</b> games averaging ${g.toFixed(1)} ${tot[2]} — unders trending` });
    }
  });
  teamTrends.sort((a, b) => b.s - a.s);

  // ---- player props (MLB: probable pitchers + hot hitters) ----
  const propRows = [];
  if (sport === 'mlb') {
    const pitchers = [];
    games.forEach((g) => [['away', g.away], ['home', g.home]].forEach(([, t]) => {
      const pr = t.probables?.[0]; const nm = pr?.athlete?.displayName || pr?.athlete?.shortName;
      if (!nm) return;
      const era = statVal(pr?.statistics, ['ERA', 'earnedRunAverage']);
      const whip = statVal(pr?.statistics, ['WHIP', 'walksHitsPerInningPitched']);
      if (era != null) pitchers.push({ nm, era, whip });
    }));
    pitchers.sort((a, b) => a.era - b.era);
    pitchers.slice(0, 2).forEach((p) => propRows.push(`🎯 <b>${p.nm}</b> on the mound — ${p.era} ERA${p.whip != null ? `, ${p.whip} WHIP` : ''} (Ks / unders watch)`));
    pitchers.slice(-1).forEach((p) => { if (p.era >= 4.8) propRows.push(`⚠️ <b>${p.nm}</b> starting — ${p.era} ERA${p.whip != null ? `, ${p.whip} WHIP` : ''} (hitter / overs spot)`); });

    // hot hitters from the teams in the edge games (bounded), else top form teams
    let hitterTeams = rows.filter((r) => r.isEdge).flatMap((r) => [r.g.home, r.g.away]);
    if (!hitterTeams.length) hitterTeams = teams.slice(0, 4);
    const uniqH = []; const seenH = new Set();
    hitterTeams.forEach((t) => { if (t.id && !seenH.has(t.id)) { seenH.add(t.id); uniqH.push(t); } });
    const hh = await Promise.all(uniqH.slice(0, 6).map((t) => topHitters(t.id, 1).catch(() => [])));
    hh.forEach((arr, i) => { const p = arr[0]; if (p && parseFloat(p.ops) >= 0.800) propRows.push(`🔥 <b>${p.name}</b> (${uniqH[i].abbr || uniqH[i].name}) — ${ops3n(p.ops)} OPS${p.hr ? `, ${p.hr} HR` : ''} (hits / TB props)`); });
  }

  // ---- render ----
  if (teamTrends.length) {
    container.appendChild(el('div', 'ai-section-head', '📈 Team Trends to Watch'));
    const box = el('div', 'trend-list');
    teamTrends.slice(0, 6).forEach((x) => box.appendChild(el('div', 'trend-row', x.t)));
    container.appendChild(box);
  }
  if (propRows.length) {
    container.appendChild(el('div', 'ai-section-head', '🎯 Player Props to Watch'));
    const box = el('div', 'trend-list');
    propRows.slice(0, 6).forEach((x) => box.appendChild(el('div', 'trend-row', x)));
    container.appendChild(box);
  }
  if (!teamTrends.length && !propRows.length) {
    container.appendChild(el('div', 'ai-note', 'Trends populate once teams have played enough games this season.'));
  }
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
  try { games = await getGames(leagueKey, ymd(sportsDate())); } catch (_) {}
  fanState.gamesByTeam = buildGameIndex(games);

  // Pull the real ESPN league once per session (overwrites the saved roster).
  // Falls back silently to the locally-saved/manual roster if the backend is
  // unreachable or this sport's league isn't configured.
  fanState.synced = fanState.synced || {};
  const cfg = await leagueConfig();
  if (cfg[fanState.sport] && !fanState.synced[fanState.sport]) {
    await syncFromLeague(fanState.sport);
    fanState.synced[fanState.sport] = true;
  }
  renderLeagueHeader(fanState.sport);
  renderMatchup(fanState.sport);
  renderFantasyStandings(fanState.sport);
  renderWaivers(fanState.sport);
  renderOpponent(fanState.sport);

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

  // snapshot + hot/cold are filled asynchronously (need recent-form data)
  $('#fantasy-analytics').innerHTML = '<div class="fan-card"><div class="big">…</div><div class="lbl">Analyzing recent form</div></div>';
  $('#fantasy-recs').innerHTML = '<h3>Hot & Cold</h3><div class="none">Checking who’s heating up and who to drop…</div>';

  // roster grouped by Hitters / Pitchers
  const teamOpts = (fanState.sport === 'baseball' ? MLB_TEAMS : NFL_TEAMS);
  const groups = fanState.sport === 'baseball'
    ? [['Hitters', (p) => !isPitcher(p)], ['Pitchers', (p) => isPitcher(p)]]
    : [['Offense', (p) => /QB|RB|HB|FB|WR|TE/.test((p.pos || p.slot || '').toUpperCase())], ['Other', (p) => !/QB|RB|HB|FB|WR|TE/.test((p.pos || p.slot || '').toUpperCase())]];
  const container = $('#fantasy-roster');
  container.innerHTML = '';
  if (!roster.length) {
    container.appendChild(el('div', 'empty', 'No players yet. Tap “Add player” to build your roster.'));
  }
  groups.forEach(([label, match]) => {
    const rows = roster.map((p, i) => ({ p, i })).filter(({ p }) => match(p));
    if (!rows.length) return;
    container.appendChild(el('div', 'roster-group', label));
    rows.forEach(({ p, i }) => {
      const pg = playerGame(p);
      const gl = gameLabel(pg);
      const ln = lineFor(p);
      const teamAbbr = MLB_ABBR[p.team] || (p.team ? p.team.split(' ').slice(-1)[0].slice(0, 3).toUpperCase() : '');
      const item = el('div', 'fan-item');
      const teamSel = `<select data-i="${i}" data-f="team"><option value="">— set team —</option>${teamOpts.map((t) => `<option ${t === p.team ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
      const statSel = `<select data-i="${i}" data-f="status">${['active','bench','il'].map((s) => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${s === 'active' ? 'Starter' : s === 'bench' ? 'Bench' : 'IL'}</option>`).join('')}</select>`;
      item.innerHTML = `
        <div class="fan-head">
          <span class="arrow" id="farrow-${i}"></span>
          <span class="fh-name">${p.name}</span>
          <span class="fh-meta">${p.slot}${teamAbbr ? ' · ' + teamAbbr : ''}</span>
          <span class="fh-lead" id="flead-${i}"></span>
          <span class="chev">▸</span>
        </div>
        <div class="fan-body">
          <div class="pgame ${gl.cls}">${gl.text}${ln ? ` <b style="color:var(--accent)">— ${ln.text}</b>` : ''}</div>
          <div class="seas" id="fseas-${i}">${p.team ? 'loading season stats…' : 'set a team to load stats'}</div>
          <div id="ftrend-${i}"></div>
          <div class="fan-edit"><label>Team ${teamSel}</label><label>Role ${statSel}</label><button class="rm" data-i="${i}">Remove</button></div>
        </div>`;
      item.querySelector('.fan-head').onclick = () => item.classList.toggle('open');
      container.appendChild(item);
    });
  });

  // wire row controls (stop clicks from toggling the row)
  container.querySelectorAll('select').forEach((sel) => {
    sel.onclick = (e) => e.stopPropagation();
    sel.onchange = () => {
      const r = loadRoster(fanState.sport);
      r[+sel.dataset.i][sel.dataset.f] = sel.value;
      saveRoster(fanState.sport, r);
      renderFantasy();
    };
  });
  container.querySelectorAll('.rm').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const r = loadRoster(fanState.sport);
      r.splice(+btn.dataset.i, 1);
      saveRoster(fanState.sport, r);
      renderFantasy();
    };
  });

  // auto-detect any missing MLB teams, then fill stats
  if (fanState.sport === 'baseball' && roster.some((p) => !p.team)) {
    autoResolveTeams(roster).then((changed) => { if (changed && fanState.sport === 'baseball') renderFantasy(); else fillSeasonStats(roster, fanState.sport); });
  } else {
    fillSeasonStats(roster, fanState.sport);
  }
}

// --- fantasy season stats -------------------------------------------------
const norm = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const nameKey = (name) => { const p = parseName(name); return `${norm(p.last)}|${norm(p.init)}`; };

async function leagueTeamIds(sport) {
  const path = LEAGUES[sport].espnPath;
  const data = await fetchJSON(`${SITE}/${path}/teams`, 24 * 3600000).catch(() => null);
  const map = {};
  const teams = data?.sports?.[0]?.leagues?.[0]?.teams || [];
  teams.forEach((t) => { const tm = t.team || t; if (tm.displayName) map[tm.displayName.toLowerCase()] = tm.id; });
  return map;
}

// Auto-detect each player's MLB team by scanning all 30 rosters (by stable
// abbreviation, so it doesn't depend on the teams endpoint). Cached a day.
const MLB_ABBR = {
  'Arizona Diamondbacks': 'ARI', 'Athletics': 'OAK', 'Atlanta Braves': 'ATL', 'Baltimore Orioles': 'BAL',
  'Boston Red Sox': 'BOS', 'Chicago Cubs': 'CHC', 'Chicago White Sox': 'CHW', 'Cincinnati Reds': 'CIN',
  'Cleveland Guardians': 'CLE', 'Colorado Rockies': 'COL', 'Detroit Tigers': 'DET', 'Houston Astros': 'HOU',
  'Kansas City Royals': 'KC', 'Los Angeles Angels': 'LAA', 'Los Angeles Dodgers': 'LAD', 'Miami Marlins': 'MIA',
  'Milwaukee Brewers': 'MIL', 'Minnesota Twins': 'MIN', 'New York Mets': 'NYM', 'New York Yankees': 'NYY',
  'Philadelphia Phillies': 'PHI', 'Pittsburgh Pirates': 'PIT', 'San Diego Padres': 'SD', 'San Francisco Giants': 'SF',
  'Seattle Mariners': 'SEA', 'St. Louis Cardinals': 'STL', 'Tampa Bay Rays': 'TB', 'Texas Rangers': 'TEX',
  'Toronto Blue Jays': 'TOR', 'Washington Nationals': 'WSH',
};

// --- live league sync (real ESPN fantasy league via the Sports-Hub backend) ---
// Invert MLB_ABBR so the backend's proTeam codes (e.g. "LAD") map to the full
// team names the stat pipeline expects (e.g. "Los Angeles Dodgers").
const MLB_ABBR2FULL = Object.fromEntries(Object.entries(MLB_ABBR).map(([full, ab]) => [ab.toUpperCase(), full]));
const proTeamToFull = (ab) => MLB_ABBR2FULL[(ab || '').toUpperCase()] || '';

// Which sports have a real league wired up on the backend (from /api/health).
async function leagueConfig() {
  if (fanState.cfg) return fanState.cfg;
  try { fanState.cfg = (await fetchJSON(`${FANTASY_API}/api/health`, 300000)).configured || {}; }
  catch (_) { fanState.cfg = {}; }
  return fanState.cfg;
}

// Pull the real roster (+ this week's matchup) and overwrite the saved roster.
// Returns true if a real roster was loaded. Teams left blank fall through to
// the existing name-based autoResolveTeams backfill.
async function syncFromLeague(sport) {
  try {
    const data = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/roster`, 60000);
    const roster = (data.roster || []).map((p) => ({
      name: p.name,
      slot: p.lineupSlot || p.pos || 'BE',
      pos: p.pos || '',
      status: p.status || 'active',
      team: sport === 'baseball' ? proTeamToFull(p.proTeam) : '',
    }));
    if (!roster.length) return false;
    saveRoster(sport, roster);
    let matchup = null, standings = null, freeAgents = null, opponent = null;
    try { matchup = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/matchup`, 60000); } catch (_) {}
    try { standings = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/standings`, 60000); } catch (_) {}
    try { freeAgents = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/freeagents?size=40`, 300000); } catch (_) {}
    try { opponent = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/opponent`, 60000); } catch (_) {}
    fanState.league = fanState.league || {};
    fanState.league[sport] = { team: data.team, record: data.record, matchup, standings, freeAgents, opponent };
    return true;
  } catch (_) { return false; }
}

// Header card above the roster: team name, record, live matchup, resync button.
function renderLeagueHeader(sport) {
  const box = $('#fantasy-league');
  if (!box) return;
  const L = (fanState.league || {})[sport];
  if (!L) { box.innerHTML = ''; return; }
  const r = L.record || {};
  const rec = [r.wins, r.losses, r.ties].every((x) => x == null) ? ''
    : `${r.wins ?? 0}-${r.losses ?? 0}${r.ties ? '-' + r.ties : ''}`;
  box.innerHTML = `<div class="lg-card">
      <div class="lg-top"><span class="lg-name">${L.team || 'My Team'}</span>${rec ? `<span class="lg-rec">${rec}</span>` : ''}<span class="lg-live">● synced from ESPN</span></div>
      <button id="lg-resync" class="fan-btn ghost">↻ Resync</button>
    </div>`;
  const btn = $('#lg-resync');
  if (btn) btn.onclick = async () => { btn.textContent = '↻ Syncing…'; fanState.synced[sport] = false; await renderFantasy(); };
}

// Format a category value (ERA/WHIP → 2dp, rate stats → .XXX, counting → int).
function fmtCat(cat, v) {
  if (v == null || v === '') return '–';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  const c = (cat || '').toUpperCase();
  if (/ERA|WHIP/.test(c)) return n.toFixed(2);
  if (/AVG|OBP|SLG|OPS|PCT/.test(c)) return n.toFixed(3).replace(/^0(?=\.)/, '');
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Live category-by-category matchup scoreboard (H2H categories leagues).
function renderMatchup(sport) {
  const box = $('#fantasy-matchup');
  if (!box) return;
  const m = ((fanState.league || {})[sport] || {}).matchup;
  if (!m || !m.me || !m.categories || !m.categories.length) { box.innerHTML = ''; return; }
  const won = m.me.catsWon ?? 0, lost = m.opponent.catsWon ?? 0, tied = m.tied ?? 0;
  const cats = m.categories.map((c) => {
    const cls = c.result === 'WIN' ? 'win' : c.result === 'LOSS' ? 'loss' : 'tie';
    return `<div class="cat ${cls}"><div class="cat-name">${c.cat}</div>
      <div class="cat-vals"><b>${fmtCat(c.cat, c.me)}</b><span>${fmtCat(c.cat, c.opp)}</span></div></div>`;
  }).join('');
  box.innerHTML = `<div class="mu-card">
      <div class="mu-top">
        <span class="mu-team you">${m.me.team}</span>
        <span class="mu-score"><b class="${won > lost ? 'lead' : ''}">${won}</b> – <b class="${lost > won ? 'lead' : ''}">${lost}</b>${tied ? ` <small>(${tied} tied)</small>` : ''}</span>
        <span class="mu-team">${m.opponent.team}</span>
      </div>
      <div class="mu-cats">${cats}</div>
      <div class="mu-legend">This week · your value vs opponent · <span class="win">green = winning the category</span></div>
    </div>`;
}

// League standings / power rankings table (toggle between the two sorts).
function renderFantasyStandings(sport) {
  const box = $('#fantasy-standings');
  if (!box) return;
  const S = ((fanState.league || {})[sport] || {}).standings;
  if (!S || !S.teams || !S.teams.length) { box.innerHTML = ''; return; }
  const sortBy = fanState.standSort || 'standing';
  const teams = [...S.teams].sort((a, b) => sortBy === 'power'
    ? (b.powerScore || 0) - (a.powerScore || 0)
    : (a.standing || 99) - (b.standing || 99));
  const maxPow = Math.max(...teams.map((t) => t.powerScore || 0), 1);
  const rows = teams.map((t, i) => {
    const rec = `${t.wins ?? 0}-${t.losses ?? 0}${t.ties ? '-' + t.ties : ''}`;
    const l5 = (t.last5 || '').split('').map((c) => `<span class="f-${c.toLowerCase()}">${c}</span>`).join('');
    const barW = Math.round(100 * (t.powerScore || 0) / maxPow);
    return `<tr class="${t.isMe ? 'me' : ''}">
        <td class="st-rank">${i + 1}</td>
        <td class="st-team">${t.team}${t.isMe ? ' <span class="st-you">you</span>' : ''}</td>
        <td class="st-rec">${rec}</td>
        <td class="st-l5">${l5 || '—'}</td>
        <td class="st-pow"><span class="pow-bar" style="width:${barW}%"></span><span class="pow-num">${t.powerScore ?? '–'}</span></td>
      </tr>`;
  }).join('');
  box.innerHTML = `
    <h2 class="section-title" style="display:flex;align-items:center;gap:10px">League
      <span class="chips st-toggle" style="margin:0">
        <button class="chip ${sortBy === 'standing' ? 'active' : ''}" data-s="standing">Standings</button>
        <button class="chip ${sortBy === 'power' ? 'active' : ''}" data-s="power">Power</button>
      </span></h2>
    <table class="st-table"><thead><tr><th></th><th>Team</th><th>Rec</th><th>L5</th><th>Power</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  box.querySelectorAll('.st-toggle .chip').forEach((b) => {
    b.onclick = () => { fanState.standSort = b.dataset.s; renderFantasyStandings(sport); };
  });
}

// Run any player list through the same recent-form engine the roster uses;
// returns each player annotated with its hot/cold tag (baseball only).
async function computeRosterForm(players, fSport) {
  if (fSport !== 'baseball') return [];
  const sport = 'mlb';
  const idx = await baseballPlayerIndex().catch(() => ({}));
  players.forEach((p) => { p._team = p.team || idx[nameKey(p.name)] || ''; });
  const teams = [...new Set(players.map((p) => p._team).filter(Boolean))];
  const ids = await leagueTeamIds(sport).catch(() => ({}));
  const idMaps = {};
  await Promise.all(teams.map(async (t) => {
    const id = ids[t.toLowerCase()]; if (!id) return;
    idMaps[t] = await rosterIdMap(sport, id).catch(() => ({}));
  }));
  const out = [];
  await Promise.all(players.map(async (p) => {
    const aid = p._team ? (idMaps[p._team] || {})[nameKey(p.name)] : null;
    if (!aid) return;
    const hc = hotCold(fSport, await athleteGamelog(sport, aid).catch(() => null), p.isPitcher);
    if (hc) out.push({ ...p, team: p._team, hc });
  }));
  return out;
}

// Free agents trending HOT, most-owned (most relevant) first.
async function hotFreeAgents(players, fSport) {
  const form = await computeRosterForm(players, fSport);
  return form.filter((p) => p.hc.tag === 'hot').sort((a, b) => (b.owned ?? 0) - (a.owned ?? 0));
}

async function renderWaivers(sport) {
  const box = $('#fantasy-waivers');
  if (!box) return;
  const fa = ((fanState.league || {})[sport] || {}).freeAgents;
  if (sport !== 'baseball' || !fa || !fa.players || !fa.players.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<h2 class="section-title">Waiver Wire — Hot Pickups</h2><div class="none">Scanning available players for hot streaks…</div>';
  const hot = await hotFreeAgents(fa.players.slice(0, 35), sport);
  if (fanState.sport !== sport) return; // user switched away while scanning
  if (!hot.length) {
    box.innerHTML = '<h2 class="section-title">Waiver Wire — Hot Pickups</h2><div class="none">No available players are trending hot right now. Check back after the next slate.</div>';
    return;
  }
  const rows = hot.slice(0, 12).map((p) => {
    const abbr = MLB_ABBR[p.team] || '';
    const owned = p.owned != null && p.owned >= 0 ? `${Math.round(p.owned)}% owned` : '';
    return `<div class="wv-item">
        <div class="wv-main"><span class="wv-name">${p.name}</span>
          <span class="wv-meta">${p.pos}${abbr ? ' · ' + abbr : ''}${owned ? ' · ' + owned : ''}</span></div>
        <div class="wv-hot"><span class="hc-tag">🔥 ${p.hc.lead || 'Hot'}</span>
          <span class="hc-detail">${p.hc.detail || ''}</span></div>
      </div>`;
  }).join('');
  box.innerHTML = `<h2 class="section-title">Waiver Wire — Hot Pickups</h2>
    <div class="none" style="margin-bottom:8px">Available players in your league trending up over recent games — best add targets first.</div>
    <div class="wv-list">${rows}</div>`;
}

// Start/Sit suggestions from the roster's own hot/cold tags (called by
// fillSeasonStats once it has computed everyone's recent form).
function renderStartSit(entries) {
  const box = $('#fantasy-startsit');
  if (!box) return;
  const start = entries.filter((e) => e.status === 'bench' && e.tag === 'hot');
  const sit = entries.filter((e) => e.status === 'active' && e.tag === 'cold');
  if (!start.length && !sit.length) { box.innerHTML = ''; return; }
  const li = (arr) => arr.length
    ? arr.map((e) => `<li><b>${e.name}</b>${e.lead ? ` <span class="lead">${e.lead}</span>` : ''}</li>`).join('')
    : '<li class="none">None</li>';
  box.innerHTML = `<h2 class="section-title">Start / Sit</h2>
    <div class="ss-cols">
      <div><div class="ss-h start">⬆ Start — hot on your bench</div><ul>${li(start)}</ul></div>
      <div><div class="ss-h sit">⬇ Sit — cold in your lineup</div><ul>${li(sit)}</ul></div>
    </div>`;
}

// Opponent scouting: this week's opponent's active lineup, hot threats vs slumps.
async function renderOpponent(sport) {
  const box = $('#fantasy-opponent');
  if (!box) return;
  const O = ((fanState.league || {})[sport] || {}).opponent;
  if (sport !== 'baseball' || !O || !O.roster || !O.roster.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<h2 class="section-title">Opponent — ${O.opponent}</h2><div class="none">Scouting their lineup…</div>`;
  const active = O.roster.filter((p) => p.status === 'active');
  const form = await computeRosterForm(active, sport);
  if (fanState.sport !== sport) return;
  const hot = form.filter((p) => p.hc.tag === 'hot');
  const cold = form.filter((p) => p.hc.tag === 'cold');
  const li = (arr) => arr.length
    ? arr.map((p) => `<li><b>${p.name}</b>${p.hc.lead ? ` <span class="lead">${p.hc.lead}</span>` : ''}</li>`).join('')
    : '<li class="none">None</li>';
  box.innerHTML = `<h2 class="section-title">Opponent — ${O.opponent}</h2>
    <div class="none" style="margin-bottom:8px">Who you're up against this week (their active lineup).</div>
    <div class="ss-cols">
      <div><div class="ss-h sit">🔥 Their threats</div><ul>${li(hot)}</ul></div>
      <div><div class="ss-h start">🥶 Slumping — go at them</div><ul>${li(cold)}</ul></div>
    </div>`;
}

let MLB_INDEX = null;
async function baseballPlayerIndex() {
  if (MLB_INDEX) return MLB_INDEX;
  try { const c = JSON.parse(localStorage.getItem('sportshub:mlbidx') || 'null'); if (c && Date.now() - c.t < 86400000 && c.m) { MLB_INDEX = c.m; return MLB_INDEX; } } catch (_) {}
  const idx = {};
  await Promise.all(Object.entries(MLB_ABBR).map(async ([name, abbr]) => {
    const data = await fetchJSON(`${SITE}/baseball/mlb/teams/${abbr}/roster`, 24 * 3600000).catch(() => null);
    (data?.athletes || []).forEach((grp) => (grp.items || grp.athletes || [grp]).forEach((a) => {
      const nm = a?.displayName || a?.fullName; if (nm) { const k = nameKey(nm); if (!idx[k]) idx[k] = name; }
    }));
  }));
  MLB_INDEX = idx;
  try { localStorage.setItem('sportshub:mlbidx', JSON.stringify({ t: Date.now(), m: idx })); } catch (_) {}
  return idx;
}
async function autoResolveTeams(roster) {
  const idx = await baseballPlayerIndex();
  let changed = false;
  roster.forEach((p) => { if (!p.team) { const t = idx[nameKey(p.name)]; if (t) { p.team = t; changed = true; } } });
  if (changed) saveRoster('baseball', roster);
  return changed;
}
// Season stats from the team-leaders feed (the proven path that already
// powers Top Hitters) -> nameKey -> { ABBR: value }. Covers players who
// appear in their team's leader lists (stars/regulars).
const STAT_CATS = {
  mlb: { AVG: /batting average|^avg$/i, HR: /home runs|^hr$|homeruns/i, RBI: /\brbi\b|runs batted/i, OPS: /ops/i, ERA: /earned run average|^era$/i, WHIP: /whip|walks.*hits/i, W: /^wins$|^w$/i, K: /strikeouts|^so$|^k$/i },
  nfl: { PYDS: /passing yards/i, PTD: /passing touchdowns/i, INT: /interceptions/i, RYDS: /rushing yards/i, RTD: /rushing touchdowns/i, REC: /receptions/i, RECYDS: /receiving yards/i, RECTD: /receiving touchdowns/i },
};
async function teamSeasonMap(sport, teamId) {
  const y = new Date().getFullYear();
  const core = sport === 'mlb' ? BBCORE : FBCORE;
  const path = LEAGUES[sport].espnPath;
  const [lead, roster] = await Promise.all([
    safeJSON(`${core}/seasons/${y}/types/2/teams/${teamId}/leaders`, 6 * 3600000),
    safeJSON(`${SITE}/${path}/teams/${teamId}/roster`, 12 * 3600000),
  ]);
  const idName = {};
  (roster?.athletes || []).forEach((grp) => (grp.items || grp.athletes || [grp]).forEach((a) => { if (a?.id) idName[a.id] = nameKey(a.displayName || a.fullName); }));
  const cats = lead?.categories || [];
  const stat = {};
  Object.entries(STAT_CATS[sport] || {}).forEach(([abbr, re]) => {
    const c = cats.find((c) => [c.abbreviation, c.name, c.displayName].some((v) => v && re.test(v)));
    (c?.leaders || []).forEach((L) => { const k = idName[refId(L.athlete?.$ref)]; if (k) (stat[k] = stat[k] || {})[abbr] = L.displayValue ?? L.value; });
  });
  return stat;
}
function seasonLine(fSport, player, s) {
  if (!s) return '';
  const bits = [];
  if (fSport === 'baseball') {
    if (isPitcher(player)) { if (s.W != null) bits.push(`${s.W} W`); if (s.ERA != null) bits.push(`${s.ERA} ERA`); if (s.WHIP != null) bits.push(`${s.WHIP} WHIP`); if (s.K != null) bits.push(`${s.K} K`); }
    else { if (s.AVG != null) bits.push(`${s.AVG} AVG`); if (s.HR != null) bits.push(`${s.HR} HR`); if (s.RBI != null) bits.push(`${s.RBI} RBI`); if (s.OPS != null) bits.push(`${s.OPS} OPS`); }
  } else {
    const pos = (player.pos || player.slot || '').toUpperCase();
    if (/QB/.test(pos)) { if (s.PYDS != null) bits.push(`${s.PYDS} yds`); if (s.PTD != null) bits.push(`${s.PTD} TD`); if (s.INT != null) bits.push(`${s.INT} INT`); }
    else if (/RB|HB|FB/.test(pos)) { if (s.RYDS != null) bits.push(`${s.RYDS} rush`); if (s.RTD != null) bits.push(`${s.RTD} TD`); }
    else if (/WR|TE/.test(pos)) { if (s.REC != null) bits.push(`${s.REC} rec`); if (s.RECYDS != null) bits.push(`${s.RECYDS} yds`); if (s.RECTD != null) bits.push(`${s.RECTD} TD`); }
  }
  return bits.join(' · ');
}
// nameKey -> athlete id, from a team roster.
async function rosterIdMap(sport, teamId) {
  const path = LEAGUES[sport].espnPath;
  const data = await fetchJSON(`${SITE}/${path}/teams/${teamId}/roster`, 12 * 3600000).catch(() => null);
  const map = {};
  (data?.athletes || []).forEach((grp) => (grp.items || grp.athletes || [grp]).forEach((a) => {
    if (a?.id && (a.displayName || a.fullName)) map[nameKey(a.displayName || a.fullName)] = a.id;
  }));
  return map;
}
// Game-by-game log for an athlete (recent-form source).
async function athleteGamelog(sport, athleteId) {
  const path = LEAGUES[sport].espnPath;
  const data = await fetchJSON(`https://site.web.api.espn.com/apis/common/v3/sports/${path}/athletes/${athleteId}/gamelog`, 3 * 3600000).catch(() => null);
  if (!data) return null;
  const names = (data.names || data.labels || []).map((n) => (n || '').toLowerCase());
  const meta = data.events || {};
  const games = [];
  (data.seasonTypes || []).forEach((stp) => (stp.categories || []).forEach((cat) => (cat.events || []).forEach((e) => {
    const id = e.eventId || e.id; const m = meta[id] || {};
    const d = m.gameDate || m.date;
    const dict = {}; (e.stats || []).forEach((v, i) => { if (names[i]) dict[names[i]] = v; });
    games.push({ date: d ? new Date(d) : null, dict });
  })));
  return games;
}
const numv = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const ipToOuts = (v) => { const f = numv(v); const w = Math.floor(f); return w * 3 + Math.round((f - w) * 10); };
// pull a stat from a (lowercased-key) game dict by trying several names
const gv = (d, ...keys) => { for (const k of keys) if (d[k] != null && d[k] !== '') return numv(d[k]); return 0; };
const gvRaw = (d, ...keys) => { for (const k of keys) if (d[k] != null && d[k] !== '') return d[k]; return 0; };
// Recent-form trend + a game-log-computed season line (works for everyone,
// not just team leaders). Hitters: last 20 days. Pitchers: last 5 outings.
function hotCold(fSport, games, pitcher) {
  if (!games || games.length < 2) return null;
  const dated = games.filter((g) => g.date && !isNaN(g.date));
  const now = Date.now(), day = 86400000;
  const within = (d) => dated.filter((g) => now - g.date.getTime() <= d * day);
  const desc = [...dated].sort((a, b) => b.date - a.date);
  const lastN = (n) => desc.slice(0, n);
  if (fSport === 'baseball') {
    if (pitcher) {
      const agg = (gs) => {
        let er = 0, o = 0, bb = 0, h = 0, k = 0;
        gs.forEach((g) => {
          const d = g.dict;
          er += gv(d, 'earnedruns', 'er');
          o += ipToOuts(gvRaw(d, 'inningspitched', 'ip', 'innings'));
          bb += gv(d, 'walks', 'bb', 'baseonballs');
          h += gv(d, 'hits', 'h');
          k += gv(d, 'strikeouts', 'k', 'so');
        });
        return o ? { era: (er * 27) / o, whip: ((bb + h) * 3) / o, o, k, g: gs.length, ip: (o / 3).toFixed(1) } : null;
      };
      const s = agg(games), w = agg(lastN(5));
      if (!s) return null;
      const e = (x) => (x ? x.era.toFixed(2) : '–'), wh = (x) => (x ? x.whip.toFixed(2) : '–');
      let tag = '';
      if (w && w.o >= 9) { const eImp = s.era - w.era, whImp = s.whip - w.whip; tag = (eImp >= 0.75 || whImp >= 0.15) ? 'hot' : (eImp <= -0.75 || whImp <= -0.15) ? 'cold' : ''; }
      const detail = [
        `Last 5 outings: ${e(w)} ERA · ${wh(w)} WHIP${w ? ` · ${w.k} K in ${w.ip} IP` : ''}`,
        `Season: ${e(s)} ERA · ${wh(s)} WHIP · ${s.k} K in ${s.ip} IP`,
      ].join('<br>');
      const lead = w ? `${e(w)} ERA · ${wh(w)} WHIP (L5)` : '';
      const season = `${e(s)} ERA · ${wh(s)} WHIP · ${s.k} K`;
      return { tag, detail, lead, season };
    }
    // hitters by OPS
    const agg = (gs) => {
      let h = 0, ab = 0, d = 0, t = 0, hr = 0, bb = 0, hbp = 0, sf = 0, rbi = 0;
      gs.forEach((g) => {
        const x = g.dict;
        h += gv(x, 'hits', 'h'); ab += gv(x, 'atbats', 'ab');
        d += gv(x, 'doubles', '2b'); t += gv(x, 'triples', '3b'); hr += gv(x, 'homeruns', 'hr');
        bb += gv(x, 'walks', 'bb'); hbp += gv(x, 'hitbypitch', 'hbp'); sf += gv(x, 'sacrificeflies', 'sacflies', 'sf');
        rbi += gv(x, 'rbis', 'rbi', 'runsbattedin');
      });
      if (!ab) return null;
      const tb = h + d + 2 * t + 3 * hr;
      return { ops: (h + bb + hbp) / ((ab + bb + hbp + sf) || ab) + tb / ab, avg: h / ab, hr, rbi, h, ab, g: gs.length };
    };
    const s = agg(games), w = agg(within(20));
    if (!s) return null;
    const o = (x) => (x ? ops3(x.ops) : '–'), a = (x) => (x ? ops3(x.avg) : '–');
    let tag = '';
    if (w && w.ab >= 20) { const diff = w.ops - s.ops; tag = diff >= 0.060 ? 'hot' : diff <= -0.060 ? 'cold' : ''; }
    const detail = [
      `Last 20d: ${o(w)} OPS · ${a(w)} AVG${w ? ` · ${w.hr} HR · ${w.rbi} RBI (${w.h}-${w.ab}, ${w.g}g)` : ''}`,
      `Season: ${o(s)} OPS · ${a(s)} AVG · ${s.hr} HR · ${s.rbi} RBI`,
    ].join('<br>');
    const lead = w ? `${o(w)} OPS (20d)` : '';
    const season = `${o(s)} OPS · ${a(s)} AVG · ${s.hr} HR · ${s.rbi} RBI`;
    return { tag, detail, lead, season };
  }
  return null; // football trends added when the season has data
}

async function fillSeasonStats(roster, fSport) {
  const sport = fSport === 'baseball' ? 'mlb' : 'nfl';
  // Resolve team IDs: start from the teams endpoint, then override with the
  // live scoreboard IDs (the source that's proven to work in-browser).
  const ids = await leagueTeamIds(sport).catch(() => ({}));
  Object.entries(fanState.gamesByTeam || {}).forEach(([name, pg]) => {
    const id = pg.side === 'home' ? pg.g.home.id : pg.g.away.id;
    if (id) ids[name.toLowerCase()] = id;
  });
  const teams = [...new Set(roster.filter((p) => p.team).map((p) => p.team))];
  const sMaps = {}, idMaps = {};
  await Promise.all(teams.map(async (t) => {
    const id = ids[t.toLowerCase()]; if (!id) return;
    [sMaps[t], idMaps[t]] = await Promise.all([teamSeasonMap(sport, id).catch(() => ({})), rosterIdMap(sport, id).catch(() => ({}))]);
  }));

  const hot = [], cold = [], ss = [];
  await Promise.all(roster.map(async (p, i) => {
    const seasEl = document.getElementById(`fseas-${i}`);
    const trendEl = document.getElementById(`ftrend-${i}`);
    const arrowEl = document.getElementById(`farrow-${i}`);
    const leadEl = document.getElementById(`flead-${i}`);
    if (!seasEl) return;
    if (!p.team) { seasEl.textContent = 'set a team to load stats'; return; }
    let season = seasonLine(fSport, p, (sMaps[p.team] || {})[nameKey(p.name)]);
    const aid = (idMaps[p.team] || {})[nameKey(p.name)];
    if (aid) {
      const hc = hotCold(fSport, await athleteGamelog(sport, aid).catch(() => null), isPitcher(p));
      if (hc) {
        if (!season && hc.season) season = hc.season; // gamelog fallback for non-leaders
        if (trendEl) trendEl.innerHTML = `<div class="hc ${hc.tag}"><span class="hc-tag">${hc.tag === 'hot' ? '🔥 Hot' : hc.tag === 'cold' ? '🥶 Cold' : '📊 Steady'}</span><span class="hc-detail">${hc.detail}</span></div>`;
        if (arrowEl) { arrowEl.textContent = hc.tag === 'hot' ? '▲' : hc.tag === 'cold' ? '▼' : '▬'; arrowEl.className = `arrow ${hc.tag || 'flat'}`; }
        if (leadEl) leadEl.textContent = hc.lead || '';
        if (hc.tag === 'hot') hot.push({ name: p.name, lead: hc.lead });
        else if (hc.tag === 'cold' && p.status !== 'il') cold.push({ name: p.name, lead: hc.lead });
        ss.push({ name: p.name, status: p.status, tag: hc.tag, lead: hc.lead });
      }
    }
    seasEl.innerHTML = season ? `<b>Season:</b> ${season}` : 'season stats unavailable';
  }));

  // snapshot cards
  const card = (val, lbl, cls) => `<div class="fan-card ${cls || ''}"><div class="big">${val}</div><div class="lbl">${lbl}</div></div>`;
  const ilCount = roster.filter((p) => p.status === 'il').length;
  const needTeam = roster.filter((p) => !p.team).length;
  $('#fantasy-analytics').innerHTML =
    card(hot.length, 'Hot 🔥', hot.length ? 'good' : '') +
    card(cold.length, 'Cold 🥶', cold.length ? 'warn' : '') +
    card(ilCount, 'On IL') +
    (needTeam ? card(needTeam, 'Need team set', 'warn') : '');

  // hot & cold lists (drop watch)
  const li = (arr) => arr.length ? arr.map((x) => `<li><b>${x.name}</b>${x.lead ? ` <span class="lead">${x.lead}</span>` : ''}</li>`).join('') : '<li class="none">None</li>';
  $('#fantasy-recs').innerHTML = `<h3>Hot & Cold (last 20 days)</h3>
    <div class="hc-cols">
      <div><div class="hc-h hot">🔥 Heating up</div><ul>${li(hot)}</ul></div>
      <div><div class="hc-h cold">🥶 Cooling off — drop watch</div><ul>${li(cold)}</ul></div>
    </div>
    <div class="none" style="margin-top:6px">Trends compare the last 20 days to season; only players with enough recent games show a tag.</div>`;

  renderStartSit(ss);
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

// Turn a container's headers into tap-to-expand accordion sections.
// Headers with class "acc-open" start expanded (in addition to first openCount).
function makeAccordion(container, headerSel, openCount = 0) {
  if (!container) return;
  [...container.querySelectorAll(headerSel)].forEach((h, idx) => {
    const content = []; let n = h.nextElementSibling;
    while (n && !n.matches(headerSel)) { content.push(n); n = n.nextElementSibling; }
    h.classList.add('acc-h');
    if (!h.querySelector('.sec-chev')) h.insertAdjacentHTML('beforeend', '<span class="sec-chev">▸</span>');
    const set = (o) => { h.classList.toggle('open', o); content.forEach((c) => { c.style.display = o ? '' : 'none'; }); };
    set(idx < openCount || h.classList.contains('acc-open'));
    h.onclick = () => set(!h.classList.contains('open'));
    h._accSet = set;
  });
}

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

  // news — tap a headline for an in-app summary instead of leaving the app
  const articles = newsR.status === 'fulfilled' ? (newsR.value.articles || []) : [];
  const newsEl = $('#eagles-news');
  if (!articles.length) {
    newsEl.innerHTML = '<div class="empty">No recent Eagles news right now — check back as camp opens.</div>';
  } else {
    newsEl.innerHTML = articles.slice(0, 12).map((a, idx) => {
      const img = a.images?.[0]?.url;
      const when = a.published ? new Date(a.published).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
      return `<div class="news-item" data-news="${idx}">
        ${img ? `<img src="${img}" alt="" onerror="this.style.display='none'">` : ''}
        <div><div class="nh">${a.headline || ''}</div><div class="nd">${a.description || ''}</div><div class="nt">${when} · tap for summary</div></div></div>`;
    }).join('');
    newsEl.querySelectorAll('.news-item').forEach((it) => { it.onclick = () => openNewsSummary(articles[+it.dataset.news]); });
  }

  // quick-jump nav widgets (all visible — they wrap to multiple rows)
  const navItems = [['sec-nextopp', 'Next Opp'], ['sec-news', 'News'], ['sec-stats', 'Stats'], ['sec-schedule', 'Schedule'], ['sec-depth', 'Depth'], ['sec-leaders', 'Leaders'], ['sec-numbers', 'Numbers'], ['sec-staff', 'Staff']];
  const navEl = $('#eagles-nav');
  navEl.innerHTML = navItems.map(([t, l]) => `<button class="chip" data-target="${t}">${l}</button>`).join('');
  navEl.querySelectorAll('button').forEach((b) =>
    (b.onclick = () => { const t = document.getElementById(b.dataset.target); if (t?._accSet) t._accSet(true); t?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));

  // collapsible sections (scannable; tap a header to expand)
  makeAccordion(document.getElementById('eagles'), '.section-title', 2);

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
  if (!panel || name === 'eagles' || name === 'home') return;
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

// fold any finished picks from earlier days into the running model record
gradePending();

// Auto-update: register the network-first service worker so new versions load
// on their own (including the home-screen app) — no manual cache-busting.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.update();
      setInterval(() => reg.update(), 30 * 60 * 1000); // re-check every 30 min
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
    }).catch(() => {});
  });
}

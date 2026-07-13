// Sports-Hub — pure browser app. Live data comes straight from ESPN's free
// public sports feed (no key, no server). Edit LEAGUES below to make it yours.

const APP_VERSION = 'v111';

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

const state = { golfSport: 'golf', liveOK: true };

// --- tiny utils -----------------------------------------------------------
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
// Escape text before interpolating it into innerHTML. Names, headlines and
// descriptions come from ESPN/your fantasy league and can contain &, <, ", '
// (e.g. "A&M", "Ke'Bryan Hayes") — keep them from breaking the markup.
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
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
    winner: c?.winner === true,      // ESPN's result flag (covers shootout wins)
    probables: c?.probables || null, // MLB probable starters
    leaders: c?.leaders || null,     // NFL/NBA team leaders
  };
}
// TV listing off the scoreboard event — geoBroadcasts (national/local networks)
// first, falling back to the older broadcasts[].names shape. De-duped, in order.
function tvFor(comp) {
  const names = [];
  (comp.geoBroadcasts || []).forEach((b) => { const n = b.media?.shortName || b.media?.callLetters; if (n) names.push(n); });
  if (!names.length) (comp.broadcasts || []).forEach((b) => (b.names || []).forEach((n) => n && names.push(n)));
  return [...new Set(names)].join(', ');
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
    tv: tvFor(comp),
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
  const games = (json.events || []).map(normEvent);
  if (dateStr === ymd(sportsDate())) trackLines(sport, games); // today only
  return games;
}

// Device-local line tracking: remember the first line this device saw for each
// game today (opener proxy) + the latest, so the Game Report can show movement
// even when the backend tracker is unreachable. One key per sports-day.
function trackLines(sport, games) {
  try {
    const key = `sportshub:lines:${ymd(sportsDate())}`;
    const all = JSON.parse(localStorage.getItem(key) || '{}');
    let changed = false;
    games.forEach((g) => {
      const info = normOdds(g.odds, g.home.name, g.away.name);
      if (!info) return;
      const snap = { t: Date.now(), hML: info.hML ?? null, aML: info.aML ?? null, ou: info.ou ?? null, details: info.details ?? null };
      const k = `${sport}:${g.id}`;
      if (!all[k]) { all[k] = { first: snap }; changed = true; return; }
      const last = all[k].last || all[k].first;
      if (['hML', 'aML', 'ou', 'details'].some((f) => last[f] !== snap[f])) { all[k].last = snap; changed = true; }
    });
    if (changed) {
      localStorage.setItem(key, JSON.stringify(all));
      Object.keys(localStorage).forEach((k) => { if (k.startsWith('sportshub:lines:') && k !== key) localStorage.removeItem(k); });
    }
  } catch (_) {}
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
// Scan order within a league: live first, then upcoming, then finished last.
const STATE_ORDER = { live: 0, scheduled: 1, final: 2 };
const byStatus = (s) => (a, b) => {
  const d = STATE_ORDER[gameState(a)] - STATE_ORDER[gameState(b)];
  return d || ((isFav(s, b) ? 1 : 0) - (isFav(s, a) ? 1 : 0));
};
function winnerName(g) {
  if (gameState(g) !== 'final') return null;
  // ESPN's winner flag first — it's the only truth when the score ends level
  // but someone still advanced (World Cup knockouts decided on penalties).
  if (g.home.winner && !g.away.winner) return g.home.name;
  if (g.away.winner && !g.home.winner) return g.away.name;
  if (g.home.score == null || g.away.score == null) return null;
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
  if (team.logo) return `<img class="logo" src="${esc(team.logo)}" alt="" onerror="this.style.display='none'"/>`;
  const initials = (team.abbr || (team.name || '?').split(' ').pop()).slice(0, 3).toUpperCase();
  return `<span class="logo placeholder">${esc(initials)}</span>`;
}

// interactive:false renders a view-only card (no tap-to-open) that shows the
// TV channel instead of the "tap for live stats" hint — used on the Home slate.
function gameCard(sport, g, opts = {}) {
  const interactive = opts.interactive !== false;
  const st = gameState(g);
  const cfg = LEAGUES[sport];
  const win = winnerName(g);
  const card = el('div', 'game-card' + (isFav(sport, g) ? ' fav' : '') + (interactive ? '' : ' no-tap'));
  const label = st === 'live' ? (g.statusText || 'LIVE') : st === 'final' ? 'FINAL' : scheduledLabel(g);
  const cls = st === 'live' ? 'status live' : st === 'final' ? 'status final' : 'status';
  const row = (team) => {
    const w = win && win !== 'TIE' && win === team.name;
    const score = st === 'scheduled' ? '–' : (team.score != null ? team.score : '–');
    return `<div class="team-row ${w ? 'winner' : ''}">
      <span class="team">${logoHTML(team)}${esc(team.name || 'TBD')}</span>
      <span class="score">${score}</span></div>`;
  };
  const tapHint = interactive ? '<div class="tap-hint">tap for game report →</div>' : '';
  // opts.odds (Home slate): show the pregame betting line right on the card.
  // AI Picks cards skip it — they carry their own richer odds block.
  let oddsLine = '';
  if (opts.odds && st === 'scheduled') {
    const info = normOdds(g.odds, g.home.name, g.away.name);
    const ml = (v) => (Number(v) > 0 ? `+${v}` : `${v}`);
    let line = info?.details;
    if (!line && info && (info.hML != null || info.aML != null)) {
      line = [info.aML != null ? `${g.away.abbr || 'Away'} ${ml(info.aML)}` : '',
              info.hML != null ? `${g.home.abbr || 'Home'} ${ml(info.hML)}` : ''].filter(Boolean).join(' / ');
    }
    const bits = [line, info?.ou != null ? `O/U ${info.ou}` : ''].filter(Boolean).join(' · ');
    if (bits) oddsLine = `<div class="game-odds">📊 ${esc(bits)}</div>`;
  }
  card.innerHTML = `
    <div class="game-meta">
      <span class="game-league">${cfg.emoji} ${cfg.label}</span>
      <span class="${cls}">${label}</span>
    </div>${row(g.away)}${row(g.home)}
    ${g.tv ? `<div class="game-tv">📺 ${esc(g.tv)}</div>` : ''}${oddsLine}${tapHint}`;
  if (interactive && g.id) card.onclick = () => openGameDetail(sport, g.id, g);
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
const SUM_STOP = new Set(('a an the and or but nor so yet of to in on at for with by from as is are was were be been being it its this that these those he she they them his her their our your my we you i not no do does did has have had will would can could should may might must about into over after before under out up down off than then also just more most some any all one two he\'s they\'re it\'s').split(' '));
const sumWords = (s) => (s.toLowerCase().match(/[a-z0-9']+/g) || []).filter((w) => w.length > 2 && !SUM_STOP.has(w));
// Extractive summary: rank sentences by keyword weight (term frequency across
// the article + headline overlap, length-normalized, mild lead boost), take the
// top `max`, then restore original order so it reads as prose — not just the lede.
function summarize(text, max = 4, title = '') {
  const t = stripHTML(text);
  if (!t) return '';
  let sents = (t.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [t]).map((s) => s.trim()).filter((s) => s.length >= 40 && s.length <= 320);
  if (sents.length <= max) return sents.join(' ');
  const freq = {};
  sents.forEach((s) => sumWords(s).forEach((w) => { freq[w] = (freq[w] || 0) + 1; }));
  const maxF = Math.max(1, ...Object.values(freq));
  const titleWords = new Set(sumWords(title));
  const scored = sents.map((s, i) => {
    const ws = sumWords(s);
    if (!ws.length) return { i, s, score: 0 };
    let score = ws.reduce((a, w) => a + (freq[w] || 0) / maxF, 0) / Math.sqrt(ws.length);
    score *= 1 + 0.15 * ws.filter((w) => titleWords.has(w)).length; // reward on-topic sentences
    if (i === 0) score *= 1.25; else if (i === 1) score *= 1.1;     // the lede usually matters
    return { i, s, score };
  });
  return scored.slice().sort((a, b) => b.score - a.score).slice(0, max).sort((a, b) => a.i - b.i)
    .map((x) => x.s.replace(/^[\s\-–—:]+/, '')).join(' '); // drop leading dateline dashes
}
async function openNewsSummary(a, backFn) {
  if (!a) return;
  modal().classList.remove('hidden');
  const img = a.images?.[0]?.url;
  const when = a.published ? new Date(a.published).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const by = a.byline || '';
  const href = a.links?.web?.href || a.links?.mobile?.href || '#';
  $('#modal-body').innerHTML = `${backFn ? '<button class="md-back" id="md-back">‹ Back</button>' : ''}
    ${img ? `<img class="news-hero" src="${esc(img)}" onerror="this.style.display='none'">` : ''}
    <h2 class="news-title">${esc(a.headline || '')}</h2>
    <div class="news-by">${esc([by, when].filter(Boolean).join(' · '))}</div>
    <div class="md-section-title">Summary</div>
    <div class="news-summary" id="news-sum">${esc(a.description || 'Summarizing…')}</div>
    <a class="fan-btn" href="${esc(href)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:14px;text-decoration:none">Read full article ↗</a>
    <div class="ai-why" style="margin-top:8px;opacity:.7">Auto-condensed from the article text.</div>`;
  if (backFn) { const bb = document.getElementById('md-back'); if (bb) bb.onclick = backFn; }
  const apiHref = a.links?.api?.self?.href || a.links?.api?.news?.href;
  if (apiHref) {
    const d = await fetchJSON(apiHref.replace(/^http:/, 'https:'), 6 * 3600000).catch(() => null);
    const story = d?.story || d?.headlines?.[0]?.story || d?.content || (d?.articles && d.articles[0]?.story);
    const sum = summarize(story, 4, a.headline);
    const elx = document.getElementById('news-sum');
    if (sum && elx) elx.textContent = sum;
  }
}

async function openGameDetail(sport, id, g) {
  modal().classList.remove('hidden');
  $('#modal-body').innerHTML = '<div class="empty">Loading live stats…</div>';
  try {
    const path = LEAGUES[sport].espnPath;
    const [data, pred, hitters, report] = await Promise.all([
      fetchJSON(`${SITE}/${path}/summary?event=${id}`, 30000),
      g ? predictGame(sport, g).catch(() => null) : Promise.resolve(null),
      g && sport === 'mlb' ? Promise.all([topHitters(g.home.id), topHitters(g.away.id)]).catch(() => null) : Promise.resolve(null),
      g ? getBettingReport(sport) : Promise.resolve(null),
    ]);
    let reportHTML = '';
    if (g) {
      // Odds for the report: prefer the summary's pickcenter — the scoreboard
      // object often drops its odds once a game goes live, which blanked the
      // Book/Grade columns mid-game.
      const rawO = (data.pickcenter || []).find((x) => x.spread != null || x.details || x.homeTeamOdds) || (data.odds || [])[0] || g.odds;
      reportHTML = gameReportHTML(sport, g, pred, normOdds(rawO, g.home.name, g.away.name), report);
    }
    let extra = '';
    if (g && sport === 'mlb') {
      extra += startersHTML(g) + (hitters ? hittersHTML(g, hitters[0], hitters[1]) : '');
    } else if (g && sport === 'nfl') {
      extra += nflKeyHTML(g);
    }
    $('#modal-body').innerHTML = renderGameDetail(sport, data, pred, extra, g, reportHTML);
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
  const details = o.details ?? o.spread ?? null;
  // MLB scoreboards often carry NO raw moneylines — just the favorite string
  // ("SEA -231"). A 3+ digit number there is a moneyline (spreads are small),
  // so keep it as a fallback for implied-probability math.
  let dML = null;
  const dm = typeof details === 'string' ? details.match(/[+-]\d{3,4}\b/) : null;
  if (dm && Math.abs(Number(dm[0])) >= 100) dML = Number(dm[0]);
  const has = (details != null || o.overUnder != null || hML != null || aML != null);
  return has ? { details, ou: o.overUnder ?? o.total ?? null, hML, aML, dML,
    favHome: favName ? favName === homeName : null, favName, provider: o.provider?.name || null } : null;
}
const impliedP = (ml) => (typeof ml !== 'number' || !isFinite(ml) || ml === 0) ? null
  : (ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100));
// Market's implied win probability for the HOME side — de-vigged from the two
// moneylines when both exist, else from the favorite's ML in the details
// string (no de-vig possible there; close enough for gap sizing).
function marketHomeProb(info) {
  const h = impliedP(info?.hML), a = impliedP(info?.aML);
  if (h != null && a != null && h + a > 0) return h / (h + a);
  if (info?.dML != null && info?.favHome != null) {
    const p = impliedP(info.dML);
    if (p != null) return info.favHome ? p : 1 - p;
  }
  return null;
}
// Implied home prob from a single line snapshot (movement records) — raw ML
// first, else the favorite string matched to a side by abbreviation.
function snapHomeProb(snap, g) {
  if (snap?.hML != null) return impliedP(snap.hML);
  const m = typeof snap?.details === 'string' ? snap.details.match(/([A-Z]{2,4})\s*([+-]\d{3,4})\b/) : null;
  if (!m || Math.abs(Number(m[2])) < 100) return null;
  const p = impliedP(Number(m[2]));
  if (p == null) return null;
  if ((g.home.abbr || '').toUpperCase() === m[1]) return p;
  if ((g.away.abbr || '').toUpperCase() === m[1]) return 1 - p;
  return null;
}
// Model-vs-market gap in probability points on the MODEL'S pick side
// (+13 = model likes its pick 13 points more than the book does).
function marketGap(pred, info) {
  const mkt = marketHomeProb(info);
  if (!pred || mkt == null || pred.probHome == null) return null;
  const pickProb = pred.homePick ? pred.probHome : 1 - pred.probHome;
  const mktPick = pred.homePick ? mkt : 1 - mkt;
  return Math.round((pickProb - mktPick) * 100);
}
function marketCompare(pred, favName, info) {
  if (!pred || !favName) return '';
  if (pred.winner.name === favName) return `✅ Model agrees with the line (${favName})`;
  const mkt = marketHomeProb(info);
  let probs = '';
  if (mkt != null && pred.probHome != null) {
    const pickProb = Math.round((pred.homePick ? pred.probHome : 1 - pred.probHome) * 100);
    const mktPick = Math.round((pred.homePick ? mkt : 1 - mkt) * 100);
    probs = ` — model ${pickProb}%, market ${mktPick}%`;
  }
  return `⚡ Model sees value — likes ${pred.winner.name}, market favors ${favName}${probs}`;
}
// Fair American moneyline for a win probability (the model's "price").
const fairML = (p) => {
  if (p == null || !isFinite(p)) return null;
  const q = clamp(p, 0.02, 0.98);
  return q >= 0.5 ? -Math.round((100 * q) / (1 - q)) : Math.round((100 * (1 - q)) / q);
};
const fmtML = (v) => (v == null ? '—' : Number(v) > 0 ? `+${v}` : `${v}`);
// Price grade for a side: model prob − de-vigged market prob, in points.
// A = the book is offering a much better price than the model thinks is fair.
function priceGrade(gapPts) {
  const T = [[10, 'A'], [7, 'A-'], [5, 'B+'], [3, 'B'], [1.5, 'B-'], [0, 'C+'], [-1.5, 'C'], [-3, 'C-'], [-5, 'D']];
  for (const [min, l] of T) if (gapPts >= min) return l;
  return 'F';
}
const gradeHue = (letter) =>
  letter[0] === 'A' ? 'var(--accent)' : letter[0] === 'B' ? '#8fd14f'
  : letter[0] === 'C' ? 'var(--gold)' : letter[0] === 'D' ? '#ff9f43' : '#ff5a5a';

function oddsSectionHTML(info, awayAbbr, homeAbbr, pred) {
  if (!info) return '';
  const cmp = marketCompare(pred, info.favName, info);
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
      ${(batter || pitcher) ? `<div class="sit-mu">${pitcher ? `Pitching: <b>${esc(pitcher)}</b>` : ''}${pitcher && batter ? ' · ' : ''}${batter ? `At bat: <b>${esc(batter)}</b>` : ''}</div>` : ''}
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

function renderGameDetail(sport, data, pred, extra, g, report) {
  const comp = data.header?.competitions?.[0] || data.competitions?.[0] || {};
  const cs = comp.competitors || [];
  const home = cs.find((c) => c.homeAway === 'home') || cs[0] || {};
  const away = cs.find((c) => c.homeAway === 'away') || cs[1] || {};
  const teamCell = (c) => {
    const t = c.team || {};
    const logo = t.logos?.[0]?.href || t.logo;
    return `<div class="md-team">${logo ? `<img src="${esc(logo)}" alt=""/>` : ''}
      <div class="nm">${esc(t.shortDisplayName || t.displayName || t.abbreviation || 'TBD')}</div>
      <div class="sc">${c.score ?? '–'}</div></div>`;
  };
  const st = comp.status?.type || {};
  const live = st.state === 'in';
  // neutral-site World Cup games read "vs" rather than away @ home
  const neutral = sport === 'soccer' && !isWorldCupHost(home.team?.displayName || home.team?.name);
  const sep = neutral ? 'vs' : '@';
  let html = `<div class="md-head">${teamCell(away)}<div style="color:var(--muted);font-weight:700">${sep}</div>${teamCell(home)}</div>
    <div class="md-status ${live ? 'live' : ''}">${st.detail || st.shortDetail || ''}</div>`;

  // Order: 🔴 Live Situation on top when the game is live (most timely), then
  // Betting Odds, then the Game Report, then the model's read + box-score detail.
  if (live) html += liveSituationHTML(sport, data, comp, g);

  const rawO = (data.pickcenter || []).find((x) => x.spread != null || x.details || x.homeTeamOdds) || (data.odds || [])[0] || g?.odds;
  const oddsInfo = normOdds(rawO, home.team?.displayName, away.team?.displayName);
  html += oddsSectionHTML(oddsInfo, away.team?.abbreviation, home.team?.abbreviation, pred);
  html += report || '';

  html += aiPickHead(pred);
  html += aiFactors(pred);
  html += extra || '';

  // line score (innings / quarters)
  const aLine = away.linescores || [], hLine = home.linescores || [];
  if (aLine.length || hLine.length) {
    const n = Math.max(aLine.length, hLine.length);
    const cols = Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('');
    const cell = (arr, i) => `<td>${arr[i]?.displayValue ?? arr[i]?.value ?? ''}</td>`;
    const rowFor = (c, arr) => `<tr><td>${esc(c.team?.abbreviation || c.team?.shortDisplayName || '')}</td>${Array.from({ length: n }, (_, i) => cell(arr, i)).join('')}<td><b>${c.score ?? ''}</b></td></tr>`;
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
    html += `<div class="featured-game"><div><strong>${esc(fg.away.name)}</strong> ${fg.away.score ?? ''} @ <strong>${esc(fg.home.name)}</strong> ${fg.home.score ?? ''}</div>
      <span class="status ${s === 'live' ? 'live' : s === 'final' ? 'final' : ''}">${lbl}</span></div>`;
  } else {
    html += `<div class="muted">No game today. See the full slate below.</div>`;
  }
  html += '</div>';
  $('#featured').innerHTML = html;
  renderHomeByLeague($('#home-games'), games);
  renderHomeHeadline();
  renderWCBracket();
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
    arts.slice(1, 6).forEach((a) => more.push({ sport: sports[i], a }));
  });
  leads.sort(newest); more.sort(newest);
  const picks = [], seen = new Set();
  for (const p of [...leads, ...more]) {
    const k = (p.a.headline || '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k); picks.push(p);
    if (picks.length >= 10) break;
  }
  if (!picks.length) { box.innerHTML = ''; return; }

  const row = el('div', 'headline-row');
  picks.forEach(({ sport, a }, idx) => {
    const cfg = LEAGUES[sport];
    const img = a.images?.[0]?.url;
    const when = a.published ? timeAgo(a.published) : '';
    const card = el('div', 'hl-card');
    card.innerHTML = `
      <div class="hl-img" style="${img ? `background-image:url('${esc(img)}')` : ''}"><span class="hl-num">${idx + 1}</span></div>
      <div class="hl-body">
        <div class="hl-eyebrow">${cfg.emoji} ${cfg.label}${when ? ` · ${when}` : ''}</div>
        <div class="hl-title">${esc(a.headline || '')}</div>
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
  const addChip = (id, label, live) => {
    const b = el('button', 'chip' + (live ? ' chip-live' : ''), (live ? '🔴 ' : '') + label);
    b.onclick = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nav.appendChild(b);
  };
  const addSection = (id, label, cards, live) => {
    addChip(id, label, live);
    const head = el('h3', 'games-league-head'); head.id = id;
    head.innerHTML = (live ? '<span class="live-dot"></span>' : '') + label;
    container.appendChild(head);
    const grid = el('div', 'games-grid');
    cards.forEach((c) => grid.appendChild(c));
    container.appendChild(grid);
  };

  const teamSports = sortedSports({ teamOnly: true });

  // Grouped by league (in-season first). Within each league the slate is sorted
  // live → finished → unstarted, so tapping a league chip lands you on the live
  // games up top. Leagues with a live game get a 🔴 flag on their chip/heading.
  const sportsWithGames = teamSports.filter((s) => (games[s] || []).length);
  sportsWithGames.forEach((s) => {
    const list = [...(games[s] || [])].sort(byStatus(s));
    const hasLive = list.some((g) => gameState(g) === 'live');
    // Tappable cards (v89): scores/time/TV/line at a glance, tap → the game
    // modal, which leads with the 📊 Game Report.
    const cards = list.map((g) => gameCard(s, g, { odds: true }));
    addSection(`home-${s}`, `${LEAGUES[s].emoji} ${LEAGUES[s].label}`, cards, hasLive);
  });
  if (!sportsWithGames.length) container.appendChild(el('div', 'empty', 'No games today for your sports.'));

  // golf as its own section (it's a leaderboard, not team games)
  if (SEASON_MONTHS.golf.includes(new Date().getMonth())) addGolfHomeSection(addSection);
}

async function addGolfHomeSection(addSection) {
  const ev = await getGolfEvent();
  if (!ev) return;
  const players = ev.competitions?.[0]?.competitors || [];
  const status = ev.status?.type?.shortDetail || '';
  // View-only: a compact top-5 leaderboard right on the card, no tap.
  const top = players.slice(0, 5).map((c) => {
    const pos = c.status?.position?.displayName || c.order || '';
    const name = c.athlete?.displayName || 'TBD';
    const toPar = c.score?.displayValue ?? c.score ?? '';
    const fav = (LEAGUES.golf.fav || []).some((f) => f.toLowerCase() === name.toLowerCase());
    return `<div class="golf-line${fav ? ' fav' : ''}"><span>${esc(pos)} ${esc(name)}</span><span class="score">${esc(toPar)}</span></div>`;
  }).join('');
  const card = el('div', 'game-card no-tap');
  card.innerHTML = `<div class="game-meta"><span class="game-league">⛳ Golf</span><span class="status">${esc(status)}</span></div>
    <div style="font-weight:700;margin:4px 0">${esc(ev.name || 'PGA Tour')}</div>
    ${top || '<div class="muted">Leaderboard unavailable.</div>'}`;
  addSection('home-golf', '⛳ Golf', [card]);
}

// --- WORLD CUP KNOCKOUT BRACKET (Home) -------------------------------------
// One ranged scoreboard call covers the whole knockout window, then games are
// bucketed into rounds — by ESPN's round note when present, else by date
// (the 2026 knockout schedule below). Rounds with games still TBD get dashed
// placeholder slots so the full bracket shape is always visible.
const WC_ROUNDS = [
  { key: 'r32',   label: 'Round of 32',   from: '20260628', to: '20260703', size: 16, when: 'Jun 28 – Jul 3' },
  { key: 'r16',   label: 'Round of 16',   from: '20260704', to: '20260707', size: 8,  when: 'Jul 4–7' },
  { key: 'qf',    label: 'Quarterfinals', from: '20260708', to: '20260712', size: 4,  when: 'Jul 9–11' },
  { key: 'sf',    label: 'Semifinals',    from: '20260713', to: '20260716', size: 2,  when: 'Jul 14–15' },
  { key: 'third', label: 'Third Place',   from: '20260717', to: '20260718', size: 1,  when: 'Jul 18' },
  { key: 'final', label: 'Final',         from: '20260719', to: '20260720', size: 1,  when: 'Jul 19' },
];
const etYmd = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/-/g, '');
};
function wcRoundOf(ev) {
  // Prefer ESPN's own round label (scoreboard notes / headline) when it's there.
  const note = `${(ev.competitions?.[0]?.notes || []).map((n) => n.headline || '').join(' ')} ${ev.season?.slug || ''}`.toLowerCase();
  if (/round of 32/.test(note)) return 'r32';
  if (/round of 16/.test(note)) return 'r16';
  if (/quarter/.test(note)) return 'qf';
  if (/semi/.test(note)) return 'sf';
  if (/third/.test(note)) return 'third';
  if (/\bfinal\b/.test(note)) return 'final';
  const d = etYmd(ev.date);
  const r = WC_ROUNDS.find((x) => d >= x.from && d <= x.to);
  return r ? r.key : null;
}
function wcTeamObj(c) {
  const t = c?.team || {};
  return {
    name: t.shortDisplayName || t.displayName || t.name || 'TBD',
    full: t.displayName || t.name || '',
    abbr: t.abbreviation || '',
    logo: t.logo || t.logos?.[0]?.href || null,
    score: c?.score != null && c.score !== '' ? Number(c.score) : null,
    pens: c?.shootoutScore != null && c.shootoutScore !== '' ? Number(c.shootoutScore) : null,
    winner: c?.winner === true,
  };
}
function wcMatchObj(ev) {
  const comp = ev.competitions?.[0] || {};
  const cs = comp.competitors || [];
  const st = ev.status?.type || comp.status?.type || {};
  return {
    date: ev.date,
    state: st.state, // 'pre' | 'in' | 'post'
    statusText: st.shortDetail || st.detail || st.description || '',
    home: wcTeamObj(cs.find((c) => c.homeAway === 'home') || cs[0]),
    away: wcTeamObj(cs.find((c) => c.homeAway === 'away') || cs[1]),
    tv: tvFor(comp),
  };
}
// Which side won a finished knockout game — ESPN's winner flag first, then
// score, then the penalty shootout.
function wcWinSide(m) {
  if (m.state !== 'post') return null;
  if (m.home.winner) return 'home';
  if (m.away.winner) return 'away';
  if (m.home.score == null || m.away.score == null) return null;
  if (m.home.score !== m.away.score) return m.home.score > m.away.score ? 'home' : 'away';
  if (m.home.pens != null && m.away.pens != null && m.home.pens !== m.away.pens) return m.home.pens > m.away.pens ? 'home' : 'away';
  return null;
}
function wcMatchHTML(m) {
  const live = m.state === 'in';
  const win = wcWinSide(m);
  const isFavT = (t) => favSet('soccer').includes((t.full || t.name || '').toLowerCase()) || favSet('soccer').includes((t.abbr || '').toLowerCase());
  const d = new Date(m.date);
  const pre = isNaN(d) ? '' : `${d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' })} · ${fmtTime(d)}`;
  const status = live ? (m.statusText || 'LIVE')
    : m.state === 'post' ? `FINAL${m.home.pens != null || m.away.pens != null ? ' · PENS' : ''}`
    : pre || scheduledLabel({ statusText: m.statusText, date: m.date });
  const row = (t, side) => {
    const w = win === side, out = win && !w;
    const score = m.state === 'pre' ? '' : `${t.score ?? '–'}${t.pens != null ? ` <span class="wc-pens">(${t.pens})</span>` : ''}`;
    return `<div class="wc-team ${w ? 'winner' : ''} ${out ? 'out' : ''}">${logoHTML(t)}<span class="wc-name" title="${esc(t.full)}">${esc(t.name)}</span><span class="wc-score">${score}</span></div>`;
  };
  return `<div class="wc-match ${live ? 'live' : ''} ${isFavT(m.home) || isFavT(m.away) ? 'fav' : ''}">
    <div class="wc-status"><span class="${live ? 'live' : ''}">${esc(status)}</span>${m.state === 'pre' && m.tv ? `<span>📺 ${esc(m.tv)}</span>` : ''}</div>
    ${row(m.away, 'away')}${row(m.home, 'home')}</div>`;
}
async function renderWCBracket() {
  const box = $('#home-wc');
  if (!box) return;
  box.innerHTML = '';
  if (LEAGUES.soccer.espnPath !== 'soccer/fifa.world') return;
  let events = [];
  try {
    const j = await fetchJSON(`${SITE}/${LEAGUES.soccer.espnPath}/scoreboard?dates=${WC_ROUNDS[0].from}-${WC_ROUNDS[WC_ROUNDS.length - 1].to}&limit=120`, 60000);
    events = j.events || [];
  } catch (_) { return; } // ESPN unreachable → just no bracket section
  const rounds = WC_ROUNDS.map((r) => ({ ...r, games: [] }));
  events.forEach((ev) => {
    const r = rounds.find((x) => x.key === wcRoundOf(ev));
    if (r) r.games.push(wcMatchObj(ev));
  });
  if (!rounds.some((r) => r.games.length)) return; // nothing knockout yet → hide
  rounds.forEach((r) => r.games.sort((a, b) => new Date(a.date) - new Date(b.date)));

  // "Current" round = the first one that isn't fully finished; scroll to it.
  const current = rounds.find((r) => r.games.length < r.size || r.games.some((g) => g.state !== 'post')) || rounds[rounds.length - 1];
  const cols = rounds.map((r) => {
    const slots = r.games.map(wcMatchHTML);
    while (slots.length < r.size) slots.push(`<div class="wc-match tbd"><div class="wc-status"><span>${esc(r.when)}</span></div><div class="wc-team"><span class="logo placeholder">?</span><span class="wc-name">TBD</span></div><div class="wc-team"><span class="logo placeholder">?</span><span class="wc-name">TBD</span></div></div>`);
    return `<div class="wc-round ${r.key === current.key ? 'current' : ''}" data-round="${r.key}">
      <div class="wc-round-head"><span>${r.label}</span><span class="wc-round-when">${esc(r.when)}</span></div>${slots.join('')}</div>`;
  }).join('');
  box.innerHTML = `<h2 class="section-title" id="home-wc-title">🏆 World Cup Bracket</h2>
    <div class="wc-bracket">${cols}</div>
    <div class="wc-hint muted">Swipe for earlier / later rounds →</div>`;
  const wrap = box.querySelector('.wc-bracket');
  const cur = wrap.querySelector('.wc-round.current');
  if (cur) wrap.scrollLeft = Math.max(0, cur.offsetLeft - wrap.offsetLeft - 12);

  // add a jump chip for the bracket to the Home league nav
  const nav = $('#home-games .jump-nav');
  if (nav && !nav.querySelector('[data-wc]')) {
    const b = el('button', 'chip', '🏆 Bracket');
    b.dataset.wc = '1';
    b.onclick = () => $('#home-wc-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nav.appendChild(b);
  }
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
// Golf: render the current/most-recent PGA tournament leaderboard.
async function getGolfEvent() {
  const data = await fetchJSON(`${SITE}/golf/pga/scoreboard`, 5 * 60000).catch(() => null);
  const events = data?.events || [];
  return events.find((e) => e.status?.type?.state === 'in') || events[0] || null;
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
    homeGP: homeG.length,
    roadGP: roadG.length,
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
    return `<div class="hit-row"><span class="hit-n">${esc(p.name)}</span><span class="hit-s">${ops3n(p.ops)} OPS${extra ? ' · ' + esc(extra) : ''}</span></div>`;
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
  const rows = (arr) => arr.length ? arr.map((p) => `<div class="hit-row"><span class="hit-n">${esc(p.pos)} · ${esc(p.name)}</span><span class="hit-s">${esc(p.val)}</span></div>`).join('') : '<div class="ai-why">Not available</div>';
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
  const row = (label, p) => p ? `<div class="hit-row"><span class="hit-n">${label} · ${esc(p.name)}</span><span class="hit-s">${esc(p.bits)}</span></div>` : '';
  return `<div class="md-section-title">Projected Starters</div>${row(g.away.abbr || 'Away', a)}${row(g.home.abbr || 'Home', h)}`;
}

// Probable starter's recent form: last 3 starts aggregated from the gamelog
// (a 4.20-season-ERA arm on a three-gem heater is a different bet). Needs a
// real recent sample (12+ outs) or it stays silent.
async function starterForm(athleteId) {
  if (!athleteId) return null;
  const games = await athleteGamelog('mlb', athleteId).catch(() => null);
  if (!games || !games.length) return null;
  const recent = games.filter((g) => g.date && !isNaN(g.date)).sort((a, b) => b.date - a.date).slice(0, 3);
  let er = 0, o = 0, bb = 0, h = 0;
  recent.forEach((g) => {
    const d = g.dict;
    er += gv(d, 'earnedruns', 'er');
    o += ipToOuts(gvRaw(d, 'inningspitched', 'ip', 'innings'));
    bb += gv(d, 'walks', 'bb', 'baseonballs');
    h += gv(d, 'hits', 'h');
  });
  if (o < 12) return null;
  return { era: (er * 27) / o, whip: ((bb + h) * 3) / o, starts: recent.length };
}

// Player-matchup signal: MLB starting pitchers (season ERA/WHIP + last-3-starts
// form) and team OPS; football/basketball key player. Returns weighted factors
// + display notes.
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
      // recent form on top of the season line (half the season-stat weight)
      const [hForm, aForm] = await Promise.all([starterForm(hp?.athlete?.id), starterForm(ap?.athlete?.id)]);
      if (hForm && aForm) {
        notes.push(`SP form (L3): ${hn} ${hForm.era.toFixed(2)} ERA vs ${an} ${aForm.era.toFixed(2)} ERA`);
        const fparts = [clamp((aForm.era - hForm.era) / 2.0, -2, 2), clamp((aForm.whip - hForm.whip) / 0.35, -2, 2)];
        factors.push({ label: 'SP recent form', c: 0.12 * (fparts.reduce((s, v) => s + v, 0) / fparts.length), detail: `L3 starts: ${hForm.era.toFixed(2)} vs ${aForm.era.toFixed(2)} ERA` });
      }
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
      // A 3-1 home record says almost nothing — blend the split with the
      // generic home edge until both sides have ~10 games of sample.
      const shrink = clamp(Math.min(hf.homeGP ?? 0, af.roadGP ?? 0) / 10, 0, 1);
      add('Home/road split', 1.0 * shrink * (hf.homeWP - af.roadWP),
        `home ${(hf.homeWP * 100).toFixed(0)}% vs road ${(af.roadWP * 100).toFixed(0)}%${shrink < 1 ? ' (small sample, damped)' : ''}`);
      if (shrink < 1) add('Home field', 0.28 * (1 - shrink), 'standard home edge');
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
  // Projected game total: average of the two teams' combined-scoring rates —
  // compared against the posted O/U for totals edges.
  const projTotal = hf && af && hf.ppg != null && af.ppg != null
    ? (hf.ppg + hf.papg + af.ppg + af.papg) / 2 : null;
  return { winner, conf, homePick, probHome: pHome, projTotal, breakdown, notes: mu.notes, thin: !(hf && af) };
}

function aiPickHead(pred) {
  if (!pred) return '';
  return `<div class="md-section-title acc-open">🤖 AI Pick</div>
    <div class="ai-pick">Pick: <b>${esc(pred.winner.name)}</b> <span class="ai-conf">${pred.conf}%</span></div>
    <div class="conf-bar"><span style="width:${pred.conf}%"></span></div>
    ${pred.projTotal != null ? `<div class="ai-why">Model total: ${pred.projTotal.toFixed(1)}</div>` : ''}
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

// --- Game Report (betting intel: model vs market, line moves, DK splits) ----
// The backend bundles VSiN's DraftKings splits + its own ESPN line snapshots;
// everything degrades gracefully when it's unreachable (model grades and
// device-tracked movement still render).
const BETTING_SPORTS = new Set(['mlb', 'nfl', 'nba']);
async function getBettingReport(sport) {
  if (!BETTING_SPORTS.has(sport)) return null;
  return fetchJSON(`${FANTASY_API}/api/betting/${sport}/report`, 5 * 60000).catch(() => null);
}
// Match a VSiN team cell ("9:40 PM LA Angels +1.5") to an ESPN team name.
function vsinMatches(vstr, teamName) {
  const v = ` ${norm(vstr || '').replace(/[+-]?\d+(\.\d+)?/g, ' ')} `;
  const n = norm(teamName || '');
  if (!n) return false;
  if (v.includes(` ${n} `) || v.includes(n)) return true;
  const words = n.split(/\s+/);
  const nick = words[words.length - 1];
  const nick2 = words.slice(-2).join(' ');
  if (['red sox', 'white sox', 'blue jays'].includes(nick2)) {
    return v.includes(nick2) || v.includes(words.slice(0, -2).join(' ')); // "red sox" or the city
  }
  const city = words.slice(0, -1).join(' ');
  return v.includes(nick) || (!!city && v.includes(city));
}
function splitsFor(report, g) {
  for (const s of report?.splits?.games || []) {
    if (vsinMatches(s.away?.team, g.away.name) && vsinMatches(s.home?.team, g.home.name)) return { away: s.away, home: s.home };
    if (vsinMatches(s.away?.team, g.home.name) && vsinMatches(s.home?.team, g.away.name)) return { away: s.home, home: s.away };
  }
  return null;
}
// Best movement record for a game: backend snapshots (real openers, keyed by
// ESPN event id) first, else this device's own first-seen tracking.
function lineMoves(sport, g, report) {
  const be = report?.movement?.[String(g.id)];
  if (be?.first && be.n > 1) return { first: be.first, last: be.last || be.first, src: 'server' };
  try {
    const rec = JSON.parse(localStorage.getItem(`sportshub:lines:${ymd(sportsDate())}`) || '{}')[`${sport}:${g.id}`];
    if (rec?.first) return { first: rec.first, last: rec.last || rec.first, src: 'device' };
  } catch (_) {}
  return be?.first ? { first: be.first, last: be.last || be.first, src: 'server' } : null;
}
// Sharp-flavored reads computed from splits + movement (labeled, no hand-waving).
function sharpSignals(g, sp, mv) {
  const out = [];
  if (sp) {
    [['away', g.away], ['home', g.home]].forEach(([side, team]) => {
      const s = sp[side];
      if (s && s.ml_handle != null && s.ml_bets != null && s.ml_handle - s.ml_bets >= 7) {
        out.push(`💰 Big money on ${esc(team.abbr || team.name)} — ${s.ml_handle}% of dollars vs ${s.ml_bets}% of bets`);
      }
    });
  }
  if (sp && mv?.first && mv?.last) {
    const f = snapHomeProb(mv.first, g), l = snapHomeProb(mv.last, g);
    if (f != null && l != null) {
      const d = (l - f) * 100; // + = moved toward home
      if (Math.abs(d) >= 1.5) {
        const toward = d > 0 ? g.home : g.away, against = d > 0 ? g.away : g.home;
        const bets = sp[d > 0 ? 'away' : 'home']?.ml_bets;
        if (bets != null && bets >= 55) {
          out.push(`🔪 Reverse line move — line moved toward ${esc(toward.abbr || toward.name)} while ${bets}% of bets sit on ${esc(against.abbr || against.name)} (classic sharp-side signal)`);
        }
      }
    }
  }
  return out;
}
// The modal's PRO-style report: model line vs book (graded per side), model
// total, line movement, DK money splits, and sharp signals.
function gameReportHTML(sport, g, pred, info, report) {
  const parts = [];
  const mkt = info ? marketHomeProb(info) : null;
  if (pred && pred.probHome != null) {
    const rows = [['away', 1 - pred.probHome, info?.aML], ['home', pred.probHome, info?.hML]].map(([side, p, book]) => {
      const team = g[side];
      const mktP = mkt != null ? (side === 'home' ? mkt : 1 - mkt) : null;
      const grade = mktP != null ? priceGrade((p - mktP) * 100) : null;
      return `<div class="gr-row">
        <span class="gr-team">${logoHTML(team)}${esc(team.abbr || team.name)}</span>
        <span class="gr-fair">${fmtML(fairML(p))}</span>
        <span class="gr-book">${fmtML(book)}</span>
        ${grade ? `<span class="gr-grade" style="color:${gradeHue(grade)};border-color:${gradeHue(grade)}">${grade}</span>` : '<span class="gr-grade none">—</span>'}
      </div>`;
    }).join('');
    parts.push(`<div class="gr-head"><span></span><span>Model line</span><span>Book</span><span>Grade</span></div>${rows}`);
    if (pred.projTotal != null && info?.ou != null) {
      const lean = pred.projTotal > info.ou ? 'OVER' : pred.projTotal < info.ou ? 'UNDER' : null;
      parts.push(`<div class="gr-total">Total: model ${pred.projTotal.toFixed(1)} vs O/U ${info.ou}${lean ? ` → <b>${lean}</b>` : ''}</div>`);
    }
  }
  const mv = lineMoves(sport, g, report);
  if (mv) {
    const f = mv.first, l = mv.last;
    const changes = [];
    if (f.hML != null && l.hML != null && f.hML !== l.hML) changes.push(`${esc(g.home.abbr || 'Home')} ML ${fmtML(f.hML)} → ${fmtML(l.hML)}`);
    if (f.aML != null && l.aML != null && f.aML !== l.aML) changes.push(`${esc(g.away.abbr || 'Away')} ML ${fmtML(f.aML)} → ${fmtML(l.aML)}`);
    if (f.ou != null && l.ou != null && f.ou !== l.ou) changes.push(`O/U ${f.ou} → ${l.ou}`);
    if (!changes.length && f.details && l.details && f.details !== l.details) changes.push(`${esc(f.details)} → ${esc(l.details)}`);
    const since = f.t ? timeAgo(new Date(f.t > 2e10 ? f.t : f.t * 1000)) : '';
    parts.push(`<div class="gr-move">📈 ${changes.length ? changes.join(' · ') : 'No line movement yet'}
      <span class="gr-src">${mv.src === 'server' ? `server tracking since ${since}` : `since first seen on this device (${since})`}</span></div>`);
  }
  const sp = splitsFor(report, g);
  if (sp) {
    const bar = (v) => `<span class="gr-bar"><i style="width:${clamp(v, 0, 100)}%"></i></span>`;
    const row = (team, s) => `<div class="gr-money-row"><span class="gr-mteam">${esc(team.abbr || team.name)}</span>
      <span class="gr-pcts">bets ${s.ml_bets ?? '–'}%${s.ml_bets != null ? bar(s.ml_bets) : ''}</span>
      <span class="gr-pcts">money ${s.ml_handle ?? '–'}%${s.ml_handle != null ? bar(s.ml_handle) : ''}</span>
      ${s.ml_handle != null && s.ml_bets != null ? `<span class="gr-diff ${s.ml_handle - s.ml_bets > 0 ? 'up' : ''}">${s.ml_handle - s.ml_bets > 0 ? '+' : ''}${s.ml_handle - s.ml_bets}</span>` : '<span></span>'}
    </div>`;
    parts.push(`<div class="gr-sub">💰 Big Money — moneyline splits (${esc(report?.splits?.book || 'DraftKings')})</div>${row(g.away, sp.away)}${row(g.home, sp.home)}`);
    sharpSignals(g, sp, mv).forEach((s) => parts.push(`<div class="gr-sharp">${s}</div>`));
  } else if (report?.splits && !report.splits.ok) {
    parts.push(`<div class="gr-unavail">DK betting splits unavailable — ${esc(report.splits.error || 'source down')}.</div>`);
  } else if (report?.splits?.ok) {
    parts.push(`<div class="gr-unavail">No DK splits row matched for this game.</div>`);
  }
  if (!parts.length) return '';
  return `<div class="md-section-title acc-open">📊 Game Report</div><div class="gr-card">${parts.join('')}</div>`;
}

// Persistent model performance tally (vs results and vs the betting line).
const TALLY_KEY = 'sportshub:aitally';
const getTally = () => { try { return JSON.parse(localStorage.getItem(TALLY_KEY) || '{}'); } catch (_) { return {}; } };
// meta (added v83): s sport, d date YYYYMMDD, cf confidence, p pick name,
// m matchup label — powers the report card. Older entries only have {c,e}.
function recordResult(id, correct, edge, meta) {
  const t = getTally();
  if (t[id]) return; // graded once; re-renders of a final must not wipe the meta
  t[id] = { c: correct ? 1 : 0, e: edge, ...(meta || {}) }; // e: 'h' edge-hit, 'm' edge-miss, null agreed
  localStorage.setItem(TALLY_KEY, JSON.stringify(t));
}
function tallyStats() {
  // Totals (O/U) picks live in the same store (id suffixed ':t', entry t:1)
  // but count as their own record — mixing them into the side W-L would
  // muddy the calibration the report card exists to show.
  const t = getTally(); let w = 0, n = 0, eh = 0, en = 0, tw = 0, tn = 0;
  Object.values(t).forEach((r) => {
    if (r.t) { tn++; if (r.c) tw++; return; }
    n++; if (r.c) w++; if (r.e === 'h') { eh++; en++; } else if (r.e === 'm') en++;
  });
  return { w, l: n - w, n, eh, el: en - eh, en, tw, tl: tn - tw, tn };
}
// Report-card slices of the tally: record by confidence bucket / sport / last
// 7 days, plus the most recent graded picks (entries with v83+ meta only).
function tallyDetails() {
  const entries = Object.values(getTally());
  const bucketOf = (cf) => (cf >= 70 ? '70%+' : cf >= 60 ? '60–69%' : '50–59%');
  const buckets = {}, sports = {};
  const bump = (o, k, win) => { const r = (o[k] = o[k] || { w: 0, n: 0 }); r.n++; if (win) r.w++; };
  const weekCut = Number(ymd(new Date(Date.now() - 7 * 86400000)));
  const week = { w: 0, n: 0 };
  const totals = { w: 0, n: 0 };
  const recent = [];
  entries.forEach((r) => {
    const win = !!r.c;
    if (r.t) { totals.n++; if (win) totals.w++; if (r.p) recent.push(r); return; } // O/U picks: own record, but in history
    if (r.cf != null) bump(buckets, bucketOf(r.cf), win);
    if (r.s) bump(sports, r.s, win);
    if (r.d != null && Number(r.d) >= weekCut) { week.n++; if (win) week.w++; }
    if (r.p) recent.push(r);
  });
  recent.sort((a, b) => Number(b.d || 0) - Number(a.d || 0));
  return { total: entries.length, buckets, sports, week, totals, recent: recent.slice(0, 15) };
}
const matchupLabel = (sport, g) =>
  `${g.away.abbr || g.away.name} ${sport === 'soccer' ? 'vs' : '@'} ${g.home.abbr || g.home.name}`;

// Pending picks: every prediction is stashed so the running record keeps
// building even if you're not on the AI Picks tab when a game ends. On load
// we look up each pending game's final result and fold it into the tally.
const PENDING_KEY = 'sportshub:pending';
const getPending = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}'); } catch (_) { return {}; } };
const setPending = (p) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch (_) {} };
function recordPick(id, sport, date, pick, fav, conf, isEdge) {
  if (!id || !pick) return;
  if (getTally()[id]) return; // already graded
  const p = getPending();
  if (p[id]) return;
  // eg carries the qualified-edge flag (gap-filtered) so deferred grading
  // counts the same picks toward the vs-line record as live grading does.
  p[id] = { sport, date, pick, fav: fav || null, conf: conf ?? null, eg: isEdge ? 1 : 0 };
  setPending(p);
}
// Totals pick: keyed `${gameId}:t` so it never collides with the side pick.
function recordTotalPick(gameId, sport, date, side, line) {
  const id = `${gameId}:t`;
  if (!gameId || !side || line == null) return;
  if (getTally()[id]) return;
  const p = getPending();
  if (p[id]) return;
  p[id] = { sport, date, t: 1, pick: side, line };
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
      const g = byId[id.replace(/:t$/, '')]; if (!g || gameState(g) !== 'final') return;
      const entry = p[id];
      if (entry.t) { // totals pick: grade combined score vs the line (push → drop)
        const total = g.home.score != null && g.away.score != null ? g.home.score + g.away.score : null;
        if (total == null || total === entry.line) { delete p[id]; changed = true; return; }
        const hit = entry.pick === 'OVER' ? total > entry.line : total < entry.line;
        recordResult(id, hit, null,
          { s: sport, d: Number(date), t: 1, p: `${entry.pick} ${entry.line}`, m: matchupLabel(sport, g) });
        delete p[id]; changed = true; return;
      }
      const actual = winnerName(g);
      if (!actual || actual === 'TIE') { delete p[id]; changed = true; return; }
      const { pick, fav, conf, eg } = entry;
      const hit = actual === pick;
      const wasEdge = eg != null ? !!eg : !!(fav && pick !== fav); // old entries: fav comparison
      recordResult(id, hit, wasEdge ? (hit ? 'h' : 'm') : null,
        { s: sport, d: Number(date), cf: conf ?? null, p: pick, m: matchupLabel(sport, g) });
      delete p[id]; changed = true;
    });
  }));
  if (changed) setPending(p);
}

// 📜 Model Report Card — a tap-to-expand panel under the stat bar: record by
// confidence bucket (is a "75%" pick really a 75% pick?), by sport, and the
// most recent graded picks so the record is inspectable, not just asserted.
function reportCard(det) {
  const box = el('div', 'ai-report');
  const pct = (r) => (r.n ? ` (${Math.round((r.w / r.n) * 100)}%)` : '');
  const row = (l, r) => `<div class="rep-row"><span class="rep-l">${l}</span><span class="rep-v">${r.w}-${r.n - r.w}${pct(r)}</span></div>`;
  const bRows = ['50–59%', '60–69%', '70%+'].filter((k) => det.buckets[k])
    .map((k) => row(`${k} confidence`, det.buckets[k])).join('');
  const sRows = Object.entries(det.sports)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([s, r]) => row(`${LEAGUES[s]?.emoji || ''} ${LEAGUES[s]?.label || s}`, r)).join('');
  const recent = det.recent.map((r) => {
    const d = String(r.d || '');
    const dd = d.length === 8 ? `${Number(d.slice(4, 6))}/${Number(d.slice(6, 8))}` : '';
    const pickTxt = r.t ? (r.p || '') : (r.p || '').split(' ').slice(-1)[0]; // totals keep "OVER 8.5"
    return `<div class="rep-pick"><span class="rep-i">${r.c ? '✅' : '❌'}${r.e ? '⚡' : r.t ? '🎯' : ''}</span><span class="rep-m">${esc(r.m || '')}</span><span class="rep-p">${esc(pickTxt)}${r.cf ? ` <span class="rep-cf">${r.cf}%</span>` : ''}</span><span class="rep-d">${dd}</span></div>`;
  }).join('');
  const tRow = det.totals?.n ? row('🎯 Totals (O/U) record', det.totals) : '';
  const week = det.week.n ? ` · this week ${det.week.w}-${det.week.n - det.week.w}` : '';
  box.innerHTML = `
    <button class="ai-report-head" aria-expanded="false">📜 Model Report Card${week}<span class="sec-chev">▸</span></button>
    <div class="ai-report-body" hidden>
      ${bRows ? `<div class="rep-sec">By confidence</div>${bRows}` : ''}
      ${sRows ? `<div class="rep-sec">By sport</div>${sRows}` : ''}
      ${tRow ? `<div class="rep-sec">Totals</div>${tRow}` : ''}
      ${recent ? `<div class="rep-sec">Recent picks (⚡ = against the line · 🎯 = totals)</div>${recent}` : ''}
      ${!bRows && !recent ? '<div class="ai-why" style="padding:6px 0">Detail builds as new picks grade — earlier picks only counted toward the totals.</div>' : ''}
    </div>`;
  const head = box.querySelector('.ai-report-head'), body = box.querySelector('.ai-report-body');
  head.onclick = () => {
    const open = body.hidden;
    body.hidden = !open;
    head.classList.toggle('open', open);
    head.setAttribute('aria-expanded', String(open));
  };
  return box;
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
    if (ts.tn) parts.push(`totals ${ts.tw}-${ts.tl}`);
    if (todayTxt) parts.push(todayTxt);
    $('#ai-score').textContent = parts.join(' · ');
  };
  // Full-width tracking panel: overall model record, record when the model
  // bucked the book, and how many edges it sees today.
  const statBar = (edgeCount, edgeSub) => {
    const ts = tallyStats();
    const tile = (val, label, sub, cls) =>
      `<div class="ai-stat ${cls || ''}"><div class="ai-stat-v">${val}</div><div class="ai-stat-l">${label}</div><div class="ai-stat-s">${sub}</div></div>`;
    const bar = el('div', 'ai-statbar');
    bar.innerHTML =
      tile(ts.n ? `${ts.w}-${ts.l}` : '—', 'Model record', ts.n ? `${Math.round((ts.w / ts.n) * 100)}% all-time` : 'no graded games yet') +
      tile(ts.en ? `${ts.eh}-${ts.el}` : '—', 'vs the line', ts.en ? `${Math.round((ts.eh / ts.en) * 100)}% off the book` : 'edges not graded yet') +
      tile(String(edgeCount), 'Edges today', edgeSub, edgeCount ? 'edge' : '');
    return bar;
  };
  if (!playable.length) {
    container.innerHTML = '';
    container.appendChild(statBar(0, 'no games today'));
    const det0 = tallyDetails();
    if (det0.total) container.appendChild(reportCard(det0));
    container.appendChild(el('div', 'empty', 'No games today for this sport.'));
    renderTally('');
    return;
  }

  const dateStr = ymd(sportsDate());
  const preds = await Promise.all(playable.map((g) => predictGame(sport, g).catch(() => null)));
  container.innerHTML = '';
  let right = 0, graded = 0;

  // Build a record per game and flag where the model bucks the betting favorite.
  // With moneylines posted, a disagreement only counts as an edge when the
  // model likes its side ≥5 probability points more than the de-vigged market
  // — coin-flip disagreements against a -110 line are noise, not signal.
  const MIN_EDGE_GAP = 5;
  // Totals edge: model's projected total vs the posted O/U, sport-scaled floor.
  const TOT_EDGE_MIN = { mlb: 1.0, nba: 6, nfl: 4, soccer: 0.6 };
  const rows = playable.map((g, i) => {
    const p = preds[i];
    const info = p ? normOdds(g.odds, g.home.name, g.away.name) : null;
    const gap = p && info ? marketGap(p, info) : null;
    const isEdge = !!(p && info && info.favName && p.winner.name !== info.favName
      && (gap == null || gap >= MIN_EDGE_GAP)); // no MLs (spread-only) → old behavior
    let tot = null;
    if (p?.projTotal != null && info?.ou != null) {
      const diff = p.projTotal - Number(info.ou);
      if (isFinite(diff) && Math.abs(diff) >= (TOT_EDGE_MIN[sport] ?? 1)) {
        tot = { side: diff > 0 ? 'OVER' : 'UNDER', line: Number(info.ou), proj: p.projTotal, diff };
      }
    }
    let resultTag = '';
    if (p && gameState(g) === 'final') {
      const actual = winnerName(g);
      if (actual && actual !== 'TIE') {
        graded++; const hit = actual === p.winner.name; if (hit) right++;
        const edge = info && info.favName ? (isEdge ? (hit ? 'h' : 'm') : null) : null;
        recordResult(g.id, hit, edge,
          { s: sport, d: Number(dateStr), cf: p.conf, p: p.winner.name, m: matchupLabel(sport, g) });
        resultTag = `<div class="ai-result ${hit ? 'win' : 'loss'}">${hit ? '✅ Model nailed it' : '❌ Model missed'}</div>`;
      }
      if (tot && g.home.score != null && g.away.score != null) {
        const total = g.home.score + g.away.score;
        if (total !== tot.line) {
          recordResult(`${g.id}:t`, tot.side === 'OVER' ? total > tot.line : total < tot.line, null,
            { s: sport, d: Number(dateStr), t: 1, p: `${tot.side} ${tot.line}`, m: matchupLabel(sport, g) });
        }
      }
    } else if (p) {
      // stash the picks so they get graded later even if the tab isn't open
      recordPick(g.id, sport, dateStr, p.winner.name, info?.favName, p.conf, isEdge);
      if (tot) recordTotalPick(g.id, sport, dateStr, tot.side, tot.line);
    }
    return { g, p, info, gap, isEdge, tot, resultTag };
  });

  // No line ≠ no disagreement: if ESPN sent no odds, say so instead of
  // claiming the model agrees with a book that never posted.
  const anyLines = rows.some((r) => r.info?.favName);
  const upcomingEdges = rows.filter((r) => r.isEdge && gameState(r.g) !== 'final').length;
  container.appendChild(statBar(upcomingEdges,
    upcomingEdges ? 'model disagrees w/ book' : anyLines ? 'model in line w/ book' : 'no lines posted yet'));
  renderTally(graded ? `today ${right}-${graded - right}` : '');
  const det = tallyDetails();
  if (det.total) container.appendChild(reportCard(det));

  const buildCard = ({ g, p, info, gap, isEdge, resultTag }) => {
    const card = gameCard(sport, g);
    if (isEdge) {
      const abbr = (g.home.name === p.winner.name ? g.home.abbr : g.away.abbr) || (p.winner.name || '').split(' ').pop();
      const b = el('div', 'edge-badge', `⚡ Model edge: ${abbr} <span class="edge-conf">${p.conf}%</span>${gap != null ? `<span class="edge-gap">+${gap} vs market</span>` : ''}`);
      const meta = card.querySelector('.game-meta');
      if (meta) meta.insertAdjacentElement('afterend', b); else card.appendChild(b);
      card.classList.add('has-edge');
    }
    if (p) {
      const cmp = info ? marketCompare(p, info.favName, info) : '';
      const top = p.breakdown.slice(0, 2).map((b) => `${b.label} (${b.favor.split(' ').slice(-1)[0]} +${b.pct.toFixed(1)}%)`).join(' · ');
      const oddsLine = info ? `<div class="card-odds">📊 ${info.details ?? 'line n/a'}${info.ou != null ? ` · O/U ${info.ou}` : ''}</div>` : '';
      const block = el('div', 'ai-block');
      block.innerHTML = `
        <div class="ai-pick">🤖 Pick: <b>${esc(p.winner.name)}</b> <span class="ai-conf">${p.conf}%</span></div>
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
  // already lives on the Home tab. The rest of the space goes to trends.
  // Biggest model-vs-market gap first (raw confidence as the tiebreak).
  const edges = rows.filter((r) => r.isEdge)
    .sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1) || (b.p?.conf || 0) - (a.p?.conf || 0));
  if (edges.length) {
    container.appendChild(el('div', 'ai-section-head edge', `⚡ Model Edges — off the book (${edges.length})`));
    edges.forEach((r) => container.appendChild(buildCard(r)));
  } else if (anyLines) {
    container.appendChild(el('div', 'ai-note', '✅ No model edges today — the model is within a few points of the book everywhere. Check the trends below.'));
  } else {
    container.appendChild(el('div', 'ai-note', '📭 No betting lines posted for this slate yet — edges appear once the books hang lines. Check the trends below.'));
  }

  // Totals edges — the model's projected total vs the posted O/U. Finished
  // games show the graded result inline.
  const totRows = rows.filter((r) => r.tot).sort((a, b) => Math.abs(b.tot.diff) - Math.abs(a.tot.diff));
  if (totRows.length) {
    container.appendChild(el('div', 'ai-section-head', `🎯 Totals Edges — model vs the O/U (${totRows.length})`));
    const box = el('div', 'trend-list');
    totRows.forEach(({ g, tot }) => {
      const total = gameState(g) === 'final' && g.home.score != null && g.away.score != null ? g.home.score + g.away.score : null;
      const res = total == null ? '' : total === tot.line ? ` · ⬜ push (${total})`
        : (tot.side === 'OVER' ? total > tot.line : total < tot.line) ? ` · ✅ hit (${total})` : ` · ❌ miss (${total})`;
      box.appendChild(el('div', 'trend-row',
        `<b>${tot.side} ${tot.line}</b> — ${esc(matchupLabel(sport, g))} · model projects ${tot.proj.toFixed(1)} (${tot.diff > 0 ? '+' : ''}${tot.diff.toFixed(1)} vs line)${res}`));
    });
    container.appendChild(box);
  }

  // (v89: the Game Reports list moved off this tab — reports open from the
  // Home slate's tappable cards instead. AI Picks stays model tracking + trends.)
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
    pitchers.slice(0, 2).forEach((p) => propRows.push(`🎯 <b>${esc(p.nm)}</b> on the mound — ${p.era} ERA${p.whip != null ? `, ${p.whip} WHIP` : ''} (Ks / unders watch)`));
    pitchers.slice(-1).forEach((p) => { if (p.era >= 4.8) propRows.push(`⚠️ <b>${esc(p.nm)}</b> starting — ${p.era} ERA${p.whip != null ? `, ${p.whip} WHIP` : ''} (hitter / overs spot)`); });

    // hot hitters from the teams in the edge games (bounded), else top form teams
    let hitterTeams = rows.filter((r) => r.isEdge).flatMap((r) => [r.g.home, r.g.away]);
    if (!hitterTeams.length) hitterTeams = teams.slice(0, 4);
    const uniqH = []; const seenH = new Set();
    hitterTeams.forEach((t) => { if (t.id && !seenH.has(t.id)) { seenH.add(t.id); uniqH.push(t); } });
    const hh = await Promise.all(uniqH.slice(0, 6).map((t) => topHitters(t.id, 1).catch(() => [])));
    hh.forEach((arr, i) => { const p = arr[0]; if (p && parseFloat(p.ops) >= 0.800) propRows.push(`🔥 <b>${esc(p.name)}</b> (${esc(uniqH[i].abbr || uniqH[i].name)}) — ${ops3n(p.ops)} OPS${p.hr ? `, ${p.hr} HR` : ''} (hits / TB props)`); });
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

// --- Fantasy: NFL preseason prep ------------------------------------------
// Everything here is client-side (no backend league needed): a kickoff
// countdown, an offseason timeline, and a personal draft board saved on-device.
const NFLBOARD_KEY = 'sportshub:fantasy:nflboard';
const loadNflBoard = () => { try { return JSON.parse(localStorage.getItem(NFLBOARD_KEY)) || []; } catch (_) { return []; } };
const saveNflBoard = (list) => { try { localStorage.setItem(NFLBOARD_KEY, JSON.stringify(list)); } catch (_) {} };

// 2026 NFL calendar (expected). Kickoff is the Week-1 Thursday nighter.
const NFL_KICKOFF = '2026-09-10';
const NFL_DATES = [
  ['Training camps open', '2026-07-22'],
  ['Hall of Fame Game', '2026-07-30'],
  ['Preseason Week 1', '2026-08-07'],
  ['Preseason Week 2', '2026-08-14'],
  ['Preseason Week 3', '2026-08-21'],
  ['Cutdown to 53', '2026-08-26'],
  ['Kickoff — Week 1', NFL_KICKOFF],
];
// Quick-add starter names by position (NOT a ranking — a seed list to edit).
const NFL_SUGGEST = {
  QB: ['Josh Allen', 'Lamar Jackson', 'Jalen Hurts', 'Patrick Mahomes', 'Jayden Daniels'],
  RB: ['Bijan Robinson', 'Saquon Barkley', 'Jahmyr Gibbs', 'Christian McCaffrey', "De'Von Achane"],
  WR: ["Ja'Marr Chase", 'Justin Jefferson', 'CeeDee Lamb', 'Amon-Ra St. Brown', 'A.J. Brown'],
  TE: ['Brock Bowers', 'Trey McBride', 'George Kittle', 'Sam LaPorta'],
};
const NFL_POS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST'];
const daysUntil = (iso) => Math.ceil((new Date(iso + 'T12:00:00') - new Date()) / 86400000);

function renderFantasyFootball() {
  const box = $('#fantasy-football');
  if (!box) return;
  const board = loadNflBoard();
  const filter = fanState.nflFilter || 'ALL';
  const kick = daysUntil(NFL_KICKOFF);
  const status = kick > 0
    ? `<span class="pp-big">${kick}</span> day${kick === 1 ? '' : 's'} until Week 1 kickoff`
    : (kick === 0 ? '<span class="pp-big">🏈</span> Kickoff is today!' : 'Season underway — live league sync will light up here.');

  const tl = NFL_DATES.map(([label, iso]) => {
    const n = daysUntil(iso);
    const when = n > 0 ? `in ${n}d` : (n === 0 ? 'today' : 'done');
    const cls = n > 0 ? '' : (n === 0 ? ' now' : ' past');
    const md = new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `<div class="tl-row${cls}"><span class="tl-date">${md}</span><span class="tl-label">${esc(label)}</span><span class="tl-when">${when}</span></div>`;
  }).join('');

  const shown = board.filter((p) => filter === 'ALL' || p.pos === filter)
    .sort((a, b) => (a.pos === b.pos ? (a.tier - b.tier || a.name.localeCompare(b.name)) : NFL_POS.indexOf(a.pos) - NFL_POS.indexOf(b.pos)));
  const boardHTML = shown.length
    ? shown.map((p) => `<div class="bd-row"><span class="bd-tier t${p.tier}">T${p.tier}</span><span class="bd-name">${esc(p.name)}</span><span class="bd-pos">${esc(p.pos)}</span><button class="bd-rm" data-name="${esc(p.name)}" aria-label="Remove ${esc(p.name)}">×</button></div>`).join('')
    : '<div class="muted" style="padding:8px 2px">No targets yet — add players below, or tap a suggestion.</div>';

  const filterChips = ['ALL', 'QB', 'RB', 'WR', 'TE'].map((f) =>
    `<button class="chip${f === filter ? ' active' : ''}" data-filter="${f}">${f === 'ALL' ? 'All' : f}</button>`).join('');
  const sugg = Object.entries(NFL_SUGGEST).map(([pos, names]) =>
    `<div class="pp-sugg-row"><span class="pp-sugg-pos">${pos}</span>${names.map((n) =>
      `<button class="chip sm" data-add="${esc(n)}" data-pos="${pos}">${esc(n)}</button>`).join('')}</div>`).join('');

  box.innerHTML = `
    <div class="setup-card pp-hero">
      <div class="pp-kicker">🏈 NFL Fantasy — Preseason Prep</div>
      <div class="pp-count">${status}</div>
      <div class="muted" style="margin-top:8px">Your live ESPN league — matchups, roster, standings — will sync here once the season starts and the league is connected. Until then, get your draft ready below.</div>
    </div>

    <h2 class="section-title">Team Research</h2>
    <div id="tr-nav" class="tr-nav"></div>
    <div class="tr-bar"><label for="tr-team">Team</label><select id="tr-team"><option>Loading teams…</option></select></div>
    <div class="muted" style="font-size:11.5px;margin:2px 0 8px">Projected offensive fantasy starters from the latest depth chart (QB · RB · WR · TE). Tap a player for more info.</div>
    <div id="tr-content" class="tr-content"></div>

    <h2 class="section-title">Offseason Timeline</h2>
    <div class="tl-list">${tl}</div>
    <div class="muted" style="font-size:11px;margin-top:6px">Expected 2026 dates — may shift when the official calendar is set.</div>

    <h2 class="section-title">My Draft Board</h2>
    <div class="chips" style="margin-bottom:10px">${filterChips}</div>
    <div class="bd-list">${boardHTML}</div>
    <div class="pp-add">
      <input id="bd-name" type="text" placeholder="Add a player…" autocomplete="off" />
      <select id="bd-pos">${NFL_POS.map((p) => `<option>${p}</option>`).join('')}</select>
      <select id="bd-tier">${[1, 2, 3, 4, 5].map((t) => `<option value="${t}"${t === 3 ? ' selected' : ''}>Tier ${t}</option>`).join('')}</select>
      <button id="bd-add" class="fan-btn">Add</button>
    </div>
    <div class="muted" style="font-size:12px;margin:12px 0 6px">Quick add — popular names to start (tap to add, then edit freely; not a ranking):</div>
    ${sugg}

    <h2 class="section-title">Prep Tips</h2>
    <ul class="pp-tips">
      <li>Know your <b>scoring</b> first — PPR lifts pass-catching backs and slot receivers; standard leans to volume RBs.</li>
      <li>Plan the early rounds as <b>tiers</b>, not exact names — your slot and position runs will move the board.</li>
      <li>Track <b>bye weeks</b> so you don't stack too many starters on the same week.</li>
      <li>Don't reach for <b>QB or TE</b> early unless it's a truly elite one — both are deep.</li>
      <li><b>Handcuff</b> your stud RB late, and save a bench spot for a Week-1 waiver dart.</li>
    </ul>`;

  const addPlayer = (name, pos, tier) => {
    name = (name || '').trim();
    if (!name) return;
    const list = loadNflBoard();
    if (list.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
    list.push({ name, pos, tier });
    saveNflBoard(list);
    renderFantasyFootball();
  };
  box.querySelectorAll('[data-filter]').forEach((b) => (b.onclick = () => { fanState.nflFilter = b.dataset.filter; renderFantasyFootball(); }));
  box.querySelectorAll('.bd-rm').forEach((b) => (b.onclick = () => { saveNflBoard(loadNflBoard().filter((p) => p.name !== b.dataset.name)); renderFantasyFootball(); }));
  box.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => addPlayer(b.dataset.add, b.dataset.pos, 3)));
  const addBtn = box.querySelector('#bd-add');
  if (addBtn) addBtn.onclick = () => addPlayer(box.querySelector('#bd-name').value, box.querySelector('#bd-pos').value, Number(box.querySelector('#bd-tier').value) || 3);
  initTeamResearch();
}

// --- Fantasy: Team Research (any NFL team's projected offensive starters) ---
// Static ESPN NFL team ids (stable) so the picker never hangs on a network
// call — only each team's roster/depth loads on demand (same feeds the Eagles
// tab uses). Alphabetical by name.
const NFL_TEAM_LIST = [
  { id: '22', name: 'Arizona Cardinals' }, { id: '1', name: 'Atlanta Falcons' }, { id: '33', name: 'Baltimore Ravens' },
  { id: '2', name: 'Buffalo Bills' }, { id: '29', name: 'Carolina Panthers' }, { id: '3', name: 'Chicago Bears' },
  { id: '4', name: 'Cincinnati Bengals' }, { id: '5', name: 'Cleveland Browns' }, { id: '6', name: 'Dallas Cowboys' },
  { id: '7', name: 'Denver Broncos' }, { id: '8', name: 'Detroit Lions' }, { id: '9', name: 'Green Bay Packers' },
  { id: '34', name: 'Houston Texans' }, { id: '11', name: 'Indianapolis Colts' }, { id: '30', name: 'Jacksonville Jaguars' },
  { id: '12', name: 'Kansas City Chiefs' }, { id: '13', name: 'Las Vegas Raiders' }, { id: '24', name: 'Los Angeles Chargers' },
  { id: '14', name: 'Los Angeles Rams' }, { id: '15', name: 'Miami Dolphins' }, { id: '16', name: 'Minnesota Vikings' },
  { id: '17', name: 'New England Patriots' }, { id: '18', name: 'New Orleans Saints' }, { id: '19', name: 'New York Giants' },
  { id: '20', name: 'New York Jets' }, { id: '21', name: 'Philadelphia Eagles' }, { id: '23', name: 'Pittsburgh Steelers' },
  { id: '25', name: 'San Francisco 49ers' }, { id: '26', name: 'Seattle Seahawks' }, { id: '27', name: 'Tampa Bay Buccaneers' },
  { id: '10', name: 'Tennessee Titans' }, { id: '28', name: 'Washington Commanders' },
];

// Division quick-nav: 8 division chips → that division's 4 teams as chips.
const NFL_DIVISIONS = [
  ['AFC East', ['2', '15', '17', '20']], ['AFC North', ['33', '4', '5', '23']],
  ['AFC South', ['34', '11', '30', '10']], ['AFC West', ['7', '12', '13', '24']],
  ['NFC East', ['6', '19', '21', '28']], ['NFC North', ['3', '8', '9', '16']],
  ['NFC South', ['1', '29', '18', '27']], ['NFC West', ['22', '14', '25', '26']],
];
const NFL_NAME = Object.fromEntries(NFL_TEAM_LIST.map((t) => [t.id, t.name]));
const DIVISIONS = NFL_DIVISIONS.map(([name, ids]) => ({
  name, teams: ids.map((id) => ({ id, name: NFL_NAME[id], short: (NFL_NAME[id] || '').split(' ').pop() })),
}));
const divisionOf = (id) => (DIVISIONS.find((d) => d.teams.some((t) => t.id === id)) || DIVISIONS[0]).name;

function paintTeamNav() {
  const nav = $('#tr-nav');
  if (!nav) return;
  const cur = fanState.researchTeam;
  const activeDiv = fanState.researchDiv || (fanState.researchDiv = divisionOf(cur));
  const divs = DIVISIONS.map((d) => `<button class="chip sm tr-div${d.name === activeDiv ? ' active' : ''}" data-div="${esc(d.name)}">${esc(d.name)}</button>`).join('');
  const teams = (DIVISIONS.find((d) => d.name === activeDiv)?.teams || [])
    .map((t) => `<button class="chip sm tr-team-chip${t.id === cur ? ' active' : ''}" data-team="${t.id}">${esc(t.short)}</button>`).join('');
  nav.innerHTML = `<div class="tr-divs">${divs}</div><div class="tr-teams">${teams}</div>`;
  nav.querySelectorAll('[data-div]').forEach((b) => (b.onclick = () => { fanState.researchDiv = b.dataset.div; paintTeamNav(); }));
  nav.querySelectorAll('[data-team]').forEach((b) => (b.onclick = () => selectResearchTeam(b.dataset.team)));
}
function selectResearchTeam(id) {
  fanState.researchTeam = id;
  fanState.researchDiv = divisionOf(id);
  const sel = $('#tr-team');
  if (sel) sel.value = id;
  paintTeamNav();
  renderTeamResearch();
}
function initTeamResearch() {
  const sel = $('#tr-team');
  if (!sel) return;
  if (!fanState.researchTeam) fanState.researchTeam = '21'; // Eagles by default
  fanState.researchDiv = divisionOf(fanState.researchTeam);
  // Full list, grouped by division (keeps the dropdown but easier to scan).
  sel.innerHTML = DIVISIONS.map((d) => `<optgroup label="${esc(d.name)}">${d.teams
    .map((t) => `<option value="${t.id}"${t.id === fanState.researchTeam ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
  sel.onchange = () => selectResearchTeam(sel.value);
  paintTeamNav();
  renderTeamResearch();
}

// Fantasy positions we surface as "starters", with how many start at each.
const FANTASY_STARTERS = { QB: 1, RB: 2, WR: 3, TE: 1 };
async function renderTeamResearch() {
  const c = $('#tr-content');
  if (!c) return;
  const id = fanState.researchTeam;
  if (!id) return;
  fanState.researchCache = fanState.researchCache || {};
  fanState.researchAthletes = fanState.researchAthletes || {};
  if (fanState.researchCache[id]) { paintResearch(c, fanState.researchCache[id]); return; }
  c.innerHTML = '<div class="muted">Loading projected starters…</div>';
  const [rosterR, dcR, newsR] = await Promise.all([
    fetchJSON(`${SITE}/football/nfl/teams/${id}/roster`, 12 * 3600000).catch(() => null),
    safeJSON(`${FBCORE}/seasons/${STAT_SEASON}/teams/${id}/depthcharts`, 24 * 3600000),
    fetchJSON(`${SITE}/football/nfl/news?team=${id}`, 30 * 60000).catch(() => null),
  ]);
  const idMap = {};
  (rosterR?.athletes || []).forEach((grp) => (grp.items || []).forEach((a) => { if (a.id) { idMap[a.id] = a; fanState.researchAthletes[a.id] = a; } }));
  const groups = {};
  (dcR?.items || []).forEach((u) => Object.values(u.positions || {}).forEach((pos) => {
    const label = (pos.position?.abbreviation || '').toUpperCase();
    if (!FANTASY_STARTERS[label] || groups[label]) return;
    const players = (pos.athletes || []).sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .map((a) => idMap[refId(a.athlete?.$ref)]).filter(Boolean);
    if (players.length) groups[label] = players;
  }));
  // Fallback: derive by roster position if the depth chart is unavailable.
  let fallback = false;
  if (!Object.keys(groups).length && Object.keys(idMap).length) {
    fallback = true;
    Object.values(idMap).forEach((a) => {
      const p = (a.position?.abbreviation || '').toUpperCase();
      if (FANTASY_STARTERS[p]) (groups[p] = groups[p] || []).push(a);
    });
  }
  // ESPN team news → match a recent headline to each shown player (real beat
  // context: injuries, "first-team reps", "named starter", IR moves, etc.).
  // Keep the raw ESPN article objects so the player modal can show an in-app
  // summary (openNewsSummary) instead of linking out.
  const articles = (newsR?.articles || []).filter((a) => a.headline);
  fanState.researchNews = fanState.researchNews || {};
  const news = {};
  const shown = [];
  Object.entries(groups).forEach(([pos, arr]) => arr.slice(0, FANTASY_STARTERS[pos] + 3).forEach((a) => shown.push(a)));
  shown.forEach((a) => { const n = playerNews(a, articles); if (n) { news[a.id] = n; fanState.researchNews[a.id] = n; } });

  const data = { groups, error: !Object.keys(groups).length, fallback, news };
  fanState.researchCache[id] = data;
  if (fanState.researchTeam === id) paintResearch(c, data);
}

// Most recent team-news article that mentions this player + a role/injury
// signal, if any. Matching is deliberately conservative to avoid false hits.
const NEWS_DOWNGRADE = ['out for the season', 'season-ending', 'injured reserve', 'placed on ir', 'to ir', 'ruled out', 'will miss', 'expected to miss', 'suspended', 'carted off', 'torn ', 'acl', 'achilles', 'undergo surgery', 'out indefinitely'];
const NEWS_PROMOTE = ['first-team', 'first team', 'expected to start', 'named the starter', 'named starter', 'will start', 'gets the start', 'starting job', 'taking over', 'promoted to', 'ahead of', 'atop the depth', 'first string'];
function classifyNews(text) {
  if (NEWS_DOWNGRADE.some((k) => text.includes(k))) return 'downgrade';
  if (NEWS_PROMOTE.some((k) => text.includes(k))) return 'promote';
  return 'note';
}
// Normalize for name matching: drop periods/apostrophes (so "A.J."→"aj",
// "De'Von"→"devon"), turn other punctuation into spaces, collapse whitespace.
const newsNorm = (s) => (s || '').toLowerCase().replace(/[.'’]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
function playerNews(a, articles) {
  const fullN = newsNorm(a.displayName);
  const lastN = newsNorm(lastName(a.displayName));
  if (!fullN || !lastN) return null;
  for (const art of articles) { // articles arrive newest-first
    const raw = (art.headline || '') + ' ' + (art.description || '');
    const T = ` ${newsNorm(raw)} `;
    // Require the FULL name (word-bounded); allow last-name-only ONLY when it's
    // distinctive (≥6 chars) — this stops common-word surnames like "Price",
    // "Love", "Green", "Chase" from matching generic article words.
    const hit = T.includes(` ${fullN} `) || (lastN.length >= 6 && T.includes(` ${lastN} `));
    if (!hit) continue;
    return { headline: art.headline, when: art.published, signal: classifyNews(raw.toLowerCase()), article: art };
  }
  return null;
}

// Active injury label for an athlete (from the roster object), if any.
const injOf = (a) => a?.injuries?.find((i) => i.status && i.status !== 'Active')?.status || '';
// 0 healthy · 1 questionable · 2 doubtful · 3 out/IR/suspended.
function injSeverity(status) {
  const s = (status || '').toLowerCase();
  if (!s) return 0;
  if (/out|reserve|\bir\b|suspend|\bpup\b|non-football/.test(s)) return 3;
  if (/doubtful/.test(s)) return 2;
  if (/questionable|day-to-day/.test(s)) return 1;
  return 0;
}
// Estimated chance a backup takes over the starting job this season. Heuristic,
// NOT a real probability: base rate by position × depth-rank decay × the
// starter's injury severity × the starter's age (older = more likely replaced).
const POS_BASE = { QB: 9, RB: 30, WR: 16, TE: 13 };
const rankDecay = (d) => (d <= 1 ? 1 : d === 2 ? 0.42 : d === 3 ? 0.18 : 0.08);
const sevMult = (sev) => [1, 1.5, 2.3, 3.4][sev] || 1;
function ageMult(pos, age) {
  if (!age) return 1;
  if (pos === 'RB') return age >= 31 ? 1.7 : age >= 29 ? 1.4 : age >= 27 ? 1.15 : 1;
  if (pos === 'WR') return age >= 32 ? 1.4 : age >= 30 ? 1.2 : 1;
  if (pos === 'QB') return age >= 37 ? 1.4 : age >= 35 ? 1.2 : 1;
  if (pos === 'TE') return age >= 33 ? 1.4 : age >= 31 ? 1.2 : 1;
  return 1;
}
function stealOdds(pos, depth, starters, backup) {
  const worstSev = Math.max(0, ...starters.map((s) => injSeverity(injOf(s))));
  const oldest = Math.max(0, ...starters.map((s) => s.age || 0));
  let pct = (POS_BASE[pos] || 12) * rankDecay(depth) * sevMult(worstSev) * ageMult(pos, oldest);
  if (injOf(backup)) pct *= 0.4; // a hurt backup is itself less able to step in
  pct = Math.round(pct);
  if (depth === 1) { // primary backup gets a floor when the starter is hurt
    if (worstSev === 3) pct = Math.max(pct, 75);
    else if (worstSev === 2) pct = Math.max(pct, 55);
    else if (worstSev === 1) pct = Math.max(pct, 36);
  }
  pct = Math.max(2, Math.min(94, pct));
  const note = worstSev >= 1 ? 'starter banged up' : ageMult(pos, oldest) > 1.15 ? 'aging starter' : (pos === 'RB' ? 'committee risk' : 'depth');
  return { pct, note, cls: pct >= 45 ? 'hi' : pct >= 22 ? 'mid' : 'lo' };
}

function paintResearch(c, data) {
  if (data.error) { c.innerHTML = '<div class="muted">Depth chart unavailable for this team right now.</div>'; return; }
  const order = ['QB', 'RB', 'WR', 'TE'];
  const POSNAME = { QB: 'Quarterback', RB: 'Running Back', WR: 'Wide Receiver', TE: 'Tight End' };
  const avatar = (a) => a.headshot?.href
    ? `<img src="${esc(a.headshot.href)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'tr-ph',textContent:'${esc((a.position?.abbreviation || '').slice(0, 3))}'}))">`
    : `<span class="tr-ph">${esc((a.position?.abbreviation || '').slice(0, 3))}</span>`;
  const newsIcon = (sig) => (sig === 'downgrade' ? '🔻' : sig === 'promote' ? '🔼' : '🗞');
  const row = (a, starter, odds, nw) => {
    const inj = injOf(a);
    const bits = [starter ? 'Projected starter' : 'Backup', a.jersey ? '#' + esc(a.jersey) : '', inj ? '🩹 ' + esc(inj) : '', odds ? esc(odds.note) : ''].filter(Boolean);
    const right = odds
      ? `<span class="tr-odds ${odds.cls}" title="Estimated chance to take over the starting job">${odds.pct}%<small>to start</small></span>`
      : '<span class="tr-arrow">›</span>';
    const newsLine = nw ? `<span class="tr-news">${newsIcon(nw.signal)} ${esc(nw.headline)}</span>` : '';
    return `<button class="tr-player${starter ? ' starter' : ''}${nw && nw.signal !== 'note' ? ' news' : ''}" data-aid="${esc(a.id)}">
      ${avatar(a)}
      <span class="tr-info"><span class="tr-name">${esc(a.displayName)}</span><span class="tr-meta">${bits.join(' · ')}</span>${newsLine}</span>
      ${right}</button>`;
  };
  const nwOf = (a) => data.news && data.news[a.id];
  c.innerHTML = order.filter((p) => data.groups[p]).map((pos) => {
    const n = FANTASY_STARTERS[pos];
    const starters = data.groups[pos].slice(0, n);
    const backups = data.groups[pos].slice(n, n + 3);
    const starterDown = starters.some((s) => nwOf(s) && nwOf(s).signal === 'downgrade');
    return `<div class="tr-pos"><div class="tr-pos-h">${POSNAME[pos]}</div>`
      + starters.map((a) => row(a, true, null, nwOf(a))).join('')
      + backups.map((a, i) => {
        const o = stealOdds(pos, i + 1, starters, a);
        const nw = nwOf(a);
        let { pct, note } = o;
        if (starterDown && i === 0) { pct = Math.max(pct, 80); note = 'starter sidelined (news)'; }
        if (nw && nw.signal === 'promote') { pct = Math.max(pct, i === 0 ? 66 : 46); note = 'beat buzz: first-team reps'; }
        pct = Math.min(94, pct);
        const cls = pct >= 45 ? 'hi' : pct >= 22 ? 'mid' : 'lo';
        return row(a, false, { pct, note, cls }, nw);
      }).join('')
      + '</div>';
  }).join('')
    + '<div class="muted" style="font-size:11px;margin-top:6px">“% to start” is our estimate from depth-chart rank, the starter’s injury status, age &amp; recent ESPN news — not a real probability.'
    + (data.fallback ? ' Depth order unavailable, so it’s roster-by-position here.' : '') + '</div>';
  c.querySelectorAll('.tr-player').forEach((b) => (b.onclick = () => openPlayerModal(b.dataset.aid)));
}

async function openPlayerModal(aid) {
  const a = (fanState.researchAthletes || {})[aid];
  modal().classList.remove('hidden');
  const body = $('#modal-body');
  if (!a) { body.innerHTML = '<div class="muted" style="padding:20px">Player info unavailable.</div>'; return; }
  const head = a.headshot?.href;
  const exp = a.experience?.years;
  const bio = [
    ['Position', a.position?.displayName || a.position?.abbreviation],
    ['Age', a.age],
    ['Height', a.displayHeight],
    ['Weight', a.displayWeight],
    ['College', a.college?.name],
    ['Experience', exp != null ? (exp === 0 ? 'Rookie' : exp + ' yrs') : null],
  ].filter(([, v]) => v != null && v !== '');
  const inj = a.injuries?.find((i) => i.status && i.status !== 'Active');
  const nw = (fanState.researchNews || {})[aid];
  // Canonical ESPN player URL (id + name slug) — the slugged URL universal-links
  // into the ESPN app, whereas a bare /id/N redirects and falls back to a browser.
  const slug = (a.displayName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const espn = `https://www.espn.com/nfl/player/_/id/${esc(a.id)}/${esc(slug)}`;
  const nwWhen = nw?.when ? new Date(nw.when).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
  body.innerHTML = `
    <div class="pl-head">
      ${head ? `<img class="pl-shot" src="${esc(head)}" alt="" onerror="this.style.display='none'">` : ''}
      <div><div class="pl-name">${esc(a.displayName)}</div>
      <div class="pl-sub">${esc([a.position?.abbreviation, a.jersey ? '#' + a.jersey : ''].filter(Boolean).join(' · '))}</div></div>
    </div>
    ${inj ? `<div class="pl-inj">🩹 ${esc(inj.status)}${inj.details?.type ? ' — ' + esc(inj.details.type) : ''}</div>` : ''}
    ${nw ? `<div class="md-section-title">Latest News</div><button class="pl-news-card" id="pl-news-open" type="button"><div class="pl-news-h">${esc(nw.headline)}</div><div class="pl-news-w">${nwWhen ? esc(nwWhen) + ' · ' : ''}tap for in-app summary</div></button>` : ''}
    <div class="pl-bio">${bio.map(([k, v]) => `<div class="pl-b"><span class="pl-bk">${k}</span><span class="pl-bv">${esc(String(v))}</span></div>`).join('')}</div>
    <a class="fan-btn" href="${espn}" target="_blank" rel="noopener" style="display:inline-block;margin-top:14px;text-decoration:none">Full profile &amp; stats on ESPN ↗</a>`;
  if (nw?.article) {
    const btn = body.querySelector('#pl-news-open');
    if (btn) btn.onclick = () => openNewsSummary(nw.article, () => openPlayerModal(aid));
  }
}

// --- Fantasy: NFL mock draft (client-side snake draft vs CPU GMs) ----------
// Built-in SAMPLE big board (~100 players) — for practice, not live ADP.
const MOCK_POOL_RAW = `Ja'Marr Chase|WR|CIN
Bijan Robinson|RB|ATL
Justin Jefferson|WR|MIN
Saquon Barkley|RB|PHI
Jahmyr Gibbs|RB|DET
CeeDee Lamb|WR|DAL
Christian McCaffrey|RB|SF
Amon-Ra St. Brown|WR|DET
Puka Nacua|WR|LAR
Malik Nabers|WR|NYG
De'Von Achane|RB|MIA
Ashton Jeanty|RB|LV
Nico Collins|WR|HOU
Brian Thomas Jr.|WR|JAX
A.J. Brown|WR|PHI
Drake London|WR|ATL
Jonathan Taylor|RB|IND
Derrick Henry|RB|BAL
Brock Bowers|TE|LV
Josh Jacobs|RB|GB
Bucky Irving|RB|TB
Ladd McConkey|WR|LAC
Tee Higgins|WR|CIN
Jaxon Smith-Njigba|WR|SEA
Kyren Williams|RB|LAR
Chase Brown|RB|CIN
Trey McBride|TE|ARI
Garrett Wilson|WR|NYJ
Davante Adams|WR|LAR
Terry McLaurin|WR|WAS
Marvin Harrison Jr.|WR|ARI
James Cook|RB|BUF
Kenneth Walker III|RB|SEA
Breece Hall|RB|NYJ
DK Metcalf|WR|PIT
Mike Evans|WR|TB
DJ Moore|WR|CHI
Josh Allen|QB|BUF
Lamar Jackson|QB|BAL
Jayden Daniels|QB|WAS
Jalen Hurts|QB|PHI
George Kittle|TE|SF
Omarion Hampton|RB|LAC
Alvin Kamara|RB|NO
Rashee Rice|WR|KC
Courtland Sutton|WR|DEN
Jaylen Waddle|WR|MIA
Zay Flowers|WR|BAL
DeVonta Smith|WR|PHI
Chuba Hubbard|RB|CAR
TreVeyon Henderson|RB|NE
Sam LaPorta|TE|DET
James Conner|RB|ARI
Aaron Jones|RB|MIN
Jerry Jeudy|WR|CLE
Calvin Ridley|WR|TEN
Jameson Williams|WR|DET
Tetairoa McMillan|WR|CAR
Patrick Mahomes|QB|KC
Joe Burrow|QB|CIN
RJ Harvey|RB|DEN
Tony Pollard|RB|TEN
David Montgomery|RB|DET
Travis Hunter|WR|JAX
Xavier Worthy|WR|KC
Jordan Addison|WR|MIN
Jakobi Meyers|WR|LV
T.J. Hockenson|TE|MIN
Mark Andrews|TE|BAL
D'Andre Swift|RB|CHI
Isiah Pacheco|RB|KC
Brian Robinson Jr.|RB|WAS
Rome Odunze|WR|CHI
Chris Godwin|WR|TB
Stefon Diggs|WR|NE
Bo Nix|QB|DEN
Baker Mayfield|QB|TB
Kaleb Johnson|RB|PIT
Tyrone Tracy Jr.|RB|NYG
Jaylen Warren|RB|PIT
Khalil Shakir|WR|BUF
Deebo Samuel|WR|WAS
Keon Coleman|WR|BUF
Ricky Pearsall|WR|SF
Dallas Goedert|TE|PHI
David Njoku|TE|CLE
Evan Engram|TE|DEN
Caleb Williams|QB|CHI
Kyler Murray|QB|ARI
Justin Fields|QB|NYJ
Najee Harris|RB|LAC
Rhamondre Stevenson|RB|NE
Jauan Jennings|WR|SF
Cooper Kupp|WR|SEA
Jordan Mason|RB|MIN
Tyler Warren|TE|IND
Colston Loveland|TE|CHI
Dak Prescott|QB|DAL
Brock Purdy|QB|SF
Chris Olave|WR|NO
Brandon Aubrey|K|DAL
Jake Bates|K|DET
Cameron Dicker|K|LAC
Harrison Butker|K|KC
Eagles D/ST|DST|PHI
Ravens D/ST|DST|BAL
Broncos D/ST|DST|DEN
Texans D/ST|DST|HOU
Steelers D/ST|DST|PIT`;
const MOCK_POOL = MOCK_POOL_RAW.trim().split('\n').map((l, i) => {
  const [name, pos, team] = l.split('|');
  return { name, pos, team, rank: i + 1 };
});
const MOCK_CAP = { QB: 2, RB: 6, WR: 7, TE: 2, K: 1, DST: 1, FLEX: 9 };

const mockTeamOnClock = (overall, teams) => {
  const rnd = Math.floor(overall / teams);
  const pos = overall % teams;
  return rnd % 2 === 0 ? pos : teams - 1 - pos;
};
const mockCounts = (roster) => { const c = {}; roster.forEach((p) => { c[p.pos] = (c[p.pos] || 0) + 1; }); return c; };

function mockFiller(m) { m._f = (m._f || 0) + 1; return { name: 'Best Available ' + m._f, pos: 'FLEX', team: '', rank: 900 + m._f }; }

// How many of each position a team wants starting — drives the need boost.
const MOCK_NEED = { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DST: 1 };
// Score a player for a team: steep rank value × positional need × a reach/slide
// factor. Returns -1 for an illegal pick (position full, or K/DST too early) so
// drafts vary by team need and don't play out identically every time.
function mockScore(p, counts, round, rounds) {
  const have = counts[p.pos] || 0;
  if (have >= (MOCK_CAP[p.pos] || 9)) return -1;
  if ((p.pos === 'K' || p.pos === 'DST') && round < rounds - 1) return -1;
  const value = Math.exp(-(p.rank - 1) / 14); // tier-shaped: nearby ranks close, far ranks fall off
  const need = MOCK_NEED[p.pos] || 1;
  let mult = have < need ? 1.5 - 0.12 * have : Math.max(0.2, 0.8 - 0.28 * (have - need));
  if ((p.pos === 'QB' || p.pos === 'TE') && have >= 1 && round < 8) mult *= 0.25; // one early is plenty
  if (p.pos === 'QB' && round < 3) mult *= 0.6;                                    // rarely a top-2-round QB
  const reach = Math.exp((Math.random() - 0.5) * 0.7); // ~0.70–1.42, simulates differing team boards
  return value * mult * reach;
}
function mockCpuChoose(m) {
  if (!m.pool.length) return mockFiller(m);
  const counts = mockCounts(m.rosters[mockTeamOnClock(m.onClock, m.teams)]);
  const round = Math.floor(m.onClock / m.teams) + 1;
  let best = null, bestScore = -Infinity;
  for (const p of m.pool) {
    const s = mockScore(p, counts, round, m.rounds);
    if (s >= 0 && s > bestScore) { bestScore = s; best = p; }
  }
  return best || m.pool.find((p) => (counts[p.pos] || 0) < (MOCK_CAP[p.pos] || 9)) || m.pool[0];
}

function mockAssign(m, teamIdx, player) {
  m.pool = m.pool.filter((p) => p !== player);
  m.picks.push({ overall: m.onClock, round: Math.floor(m.onClock / m.teams) + 1, teamIdx, player });
  m.rosters[teamIdx].push(player);
  m.onClock++;
}
// Auto-run CPU picks until it's the user's turn (or the draft is done).
function mockAdvance(m) {
  const total = m.teams * m.rounds;
  while (m.onClock < total && mockTeamOnClock(m.onClock, m.teams) !== m.userIdx) {
    mockAssign(m, mockTeamOnClock(m.onClock, m.teams), mockCpuChoose(m));
  }
}
const mockDone = (m) => m.onClock >= m.teams * m.rounds;

function mockStart(m) {
  m.userIdx = Math.max(0, Math.min(m.teams - 1, (m.slot || 1) - 1));
  m.pool = MOCK_POOL.slice();
  // The sample board (~100 names) can be shorter than a deep draft needs
  // (e.g. 12 teams × 10 rounds = 120 picks). Pad with generic depth players so
  // the board never empties mid-draft. Filler carries rank ≥900 → shown as "–"
  // and excluded from the draft grade.
  const need = m.teams * m.rounds + 4;
  const fillPos = ['WR', 'RB', 'WR', 'RB', 'TE', 'QB'];
  for (let i = 0; m.pool.length < need; i++) {
    const pos = fillPos[i % fillPos.length];
    m.pool.push({ name: `Depth ${pos} ${Math.floor(i / fillPos.length) + 1}`, pos, team: 'FA', rank: 901 + i });
  }
  m.rosters = Array.from({ length: m.teams }, () => []);
  m.picks = [];
  m.onClock = 0;
  m.setup = false;
  mockAdvance(m);
}
function mockUserPick(m, player) { mockAssign(m, m.userIdx, player); mockAdvance(m); }
function mockSimRest(m) {
  const total = m.teams * m.rounds;
  while (m.onClock < total) {
    const t = mockTeamOnClock(m.onClock, m.teams);
    mockAssign(m, t, mockCpuChoose(m));
  }
}
function mockGrade(m) {
  const mine = m.picks.filter((p) => p.teamIdx === m.userIdx && p.player.rank < 900);
  if (!mine.length) return { letter: '—', diff: 0 };
  const diff = mine.reduce((s, p) => s + ((p.overall + 1) - p.player.rank), 0) / mine.length;
  const letter = diff >= 8 ? 'A+' : diff >= 5 ? 'A' : diff >= 2 ? 'B+' : diff >= -1 ? 'B' : diff >= -4 ? 'C' : diff >= -8 ? 'D' : 'F';
  return { letter, diff };
}

// Lives in the About → Labs card (rendered into #labs-mock).
function closeMockDraft() { fanState.mock = null; const b = $('#labs-mock'); if (b) b.innerHTML = ''; }
function renderMockDraft() {
  const box = $('#labs-mock');
  const m = fanState.mock;
  if (!box || !m) return;

  // Setup screen
  if (m.setup) {
    const slotOpts = () => Array.from({ length: m.teams }, (_, i) => `<option value="${i + 1}"${i + 1 === m.slot ? ' selected' : ''}>${i + 1}</option>`).join('');
    box.innerHTML = `
      <h2 class="section-title">Mock Draft — Setup</h2>
      <div class="setup-card">
        <div class="mock-setrow"><label>Teams</label><select id="mk-teams">${[8, 10, 12, 14].map((n) => `<option value="${n}"${n === m.teams ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="mock-setrow"><label>Your pick</label><select id="mk-slot">${slotOpts()}</select></div>
        <div class="mock-setrow"><label>Rounds</label><select id="mk-rounds">${[6, 8, 10, 12, 15].map((n) => `<option value="${n}"${n === m.rounds ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="fan-actions">
          <button id="mk-go" class="fan-btn">Start draft</button>
          <button id="mk-cancel" class="fan-btn ghost">Cancel</button>
        </div>
      </div>`;
    const teamsSel = box.querySelector('#mk-teams');
    teamsSel.onchange = () => { m.teams = Number(teamsSel.value); if (m.slot > m.teams) m.slot = m.teams; renderMockDraft(); };
    box.querySelector('#mk-slot').onchange = (e) => { m.slot = Number(e.target.value); };
    box.querySelector('#mk-rounds').onchange = (e) => { m.rounds = Number(e.target.value); };
    box.querySelector('#mk-go').onclick = () => { m.slot = Number(box.querySelector('#mk-slot').value); m.rounds = Number(box.querySelector('#mk-rounds').value); mockStart(m); renderMockDraft(); };
    box.querySelector('#mk-cancel').onclick = closeMockDraft;
    return;
  }

  const done = mockDone(m);
  const round = Math.floor(m.onClock / m.teams) + 1;
  const inRound = (m.onClock % m.teams) + 1;
  const teamLabel = (i) => (i === m.userIdx ? 'You' : `Team ${i + 1}`);

  // Your roster panel
  const mine = m.rosters[m.userIdx];
  const posOrder = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST'];
  const teamHTML = posOrder.map((pos) => {
    const list = mine.filter((p) => p.pos === pos);
    if (!list.length) return '';
    return `<div class="pos-h">${pos}</div>` + list.map((p) => `<div class="mk-pick-line">${esc(p.name)} <span class="mk-meta">${esc(p.team || '')}</span></div>`).join('');
  }).join('') || '<div class="muted">No picks yet.</div>';

  // Recent picks log (last 8)
  const log = m.picks.slice(-8).reverse().map((pk) =>
    `<div class="mk-log-row"><span class="mk-meta">R${pk.round} · ${teamLabel(pk.teamIdx)}</span> ${esc(pk.player.name)} <span class="mk-meta">${esc(pk.player.pos)}</span></div>`).join('');

  if (done) {
    const g = mockGrade(m);
    // Every one of your picks, in draft order, with its value vs the slot it was
    // taken (+ = fell to you past its board rank, − = a reach).
    const myPicks = m.picks.filter((p) => p.teamIdx === m.userIdx).sort((a, b) => a.overall - b.overall);
    const picksHTML = myPicks.map((pk) => {
      const slot = pk.overall + 1;
      const real = pk.player.rank < 900;
      const val = real ? slot - pk.player.rank : null;
      const cls = val == null ? 'na' : val > 0 ? 'pos' : val < 0 ? 'neg' : 'zero';
      const txt = val == null ? '–' : (val > 0 ? '+' : '') + val;
      return `<div class="mk-pick"><span class="mk-pk-slot">R${pk.round} · #${slot}</span><span class="mk-pk-name">${esc(pk.player.name)} <span class="mk-meta">${esc(pk.player.pos)}·${esc(pk.player.team || '')}</span></span><span class="mk-pk-val ${cls}">${txt}</span></div>`;
    }).join('');
    box.innerHTML = `
      <div class="setup-card pp-hero"><div class="pp-kicker">🏈 Draft Complete</div>
        <div class="pp-count"><span class="pp-big">${g.letter}</span> your draft grade</div>
        <div class="muted" style="margin-top:6px">Value vs slot: ${g.diff >= 0 ? '+' : ''}${g.diff.toFixed(1)} per pick (positive = you landed players below where they went).</div>
      </div>
      <h2 class="section-title">Your Picks</h2>
      <div class="mk-picks">${picksHTML}</div>
      <div class="muted" style="font-size:11px;margin-top:6px"><b class="mk-pk-val pos">+</b> value (fell to you) · <b class="mk-pk-val neg">−</b> reach vs board rank</div>
      <div class="fan-actions">
        <button id="mk-new" class="fan-btn">New draft</button>
        <button id="mk-exit" class="fan-btn ghost">Close</button>
      </div>`;
    box.querySelector('#mk-new').onclick = () => { fanState.mock = { setup: true, teams: m.teams, slot: m.slot, rounds: m.rounds }; renderMockDraft(); box.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    box.querySelector('#mk-exit').onclick = closeMockDraft;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const filter = m.filter || 'ALL';
  const filterChips = ['ALL', 'QB', 'RB', 'WR', 'TE'].map((f) =>
    `<button class="chip sm${f === filter ? ' active' : ''}" data-mf="${f}">${f === 'ALL' ? 'All' : f}</button>`).join('');

  box.innerHTML = `
    <div class="mk-head">
      <div class="mk-clock">🕐 On the clock: <b>${teamLabel(mockTeamOnClock(m.onClock, m.teams))}</b></div>
      <div class="mk-sub">Round ${round} · Pick ${inRound}/${m.teams} · #${m.onClock + 1} overall</div>
    </div>
    <div class="chips" style="margin-bottom:8px">${filterChips}
      <input id="mk-search" type="text" placeholder="Search…" autocomplete="off" style="flex:1 1 120px;min-width:100px" />
    </div>
    <div id="mk-list" class="mk-board"></div>
    <div class="fan-actions">
      <button id="mk-auto" class="fan-btn">Auto-pick best</button>
      <button id="mk-sim" class="fan-btn ghost">Sim rest</button>
      <button id="mk-exit" class="fan-btn ghost">Exit</button>
    </div>
    <h2 class="section-title">Your Team <span class="season-tag">${mine.length} pick${mine.length === 1 ? '' : 's'}</span></h2>
    <div class="mk-team">${teamHTML}</div>
    <h2 class="section-title">Recent Picks</h2>
    <div class="mk-log">${log || '<div class="muted">Draft just started.</div>'}</div>`;

  const listBox = box.querySelector('#mk-list');
  const searchEl = box.querySelector('#mk-search');
  const paint = () => {
    const q = (searchEl.value || '').toLowerCase().trim();
    const shown = m.pool.filter((p) => (filter === 'ALL' || p.pos === filter) && (!q || p.name.toLowerCase().includes(q))).slice(0, 40);
    listBox.innerHTML = shown.length
      ? shown.map((p) => `<div class="mk-row"><span class="mk-rank">${p.rank < 900 ? p.rank : '–'}</span><span class="mk-nm">${esc(p.name)} <span class="mk-meta">${esc(p.pos)}·${esc(p.team || '')}</span></span><button class="mk-draft" data-rank="${p.rank}">Draft</button></div>`).join('')
      : '<div class="muted" style="padding:8px 2px">No players match.</div>';
    listBox.querySelectorAll('.mk-draft').forEach((b) => (b.onclick = () => {
      const player = m.pool.find((p) => String(p.rank) === b.dataset.rank);
      if (player) { mockUserPick(m, player); renderMockDraft(); }
    }));
  };
  paint();
  box.querySelectorAll('[data-mf]').forEach((b) => (b.onclick = () => { m.filter = b.dataset.mf; renderMockDraft(); }));
  searchEl.oninput = paint;
  box.querySelector('#mk-auto').onclick = () => { mockUserPick(m, mockCpuChoose(m)); renderMockDraft(); };
  box.querySelector('#mk-sim').onclick = () => { mockSimRest(m); renderMockDraft(); };
  box.querySelector('#mk-exit').onclick = closeMockDraft;
}

async function renderFantasy() {
  // Which sports have a real league wired up. Football only appears once its
  // ESPN league is configured on the backend (i.e. in-season) — until then the
  // chip is hidden so the tab never shows a hollow football view.
  const cfg = await leagueConfig();
  // Baseball has a live category league; Football is shown year-round for
  // preseason prep (its live-league sections will come once an NFL league is
  // wired up and in season).
  const sports = [['baseball', '⚾ Baseball'], ['football', '🏈 Football']];
  if (!sports.some(([s]) => s === fanState.sport)) fanState.sport = 'baseball';

  // sport chips
  const chips = $('#fantasy-sport');
  chips.innerHTML = '';
  sports.forEach(([s, label]) => {
    const c = el('button', 'chip' + (s === fanState.sport ? ' active' : ''), label);
    c.onclick = () => { fanState.sport = s; renderFantasy(); };
    chips.appendChild(c);
  });

  // Football = preseason-prep view for now. Swap out the live-league (baseball)
  // sections and render the prep tools, then rebuild the jump nav and stop.
  const liveWrap = $('#fantasy-live');
  const fbBox = $('#fantasy-football');
  if (fanState.sport === 'football') {
    if (liveWrap) liveWrap.style.display = 'none';
    renderFantasyFootball();
    injectJumpNav('fantasy');
    return;
  }
  if (liveWrap) liveWrap.style.display = '';
  if (fbBox) fbBox.innerHTML = '';

  const leagueKey = fanState.sport === 'baseball' ? 'mlb' : 'nfl';
  let games = [];
  try { games = await getGames(leagueKey, ymd(sportsDate())); } catch (_) {}
  fanState.gamesByTeam = buildGameIndex(games);

  // Pull the real ESPN league once per session (overwrites the saved roster).
  // Falls back silently to the locally-saved/manual roster if the backend is
  // unreachable or this sport's league isn't configured.
  fanState.synced = fanState.synced || {};
  if (cfg[fanState.sport] && (!fanState.synced[fanState.sport] || fanState.forceSync)) {
    await syncFromLeague(fanState.sport, !!fanState.forceSync);
    fanState.synced[fanState.sport] = true;
    fanState.forceSync = false;
  }
  renderLeagueHeader(fanState.sport);
  renderMatchup(fanState.sport);
  renderProjection(fanState.sport);
  renderFantasyStandings(fanState.sport);
  renderPlayoffs(fanState.sport);
  // Reset cross-render state that the add/drop pairing + category strengths
  // build up asynchronously, so stale data from another sport can't leak in.
  fanState.faHot = null; fanState.dropCandidates = null; fanState.dropPool = null; fanState.catNeeds = null;
  const adBox = $('#fantasy-adddrop'); if (adBox) adBox.innerHTML = '';
  const csBox = $('#fantasy-strength'); if (csBox) csBox.innerHTML = '';
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
      const teamSel = `<select data-i="${i}" data-f="team"><option value="">— set team —</option>${teamOpts.map((t) => `<option ${t === p.team ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
      const statSel = `<select data-i="${i}" data-f="status">${['active','bench','il'].map((s) => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${s === 'active' ? 'Starter' : s === 'bench' ? 'Bench' : 'IL'}</option>`).join('')}</select>`;
      item.innerHTML = `
        <div class="fan-head">
          <span class="arrow" id="farrow-${i}"></span>
          <span class="fh-name">${esc(p.name)}</span>
          <span class="fh-meta">${esc(p.slot)}${teamAbbr ? ' · ' + esc(teamAbbr) : ''}</span>
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

  scheduleLiveRefresh();
}

// While any roster game is live AND the Fantasy tab is open, re-pull every 5
// min so the matchup scoreboard + live stat lines stay current without the user
// tapping 🔄. Cleared/re-armed on each render; stops once no game is live or the
// user leaves the tab. 5-min cadence matches the backend's league cache TTL.
function scheduleLiveRefresh() {
  if (fanState.refreshTimer) { clearTimeout(fanState.refreshTimer); fanState.refreshTimer = null; }
  const anyLive = Object.values(fanState.gamesByTeam || {}).some((pg) => gameState(pg.g) === 'live');
  const onTab = document.getElementById('fantasy')?.classList.contains('active');
  if (!anyLive || !onTab) return;
  fanState.refreshTimer = setTimeout(() => {
    if (document.getElementById('fantasy')?.classList.contains('active')) {
      fanState.forceSync = true;
      renderFantasy();
    }
  }, 300000);
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
async function syncFromLeague(sport, force = false) {
  try {
    // On a forced refresh, clear the backend's in-memory league cache first,
    // then cache-bust our own fetchJSON cache so we truly re-pull from ESPN
    // instead of getting a stale snapshot from either layer.
    let bust = '';
    if (force) {
      try { await fetch(`${FANTASY_API}/api/refresh`, { cache: 'no-store' }); } catch (_) {}
      bust = `_=${Date.now()}`;
    }
    const q = (extra) => { const p = [bust, extra].filter(Boolean); return p.length ? `?${p.join('&')}` : ''; };
    const data = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/roster${q()}`, 60000);
    const roster = (data.roster || []).map((p) => ({
      name: p.name,
      slot: p.lineupSlot || p.pos || 'BE',
      pos: p.pos || '',
      status: p.status || 'active',
      team: sport === 'baseball' ? proTeamToFull(p.proTeam) : '',
    }));
    if (!roster.length) return false;
    saveRoster(sport, roster);
    let matchup = null, standings = null, freeAgents = null, opponent = null, catranks = null, playoffs = null;
    try { matchup = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/matchup${q()}`, 60000); } catch (_) {}
    try { standings = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/standings${q()}`, 60000); } catch (_) {}
    try { freeAgents = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/freeagents${q('size=40')}`, 300000); } catch (_) {}
    try { opponent = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/opponent${q()}`, 60000); } catch (_) {}
    try { catranks = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/catranks${q()}`, 60000); } catch (_) {}
    try { playoffs = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/playoffs${q('slots=6')}`, 60000); } catch (_) {}
    fanState.league = fanState.league || {};
    fanState.league[sport] = { team: data.team, record: data.record, matchup, standings, freeAgents, opponent, catranks, playoffs, syncedAt: Date.now() };
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
  const syncedTxt = L.syncedAt
    ? (Date.now() - L.syncedAt < 60000 ? 'synced just now' : `synced ${timeAgo(L.syncedAt)}`)
    : 'synced from ESPN';
  box.innerHTML = `<div class="lg-card">
      <div class="lg-top"><span class="lg-name">${esc(L.team || 'My Team')}</span>${rec ? `<span class="lg-rec">${rec}</span>` : ''}<span class="lg-live">● ${syncedTxt}</span></div>
      <button id="lg-resync" class="fan-btn ghost">🔄 Refresh from ESPN</button>
    </div>`;
  const btn = $('#lg-resync');
  if (btn) btn.onclick = async () => { btn.textContent = '🔄 Refreshing…'; fanState.forceSync = true; await renderFantasy(); };
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
    return `<div class="cat ${cls}"><div class="cat-name">${esc(c.cat)}</div>
      <div class="cat-vals"><b>${fmtCat(c.cat, c.me)}</b><span>${fmtCat(c.cat, c.opp)}</span></div></div>`;
  }).join('');
  box.innerHTML = `<div class="mu-card">
      <div class="mu-top">
        <span class="mu-team you">${esc(m.me.team)}</span>
        <span class="mu-score"><b class="${won > lost ? 'lead' : ''}">${won}</b> – <b class="${lost > won ? 'lead' : ''}">${lost}</b>${tied ? ` <small>(${tied} tied)</small>` : ''}</span>
        <span class="mu-team">${esc(m.opponent.team)}</span>
      </div>
      <div class="mu-cats">${cats}</div>
      <div class="mu-legend">This week · your value vs opponent · <span class="win">green = winning the category</span></div>
    </div>`;
}

// --- weekly win-probability meter -------------------------------------------
// How far through the Mon–Sun fantasy week we are (ET), by the hour.
function weekProgress() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dayIdx = (et.getDay() + 6) % 7; // Mon=0 … Sun=6
  return clamp((dayIdx + et.getHours() / 24) / 7, 0.02, 0.98);
}
// Typical week-to-week spread of each rate cat — normalizes "how big is this lead".
const RATE_SD = { ERA: 1.2, WHIP: 0.18, OPS: 0.09, AVG: 0.035, OBP: 0.04, SLG: 0.055 };
const isRateCat = (c) => /ERA|WHIP|OPS|AVG|OBP|SLG|PCT/i.test(c);
// Estimate P(win the week) from the current category margins and time left:
// counting cats = can the margin survive the remaining volume (Poisson-ish
// variance on what's still to be played); rate cats = does the lead hold as
// the remaining sample shrinks. Per-cat probabilities combine via a
// Poisson-binomial DP into P(more cats won than lost); 50/50 on exact splits
// and per-cat ties. A pace-free heuristic — NOT an official ESPN projection.
function matchupWinProb(m) {
  const phi = (z) => 1 / (1 + Math.exp(-1.702 * z)); // logistic ≈ normal CDF
  const prog = weekProgress(), rem = 1 - prog;
  const ps = [];
  (m.categories || []).forEach((c) => {
    const me = Number(c.me), opp = Number(c.opp);
    if (Number.isNaN(me) || Number.isNaN(opp)) return;
    const name = (c.cat || '').toUpperCase();
    let p;
    if (me === opp) { p = 0.5; }
    else if (isRateCat(name)) {
      const margin = /ERA|WHIP/.test(name) ? opp - me : me - opp; // reverse cats: lower wins
      const sd = RATE_SD[name] ?? Math.max(Math.abs(me), Math.abs(opp), 0.1) * 0.12;
      p = phi(clamp((margin / sd) * Math.sqrt(prog / (rem + 0.08)), -3.5, 3.5));
    } else {
      const margin = me - opp;
      const expRem = Math.max(((me + opp) * rem) / Math.max(prog, 0.05), 0.5); // volume still to come
      p = phi(clamp(margin / Math.sqrt(expRem + 2), -3.5, 3.5));
    }
    // ESPN can score a cat against the raw values (e.g. pitching rate cats
    // lost to the weekly innings minimum). When its result contradicts the
    // value-implied leader, call the cat a coin flip rather than pretend the
    // raw margin is winning.
    const res = (c.result || '').toUpperCase();
    if ((res === 'LOSS' && p > 0.5) || (res === 'WIN' && p < 0.5)) p = 0.5;
    ps.push(p);
  });
  if (!ps.length) return null;
  let dp = [1];
  ps.forEach((p) => {
    const nd = new Array(dp.length + 1).fill(0);
    dp.forEach((v, k) => { nd[k] += v * (1 - p); nd[k + 1] += v * p; });
    dp = nd;
  });
  let win = 0;
  dp.forEach((v, k) => { if (k * 2 > ps.length) win += v; else if (k * 2 === ps.length) win += v / 2; });
  return { p: win, prog, daysLeft: rem * 7 };
}

// Project this week's category matchup: a quick verdict (leading/trailing/tied)
// plus which CLOSE categories are still in play to target (flip) or defend.
// Pure client-side read of the same weekly totals renderMatchup already shows —
// no projection of remaining games, just "where the week is winnable right now".
function renderProjection(sport) {
  const box = $('#fantasy-projection');
  if (!box) return;
  const m = ((fanState.league || {})[sport] || {}).matchup;
  if (!m || !m.me || !m.categories || !m.categories.length) { box.innerHTML = ''; return; }
  const won = m.me.catsWon ?? 0, lost = m.opponent.catsWon ?? 0, tied = m.tied ?? 0;
  const target = [], defend = [];
  m.categories.forEach((c) => {
    const me = Number(c.me), opp = Number(c.opp);
    if (Number.isNaN(me) || Number.isNaN(opp)) return;
    const rel = Math.abs(me - opp) / (Math.max(Math.abs(me), Math.abs(opp)) || 1);
    const bothInt = Number.isInteger(me) && Number.isInteger(opp);
    const close = rel <= 0.10 || (bothInt && Math.abs(me - opp) <= 2);
    if (!close) return;
    if (c.result === 'WIN') defend.push(c.cat);   // winning but within a hair
    else target.push(c.cat);                       // losing/tied but reachable
  });
  const verdict = won > lost ? `Leading ${won}–${lost}` : won < lost ? `Trailing ${won}–${lost}` : `Tied ${won}–${lost}`;
  const vcls = won > lost ? 'win' : won < lost ? 'loss' : 'tie';
  const chips = (arr) => arr.map((c) => `<span class="pj-chip">${esc(c)}</span>`).join('');
  const hasSwing = target.length || defend.length;
  // win-probability meter: current margins vs the time left in the week
  const wp = matchupWinProb(m);
  let meter = '';
  if (wp) {
    const pct = Math.round(wp.p * 100);
    const cls = pct >= 55 ? 'win' : pct >= 45 ? 'tie' : 'loss';
    const days = wp.daysLeft >= 1 ? `${wp.daysLeft.toFixed(1).replace(/\.0$/, '')} days` : 'final day';
    meter = `<div class="pj-prob">
        <div class="pj-prob-top"><span class="pj-lbl">📊 Projected win probability</span><b class="pj-prob-val ${cls}">${pct}%</b></div>
        <div class="pj-meter"><span class="pj-meter-fill ${cls}" style="width:${pct}%"></span><span class="pj-meter-mid"></span></div>
        <div class="pj-prob-note">${days} left · from current category margins vs time remaining — an estimate, not ESPN's projection</div>
      </div>`;
  }
  box.innerHTML = `<div class="pj-card">
      <div class="pj-top"><span class="pj-verdict ${vcls}">${verdict}</span>${tied ? `<span class="pj-tied">${tied} tied</span>` : ''}</div>
      ${meter}
      ${target.length ? `<div class="pj-row"><span class="pj-lbl">🎯 Target</span><span class="pj-chips">${chips(target)}</span></div>` : ''}
      ${defend.length ? `<div class="pj-row"><span class="pj-lbl">🛡 Defend</span><span class="pj-chips">${chips(defend)}</span></div>` : ''}
      <div class="pj-note">${hasSwing ? 'Close categories still in play — focus adds & start/sit here.' : 'No close categories — this week looks decided.'}</div>
    </div>`;
}

// League standings / power rankings table (toggle between the two sorts).
function renderFantasyStandings(sport) {
  const box = $('#fantasy-standings');
  if (!box) return;
  const S = ((fanState.league || {})[sport] || {}).standings;
  if (!S || !S.teams || !S.teams.length) { box.innerHTML = ''; return; }

  // Category power (from /catranks): how much a team's SEASON category totals
  // dominate the league — sum of (teams beaten + 1) across every scored cat, so
  // a #1 finish is worth the most. A roster-strength read that record alone
  // misses early in the year. Keyed by teamId.
  const C = ((fanState.league || {})[sport] || {}).catranks;
  const catPow = {};
  if (C && Array.isArray(C.teams)) {
    C.teams.forEach((t) => {
      let p = 0;
      Object.values(t.cats || {}).forEach((c) => { if (c && c.rank && c.of) p += (c.of - c.rank + 1); });
      catPow[String(t.teamId)] = p;
    });
  }
  const haveCats = Object.keys(catPow).length > 0;

  let sortBy = fanState.standSort || 'standing';
  if (sortBy === 'cats' && !haveCats) sortBy = 'standing';
  const teams = [...S.teams].sort((a, b) => {
    if (sortBy === 'power') return (b.powerScore || 0) - (a.powerScore || 0);
    if (sortBy === 'cats') return (catPow[String(b.teamId)] || 0) - (catPow[String(a.teamId)] || 0);
    return (a.standing || 99) - (b.standing || 99);
  });

  // Last column is dynamic: Power score, or Category power when that sort is on.
  const lastHead = sortBy === 'cats' ? 'CatPwr' : 'Power';
  const maxPow = Math.max(...teams.map((t) => t.powerScore || 0), 1);
  const maxCat = Math.max(...Object.values(catPow), 1);
  const rows = teams.map((t, i) => {
    const rec = `${t.wins ?? 0}-${t.losses ?? 0}${t.ties ? '-' + t.ties : ''}`;
    const l5 = (t.last5 || '').split('').map((c) => `<span class="f-${c.toLowerCase()}">${c}</span>`).join('');
    const useCat = sortBy === 'cats';
    const val = useCat ? (catPow[String(t.teamId)] ?? null) : (t.powerScore ?? null);
    const barW = Math.round(100 * ((useCat ? (catPow[String(t.teamId)] || 0) / maxCat : (t.powerScore || 0) / maxPow)));
    return `<tr class="${t.isMe ? 'me' : ''}">
        <td class="st-rank">${i + 1}</td>
        <td class="st-team">${esc(t.team)}${t.isMe ? ' <span class="st-you">you</span>' : ''}</td>
        <td class="st-rec">${rec}</td>
        <td class="st-l5">${l5 || '—'}</td>
        <td class="st-pow"><span class="pow-bar" style="width:${barW}%"></span><span class="pow-num">${val ?? '–'}</span></td>
      </tr>`;
  }).join('');
  box.innerHTML = `
    <h2 class="section-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">League Analyzer
      <span class="chips st-toggle" style="margin:0">
        <button class="chip ${sortBy === 'standing' ? 'active' : ''}" data-s="standing">Standings</button>
        <button class="chip ${sortBy === 'power' ? 'active' : ''}" data-s="power">Power</button>
        ${haveCats ? `<button class="chip ${sortBy === 'cats' ? 'active' : ''}" data-s="cats">Category</button>` : ''}
      </span></h2>
    <table class="st-table"><thead><tr><th></th><th>Team</th><th>Rec</th><th>L5</th><th>${lastHead}</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="none" style="margin-top:6px">${sortBy === 'cats'
      ? 'Category power = how much each team’s season totals dominate the league across all scored cats (higher = stronger roster).'
      : sortBy === 'power' ? 'Power = 60% record + 40% recent form.' : 'Sorted by league standing.'}</div>`;
  box.querySelectorAll('.st-toggle .chip').forEach((b) => {
    b.onclick = () => { fanState.standSort = b.dataset.s; renderFantasyStandings(sport); };
  });
}

// Playoff Predictor: Monte-Carlo odds from the backend /playoffs sim (each
// remaining matchup decided by season category strength). Rows are pre-sorted
// by odds; a dashed line marks the playoff cut (top `slots`). Inline styles
// (per the v74 visibility lesson) so it renders regardless of stylesheet.
function renderPlayoffs(sport) {
  const box = $('#fantasy-playoffs');
  if (!box) return;
  const P = ((fanState.league || {})[sport] || {}).playoffs;
  if (sport !== 'baseball' || !P || !Array.isArray(P.teams) || !P.teams.length) { box.innerHTML = ''; return; }
  const slots = P.slots || 6;
  const wkLeft = P.gamesLeft || 0;
  const me = P.teams.find((t) => t.isMe);
  const oddColor = (o) => o >= 85 ? '#3ad29f' : o >= 50 ? '#ffd166' : o >= 15 ? '#e0a458' : '#8a93a3';
  const tag = (t) => t.clinched ? ' 🔒' : t.eliminated ? ' ❌' : '';
  const rows = P.teams.map((t, i) => {
    const rec = `${t.wins ?? 0}-${t.losses ?? 0}${t.ties ? '-' + t.ties : ''}`;
    const o = t.playoffOdds;
    const col = oddColor(o);
    const cut = i === slots ? 'border-top:2px dashed rgba(255,209,102,.55);' : '';
    const bg = t.isMe ? 'background:rgba(58,210,159,.10);' : '';
    return `<div style="${cut}${bg}display:grid;grid-template-columns:22px 1fr auto;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.06)">
        <div style="opacity:.6;font-size:.85em;text-align:center">${i + 1}</div>
        <div style="min-width:0">
          <div style="font-weight:700;color:#e8efed;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.team)}${t.isMe ? ' <span style="color:#3ad29f;font-size:.8em">you</span>' : ''}${tag(t)}</div>
          <div style="height:5px;border-radius:3px;background:rgba(255,255,255,.08);margin-top:4px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(2, Math.round(o))}%;background:${col}"></span></div>
        </div>
        <div style="text-align:right;min-width:92px">
          <div style="font-weight:800;color:${col}">${o}%</div>
          <div style="opacity:.55;font-size:.78em">${rec} · proj ${t.projWins}</div>
        </div>
      </div>`;
  }).join('');
  const model = P.usedCategoryModel ? 'category-strength model' : 'record-based';
  const verdict = me ? `You: <b style="color:${oddColor(me.playoffOdds)}">${me.playoffOdds}% to make it</b> (proj seed ${me.avgSeed}). ` : '';
  box.innerHTML = `<h2 class="section-title">Playoff Predictor</h2>
    <div class="none" style="margin-bottom:8px">${verdict}${slots}-team playoff · ${wkLeft} ${wkLeft === 1 ? 'week' : 'weeks'} to go · ${(P.sims || 0).toLocaleString()} sims · ${model}. Dashed line = playoff cut.</div>
    <div style="border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden">${rows}</div>`;
}

// Run any player list through the same recent-form engine the roster uses;
// returns each player annotated with its hot/cold tag (baseball only).
async function computeRosterForm(players, fSport) {
  if (fSport !== 'baseball') return [];
  const sport = 'mlb';
  const idx = await baseballPlayerIndex().catch(() => ({}));
  players.forEach((p) => { p._team = p.team || idx[nameKey(p.name)] || ''; });
  const teams = [...new Set(players.map((p) => p._team).filter(Boolean))];
  // Resolve team IDs the same way fillSeasonStats does: start from the /teams
  // endpoint, then overlay today's live scoreboard IDs (the source proven to
  // work in-browser). Without the scoreboard overlay, resolution often fails.
  const ids = await leagueTeamIds(sport).catch(() => ({}));
  Object.entries(fanState.gamesByTeam || {}).forEach(([name, pg]) => {
    const id = pg.side === 'home' ? pg.g.home.id : pg.g.away.id;
    if (id) ids[name.toLowerCase()] = id;
  });
  const idMaps = {};
  await Promise.all(teams.map(async (t) => {
    const id = ids[t.toLowerCase()]; if (!id) return;
    idMaps[t] = await rosterIdMap(sport, id).catch(() => ({}));
  }));
  const out = [];
  await Promise.all(players.map(async (p) => {
    const aid = p._team ? (idMaps[p._team] || {})[nameKey(p.name)] : null;
    const hc = aid ? hotCold(fSport, await athleteGamelog(sport, aid).catch(() => null), p.isPitcher) : null;
    out.push({ ...p, team: p._team, hc });
  }));
  return out;
}

// Sort key: hot first, then steady, then cold.
const formRank = (p) => (p.hc && p.hc.tag === 'hot') ? 0 : (p.hc && p.hc.tag === 'cold') ? 2 : 1;

// One row: name (+ hot/cold icon), position·team·meta, recent-form line.
function playerFormRow(p, meta) {
  const tag = p.hc && p.hc.tag;
  const icon = tag === 'hot' ? '🔥 ' : tag === 'cold' ? '🥶 ' : '';
  const abbr = MLB_ABBR[p.team] || '';
  const line = p.hc ? (p.hc.lead || p.hc.detail || '') : '';
  return `<div class="wv-item ${tag || ''}">
      <div class="wv-main"><span class="wv-name">${icon}${esc(p.name)}</span>
        <span class="wv-meta">${esc(p.pos)}${abbr ? ' · ' + esc(abbr) : ''}${meta ? ' · ' + esc(meta) : ''}</span></div>
      <div class="wv-hot">${line ? `<span class="hc-tag ${tag || 'flat'}">${line}</span>` : '<span class="hc-detail">recent form n/a</span>'}</div>
    </div>`;
}

async function renderWaivers(sport) {
  const box = $('#fantasy-waivers');
  if (!box) return;
  const fa = ((fanState.league || {})[sport] || {}).freeAgents;
  if (sport !== 'baseball' || !fa || !fa.players || !fa.players.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<h2 class="section-title">Waiver Wire — Top Available</h2><div class="none">Scanning available players for recent form…</div>';
  const form = await computeRosterForm(fa.players.slice(0, 30), sport);
  if (fanState.sport !== sport) return; // user switched away while scanning
  // Hot pickups first, then by ownership (most-rostered = most relevant).
  form.sort((a, b) => formRank(a) - formRank(b) || (b.owned ?? 0) - (a.owned ?? 0));
  const hotCount = form.filter((p) => p.hc && p.hc.tag === 'hot').length;
  const rows = form.slice(0, 12).map((p) => {
    const owned = p.owned != null && p.owned >= 0 ? `${Math.round(p.owned)}% owned` : '';
    return playerFormRow(p, owned);
  }).join('');
  const runLbl = nextWaiverRunLabel();
  box.innerHTML = `<h2 class="section-title">Waiver Wire — Top Available</h2>
    <div class="none" style="margin-bottom:8px">Best available players in your league${hotCount ? ` — <span style="color:var(--accent)">🔥 ${hotCount} trending hot</span>` : ''}. Hot streaks listed first.${runLbl ? ` <span class="wv-run">⏰ ${runLbl}</span>` : ''}</div>
    <div class="wv-list">${rows}</div>`;

  // Stash the hottest available players so renderAddDrop can pair them with the
  // coldest droppable roster players (the other half comes from fillSeasonStats;
  // whichever finishes last renders the pairing).
  fanState.faHot = form.filter((p) => p.hc && p.hc.tag === 'hot')
    .map((p) => ({ name: p.name, isPitcher: !!p.isPitcher, lead: (p.hc && p.hc.lead) || '', owned: p.owned }));
  renderAddDrop(sport);
}

// Waivers in the owner's league process Wed & Sun at 11 PM ET. Surface the next
// run so pickups are framed around when they'd actually go through (you can't
// stream a player for "today" — adds clear only on those two nights).
function nextWaiverRun() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  for (let add = 0; add < 8; add++) {
    const d = new Date(et);
    d.setDate(et.getDate() + add);
    d.setHours(23, 0, 0, 0);
    if ((d.getDay() === 0 || d.getDay() === 3) && d > et) return d; // Sun=0, Wed=3
  }
  return null;
}
function nextWaiverRunLabel() {
  const d = nextWaiverRun();
  if (!d) return '';
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const sameDay = d.toDateString() === et.toDateString();
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
  return `Next waiver run: ${sameDay ? 'tonight' : day} 11 PM ET`;
}

// Turn the hottest available free agents into concrete suggestions. Each hot
// pickup is paired with a same-type roster player to drop (hitter↔hitter,
// pitcher↔pitcher): a cold/drop-watch player first, else the weakest droppable
// roster spot. If you have hot pickups but no clearly droppable player, we still
// surface the add with an "open a roster spot" note rather than show a bare,
// empty heading. Needs faHot (renderWaivers); dropPool/dropCandidates come from
// fillSeasonStats — whichever finishes last renders the suggestions.
function renderAddDrop(sport) {
  const box = $('#fantasy-adddrop');
  if (!box) return;
  if (sport !== 'baseball' || fanState.sport !== sport) { box.innerHTML = ''; return; }
  const head = '<h2 class="section-title">Suggested Moves</h2>';
  const note = (msg) => { box.innerHTML = `${head}<div class="none" style="margin-bottom:4px">${msg}</div>`; };
  try {
    const adds = (fanState.faHot || []).slice();
    // No hot pickups loaded yet → say so plainly rather than leave a blank gap.
    if (!adds.length) { note('No hot free agents to suggest right now — check the Waiver Wire below.'); return; }
    const cold = fanState.dropCandidates || [], pool = fanState.dropPool || [];
    const needs = fanState.catNeeds || { hitters: [], pitchers: [] };
    const needLabel = (a) => (a.isPitcher ? needs.pitchers : needs.hitters).join('/');
    const helpsNeed = (a) => !!needLabel(a);
    // Pickups that fill a THIN category (from Category Strengths) sort first.
    adds.sort((a, b) => (helpsNeed(b) ? 1 : 0) - (helpsNeed(a) ? 1 : 0));
    const used = new Set();
    const pickDrop = (a) => {
      let d = cold.find((x) => x.isPitcher === a.isPitcher && !used.has(x.name));
      if (!d) d = pool.find((x) => x.isPitcher === a.isPitcher && !used.has(x.name));
      if (d) used.add(d.name);
      return d || null;
    };
    const moves = adds.slice(0, 3).map((a) => ({ a, drop: pickDrop(a) }));
    // NOTE: rendered with INLINE styles (no class dependency). An identical
    // class-based version rendered invisibly on the owner's device despite the
    // cards being present in the DOM and the CSS being valid — cause unknown, so
    // we inline the essentials to guarantee they show regardless of stylesheet.
    const chip = (color, bg, label) => `<span style="display:inline-block;color:${color};background:${bg};font-weight:800;font-size:11px;padding:1px 6px;border-radius:6px;margin-right:5px">${label}</span>`;
    const lineCss = 'font-size:13.5px;color:#e8efed;line-height:1.45';
    const leadCss = 'color:#a5acaf;font-size:12px';
    const dropLine = (drop) => drop
      ? `<div style="${lineCss}">${chip('#ffd166', 'rgba(255,209,102,.16)', '－ DROP')}${esc(drop.name)}${drop.lead ? ` <span style="${leadCss}">${esc(drop.lead)}</span>` : ''}</div>`
      : `<div style="${lineCss};color:#a5acaf">${chip('#a5acaf', 'rgba(255,255,255,.1)', '🆓 OPEN')}open a roster spot to add</div>`;
    const rows = moves.map(({ a, drop }) => {
      const need = helpsNeed(a) ? ` <span style="color:#3ad29f;font-size:11.5px;font-weight:700">🎯 fills ${esc(needLabel(a))} need</span>` : '';
      return `<div style="background:#16211f;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;margin-bottom:8px">`
        + `<div style="${lineCss};margin-bottom:4px">${chip('#3ad29f', 'rgba(58,210,159,.16)', '＋ ADD')}<b>${esc(a.name)}</b>${a.lead ? ` <span style="${leadCss}">${esc(a.lead)}</span>` : ''}${need}</div>`
        + `${dropLine(drop)}</div>`;
    }).join('');
    const needLine = (needs.hitters.length || needs.pitchers.length)
      ? `Prioritizing your thin categories (${esc([...needs.hitters, ...needs.pitchers].join(', '))}). `
      : '';
    box.innerHTML = `${head}
    <div class="none" style="margin-bottom:8px">${needLine}Hot free agents worth adding, paired with a cold or weak same-position player to drop where you have one. Adds clear ${esc(nextWaiverRunLabel().replace('Next waiver run: ', '') || 'on waiver night')}.</div>
    <div>${rows}</div>`;
  } catch (e) {
    note(`Couldn’t build suggestions: ${esc(String((e && e.message) || e))}`);
  }
  // Async fantasy sections (Waiver Wire, Category Strengths, Suggested Moves)
  // finish after the initial jump-nav is built, so refresh it now that their
  // headings exist. This is the terminal call in each async flow.
  injectJumpNav('fantasy');
}

// Opponent overview: a head-to-head SEASON comparison — my team vs this week's
// opponent in each scored category, so you can see at a glance where you stack
// up. Totals + league rank come from the backend /catranks endpoint; lower rank
// = better (reverse categories like ERA/WHIP are already handled server-side).
function renderOpponent(sport) {
  const box = $('#fantasy-opponent');
  if (!box) return;
  const C = ((fanState.league || {})[sport] || {}).catranks;
  if (sport !== 'baseball' || !C || !C.categories || !C.categories.length || !Array.isArray(C.teams)) {
    box.innerHTML = ''; return;
  }
  const me = C.teams.find((t) => t.isMe);
  const opp = C.teams.find((t) => t.isOpp);
  if (!me || !opp) { box.innerHTML = ''; return; }

  let win = 0, lose = 0, tie = 0;
  const rows = C.categories.map((cat) => {
    const mc = (me.cats || {})[cat], oc = (opp.cats || {})[cat];
    const mr = mc ? mc.rank : null, or_ = oc ? oc.rank : null;
    // Lower rank wins. Missing data → no verdict for that row.
    let meWins = null;
    if (mr != null && or_ != null) { meWins = mr < or_ ? true : mr > or_ ? false : null; if (meWins === true) win++; else if (meWins === false) lose++; else tie++; }
    const cell = (c, isWin) => {
      const val = c ? fmtCat(cat, c.value) : '–';
      const rk = c ? ` <span style="opacity:.6;font-size:.8em">#${c.rank}</span>` : '';
      const col = isWin === true ? 'var(--accent)' : isWin === false ? 'var(--muted,#8a93a3)' : 'var(--text,#e6e9ef)';
      return `<span style="font-weight:700;color:${col}">${val}${rk}</span>`;
    };
    return `<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.06)">
        <div style="text-align:right">${cell(mc, meWins === true)}</div>
        <div style="text-align:center;font-size:.78em;letter-spacing:.04em;opacity:.7;min-width:46px">${esc(cat)}</div>
        <div style="text-align:left">${cell(oc, meWins === false)}</div>
      </div>`;
  }).join('');

  box.innerHTML = `<h2 class="section-title">How You Stack Up — vs ${esc(opp.team)}</h2>
    <div class="none" style="margin-bottom:8px">Season category totals · <b>you ${win}</b> – ${lose} ${opp.team ? '' : ''}${tie ? `· ${tie} even ` : ''}vs ${esc(opp.team)} (across ${C.teamCount || '–'} teams; <span style="opacity:.6">#rank</span>). <span style="color:var(--accent)">Green = you're ahead.</span></div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:4px 10px;font-size:.74em;letter-spacing:.04em;opacity:.7">
        <div style="text-align:right;font-weight:700">YOU</div><div style="text-align:center">CAT</div><div style="text-align:left;font-weight:700">${esc(opp.team).toUpperCase()}</div>
      </div>
    ${rows}`;
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

  const hot = [], cold = [], drops = [], dropPool = [], hitStats = [], pitStats = [];
  await Promise.all(roster.map(async (p, i) => {
    const seasEl = document.getElementById(`fseas-${i}`);
    const trendEl = document.getElementById(`ftrend-${i}`);
    const arrowEl = document.getElementById(`farrow-${i}`);
    const leadEl = document.getElementById(`flead-${i}`);
    if (!seasEl) return;
    if (!p.team) { seasEl.textContent = 'set a team to load stats'; return; }
    const sraw = (sMaps[p.team] || {})[nameKey(p.name)];
    let season = seasonLine(fSport, p, sraw);
    // Roster category profile (baseball): collect each player's season stats.
    if (fSport === 'baseball' && sraw) {
      const num = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? null : n; };
      if (isPitcher(p)) pitStats.push({ ERA: num(sraw.ERA), WHIP: num(sraw.WHIP), K: num(sraw.K), W: num(sraw.W) });
      else hitStats.push({ HR: num(sraw.HR), RBI: num(sraw.RBI), OPS: num(sraw.OPS), AVG: num(sraw.AVG) });
    }
    // Season value — so Suggested Moves NEVER tells you to drop a real contributor.
    // `essential` = a genuine producer (a good rate stat or real counting totals);
    // `weakKey` ranks the rest weakest-first. Rate stats (OPS/ERA/WHIP) are the safe
    // signal. A player with no season stats stays OUT of the drop pool entirely, so
    // we never recommend cutting someone we simply couldn't match/value.
    let essential = false, weakKey = null, weakHint = '';
    if (fSport === 'baseball' && sraw) {
      const num = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? null : n; };
      if (isPitcher(p)) {
        const era = num(sraw.ERA), whip = num(sraw.WHIP), k = num(sraw.K), w = num(sraw.W);
        essential = (era != null && era <= 3.90) || (whip != null && whip <= 1.25) || (k != null && k >= 100) || (w != null && w >= 8);
        weakKey = era != null ? -era : -99;          // higher ERA → weaker → sorted first
        if (era != null) weakHint = `${era.toFixed(2)} ERA`;
      } else {
        const ops = num(sraw.OPS), hr = num(sraw.HR), rbi = num(sraw.RBI);
        essential = (ops != null && ops >= 0.760) || (hr != null && hr >= 16) || (rbi != null && rbi >= 50);
        weakKey = ops != null ? ops : -1;            // lower OPS → weaker → sorted first
        if (ops != null) weakHint = `${ops.toFixed(3)} OPS`;
      }
    }
    let tag = '', lead = '';
    const aid = (idMaps[p.team] || {})[nameKey(p.name)];
    if (aid) {
      const hc = hotCold(fSport, await athleteGamelog(sport, aid).catch(() => null), isPitcher(p));
      if (hc) {
        if (!season && hc.season) season = hc.season; // gamelog fallback for non-leaders
        tag = hc.tag; lead = hc.lead || '';
        if (trendEl) trendEl.innerHTML = `<div class="hc ${hc.tag}"><span class="hc-tag">${hc.tag === 'hot' ? '🔥 Hot' : hc.tag === 'cold' ? '🥶 Cold' : '📊 Steady'}</span><span class="hc-detail">${hc.detail}</span></div>`;
        if (arrowEl) { arrowEl.textContent = hc.tag === 'hot' ? '▲' : hc.tag === 'cold' ? '▼' : '▬'; arrowEl.className = `arrow ${hc.tag || 'flat'}`; }
        if (leadEl) leadEl.textContent = hc.lead || '';
        if (hc.tag === 'hot') hot.push({ name: p.name, lead: hc.lead });
        else if (hc.tag === 'cold' && p.status !== 'il') {
          cold.push({ name: p.name, lead: hc.lead });                 // drop-watch display (still accurate)
          if (!essential) drops.push({ name: p.name, lead: hc.lead, isPitcher: isPitcher(p) }); // but never SUGGEST dropping a star
        }
      }
    }
    // Broader droppable pool (not just cold) so Suggested Moves can still pair a
    // hot pickup with a weak roster spot when nobody is icy-cold. Excludes IL, hot,
    // essential (real contributors), and players we couldn't value; weakest-first
    // ordering is applied after the loop.
    if (p.status !== 'il' && tag !== 'hot' && !essential && weakKey != null) {
      dropPool.push({ name: p.name, isPitcher: isPitcher(p), tag, status: p.status, lead: lead || weakHint, weakKey });
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

  // (Hot & Cold list and Today's Lineup Check removed — the per-player ▲/▼ form
  // arrows live on each roster row, and the hot/cold counts remain in Snapshot.)
  renderCatStrength(fSport, hitStats, pitStats);
  // Fill the cold half of the add/drop pairing, then (re)render it — the hot
  // half (faHot) was set by renderWaivers; whichever finished last completes it.
  fanState.dropCandidates = drops;
  // Weakest-first: cold/drop-watch, then bench, then steady; within a tier, the
  // worst season value (lowest OPS / highest ERA) is the first to go.
  const dropRank = (x) => x.tag === 'cold' ? 0 : x.status === 'bench' ? 1 : 2;
  fanState.dropPool = dropPool.sort((a, b) => dropRank(a) - dropRank(b) || (a.weakKey - b.weakKey));
  renderAddDrop(fSport);
}

// Roster category profile (baseball): where your roster is built to score, from
// each player's season stats. This is a roster profile (NOT league-relative) —
// it counts how many players are strong contributors in each scoring category.
function renderCatStrength(fSport, hitStats, pitStats) {
  const box = $('#fantasy-strength');
  if (!box) return;
  if (fSport !== 'baseball' || (!hitStats.length && !pitStats.length)) { box.innerHTML = ''; return; }
  const atLeast = (arr, key, thr) => arr.filter((s) => s[key] != null && s[key] >= thr).length;
  const atMost = (arr, key, thr) => arr.filter((s) => s[key] != null && s[key] <= thr).length;
  const rate = (n) => (n >= 4 ? 'strong' : n >= 2 ? 'solid' : 'thin');
  const gauges = [
    { cat: 'Power (HR)', n: atLeast(hitStats, 'HR', 18) },
    { cat: 'RBI', n: atLeast(hitStats, 'RBI', 55) },
    { cat: 'Avg / OPS', n: atLeast(hitStats, 'OPS', 0.780) },
    { cat: 'ERA', n: atMost(pitStats, 'ERA', 3.80) },
    { cat: 'WHIP', n: atMost(pitStats, 'WHIP', 1.20) },
    { cat: 'Strikeouts', n: atLeast(pitStats, 'K', 110) },
    { cat: 'Wins', n: atLeast(pitStats, 'W', 8) },
  ];
  // Surface the THIN categories as roster "needs", split hitter vs pitcher, so
  // Suggested Moves can prioritize pickups of the type that addresses a gap.
  const HIT_CATS = ['Power (HR)', 'RBI', 'Avg / OPS'];
  const shortCat = { 'Power (HR)': 'HR', 'RBI': 'RBI', 'Avg / OPS': 'OPS', 'ERA': 'ERA', 'WHIP': 'WHIP', 'Strikeouts': 'K', 'Wins': 'W' };
  const thin = gauges.filter((g) => rate(g.n) === 'thin');
  fanState.catNeeds = {
    hitters: thin.filter((g) => HIT_CATS.includes(g.cat)).map((g) => shortCat[g.cat]),
    pitchers: thin.filter((g) => !HIT_CATS.includes(g.cat)).map((g) => shortCat[g.cat]),
  };
  renderAddDrop(fSport); // re-rank suggestions now that needs are known
  const rows = gauges.map((g) => {
    const r = rate(g.n);
    const icon = r === 'strong' ? '🟢' : r === 'solid' ? '🟡' : '🔴';
    return `<div class="cs-row"><span class="cs-cat">${g.cat}</span><span class="cs-rate ${r}">${icon} ${r}</span><span class="cs-n">${g.n} contributor${g.n === 1 ? '' : 's'}</span></div>`;
  }).join('');
  box.innerHTML = `<h2 class="section-title">Category Strengths</h2>
    <div class="none" style="margin-bottom:8px">From your players’ season stats — where your roster is built to score. Counts strong contributors per category (a guide, not league-relative).</div>
    <div class="cs-list">${rows}</div>`;
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
      (youngest ? card(`${youngest.age}`, `Youngest · ${esc(youngest.displayName)}`) : '') +
      (oldest ? card(`${oldest.age}`, `Oldest · ${esc(oldest.displayName)}`) : '')
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
        ${img ? `<img src="${esc(img)}" alt="" onerror="this.style.display='none'">` : ''}
        <div><div class="nh">${esc(a.headline || '')}</div><div class="nd">${esc(a.description || '')}</div><div class="nt">${when} · tap for summary</div></div></div>`;
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
// Surname for the compact field tiles: the last name word, skipping a trailing
// generational suffix (Jr./Sr./II–V) so "Nolan Smith Jr." shows "Smith", not "Jr.".
const NAME_SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);
function lastName(name) {
  const parts = (name || '').trim().split(/\s+/);
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  return parts[parts.length - 1] || '';
}
function fieldHTML(entries, unit) {
  const spots = [];
  entries.filter((e) => e.unit === unit).forEach((e) =>
    e.players.slice(0, expandCount(e.label)).forEach((p) => spots.push({ label: e.label, name: p.name, jersey: p.jersey })));
  const rows = (FIELD_ROWS[unit] || [[]]).map(() => []);
  const extra = [];
  spots.forEach((s) => { const r = rowIndex(unit, s.label); (rows[r] || extra).push(s); });
  rows.forEach((r) => r.sort((a, b) => (FIELD_ORDER[a.label.toUpperCase()] ?? 50) - (FIELD_ORDER[b.label.toUpperCase()] ?? 50)));
  const spot = (s) => `<div class="field-spot"><div class="pl">${s.label}</div><div class="pn">${esc(lastName(s.name))}</div>${s.jersey ? `<div class="pj">#${s.jersey}</div>` : ''}</div>`;
  let html = '<div class="field">';
  rows.concat([extra]).forEach((r) => {
    if (!r.length) return;
    // A 5-wide row (the offensive line) won't fit across a phone at readable
    // size, so it wraps and the last man (RT) dangles onto his own line. Render
    // wide rows as a fixed N-column grid so the line stays intact and in order.
    if (r.length >= 5) {
      html += `<div class="field-row tight" style="grid-template-columns:repeat(${r.length},minmax(0,1fr))">${r.map(spot).join('')}</div>`;
    } else {
      html += `<div class="field-row">${r.map(spot).join('')}</div>`;
    }
  });
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
          `<span class="depth-player"><span class="jersey">${e.ordered ? (i === 0 ? '★' : i + 1) : (p.jersey ? '#' + p.jersey : '')}</span> ${esc(p.name)}${e.ordered && p.jersey ? ` #${p.jersey}` : ''}</span>`).join('')}</div>`).join('') + '</div>';
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
    return `<div class="sched-row"><span class="wk">${wk}</span><span class="opp">${home ? 'vs' : '@'} ${esc(oppName)}</span>${res}</div>`;
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
  elx.innerHTML = `<div class="opp-card">${logo ? `<img src="${esc(logo)}" alt="">` : ''}
    <div><div class="on">${esc(ot?.displayName || opp.team.displayName)}</div>
    <div class="od">${[rec ? `Record ${rec}` : '', standing].filter(Boolean).join(' • ') || 'Season not started'}</div>
    <div class="od">${esc(next.name || '')}${when ? ' · ' + when : ''}</div></div></div>`;
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
  // Derive each chip label from the heading text WITHOUT any nested controls
  // (e.g. the Standings/Power toggle inside the "League" heading) so labels stay
  // clean. Empty sections set their box to '' and emit no .section-title, so they
  // never produce a dead chip. Many fantasy sections render asynchronously, so
  // this runs again as they finish (see renderAddDrop) — it's idempotent and
  // rebuilds the bar in place.
  // Skip headings inside a hidden wrapper (e.g. the baseball sections while the
  // Football preseason view is showing) so they don't become dead chips.
  const titles = [...panel.querySelectorAll('.section-title')].filter((h) => h.offsetParent !== null);
  const items = titles.map((h, i) => {
    if (!h.id) h.id = `${name}-sec-${i}`;
    const clone = h.cloneNode(true);
    clone.querySelectorAll('.chips, button').forEach((n) => n.remove());
    const label = clone.textContent.trim().replace(/\s+/g, ' ').replace(/[🤖🦅]/g, '').trim();
    return { id: h.id, label };
  }).filter((x) => x.label);
  let nav = panel.querySelector(':scope > .jump-nav');
  if (items.length < 2) { if (nav) nav.remove(); return; }
  if (!nav) { nav = el('div', 'jump-nav'); panel.insertBefore(nav, panel.firstChild); }
  nav.innerHTML = items.map((it) => `<button class="chip" data-target="${it.id}">${it.label}</button>`).join('');
  nav.querySelectorAll('button').forEach((b) =>
    (b.onclick = () => document.getElementById(b.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
}

const renderers = { home: renderHome, eagles: renderEagles, predictions: renderPredictions, fantasy: renderFantasy, labs: () => {}, about: () => {} };
function showTab(name) {
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === name));
  document.querySelectorAll('#tabs button').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  Promise.resolve(renderers[name]()).then(() => injectJumpNav(name)).catch((e) => console.error(e));
}
$('#tabs').addEventListener('click', (e) => { if (e.target.dataset.tab) showTab(e.target.dataset.tab); });

// default the sport selectors to whatever's in season right now
state.aiSport = sortedSports({ teamOnly: true })[0];

const verEl = $('#app-version');
if (verEl) verEl.textContent = APP_VERSION;

// --- light / dark theme -----------------------------------------------------
// The <head> inline script sets data-theme before first paint (saved pref, else
// OS setting). Here we wire the header toggle and keep the meta theme-color and
// the button icon in sync. Saving a pref opts out of following the OS.
const THEME_KEY = 'sportshub:theme';
const themeMeta = document.querySelector('meta[name="theme-color"]');
const effectiveTheme = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  if (themeMeta) themeMeta.setAttribute('content', t === 'light' ? '#f7f4ee' : '#004c54');
  const btn = $('#theme-toggle');
  if (btn) {
    const dark = t !== 'light';
    btn.textContent = dark ? '☀️' : '🌙';
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('title', dark ? 'Light mode' : 'Dark mode');
  }
}
applyTheme(effectiveTheme());

// Labs: launch the fantasy mock draft (in the About → Labs card).
$('#labs-mock-start')?.addEventListener('click', () => {
  fanState.mock = { setup: true, teams: 12, slot: 6, rounds: 10 };
  renderMockDraft();
  $('#labs-mock')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#theme-toggle')?.addEventListener('click', () => {
  const next = effectiveTheme() === 'light' ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  applyTheme(next);
});
// Follow the OS theme while the user hasn't picked an explicit preference.
try {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) applyTheme(e.matches ? 'light' : 'dark');
  });
} catch (e) {}

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

// Sports-Hub — pure browser app. Live data comes straight from ESPN's free
// public sports feed (no key, no server). Edit LEAGUES below to make it yours.

const APP_VERSION = 'v162';

// Optional backend that syncs the owner's REAL ESPN fantasy leagues (the static
// app can't read private-league endpoints itself — CORS + cookie gated). When
// reachable, the Fantasy tab loads the real roster/matchup from here; when not,
// it falls back to the locally-saved/manual roster. See server/ in the repo.
// Backend base URL. Now hosted on Render's free tier (was Railway, whose trial
// expired). Override without a code push by setting localStorage 'sportshub:api'
// (handy if your Render service name — and thus URL — differs).
const FANTASY_API = (() => {
  try { return localStorage.getItem('sportshub:api'); } catch (_) { return null; }
})() || 'https://sports-hub-fantasy-api.onrender.com';

const LEAGUES = {
  nfl:    { label: 'NFL',    emoji: '🏈', espnPath: 'football/nfl',   fav: ['Philadelphia Eagles'], type: 'team' },
  // College football (v161). ESPN's CFB scoreboard is enormous — ~130 FBS teams
  // play on a Saturday — so this league is deliberately TOP-25 ONLY: `top25`
  // makes getGames drop any game without a ranked team, everywhere at once
  // (Home slate, AI Picks, trends, the betting board). groups=80 = FBS only,
  // and the default limit misses most of the slate, hence sbQuery.
  cfb:    { label: 'CFB',    emoji: '🎓', espnPath: 'football/college-football', fav: [], type: 'team',
            top25: true, sbQuery: 'groups=80&limit=300' },
  mlb:    { label: 'MLB',    emoji: '⚾', espnPath: 'baseball/mlb',    fav: ['Boston Red Sox'], type: 'team' },
  nba:    { label: 'NBA',    emoji: '🏀', espnPath: 'basketball/nba', fav: [], type: 'team' },
  golf:   { label: 'Golf',   emoji: '⛳', espnPath: 'golf/pga', fav: [], type: 'golf' },
};
const FEATURED = { sport: 'nfl', name: 'Philadelphia Eagles' };

// Roughly which months each sport is active, used to sort in-season first.
const SEASON_MONTHS = {
  nfl: [8, 9, 10, 11, 0, 1], cfb: [7, 8, 9, 10, 11, 0], mlb: [2, 3, 4, 5, 6, 7, 8, 9],
  nba: [9, 10, 11, 0, 1, 2, 3, 4, 5], golf: [0, 1, 2, 3, 4, 5, 6, 7],
};
const BASE_ORDER = ['nfl', 'cfb', 'mlb', 'nba', 'golf'];
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
async function fetchJSON(url, ttl = 60000, timeoutMs) {
  const hit = cache.get(url);
  if (hit && Date.now() < hit.exp) return hit.data;
  const ctrl = new AbortController();
  // Backend (Render free tier) can cold-start ~30-60s after idle, so give it a
  // long leash; ESPN's direct feeds stay snappy at 9s.
  const ms = timeoutMs || (url.startsWith(FANTASY_API) ? 45000 : 9000);
  const t = setTimeout(() => ctrl.abort(), ms);
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
// instead of a start time, so fall back to the time.
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
    // Poll rank straight off the scoreboard (college football). ESPN sends 99
    // for "unranked", so that becomes null and everything downstream can just
    // test truthiness. The pro leagues never send this, so it stays null there.
    rank: (() => { const r = Number(c?.curatedRank?.current); return r >= 1 && r <= 25 ? r : null; })(),
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
    seasonType: Number(ev.season?.type ?? comp.season?.type) || null, // 1 pre, 2 regular, 3 post
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
      pf: (v => isNaN(v) ? null : v)(Number(getStat(stats, ['pointsFor']))),
      pa: (v => isNaN(v) ? null : v)(Number(getStat(stats, ['pointsAgainst']))),
      diff: (v => isNaN(v) ? null : v)(Number(getStat(stats, ['pointDifferential', 'differential']))),
      seed: (v => isNaN(v) ? null : v)(Number(getStat(stats, ['playoffSeed']))),
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
// opts.allRanks skips the Top-25 gate. Exactly one caller wants that — grading
// (see gradePending). The filter decides what to SHOW and what to PICK; it must
// never decide what gets GRADED, or a pick could be quietly orphaned by a poll
// that moved after it was made.
async function getGames(sport, dateStr, opts = {}) {
  const cfg = LEAGUES[sport];
  const raw = (await scoreboard(sport, dateStr))?.games || [];
  // Filter BEFORE tracking lines: a college Saturday puts ~70 FBS games on the
  // board and only the ranked ones are ever shown, so tracking the rest would
  // just bloat the day's localStorage key for games nothing can open.
  const games = cfg.top25 && !opts.allRanks ? await onlyRanked(sport, raw) : raw;
  if (dateStr === ymd(sportsDate())) trackLines(sport, games); // today only
  return games;
}
// Raw scoreboard read, kept separate from getGames so the tab renderers can
// also see the payload's season/week metadata (which the game list drops).
async function scoreboard(sport, dateStr) {
  const cfg = LEAGUES[sport];
  const parts = [cfg.sbQuery, dateStr ? `dates=${dateStr}` : ''].filter(Boolean);
  const json = await fetchJSON(`${SITE}/${cfg.espnPath}/scoreboard${parts.length ? `?${parts.join('&')}` : ''}`);
  return { json, games: (json.events || []).map(normEvent) };
}

// --- college football: the Top 25 gate ------------------------------------
// CFB is ranked-teams-only in this app (see LEAGUES.cfb). Ranks come from two
// places: the scoreboard's own curatedRank (free, already fetched, and what
// ESPN shows on its own scoreboard) and — as a backfill — the rankings feed,
// which also powers the poll table on the CFB tab. Either source alone is
// enough, so a failure of one never empties the slate.
async function cfbRankings() {
  const json = await fetchJSON(`${SITE}/football/college-football/rankings`, 30 * 60000).catch(() => null);
  const polls = (json?.rankings || []).filter((r) => (r.ranks || []).length);
  if (!polls.length) return null;
  // The CFP committee rankings are the real bracket once they start (~Nov);
  // before that the AP poll is the standard read.
  const pick = (re) => polls.find((p) => re.test(`${p.name || ''} ${p.shortName || ''}`));
  const poll = pick(/college football playoff|^cfp\b/i) || pick(/\bAP\b|associated press/i) || polls[0];
  const byId = new Map(), byName = new Map();
  const entries = (poll.ranks || []).map((r) => {
    const t = r.team || {};
    const name = t.location && t.name ? `${t.location} ${t.name}` : (t.displayName || t.location || t.nickname || '');
    if (t.id != null) byId.set(String(t.id), r.current);
    if (name) byName.set(name.toLowerCase(), r.current);
    return {
      rank: r.current, prev: r.previous ?? null, points: r.points ?? null, votes: r.firstPlaceVotes ?? null,
      id: t.id != null ? String(t.id) : null, name, abbr: t.abbreviation || null,
      logo: t.logos?.[0]?.href || t.logo || null, record: r.recordSummary || r.record?.summary || '',
    };
  }).filter((e) => e.rank);
  return {
    poll: poll.name || poll.shortName || 'Top 25',
    asOf: json?.rankings?.[0]?.occurrence?.displayValue || json?.season?.year || '',
    entries, byId, byName,
    others: (poll.others || []).map((o) => o.team?.displayName).filter(Boolean),
  };
}
// Keep only games with a ranked team, and stamp the rank on both sides so the
// cards and the tab can label them (#3 Ohio State) even when the scoreboard's
// curatedRank is missing for one team.
async function onlyRanked(sport, games) {
  const rk = await cfbRankings().catch(() => null);
  const rankOf = (t) => t.rank
    ?? (rk && t.id != null ? rk.byId.get(String(t.id)) : null)
    ?? (rk && t.name ? rk.byName.get(t.name.toLowerCase()) : null)
    ?? null;
  const out = [];
  games.forEach((g) => {
    const hr = rankOf(g.home), ar = rankOf(g.away);
    if (!hr && !ar) return;
    g.home.rank = hr || null;
    g.away.rank = ar || null;
    out.push(g);
  });
  // Best game first: two ranked teams beat one, and lower ranks beat higher.
  return out.sort((a, b) => rankScore(a) - rankScore(b));
}
const rankScore = (g) => (g.home.rank && g.away.rank ? 0 : 100) + Math.min(g.home.rank || 99, g.away.rank || 99);

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
async function getStandings(sport, season) {
  const path = LEAGUES[sport].espnPath;
  // level=3 asks ESPN to nest by division (MLB East/Central/West, NFL
  // divisions). Fall back to the default grouping if that comes back empty.
  // Optional season (e.g. 2025) fetches a past season's final standings —
  // the NFL Power Board's offseason fallback.
  const sq = season ? `&season=${season}` : '';
  let rows = [];
  try { rows = normStandings(await fetchJSON(`${CORE}/${path}/standings?level=3${sq}`, 5 * 60000)); } catch (_) {}
  if (!rows.length) { try { rows = normStandings(await fetchJSON(`${CORE}/${path}/standings${season ? `?season=${season}` : ''}`, 5 * 60000)); } catch (_) {} }
  return rows;
}

// --- team standings + playoff outlook (Eagles / Red Sox tabs) -------------
const SEASON_GAMES = { nfl: 17, mlb: 162, nba: 82 };
const WILD_CARDS = { nfl: 3, mlb: 3, nba: 6 };
const pctOf = (r) => { const g = (r.wins || 0) + (r.losses || 0); return g ? r.wins / g : 0; };
// Games a team (b) trails another (a); positive when a is ahead.
const gamesBack = (a, b) => (((a.wins - b.wins) + (b.losses - a.losses)) / 2);
const sameTeam = (n, target) => {
  n = (n || '').toLowerCase(); target = (target || '').toLowerCase();
  return !!n && !!target && (n === target || n.includes(target) || target.includes(n));
};

// Pace + standings based playoff picture (NOT official odds — labeled as such).
function playoffOutlook(rows, teamName, sport) {
  const me = rows.find((r) => sameTeam(r.team, teamName));
  if (!me) return null;
  const conf = me.league || me.division;
  const confRows = rows.filter((r) => (r.league || r.division) === conf);
  const byDiv = {};
  confRows.forEach((r) => (byDiv[r.division] = byDiv[r.division] || []).push(r));
  Object.values(byDiv).forEach((arr) => arr.sort((a, b) => pctOf(b) - pctOf(a)));
  const leaders = Object.values(byDiv).map((a) => a[0]).sort((a, b) => pctOf(b) - pctOf(a));
  const divLeader = (byDiv[me.division] || [])[0];
  const isLeader = divLeader === me;
  const wildPool = confRows.filter((r) => (byDiv[r.division] || [])[0] !== r).sort((a, b) => pctOf(b) - pctOf(a));
  const wc = WILD_CARDS[sport] ?? 3;
  const total = SEASON_GAMES[sport] || (me.wins + me.losses) || 1;
  const gp = me.wins + me.losses;
  const projW = Math.round(me.wins + pctOf(me) * Math.max(0, total - gp));
  const projL = Math.max(0, total - projW);
  const divGB = divLeader ? gamesBack(divLeader, me) : 0;
  let madeIt, status, detail;
  if (isLeader) {
    madeIt = true;
    status = `Leads the ${me.division}`;
    detail = `${sport === 'nfl' ? `Projected #${leaders.indexOf(me) + 1} seed` : 'On track to win the division'} · ${projW}-${projL} pace`;
  } else {
    const wcRank = wildPool.indexOf(me) + 1;
    madeIt = wcRank > 0 && wcRank <= wc;
    if (madeIt) {
      const firstOut = wildPool[wc];
      const ga = firstOut ? gamesBack(me, firstOut) : null;
      status = `In the field — Wild Card #${wcRank}`;
      detail = `${ga != null ? `${ga.toFixed(1)} games ahead of the cut` : 'Holding a wild-card spot'} · ${projW}-${projL} pace`;
    } else {
      const cut = wildPool[wc - 1];
      const gb = cut ? gamesBack(cut, me) : null;
      status = 'Outside the playoff field';
      detail = `${gb != null ? `${gb.toFixed(1)} back of the last wild card · ` : ''}${projW}-${projL} pace`;
    }
  }
  return { madeIt, isLeader, status, detail, projW, projL, divGB, division: me.division, wildPool, wc };
}

async function renderStandingsBlock(sport, teamName, standSel, poSel) {
  const standEl = $(standSel), poEl = $(poSel);
  const rows = await getStandings(sport).catch(() => []);
  if (!rows.length) {
    if (standEl) standEl.innerHTML = '<div class="empty">Standings unavailable right now.</div>';
    if (poEl) poEl.innerHTML = '<div class="empty">Playoff outlook appears once standings load.</div>';
    return;
  }
  const me = rows.find((r) => sameTeam(r.team, teamName));
  const div = me?.division || rows[0].division;
  const divRows = rows.filter((r) => r.division === div).sort((a, b) => pctOf(b) - pctOf(a));
  const leader = divRows[0];
  if (standEl) {
    const body = divRows.map((r) => {
      const gb = gamesBack(leader, r);
      const pct = pctOf(r).toFixed(3).replace(/^0/, '');
      const logo = r.logo ? `<img class="tlogo" src="${esc(r.logo)}" alt="" onerror="this.style.display='none'">` : '';
      return `<tr class="${sameTeam(r.team, teamName) ? 'fav' : ''}"><td>${logo}${esc(r.team)}</td><td class="num">${r.wins}</td><td class="num">${r.losses}</td><td class="num">${pct}</td><td class="num">${gb <= 0 ? '—' : gb.toFixed(1)}</td></tr>`;
    }).join('');
    standEl.innerHTML = `<div class="standings-group">${esc(div)}</div><table><tr><th>Team</th><th class="num">W</th><th class="num">L</th><th class="num">PCT</th><th class="num">GB</th></tr>${body}</table>`;
  }
  if (poEl) {
    const o = playoffOutlook(rows, teamName, sport);
    if (!o) { poEl.innerHTML = '<div class="empty">Playoff outlook unavailable.</div>'; return; }
    let html = `<div class="po-card ${o.madeIt ? 'in' : 'out'}"><div class="po-status">${o.madeIt ? '✅' : '⚠️'} ${esc(o.status)}</div><div class="po-detail">${esc(o.detail)}</div><div class="po-note">Pace-based estimate from current standings — not official playoff odds.</div></div>`;
    // Wild-card race — shown when the team's path runs through the wild card
    // (i.e. they're not their division's leader). Dashed line marks the cut.
    if (!o.isLeader && (o.wildPool || []).length) {
      const cut = o.wildPool[o.wc - 1];
      const shown = o.wildPool.slice(0, Math.max(o.wc + 3, 6));
      const wcBody = shown.map((r, i) => {
        const pct = pctOf(r).toFixed(3).replace(/^0/, '');
        const wgb = cut ? gamesBack(cut, r) : 0;
        const gbTxt = r === cut ? '—' : (wgb < 0 ? '+' + (-wgb).toFixed(1) : wgb.toFixed(1));
        const logo = r.logo ? `<img class="tlogo" src="${esc(r.logo)}" alt="" onerror="this.style.display='none'">` : '';
        const tag = i < o.wc ? ` <span class="wc-in">WC${i + 1}</span>` : '';
        return `<tr class="${sameTeam(r.team, teamName) ? 'fav' : ''}${i === o.wc ? ' wc-cut' : ''}"><td>${logo}${esc(r.team)}${tag}</td><td class="num">${r.wins}</td><td class="num">${r.losses}</td><td class="num">${pct}</td><td class="num">${gbTxt}</td></tr>`;
      }).join('');
      html += `<div class="standings-group wc">Wild Card race</div><table><tr><th>Team</th><th class="num">W</th><th class="num">L</th><th class="num">PCT</th><th class="num">WCGB</th></tr>${wcBody}</table><div class="po-note">Dashed line = the cut (top ${o.wc} make it). WCGB is vs the last wild-card spot.</div>`;
    }
    poEl.innerHTML = html;
  }
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
  // ESPN's winner flag first — the surest signal, then fall back to the score.
  if (g.home.winner && !g.away.winner) return g.home.name;
  if (g.away.winner && !g.home.winner) return g.away.name;
  if (g.home.score == null || g.away.score == null) return null;
  if (g.home.score === g.away.score) return 'TIE';
  return g.home.score > g.away.score ? g.home.name : g.away.name;
}
const favSet = (sport) => (LEAGUES[sport].fav || []).map((t) => t.toLowerCase());
const isFav = (sport, g) =>
  favSet(sport).includes((g.home.name || '').toLowerCase()) || favSet(sport).includes((g.away.name || '').toLowerCase());

// Poll rank chip (college football only — the pro leagues never send a rank).
const rankHTML = (team) => (team.rank ? `<span class="rank-badge">#${team.rank}</span>` : '');
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
      <span class="team">${logoHTML(team)}${rankHTML(team)}${esc(team.name || 'TBD')}</span>
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

// Bumped on every modal open so a slow async section (the Game Report) can tell
// it's landing in a modal the user has since closed or replaced.
let detailToken = 0;

async function openGameDetail(sport, id, g) {
  modal().classList.remove('hidden');
  $('#modal-body').innerHTML = '<div class="empty">Loading live stats…</div>';
  const token = ++detailToken;
  try {
    const path = LEAGUES[sport].espnPath;
    // Preseason: the model's data is regular-season based (and starters sit),
    // so no AI pick, no model-vs-book grades, no model total — real odds and
    // market data still show. Mirrors the AI Picks tab sitting preseason out.
    const preseason = g?.seasonType === 1;
    // The Game Report needs the Render backend, which cold-starts in ~30-60s
    // after idling (fetchJSON gives it a 45s leash). Awaiting it here left the
    // whole modal stuck on "Loading live stats…" for up to 45s even though the
    // ESPN data was ready in a second — so it's kicked off now and injected
    // into its slot whenever it lands. Everything else is ESPN (9s cap).
    const reportP = g ? getBettingReport(sport) : null;
    // The pick now takes DK's sharp-money splits as an input, so the report is
    // peeked at (capped, see raceReport) before the model runs — otherwise the
    // modal would show a different confidence than the AI Picks tab for the
    // same game. It races the ESPN summary fetch, so it usually costs nothing.
    const [data, pred, hitters] = await Promise.all([
      fetchJSON(`${SITE}/${path}/summary?event=${id}`, 30000),
      g && !preseason
        ? raceReport(reportP, SHARP_WAIT.modal)
            .then((r) => predictGame(sport, g, { splits: r ? splitsFor(r, g) : null }))
            .catch(() => null)
        : Promise.resolve(null),
      g && sport === 'mlb' ? Promise.all([topHitters(g.home.id), topHitters(g.away.id)]).catch(() => null) : Promise.resolve(null),
    ]);
    let extra = '';
    if (preseason) {
      extra += '<div class="md-section-title acc-open">🤖 AI Pick</div><div class="ai-why">Preseason — the model sits these out. Backups play most of the snaps, so results and totals aren\'t predictive.</div>';
    }
    if (g && sport === 'mlb') {
      extra += startersHTML(g) + (hitters ? hittersHTML(g, hitters[0], hitters[1]) : '');
    } else if (g && sport === 'nfl') {
      extra += nflKeyHTML(g);
    }
    const slot = reportP ? '<div id="md-report"><div class="empty">📊 Loading betting report…</div></div>' : '';
    $('#modal-body').innerHTML = renderGameDetail(sport, data, pred, extra, g, slot);
    makeAccordion($('#modal-body'), '.md-section-title', 0);
    if (reportP) {
      // Odds for the report: prefer the summary's pickcenter — the scoreboard
      // object often drops its odds once a game goes live, which blanked the
      // Book/Grade columns mid-game.
      const rawO = (data.pickcenter || []).find((x) => x.spread != null || x.details || x.homeTeamOdds) || (data.odds || [])[0] || g.odds;
      reportP.then((report) => {
        if (token !== detailToken) return; // modal moved on while we waited
        const host = document.getElementById('md-report');
        if (!host) return;
        host.innerHTML = gameReportHTML(sport, g, pred, normOdds(rawO, g.home.name, g.away.name), report);
        makeAccordion(host, '.md-section-title', 0);
      }).catch(() => {
        const host = token === detailToken ? document.getElementById('md-report') : null;
        if (host) host.innerHTML = '';
      });
    }
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
  let html = `<div class="md-head">${teamCell(away)}<div style="color:var(--muted);font-weight:700">@</div>${teamCell(home)}</div>
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
// Typical per-game margin used to scale run/point differential. College
// football is the outlier: ranked teams routinely win by 30+, so the same
// point-differential gap means far less than it would in the NFL.
const PD_SCALE = { nfl: 7, cfb: 14, nba: 6, mlb: 2.2 };
// Per-sport factor weights (log-odds toward the stronger side). Baseball is
// pitching-dominant with a tiny home edge (~52-53% home win rate), so it can't
// share football's team-strength weights — record/home are damped here and the
// starting-pitcher matchup (weighted up in matchupFactor) carries the load.
const MODEL_W = {
  mlb:     { record: 0.6, margin: 0.9, form: 0.4, split: 0.7, homeEdge: 0.12, sharp: 0.30 },
  // College football (v161) pulls the two dials the other way from baseball.
  // Record carries more because the talent gap between programs is enormous and
  // persistent — unlike the NFL there is no parity mechanism — and home field is
  // genuinely worth more (CFB home teams win ~57-60%, vs the NFL's ~55%);
  // logistic(0.42) ≈ 60%. Nothing here is fit to graded results yet: there are
  // none. See MODEL_SHRINK and CONF_CAP for the guardrails that go with that.
  cfb:     { record: 1.3, margin: 1.0, form: 0.4, split: 1.0, homeEdge: 0.42, sharp: 0.20 },
  default: { record: 1.1, margin: 0.9, form: 0.4, split: 1.0, homeEdge: 0.28, sharp: 0.20 },
};
// Rough league-average starter ERA — the anchor for the pitcher-aware total.
const MLB_AVG_ERA = 4.10;
// Log-odds shrink applied to the combined factor score before it becomes a
// probability (v138). Fit against the owner's first graded month (119 pregame
// MLB picks): the model's stated confidence was ~2x too wide — its 70%+ picks
// won 63%, its 80-84% bucket won 22%, and its Brier score (.2553) was WORSE
// than blindly saying "52% every game" (.2465). Maximum-likelihood shrink was
// 0.26; the 90% bootstrap CI ran to 0.54, so 0.5 is deliberately the
// conservative (least-correcting) end of that range. This does NOT change WHICH
// side is picked — the shrink is monotonic, so the straight-up record is
// untouched. What it fixes is (a) honest confidence and (b) edge sizing, since
// marketGap is measured off probHome: inflated probabilities were manufacturing
// "edges" that went 10-12 against the line.
// cfb 0.8: college has NO graded history in this app, and its inputs (huge
// margins against wildly uneven schedules) are exactly the shape that produced
// MLB's 2x-too-wide confidence. A mild shrink is the cheap precaution — it is
// monotonic, so it changes no pick, only the stated confidence and the edge
// sizing that keys off probHome. Revisit once a season of picks has graded.
const MODEL_SHRINK = { mlb: 0.5, cfb: 0.8, default: 1 };
// Park run environment, 100 = neutral (3-year public run factors, rounded).
// Static by design — no endpoint needed, and parks move slowly.
const MLB_PARK = {
  COL: 113, CIN: 106, BOS: 106, KC: 104, ARI: 103, PHI: 103, BAL: 103, TEX: 103,
  ATL: 102, CHW: 101, WSH: 101, LAA: 101, TOR: 101, HOU: 101, CHC: 100, MIN: 100,
  NYY: 100, STL: 99, PIT: 99, MIL: 99, CLE: 98, LAD: 97, NYM: 97, TB: 96,
  DET: 96, ATH: 95, SD: 95, MIA: 95, SF: 93, SEA: 92,
};
// The projected total is built from both teams' season scoring rates, which
// already bake in ~a quarter of this park's effect (the home team plays half
// its games here). So the factor is applied at partial strength, not in full.
const PARK_WEIGHT = 0.7;
// Per-sport confidence ceiling. Graded results showed the model's 80-92% MLB
// picks were wildly overconfident (its 80-84% bucket won ~22%, its 90%+ bucket
// only ~73%) — a single baseball game tops out around 65-70% even best-vs-worst,
// so MLB confidence is capped well below the football/basketball ceiling.
const CONF_CAP = { mlb: 72, nfl: 85, cfb: 90, default: 92 };
// NFL cap note: the NFL side of the model has NO validated calibration data yet
// (every graded NFL pick predates both the confidence meta and the v138
// look-ahead fix), and the biggest market favorites only win ~90%. 85 is a
// principled ceiling until this season produces a clean graded sample.

// --- Sharp money (v160) ---------------------------------------------------
// DraftKings publishes two different numbers per side: bets% (share of
// TICKETS) and handle% (share of DOLLARS). When dollars run well ahead of
// tickets, the average wager on that side is far bigger than on the other —
// a handful of large bettors against a crowd of small ones. That divergence is
// the one piece of market information the posted price hasn't necessarily
// absorbed yet, which is why the Game Report has flagged it since v88. This
// folds it into the pick itself instead of only showing it.
// Deliberately small. The signal is real but modest (money-side edges measure
// a couple of points, not ten), it rides a free scrape that can go stale, and
// it has ZERO graded history in this app. So every pick records how far the
// nudge moved it (`sh` in the tally) and the Report Card slices the record by
// it — measure first, fit later, the same order v159 set for totals.
const SHARP_MIN_DIV = 7;    // handle% − bets% must clear this to count (matches sharpSignals' display threshold)
const SHARP_DIV_SCALE = 20; // 20 points past the deadband = one full unit
const SHARP_MAX_UNITS = 1.5;
// Orient a game's DK moneyline splits toward the HOME side. null when the row
// is missing, unparseable, or the divergence sits inside the deadband.
function sharpSplit(sp) {
  if (!sp) return null;
  const div = (s) => {
    if (s?.ml_handle == null || s?.ml_bets == null) return null;
    const h = Number(s.ml_handle), b = Number(s.ml_bets);
    return isFinite(h) && isFinite(b) ? h - b : null;
  };
  const dh = div(sp.home), da = div(sp.away);
  if (dh == null && da == null) return null;
  // Each column sums to ~100, so the two sides mirror each other; averaging
  // them cancels the per-cell rounding the scrape introduces.
  const d = dh == null ? -da : da == null ? dh : (dh - da) / 2;
  if (!isFinite(d)) return null;
  const mag = Math.abs(d) - SHARP_MIN_DIV;
  if (mag <= 0) return null; // inside the deadband: normal noise, not a signal
  return { d, units: clamp(Math.sign(d) * (mag / SHARP_DIV_SCALE), -SHARP_MAX_UNITS, SHARP_MAX_UNITS) };
}

// beforeDate (v138): when profiling for a PREDICTION, only games that finished
// strictly before the predicted game may count. Without it a game that's
// already final fed its own result (and every later game) back into the model
// that then graded it — the record looked far better than the model's true
// forward accuracy. Omit the arg for display uses (season trends), where the
// full schedule is what you want.
// Preseason (season type 1 — NFL preseason, MLB spring training) is practice,
// not signal: starters barely play and results don't predict anything. The
// model never counts those games. Shape of the marker varies by feed.
function isPreseasonEv(ev) {
  const t = ev?.seasonType?.type ?? ev?.seasonType?.id ?? ev?.season?.type;
  return Number(t) === 1;
}
async function teamProfile(sport, teamId, beforeDate) {
  if (!teamId) return null;
  const path = LEAGUES[sport].espnPath;
  const data = await fetchJSON(`${SITE}/${path}/teams/${teamId}/schedule`, 3 * 3600000).catch(() => null);
  const cut = beforeDate ? new Date(beforeDate).getTime() : null;
  const parse = (payload) => {
    const out = [];
    (payload?.events || []).forEach((ev) => {
      const comp = ev.competitions?.[0]; if (!comp?.status?.type?.completed) return;
      if (isPreseasonEv(ev)) return;
      if (cut != null) { const t = new Date(ev.date).getTime(); if (!(t < cut)) return; }
      const me = (comp.competitors || []).find((c) => String(c.team?.id) === String(teamId));
      const opp = (comp.competitors || []).find((c) => String(c.team?.id) !== String(teamId));
      const ms = Number(me?.score?.value ?? me?.score?.displayValue);
      const os = Number(opp?.score?.value ?? opp?.score?.displayValue);
      if (!me || isNaN(ms) || isNaN(os)) return;
      out.push({ date: ev.date, margin: ms - os, pf: ms, pa: os, home: me.homeAway === 'home', win: me.winner === true || ms > os });
    });
    out.sort((a, b) => new Date(a.date) - new Date(b.date));
    return out;
  };
  const games = parse(data);
  // Early-season blend (model path only — beforeDate is passed): with fewer
  // than 6 real games the current sample is mostly noise (and week 1 is empty),
  // so last season's full record is blended in, fading out as games arrive and
  // capped below full weight because rosters turn over. Display callers omit
  // beforeDate and get the pure current season.
  let prior = null, priorW = 0;
  if (beforeDate && games.length < 6) {
    const yr = Number(data?.season?.year) || new Date(beforeDate).getFullYear();
    const pdata = await fetchJSON(`${SITE}/${path}/teams/${teamId}/schedule?season=${yr - 1}`, 6 * 3600000).catch(() => null);
    const pg = parse(pdata);
    if (pg.length >= 8) {
      const psum = (f) => pg.reduce((s, g) => s + f(g), 0) / pg.length;
      prior = { winPct: psum((g) => (g.win ? 1 : 0)), pdpg: psum((g) => g.margin), ppg: psum((g) => g.pf), papg: psum((g) => g.pa) };
      priorW = ((6 - games.length) / 6) * 0.75;
    }
  }
  if (!games.length && !prior) return null;
  const gp = games.length;
  const mix = (cur, pv) => (prior ? (gp ? cur * (1 - priorW) + pv * priorW : pv) : cur);
  const sum = (f) => (gp ? games.reduce((s, g) => s + f(g), 0) : 0);
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
    winPct: mix(gp ? sum((g) => (g.win ? 1 : 0)) / gp : 0, prior?.winPct),
    pdpg: mix(gp ? sum((g) => g.margin) / gp : 0, prior?.pdpg),
    ppg: mix(gp ? sum((g) => g.pf) / gp : 0, prior?.ppg),
    papg: mix(gp ? sum((g) => g.pa) / gp : 0, prior?.papg),
    form: wtot ? wsum / wtot : 0,
    homeWP: wp(homeG),
    roadWP: wp(roadG),
    homeGP: homeG.length,
    roadGP: roadG.length,
    last10, streak,
    lastDate: gp ? games[gp - 1].date : null,
    blended: priorW > 0, // record/margin partly from last season (early weeks)
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
async function starterForm(athleteId, beforeDate) {
  if (!athleteId) return null;
  const games = await athleteGamelog('mlb', athleteId).catch(() => null);
  if (!games || !games.length) return null;
  // Same look-ahead guard as teamProfile: a start that happened after the game
  // being predicted can't inform that prediction (v138).
  const cut = beforeDate ? new Date(beforeDate).getTime() : null;
  const recent = games.filter((g) => g.date && !isNaN(g.date) && (cut == null || Number(g.date) < cut))
    .sort((a, b) => b.date - a.date).slice(0, 3);
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
  let starters = null; // { hERA, aERA } — surfaced so predictGame can price the total
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
      starters = { hERA, aERA }; // for the pitcher-aware projected total
      const parts = [];
      if (hERA != null && aERA != null) parts.push(clamp((aERA - hERA) / 1.5, -2, 2)); // lower ERA = home edge
      if (hWHIP != null && aWHIP != null) parts.push(clamp((aWHIP - hWHIP) / 0.25, -2, 2)); // lower WHIP = home edge
      // Starting pitching is the dominant driver of an MLB game — weighted up
      // (0.24 → 0.42) so a real ERA edge outweighs the standard home tick.
      if (parts.length) factors.push({ label: 'Starting pitcher', c: 0.42 * (parts.reduce((s, v) => s + v, 0) / parts.length), detail: 'ERA/WHIP edge' });
      // recent form on top of the season line (about half the season-stat weight)
      const [hForm, aForm] = await Promise.all([starterForm(hp?.athlete?.id, g.date), starterForm(ap?.athlete?.id, g.date)]);
      if (hForm && aForm) {
        notes.push(`SP form (L3): ${hn} ${hForm.era.toFixed(2)} ERA vs ${an} ${aForm.era.toFixed(2)} ERA`);
        const fparts = [clamp((aForm.era - hForm.era) / 2.0, -2, 2), clamp((aForm.whip - hForm.whip) / 0.35, -2, 2)];
        factors.push({ label: 'SP recent form', c: 0.18 * (fparts.reduce((s, v) => s + v, 0) / fparts.length), detail: `L3 starts: ${hForm.era.toFixed(2)} vs ${aForm.era.toFixed(2)} ERA` });
      }
    }
    const [hOPS, aOPS] = await Promise.all([teamOPS(g.home.id), teamOPS(g.away.id)]);
    if (hOPS != null && aOPS != null) {
      notes.push(`Team OPS: ${ops3(hOPS)} vs ${ops3(aOPS)}`);
      factors.push({ label: 'Lineup OPS', c: 0.20 * clamp((hOPS - aOPS) / 0.05, -2, 2), detail: `${ops3(hOPS)} vs ${ops3(aOPS)}` }); // higher OPS = home edge
    }
  } else {
    const key = (lead) => {
      const cat = (lead || []).find((x) => /passing|rating|points|qb/i.test(`${x.name}${x.displayName}`));
      const top = cat?.leaders?.[0];
      return top ? { name: top.athlete?.displayName || top.athlete?.shortName, val: top.displayValue } : null;
    };
    const h = key(g.home.leaders), a = key(g.away.leaders);
    if (h && a) notes.push(`${sport === 'nfl' || sport === 'cfb' ? 'QB' : 'Leader'}: ${h.name} (${h.val}) vs ${a.name} (${a.val})`);
  }
  return { factors, notes, starters };
}

// opts.splits (v160) = this game's DraftKings bets%/handle% row, when the
// betting backend answered in time. Optional by design: every caller must work
// without it, and the pick simply loses the sharp-money factor.
async function predictGame(sport, g, opts) {
  const [hf, af] = await Promise.all([teamProfile(sport, g.home.id, g.date), teamProfile(sport, g.away.id, g.date)]);
  const scale = PD_SCALE[sport] || 5;
  const w = MODEL_W[sport] || MODEL_W.default;
  const factors = []; // { label, c (log-odds toward home), detail }
  let z = 0;
  const add = (label, c, detail) => { if (c && isFinite(c)) { z += c; factors.push({ label, c, detail }); } };

  if (hf && af) {
    add('Record', w.record * (hf.winPct - af.winPct), `${(hf.winPct * 100).toFixed(0)}% vs ${(af.winPct * 100).toFixed(0)}% win`);
    add('Scoring margin', w.margin * clamp((hf.pdpg - af.pdpg) / scale, -3, 3), `${hf.pdpg >= 0 ? '+' : ''}${hf.pdpg.toFixed(1)} vs ${af.pdpg >= 0 ? '+' : ''}${af.pdpg.toFixed(1)} per game`);
    add('Recent form', w.form * clamp((hf.form - af.form) / scale, -3, 3), `last 5: ${hf.form >= 0 ? '+' : ''}${hf.form.toFixed(1)} vs ${af.form >= 0 ? '+' : ''}${af.form.toFixed(1)}`);
    if (hf.homeWP != null && af.roadWP != null) {
      // A 3-1 home record says almost nothing — blend the split with the
      // generic home edge until both sides have ~10 games of sample.
      const shrink = clamp(Math.min(hf.homeGP ?? 0, af.roadGP ?? 0) / 10, 0, 1);
      add('Home/road split', w.split * shrink * (hf.homeWP - af.roadWP),
        `home ${(hf.homeWP * 100).toFixed(0)}% vs road ${(af.roadWP * 100).toFixed(0)}%${shrink < 1 ? ' (small sample, damped)' : ''}`);
      if (shrink < 1) add('Home field', w.homeEdge * (1 - shrink), 'standard home edge');
    } else { add('Home field', w.homeEdge, 'standard home edge'); }
    const day = 86400000;
    const hr = g.date && hf.lastDate ? clamp(Math.round((new Date(g.date) - new Date(hf.lastDate)) / day), 0, 10) : null;
    const ar = g.date && af.lastDate ? clamp(Math.round((new Date(g.date) - new Date(af.lastDate)) / day), 0, 10) : null;
    if (hr != null && ar != null && hr !== ar) add('Rest', 0.05 * clamp(hr - ar, -5, 5), `${hr}d vs ${ar}d rest`);
  } else {
    add('Home field', w.homeEdge, 'limited data — home edge only');
  }

  // player matchup (starting pitchers ERA/WHIP, team OPS, QBs)
  const mu = await matchupFactor(sport, g);
  mu.factors.forEach((f) => add(f.label, f.c, f.detail));

  // Sharp money: DK dollars-vs-tickets divergence, oriented toward the home
  // side. Goes in as an ordinary factor so the breakdown attribution below
  // stays exact and the calibration shrink applies to it like everything else
  // (a signal with no graded history should be shrunk, not exempted).
  const ss = sharpSplit(opts?.splits);
  let sharp = null, sharpC = 0;
  if (ss && w.sharp) {
    const toHome = ss.d > 0;
    const t = toHome ? g.home : g.away;
    const row = (opts.splits || {})[toHome ? 'home' : 'away'] || {};
    sharpC = w.sharp * ss.units;
    sharp = { side: t.name, abbr: t.abbr || (t.name || '').split(' ').pop(),
      handle: row.ml_handle, bets: row.ml_bets, d: Math.round(ss.d) };
    add('Sharp money', sharpC, `${row.ml_handle}% of dollars vs ${row.ml_bets}% of bets on ${sharp.abbr}`);
  }

  // Calibration shrink (see MODEL_SHRINK): the raw factor sum is systematically
  // too confident, so pull it toward even money before it becomes a probability.
  const shrink = MODEL_SHRINK[sport] ?? MODEL_SHRINK.default;
  const zc = z * shrink;
  const pHome = logistic(zc);
  const homePick = pHome >= 0.5;
  const winner = homePick ? g.home : g.away;
  const conf = clamp(Math.round((homePick ? pHome : 1 - pHome) * 100), 50, CONF_CAP[sport] || CONF_CAP.default);
  // Calibrated attribution: split the actual edge over 50% across factors in
  // proportion to each factor's log-odds, so the parts add up to the pick.
  const edge = (pHome - 0.5) * 100; // home edge in points (can be negative)
  const breakdown = factors.map((f) => {
    const pts = Math.abs(z) > 1e-6 ? (f.c / z) * edge : 0; // toward home if positive
    return { label: f.label, detail: f.detail, favor: f.c >= 0 ? g.home.name : g.away.name, pct: Math.abs(pts) };
  }).filter((b) => b.pct >= 0.1).sort((a, b) => b.pct - a.pct);
  // Projected game total: baseline is the two teams' combined-scoring rates,
  // then — for MLB — nudged by the starting pitchers vs league-average ERA, so
  // two aces project a low total instead of the teams' season average. Each
  // starter's ERA gap carries ~0.6 of a run into the total (their share of the
  // 9 innings), clamped to a sane range.
  let projTotal = hf && af && hf.ppg != null && af.ppg != null
    ? (hf.ppg + hf.papg + af.ppg + af.papg) / 2 : null;
  if (sport === 'mlb' && projTotal != null) {
    if (mu.starters && mu.starters.hERA != null && mu.starters.aERA != null) {
      const adj = ((mu.starters.hERA - MLB_AVG_ERA) + (mu.starters.aERA - MLB_AVG_ERA)) * 0.6;
      projTotal += adj;
    }
    // Park (v138): the first month of graded totals picked OVER 17 times in 23,
    // a directional skew that a park-blind season-average total will produce —
    // it prices a game at Coors the same as one at Oracle or T-Mobile.
    const pf = MLB_PARK[(g.home.abbr || '').toUpperCase()];
    if (pf) projTotal *= 1 + ((pf / 100) - 1) * PARK_WEIGHT;
    projTotal = clamp(projTotal, 4, 20);
  }
  // How much the sharp factor actually moved THIS pick, in probability points
  // toward the side the model landed on. Stored with every graded pick so the
  // signal can be measured on real results instead of argued about.
  if (sharp) {
    const pNo = logistic((z - sharpC) * shrink);
    const side = (p) => (homePick ? p : 1 - p);
    sharp.pts = Math.round((side(pHome) - side(pNo)) * 1000) / 10;
    sharp.agree = sharp.pts >= 0;
    sharp.flipped = (pNo >= 0.5) !== homePick; // the nudge changed which side we took
  }
  const notes = mu.notes.slice();
  if (sharp) notes.unshift(`Sharp money: ${sharp.handle}% of dollars vs ${sharp.bets}% of bets on ${sharp.side}${sharp.flipped ? ' — enough to flip the model onto that side' : ''}`);
  if (hf?.blended || af?.blended) notes.unshift('Early season — record/margin blended with last season (damped)');
  return { winner, conf, homePick, probHome: pHome, projTotal, breakdown, notes, sharp, thin: !(hf && af) };
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
const BETTING_SPORTS = new Set(['mlb', 'nfl', 'nba', 'cfb']);
// Remembers a failed/timed-out backend report so every game card opened during
// an outage (or a long cold start) doesn't sit on its own 45s request — the
// report degrades to model-only, which gameReportHTML already handles.
let reportDownUntil = 0;
async function getBettingReport(sport) {
  if (!BETTING_SPORTS.has(sport)) return null;
  if (Date.now() < reportDownUntil) return null;
  return fetchJSON(`${FANTASY_API}/api/betting/${sport}/report`, 5 * 60000)
    .catch(() => { reportDownUntil = Date.now() + 3 * 60000; return null; });
}
// The sharp-money factor (v160) needs the report BEFORE a pick is computed,
// but v157's rule stands: nothing may sit on the backend's 45s cold-start
// leash. So every model caller races it against a hard cap and takes null on
// timeout — a warm backend answers in a fraction of a second, a sleeping one
// just costs the sharp factor for that render. The promise isn't cancelled, so
// the Game Report still injects into its own slot whenever it does land.
const SHARP_WAIT = { picks: 8000, modal: 1200 };
const raceReport = (p, ms) => Promise.race([
  Promise.resolve(p).catch(() => null),
  new Promise((r) => setTimeout(() => r(null), ms)),
]).catch(() => null);
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
    // v160: this divergence is no longer display-only — say where it went.
    if (pred?.sharp) parts.push(`<div class="ai-why">Folded into the model's pick below: ${pred.sharp.pts > 0 ? '+' : ''}${pred.sharp.pts.toFixed(1)} points toward ${esc(pred.winner.name)}.</div>`);
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
  // Finer buckets than v83's three (v138): after the calibration shrink almost
  // every MLB pick lands between 50 and 72, so "50–59 / 60–69 / 70+" collapsed
  // the whole range into two rows and hid the miscalibration.
  const bucketOf = (cf) => (cf >= 70 ? '70%+' : cf >= 65 ? '65–69%' : cf >= 60 ? '60–64%' : cf >= 55 ? '55–59%' : '50–54%');
  const buckets = {}, sports = {};
  // cfSum tracks what the model CLAIMED, so each bucket can show claimed vs
  // actual — the gap is the number that says whether to trust a "70%" pick.
  const bump = (o, k, win, cf) => {
    const r = (o[k] = o[k] || { w: 0, n: 0, cfSum: 0 });
    r.n++; if (win) r.w++; if (cf != null) r.cfSum += cf;
  };
  // Entries with no stored confidence (pre-v83, or picks graded before the meta
  // existed) can't be calibrated and shouldn't quietly pad the headline record.
  let legacy = 0;
  const weekCut = Number(ymd(new Date(Date.now() - 7 * 86400000)));
  const week = { w: 0, n: 0 };
  // Totals get an O/U split + a projected-total bias read, because the failure
  // mode they actually exhibit is directional: a season-average projection that
  // runs high fires OVER far more often than UNDER, and a 50% record hides it.
  const totals = { w: 0, n: 0, ow: 0, on: 0, uw: 0, un: 0, biasSum: 0, biasN: 0 };
  // Sharp money (v160): sh = points the DK dollars-vs-tickets factor moved the
  // pick, signed toward the side taken. Positive = the big money agreed with
  // the model; negative = the model took the other side anyway. Splitting the
  // record on that sign is how we find out whether the factor earns its weight.
  const sharp = { agree: { w: 0, n: 0 }, against: { w: 0, n: 0 } };
  const recent = [];
  entries.forEach((r) => {
    const win = !!r.c;
    if (r.t) { // O/U picks: own record, but in history
      totals.n++; if (win) totals.w++;
      const over = String(r.p || '').startsWith('OVER');
      if (over) { totals.on++; if (win) totals.ow++; } else if (String(r.p || '').startsWith('UNDER')) { totals.un++; if (win) totals.uw++; }
      // pt (v159+) is the model's projected total; the line rides in p ("OVER 8.5").
      const ln = Number(String(r.p || '').split(' ').pop());
      if (r.pt != null && isFinite(ln)) { totals.biasSum += r.pt - ln; totals.biasN++; }
      if (r.p) recent.push(r);
      return;
    }
    if (r.sh) { const k = r.sh > 0 ? 'agree' : 'against'; sharp[k].n++; if (win) sharp[k].w++; }
    if (r.cf != null) bump(buckets, bucketOf(r.cf), win, r.cf); else legacy++;
    if (r.s) bump(sports, r.s, win);
    if (r.d != null && Number(r.d) >= weekCut) { week.n++; if (win) week.w++; }
    if (r.p) recent.push(r);
  });
  recent.sort((a, b) => Number(b.d || 0) - Number(a.d || 0));
  return { total: entries.length, buckets, sports, week, totals, sharp, legacy, recent: recent.slice(0, 15) };
}
const matchupLabel = (sport, g) =>
  `${g.away.abbr || g.away.name} @ ${g.home.abbr || g.home.name}`;

// Pending picks: every prediction is stashed so the running record keeps
// building even if you're not on the AI Picks tab when a game ends. On load
// we look up each pending game's final result and fold it into the tally.
const PENDING_KEY = 'sportshub:pending';
const getPending = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}'); } catch (_) { return {}; } };
const setPending = (p) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch (_) {} };
function recordPick(id, sport, date, pick, fav, conf, isEdge, sharpPts) {
  if (!id || !pick) return;
  if (getTally()[id]) return; // already graded
  const p = getPending();
  if (p[id]) return;
  // eg carries the qualified-edge flag (gap-filtered) so deferred grading
  // counts the same picks toward the vs-line record as live grading does.
  // sh (v160) = probability points the sharp-money factor moved this pick,
  // signed toward the side taken. Stored so the signal can be graded.
  p[id] = { sport, date, pick, fav: fav || null, conf: conf ?? null, eg: isEdge ? 1 : 0,
    ...(sharpPts != null ? { sh: sharpPts } : {}) };
  setPending(p);
}
// Totals pick: keyed `${gameId}:t` so it never collides with the side pick.
// proj (v159) = the model's projected total at pick time. Without it a graded
// export shows only WHICH side we took, so a directional skew (the OVER lean)
// can be seen but never sized — see the projected-total bias note in the card.
function recordTotalPick(gameId, sport, date, side, line, proj) {
  const id = `${gameId}:t`;
  if (!gameId || !side || line == null) return;
  if (getTally()[id]) return;
  const p = getPending();
  if (p[id]) return;
  p[id] = { sport, date, t: 1, pick: side, line, proj: proj ?? null };
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
    // allRanks: grade against the UNFILTERED board. A CFB pick is made off the
    // ranked slate, but a team can fall out of the poll between kickoff and the
    // next time this runs — and if the re-fetched slate is re-filtered against
    // the new poll, that game disappears and the pick is silently purged at the
    // 14-day cutoff. Those are exactly the picks worth learning from (upsets
    // involving bubble teams), so grading ignores the gate entirely.
    try { games = await getGames(sport, date, { allRanks: true }); } catch (_) { return; }
    const byId = {}; games.forEach((g) => (byId[g.id] = g));
    ids.forEach((id) => {
      const g = byId[id.replace(/:t$/, '')]; if (!g || gameState(g) !== 'final') return;
      const entry = p[id];
      if (entry.t) { // totals pick: grade combined score vs the line (push → drop)
        const total = g.home.score != null && g.away.score != null ? g.home.score + g.away.score : null;
        if (total == null || total === entry.line) { delete p[id]; changed = true; return; }
        const hit = entry.pick === 'OVER' ? total > entry.line : total < entry.line;
        recordResult(id, hit, null,
          { s: sport, d: Number(date), t: 1, p: `${entry.pick} ${entry.line}`, m: matchupLabel(sport, g),
            ...(entry.proj != null ? { pt: Math.round(entry.proj * 10) / 10 } : {}) });
        delete p[id]; changed = true; return;
      }
      const actual = winnerName(g);
      if (!actual || actual === 'TIE') { delete p[id]; changed = true; return; }
      const { pick, fav, conf, eg, sh } = entry;
      const hit = actual === pick;
      const wasEdge = eg != null ? !!eg : !!(fav && pick !== fav); // old entries: fav comparison
      recordResult(id, hit, wasEdge ? (hit ? 'h' : 'm') : null,
        { s: sport, d: Number(date), cf: conf ?? null, p: pick, m: matchupLabel(sport, g),
          ...(sh != null ? { sh } : {}) });
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
  // Each confidence row shows what the model claimed vs what actually happened.
  // A "70%" bucket that wins 55% isn't a good pick reported badly — it's the
  // model lying about how sure it is, and the gap is the thing worth watching.
  const calRow = (k, r) => {
    if (!r.n) return '';
    const act = Math.round((r.w / r.n) * 100);
    const said = r.cfSum ? Math.round(r.cfSum / r.n) : null;
    const gap = said == null ? null : act - said;
    // Under ~10 graded picks a bucket is noise — show it, but don't dress it up.
    const tag = r.n < 10 ? '<span class="rep-cf">thin</span>'
      : gap == null ? ''
      : `<span class="rep-cf" style="color:${Math.abs(gap) <= 6 ? 'var(--accent)' : gap < 0 ? '#e56b6b' : 'var(--gold)'}">${gap > 0 ? '+' : ''}${gap}</span>`;
    return `<div class="rep-row"><span class="rep-l">${k} confidence</span><span class="rep-v">${r.w}-${r.n - r.w} → ${act}% ${tag}</span></div>`;
  };
  const bRows = ['50–54%', '55–59%', '60–64%', '65–69%', '70%+'].filter((k) => det.buckets[k])
    .map((k) => calRow(k, det.buckets[k])).join('');
  const sRows = Object.entries(det.sports)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([s, r]) => row(`${LEAGUES[s]?.emoji || ''} ${LEAGUES[s]?.label || s}`, r)).join('');
  const recent = det.recent.map((r) => {
    const d = String(r.d || '');
    const dd = d.length === 8 ? `${Number(d.slice(4, 6))}/${Number(d.slice(6, 8))}` : '';
    const pickTxt = r.t ? (r.p || '') : (r.p || '').split(' ').slice(-1)[0]; // totals keep "OVER 8.5"
    return `<div class="rep-pick"><span class="rep-i">${r.c ? '✅' : '❌'}${r.e ? '⚡' : r.t ? '🎯' : ''}</span><span class="rep-m">${esc(r.m || '')}</span><span class="rep-p">${esc(pickTxt)}${r.cf ? ` <span class="rep-cf">${r.cf}%</span>` : ''}</span><span class="rep-d">${dd}</span></div>`;
  }).join('');
  // A totals record near .500 can still be a broken model: if the projection
  // runs high it will keep picking OVER, and half of those land by luck. So the
  // card shows the O/U split and — once picks carry pt — how far the model's
  // total sat from the book on average.
  const t = det.totals || {};
  let tRow = '';
  if (t.n) {
    tRow = row('🎯 Totals (O/U) record', t);
    if (t.on + t.un) {
      tRow += `<div class="rep-row"><span class="rep-l">OVER / UNDER picks</span><span class="rep-v">${t.ow}-${t.on - t.ow} / ${t.uw}-${t.un - t.uw}</span></div>`;
      const share = t.on / (t.on + t.un);
      if (t.on + t.un >= 10 && (share >= 0.65 || share <= 0.35)) {
        const side = share >= 0.65 ? 'OVER' : 'UNDER';
        tRow += `<div class="ai-why" style="padding:2px 0;color:var(--gold)">${Math.round((share >= 0.65 ? share : 1 - share) * 100)}% of totals picks are ${side} — a one-sided lean means the projected total sits off the book's, not that ${side}s are live.</div>`;
      }
    }
    if (t.biasN) {
      const b = t.biasSum / t.biasN;
      tRow += `<div class="rep-row"><span class="rep-l">Model total vs the book</span><span class="rep-v">${b > 0 ? '+' : ''}${b.toFixed(1)} runs${t.biasN < 10 ? ' <span class="rep-cf">thin</span>' : ''}</span></div>`;
    }
  }
  // Sharp money is brand new and unproven here, so it gets its own slice from
  // day one and says out loud when the sample is too thin to conclude anything.
  const sh = det.sharp || { agree: { w: 0, n: 0 }, against: { w: 0, n: 0 } };
  const shN = sh.agree.n + sh.against.n;
  const shRow = !shN ? '' :
    (sh.agree.n ? row('Big money on our side', sh.agree) : '') +
    (sh.against.n ? row('Big money the other way', sh.against) : '') +
    `<div class="ai-why" style="padding:2px 0">${shN} pick${shN === 1 ? '' : 's'} where DraftKings' dollars ran ${SHARP_MIN_DIV}+ points ahead of its tickets on one side.${shN < 20 ? ' Too thin to tune on — this row exists to measure the factor, not to trust it yet.' : ''}</div>`;
  const week = det.week.n ? ` · this week ${det.week.w}-${det.week.n - det.week.w}` : '';
  box.innerHTML = `
    <button class="ai-report-head" aria-expanded="false">📜 Model Report Card${week}<span class="sec-chev">▸</span></button>
    <div class="ai-report-body" hidden>
      ${bRows ? `<div class="rep-sec">By confidence (→ actual, vs claimed)</div>${bRows}
        <div class="ai-why" style="padding:4px 0 2px">Green = the model's confidence matched reality within 6 points. Red = it was overconfident.</div>` : ''}
      ${det.legacy ? `<div class="ai-why" style="padding:2px 0">${det.legacy} older graded pick${det.legacy === 1 ? '' : 's'} stored no confidence, so ${det.legacy === 1 ? 'it counts' : 'they count'} toward the all-time record but can't be calibrated.</div>` : ''}
      ${sRows ? `<div class="rep-sec">By sport</div>${sRows}` : ''}
      ${tRow ? `<div class="rep-sec">Totals</div>${tRow}` : ''}
      ${shRow ? `<div class="rep-sec">💰 Sharp money (new in v160)</div>${shRow}` : ''}
      ${recent ? `<div class="rep-sec">Recent picks (⚡ = against the line · 🎯 = totals)</div>${recent}` : ''}
      ${!bRows && !recent ? '<div class="ai-why" style="padding:6px 0">Detail builds as new picks grade — earlier picks only counted toward the totals.</div>' : ''}
      <button class="rep-export" type="button" style="margin-top:12px;width:100%;padding:9px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);font:inherit;cursor:pointer">📋 Copy my record data</button>
      <textarea class="rep-export-ta" readonly hidden style="width:100%;height:90px;margin-top:6px;font:12px/1.4 monospace;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:6px;box-sizing:border-box"></textarea>
      <div class="ai-why" style="margin-top:4px">Exports your graded picks so they can be analyzed for model tuning. Nothing leaves your device on its own.</div>
    </div>`;
  const head = box.querySelector('.ai-report-head'), body = box.querySelector('.ai-report-body');
  head.onclick = () => {
    const open = body.hidden;
    body.hidden = !open;
    head.classList.toggle('open', open);
    head.setAttribute('aria-expanded', String(open));
  };
  const exp = box.querySelector('.rep-export'), ta = box.querySelector('.rep-export-ta');
  if (exp) exp.onclick = async () => {
    const data = localStorage.getItem(TALLY_KEY) || '{}';
    let ok = false;
    try { await navigator.clipboard.writeText(data); ok = true; } catch (_) {}
    if (ok) {
      exp.textContent = '✓ Copied — paste it to Claude';
    } else { // clipboard blocked (some PWA contexts): reveal for manual select
      ta.value = data; ta.hidden = false; ta.focus(); ta.select();
      exp.textContent = 'Select all in the box below & copy';
    }
    setTimeout(() => { exp.textContent = '📋 Copy my record data'; }, 4000);
  };
  return box;
}

async function renderPredictions() {
  const sport = state.aiSport || FEATURED.sport;
  buildChips($('#ai-sport'), sport, (s) => { state.aiSport = s; renderPredictions(); }, sortedSports({ teamOnly: true }));
  const container = $('#ai-picks');
  container.innerHTML = '<div class="empty">Crunching the numbers…</div>';

  // Sharp-money splits ride the same backend as the Game Report, so it's
  // started alongside the slate and raced (capped) just before the picks run.
  const reportP = getBettingReport(sport).catch(() => null);
  const games = await getGames(sport, ymd(sportsDate())).catch(() => []);
  // Preseason games are excluded from picks entirely: backups play, results
  // predict nothing, and grading them would pollute the model's record.
  const playable = games.filter((g) => g.id && g.seasonType !== 1);
  const allPreseason = games.length > 0 && !playable.length;
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
    container.appendChild(el('div', 'empty', allPreseason
      ? 'Preseason only today — the model sits these out (backups play; results don\'t predict anything).'
      : 'No games today for this sport.'));
    renderTally('');
    return;
  }

  const dateStr = ymd(sportsDate());
  const report = await raceReport(reportP, SHARP_WAIT.picks);
  const preds = await Promise.all(playable.map((g) =>
    predictGame(sport, g, { splits: splitsFor(report, g) }).catch(() => null)));
  container.innerHTML = '';
  let right = 0, graded = 0;

  // Build a record per game and flag where the model bucks the betting favorite.
  // With moneylines posted, a disagreement only counts as an edge when the
  // model likes its side ≥5 probability points more than the de-vigged market
  // — coin-flip disagreements against a -110 line are noise, not signal.
  const MIN_EDGE_GAP = 5;
  // Totals edge: model's projected total vs the posted O/U, sport-scaled floor.
  // MLB raised 1.0 → 1.5 (v138): at 1.0 the model fired 23 totals picks in a
  // month and went 13-10 — near coin-flip volume off a season-average total.
  // CFB totals sit near 55 with far more spread than the NFL's ~45, so the
  // floor scales with them rather than inheriting the NFL's 4.
  const TOT_EDGE_MIN = { mlb: 1.5, nba: 6, nfl: 4, cfb: 6 };
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
          { s: sport, d: Number(dateStr), cf: p.conf, p: p.winner.name, m: matchupLabel(sport, g),
            ...(p.sharp ? { sh: p.sharp.pts } : {}) });
        resultTag = `<div class="ai-result ${hit ? 'win' : 'loss'}">${hit ? '✅ Model nailed it' : '❌ Model missed'}</div>`;
      }
      if (tot && g.home.score != null && g.away.score != null) {
        const total = g.home.score + g.away.score;
        if (total !== tot.line) {
          recordResult(`${g.id}:t`, tot.side === 'OVER' ? total > tot.line : total < tot.line, null,
            { s: sport, d: Number(dateStr), t: 1, p: `${tot.side} ${tot.line}`, m: matchupLabel(sport, g),
              pt: Math.round(tot.proj * 10) / 10 });
        }
      }
    } else if (p) {
      // stash the picks so they get graded later even if the tab isn't open
      recordPick(g.id, sport, dateStr, p.winner.name, info?.favName, p.conf, isEdge, p.sharp?.pts ?? null);
      if (tot) recordTotalPick(g.id, sport, dateStr, tot.side, tot.line, tot.proj);
    }
    return { g, p, info, gap, isEdge, tot, resultTag };
  });

  // No line ≠ no disagreement: if ESPN sent no odds, say so instead of
  // claiming the model agrees with a book that never posted.
  const anyLines = rows.some((r) => r.info?.favName);
  const upcomingEdges = rows.filter((r) => r.isEdge && gameState(r.g) !== 'final').length;
  container.appendChild(statBar(upcomingEdges,
    upcomingEdges ? 'model disagrees w/ book' : anyLines ? 'model in line w/ book' : 'no lines posted yet'));
  // Say plainly whether the sharp-money input was live for this slate — a
  // sleeping backend silently dropping a model factor is exactly the kind of
  // thing that should be visible, not guessed at.
  const sharpRows = rows.filter((r) => r.p?.sharp);
  if (sharpRows.length) {
    container.appendChild(el('div', 'ai-note',
      `💰 Sharp money folded into ${sharpRows.length} of ${rows.length} pick${rows.length === 1 ? '' : 's'} — DraftKings dollars vs tickets (via VSiN).`));
  } else if (BETTING_SPORTS.has(sport) && !report) {
    container.appendChild(el('div', 'ai-note',
      '💰 Sharp-money splits unavailable right now (betting backend asleep or down) — these picks are model-only.'));
  }
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
        ${p.sharp ? `<div class="ai-why" style="color:${p.sharp.agree ? 'var(--accent)' : 'var(--muted)'}">💰 ${p.sharp.handle}% of dollars vs ${p.sharp.bets}% of bets on ${esc(p.sharp.abbr)} — sharp side ${p.sharp.agree ? 'agrees' : 'disagrees'} (${p.sharp.pts > 0 ? '+' : ''}${p.sharp.pts.toFixed(1)} pts)</div>` : ''}
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
const TOTALS = { mlb: [7.5, 9.5, 'runs'], nba: [216, 233, 'pts'], nfl: [40.5, 48.5, 'pts'], cfb: [46.5, 62.5, 'pts'] };
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

const fanState = { sport: 'football', gamesByTeam: {} };
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
const NFLRANK_META_KEY = 'sportshub:fantasy:nflboard:src';
const loadNflBoard = () => { try { return JSON.parse(localStorage.getItem(NFLBOARD_KEY)) || []; } catch (_) { return []; } };
const saveNflBoard = (list) => { try { localStorage.setItem(NFLBOARD_KEY, JSON.stringify(list)); } catch (_) {} };
const loadNflRankMeta = () => { try { return JSON.parse(localStorage.getItem(NFLRANK_META_KEY)) || null; } catch (_) { return null; } };

// Position-rank -> tier (best few at a position = T1). Mirrors the backend's
// _ffl_tier so the built-in fallback and the live ranks tier the same way.
const nflTierFor = (posrank) => (posrank <= 4 ? 1 : posrank <= 10 ? 2 : posrank <= 20 ? 3 : posrank <= 32 ? 4 : 5);

// Built-in fallback board: reuse the maintained fantasy MOCK_POOL (already
// ranked, with positions) so auto-fill ALWAYS populates a real board even when
// the backend is down / not yet deployed. Tiered per position.
function nflFallbackRanks() {
  const seen = {};
  return MOCK_POOL.filter((p) => NFL_POS.includes(p.pos)).map((p) => {
    seen[p.pos] = (seen[p.pos] || 0) + 1;
    return { name: p.name, pos: p.pos, tier: nflTierFor(seen[p.pos]) };
  });
}

// Fill the board from real fantasy draft rankings. Prefers ESPN's live ranks
// (via the backend — the browser can't read ESPN's fantasy API directly), and
// falls back to the built-in board when the backend is unreachable, so it never
// comes up empty. Merges WITHOUT clobbering the user's own picks/edited tiers.
async function autoFillNflBoard() {
  let players = null, source = 'espn';
  try {
    const data = await fetchJSON(`${FANTASY_API}/api/fantasy/football/rankings?year=2026&limit=150`, 12 * 60 * 60000);
    if (data && Array.isArray(data.players) && data.players.length) players = data.players;
  } catch (_) {}
  if (!players) { players = nflFallbackRanks(); source = 'builtin'; }
  const board = loadNflBoard();
  const have = new Set(board.map((p) => (p.name || '').toLowerCase()));
  let added = 0;
  players.forEach((p) => {
    if (!p.name || !NFL_POS.includes(p.pos) || have.has(p.name.toLowerCase())) return;
    board.push({ name: p.name, pos: p.pos, tier: Math.min(5, Math.max(1, p.tier || 3)) });
    have.add(p.name.toLowerCase());
    added++;
  });
  if (added) {
    saveNflBoard(board);
    try { localStorage.setItem(NFLRANK_META_KEY, JSON.stringify({ at: Date.now(), source })); } catch (_) {}
    return { ok: true, added, source };
  }
  return { ok: false, added: 0, source, msg: 'Every ranked player is already on your board.' };
}

// --- 📰 Latest fantasy advice (FantasyPros) ---------------------------------
// fantasypros.com sends no CORS headers, so the browser CANNOT read their
// articles page or feeds directly — the backend scrapes it server-side and
// hands us clean JSON (`/api/articles/nfl`, see server/main.py). The last good
// payload is stashed on-device so the section paints instantly instead of
// waiting out a Render cold start, and still shows something when the backend
// is asleep. Articles open on FantasyPros (we can't fetch their body text for
// an in-app summary the way we do with ESPN's news feed).
const FP_KEY = 'sportshub:fparticles';
const FP_PAGE = 'https://www.fantasypros.com/nfl/articles/';
const loadArticleCache = () => { try { return JSON.parse(localStorage.getItem(FP_KEY)) || null; } catch (_) { return null; } };
const saveArticleCache = (items) => { try { localStorage.setItem(FP_KEY, JSON.stringify({ at: Date.now(), items })); } catch (_) {} };

function articleRowHTML(a) {
  const when = a.ts ? timeAgo(a.ts * 1000) : (a.published ? timeAgo(a.published) : '');
  const meta = [a.category, a.author, when].filter(Boolean).map(esc).join(' · ');
  return `
    <a href="${esc(a.url)}" target="_blank" rel="noopener" style="display:block;padding:9px 11px;margin:5px 0;border:1px solid var(--line);border-radius:10px;background:var(--card);text-decoration:none;color:inherit">
      <div style="font-size:13px;font-weight:700;line-height:1.35">${esc(a.title)} <span style="color:var(--muted);font-weight:500">↗</span></div>
      ${meta ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">${meta}</div>` : ''}
      ${a.summary ? `<div style="font-size:11.5px;color:var(--muted);margin-top:4px;line-height:1.45">${esc(a.summary)}</div>` : ''}
    </a>`;
}

// Honest fallback: no scrape, no invented content — say why and hand over the
// link. `stale` = we're showing a previously-cached list, not today's.
const articleNoteHTML = (msg) => `
  <div style="padding:10px 12px;border:1px dashed var(--line);border-radius:10px;font-size:11.5px;color:var(--muted);line-height:1.5">
    ${msg} <a href="${FP_PAGE}" target="_blank" rel="noopener" style="color:var(--accent)">Open FantasyPros ↗</a>
  </div>`;

function paintArticles(items, note) {
  const box = $('#pp-articles');
  if (!box) return;
  if (!items || !items.length) {
    box.innerHTML = articleNoteHTML(note || "Couldn't load articles right now.");
    return;
  }
  const head = items.slice(0, 6), rest = items.slice(6);
  box.innerHTML = `
    ${note ? `<div style="font-size:11px;color:var(--muted);margin:0 0 6px">${note}</div>` : ''}
    ${head.map(articleRowHTML).join('')}
    ${rest.length ? `<details class="tp-r" style="margin:6px 0;border:1px solid var(--line);border-radius:10px;background:var(--card)">
      <summary class="tp-sum" style="display:flex;align-items:center;gap:8px;padding:11px 12px;cursor:pointer;list-style:none;min-height:44px;box-sizing:border-box">
        <b style="font-size:13px;flex:1">+ ${rest.length} more article${rest.length === 1 ? '' : 's'}</b>
        <span class="tp-chev" style="color:var(--muted);flex:none">▸</span>
      </summary>
      <div style="padding:0 12px 10px">${rest.map(articleRowHTML).join('')}</div>
    </details>` : ''}
    <div style="font-size:11px;color:var(--muted);margin-top:6px">From <a href="${FP_PAGE}" target="_blank" rel="noopener" style="color:var(--accent)">FantasyPros ↗</a> — headlines only; tap one to read it there.</div>`;
}

async function renderFantasyArticles() {
  const box = $('#pp-articles');
  if (!box) return;
  const cached = loadArticleCache();
  // Paint the cached list first (instant), then refresh in the background.
  if (cached?.items?.length) paintArticles(cached.items, `Saved list — checking for new articles…`);
  else box.innerHTML = '<div class="muted" style="font-size:11.5px;padding:8px 2px">Loading fantasy articles…</div>';
  let data = null;
  try { data = await fetchJSON(`${FANTASY_API}/api/articles/nfl?limit=20`, 30 * 60000); } catch (_) {}
  if (fanState.sport !== 'football' || !$('#pp-articles')) return; // view moved on
  if (data?.ok && data.items?.length) {
    saveArticleCache(data.items);
    paintArticles(data.items, `Updated ${timeAgo(data.fetched * 1000)}`);
    return;
  }
  // Backend unreachable, or reachable but the scrape came back empty — those
  // are different problems, so say which one.
  const why = data
    ? "FantasyPros didn't return any articles (they may be blocking the scrape, or changed their layout)."
    : 'The backend is asleep or unreachable, so new articles could not be fetched.';
  if (cached?.items?.length) paintArticles(cached.items, `⚠️ Showing a saved list from ${timeAgo(cached.at)} — ${why}`);
  else paintArticles(null, `📰 ${why}`);
}

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
// Owner's 🎯 Draft-Turn Plan: 12-team half-PPR snake from slot 10, keepers
// Trey McBride (costs R7 · #82) and Drake Maye (costs R11 · #130 — an ~ADP-52
// consensus QB2/3 for an 11th; Kyren is NOT kept, so R6 is live). One entry
// per round R1–R11 — `pick` is the overall pick number, `tag` the one-line
// summary on the collapsed row, `groups` the tiered target lists (tier = board
// priority for the ⭐ merge), `keeper` rows render locked. Targets are
// consensus-style and aligned with the app's built-in ranked board (rank ≈
// pick number); edit here as the offseason moves.
// League-wide keepers (2026 "Nectars Bologna", 12-team keep-the-round league).
// Reported by the commissioner; the owner's own team is `you: true`. Only the
// PLAYER and the ROUND matter here — the league's 1st/2nd/final-keep bookkeeping
// (how many years a player has been held) doesn't affect the draft board, so
// it isn't modeled. Names must match MOCK_POOL_RAW spelling so the mock draft
// can pull them off the board.
// ✅ COMPLETE as of the commissioner's Aug-2026 sheet: all 12 teams have
// reported. Cummish (Hurd) reported NO keepers — that's a real answer, not a
// missing one, so it has no rows here and `LEAGUE_ORDER` still names the team.
// Append/edit here and everything downstream (turn-plan strikeouts, the keepers
// card, the mock draft pool, the ⭐ board merges) updates from this one list.
const LEAGUE_TEAMS_TOTAL = 12;
const LEAGUE_KEEPERS = [
  { team: 'CC', n: 'Chase Brown', p: 'RB', r: 6 },
  { team: 'CC', n: 'Brock Bowers', p: 'TE', r: 7 },
  { team: 'Future champ', n: 'Puka Nacua', p: 'WR', r: 6 },
  { team: 'Future champ', n: 'Nico Collins', p: 'WR', r: 11 },
  { team: 'Morning Woods', n: 'Cam Skattebo', p: 'RB', r: 6 },
  { team: 'Morning Woods', n: 'Chuba Hubbard', p: 'RB', r: 7 },
  { team: 'Thurgood Marshall', n: 'Jaxon Smith-Njigba', p: 'WR', r: 4 },
  { team: 'Thurgood Marshall', n: 'Colston Loveland', p: 'TE', r: 7 },
  { team: 'Slob On My Cobb', n: 'Ladd McConkey', p: 'WR', r: 6 },
  { team: 'Slob On My Cobb', n: 'Javonte Williams', p: 'RB', r: 7 },
  { team: 'Current Champ', n: 'Trey McBride', p: 'TE', r: 7, you: true },
  { team: 'Current Champ', n: 'Drake Maye', p: 'QB', r: 11, you: true },
  { team: 'GMDD', n: "Ja'Marr Chase", p: 'WR', r: 3 },
  { team: 'GMDD', n: 'Quinshon Judkins', p: 'RB', r: 5 },
  { team: 'Christel', n: 'Jaylen Waddle', p: 'WR', r: 5 },
  { team: 'Christel', n: "De'Von Achane", p: 'RB', r: 11 },
  { team: 'Samrizz', n: 'Justin Jefferson', p: 'WR', r: 8 },
  { team: 'Cheeky Clapz', n: 'Kyle Pitts', p: 'TE', r: 9 },
  { team: 'Cheeky Clapz', n: 'Seahawks D/ST', p: 'DST', r: 15 },
  { team: 'Goff Hits Women', n: 'Bhayshul Tuten', p: 'RB', r: 10 },
  { team: 'Goff Hits Women', n: 'Rachaad White', p: 'RB', r: 11 },
];
// 2026 draft order (slot 1–12) with the manager ↔ team-name mapping, so the
// keeper board reads in real draft order and the mock sim can use real names.
// The owner drafts at slot 10 ("McD" / Current Champ) — the 1.10 + 2.15 turn
// the Draft-Turn Plan is built around. `team: null` = hasn't reported keepers
// (all 12 have, as of the Aug-2026 sheet — Hurd/Cummish reported zero).
const LEAGUE_ORDER = [
  { slot: 1, mgr: 'Gotch', team: 'Thurgood Marshall' },
  { slot: 2, mgr: 'Riz', team: 'Samrizz' },
  { slot: 3, mgr: 'Hurd', team: 'Cummish' },
  { slot: 4, mgr: 'Hyman', team: 'Cheeky Clapz' },
  { slot: 5, mgr: 'Christel', team: 'Christel' },
  { slot: 6, mgr: 'Slemp', team: 'Slob On My Cobb' },
  { slot: 7, mgr: 'Woods', team: 'Morning Woods' },
  { slot: 8, mgr: 'Zach', team: 'Goff Hits Women' },
  { slot: 9, mgr: 'CC', team: 'CC' },
  { slot: 10, mgr: 'McD', team: 'Current Champ', you: true },
  { slot: 11, mgr: 'Buley', team: 'GMDD' },
  { slot: 12, mgr: 'Jew', team: 'Future champ' }, // Jew = Wolff
];
const keepNorm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
// name -> keeper entry, for "is this player already off the board?" lookups.
const KEPT_BY = (() => {
  const m = {};
  LEAGUE_KEEPERS.forEach((k) => { m[keepNorm(k.n)] = k; });
  return m;
})();
const keptEntry = (name) => KEPT_BY[keepNorm(name)] || null;
// Sanity guard (v153). A keeper name that isn't in MOCK_POOL doesn't error —
// mockStart quietly synthesizes a `rank:900, team:''` stub for it, so the sim
// looks fine while the player has no team label, sorts to the bottom of the
// board, and is undraftable in any sim with keepers toggled off. Kyle Pitts sat
// in exactly that state until v153 and nothing surfaced it. MOCK_POOL is
// defined further down the file, so this stays a function (called at render).
const keepersMissingFromPool = () => LEAGUE_KEEPERS.filter((k) => !MOCK_POOL.some((p) => keepNorm(p.name) === keepNorm(k.n)));
// "Reported" = the manager answered the commissioner, which includes answering
// "none" (Cummish). Counting distinct teams in LEAGUE_KEEPERS would wrongly
// file a zero-keeper team as still-outstanding.
const LEAGUE_TEAMS_IN = LEAGUE_ORDER.filter((t) => t.team).length;
const LEAGUE_TEAMS_OUT = LEAGUE_TEAMS_TOTAL - LEAGUE_TEAMS_IN;

const TURN_ROUNDS = [
  { r: 1, pick: '#10', tag: '🎯 your RB1 — Love or Saquon', note: 'The keeper board helps you: Chase, JSN, Jefferson, Puka, Achane, Nico and Bowers are all kept, so ~7 top-20 players never enter the draft while every team still picks in R1 — the board at #10 runs deep. Measured over 300 sims of the real keeper board (v156, after the pool was re-ranked to live ADP): 🟢 Derrick Henry 99% · Jeremiyah Love 79% · Drake London 67% · Saquon Barkley 55% · A.J. Brown 46% — and 🔴 Jeanty only 25%, BTJ 28%, CMC 1%, Jonathan Taylor 0%. Saquon is the change: real ADP has him ~14th, not top-5, so he now reaches you in over half of drafts. Take the RB here — Love and Jeanty survive to your 2.15 essentially never (0%), while the WR tier below is 93–100% to come back to you.', groups: [
    { label: '🎁 Rare falls — take instantly', tier: 1, players: [{ n: 'Ashton Jeanty', p: 'RB' }, { n: 'Brian Thomas Jr.', p: 'WR' }, { n: 'A.J. Brown', p: 'WR' }] },
    { label: '🎯 Your realistic RB1 — this is the pick', tier: 2, players: [{ n: 'Jeremiyah Love', p: 'RB' }, { n: 'Saquon Barkley', p: 'RB' }, { n: 'Derrick Henry', p: 'RB' }] },
    { label: 'WR instead — only if all three backs are gone', tier: 2, players: [{ n: 'Drake London', p: 'WR' }] },
  ] },
  { r: 2, pick: '#15', tag: 'the RB tier broke — take the value that fell', note: 'Only 4 picks happen between your two, but they clear the top RB tier: Love and Jeanty reach #15 in 0% of sims. Measured availability at #15: Terry McLaurin + Marvin Harrison Jr. + George Pickens 100% · Malik Nabers 99% · Davante Adams 98% · Garrett Wilson 97% · Kyren Williams 93% · Tee Higgins 75% · Bucky Irving 67% · Josh Jacobs 49%. Kyren is the value (back in the pool now that you keep Maye instead), and Pickens is new to the board — ESPN grades the Lamb/Pickens duo as two top-10 WRs after his 1,400-yard first year in Dallas.', groups: [
    { label: 'RB2 — if you went WR at 1.10, this is mandatory', tier: 2, players: [{ n: 'Kyren Williams', p: 'RB' }, { n: 'Bucky Irving', p: 'RB' }, { n: 'Josh Jacobs', p: 'RB' }] },
    { label: 'WR — the real value pocket', tier: 3, players: [{ n: 'Garrett Wilson', p: 'WR' }, { n: 'George Pickens', p: 'WR' }, { n: 'Malik Nabers', p: 'WR' }, { n: 'Tee Higgins', p: 'WR' }] },
  ] },
  { r: 3, pick: '#34', tag: 'RB2/RB3 + the WR value pocket', note: 'Aim to leave R3 with 2 RB + 1 WR — your QB and TE are already rostered, so every early pick goes to RB/WR. Measured at #34: Alvin Kamara + TreVeyon Henderson + DeVonta Smith 100% · Omarion Hampton 99% · Zay Flowers 99% · Courtland Sutton 97% · Rashee Rice 93%. ⚠️ Breece Hall is out of the plan — he survives to #34 only 6% of the time. Nabers is the R2 swing now, not R3.', groups: [
    { label: 'RB — round out the backfield', tier: 3, players: [{ n: 'Omarion Hampton', p: 'RB' }, { n: 'Alvin Kamara', p: 'RB' }, { n: 'TreVeyon Henderson', p: 'RB' }] },
    { label: 'WR — all of these are 93%+ to be here', tier: 3, players: [{ n: 'Rashee Rice', p: 'WR' }, { n: 'Courtland Sutton', p: 'WR' }, { n: 'Zay Flowers', p: 'WR' }, { n: 'DeVonta Smith', p: 'WR' }] },
  ] },
  { r: 4, pick: '#39', tag: '🆕 the Jadarian Price pick — HERE, not R5', note: 'Price moved up a round (v156). Nationally his ADP is 57.8 (Underdog) to 63.3, which is why the old plan put him at #58 — but national ADP does not know YOUR league, which keeps 8 running backs (Achane, Chase Brown, Skattebo, Hubbard, Javonte, Judkins, Tuten, White). Strip 8 backs out and the rest go earlier: measured, Price is on the board at #39 in 100% of sims but at #58 in only 12%. If you want the Seahawks rookie with the lead-back path (Walker left for KC, Charbonnet coming off a knee), this is the pick. No QB — ever; Maye is your R11 keeper.', groups: [
    { label: '🎯 The rookie with a lead-back path', tier: 3, players: [{ n: 'Jadarian Price', p: 'RB' }] },
    { label: 'RB depth — all 100% to be here', tier: 3, players: [{ n: 'TreVeyon Henderson', p: 'RB' }, { n: 'James Conner', p: 'RB' }, { n: 'Aaron Jones', p: 'RB' }] },
    { label: 'WR if the backfield is set', tier: 3, players: [{ n: 'DeVonta Smith', p: 'WR' }, { n: 'Zay Flowers', p: 'WR' }, { n: 'Jerry Jeudy', p: 'WR' }, { n: 'Calvin Ridley', p: 'WR' }] },
  ] },
  { r: 5, pick: '#58', tag: 'RB volume + WR3', note: 'Assume Price is gone (88%). What actually survives to #58: David Montgomery 90% · Jakobi Meyers 86% · Tony Pollard 78% · Jordan Addison 74% · RJ Harvey 59% · Xavier Worthy 55%. Travis Hunter (37%) and a second TE are luxuries you do not need — McBride is kept.', groups: [
    { label: 'RB volume', tier: 4, players: [{ n: 'David Montgomery', p: 'RB' }, { n: 'Tony Pollard', p: 'RB' }, { n: 'RJ Harvey', p: 'RB' }] },
    { label: 'WR upside', tier: 4, players: [{ n: 'Jakobi Meyers', p: 'WR' }, { n: 'Jordan Addison', p: 'WR' }, { n: 'Xavier Worthy', p: 'WR' }] },
  ] },
  { r: 6, pick: '#63', tag: 'bonus pick — Kyren’s old slot', note: 'This pick is live again now that Kyren isn’t kept. Only 4 picks after your #58, so the R5 names thin fast (Montgomery 49%, Addison 63%, Worthy 40%) — behind them sits a wall of players who are on the board in 100% of sims. Take volume.', groups: [
    { label: 'RB volume swings — 100% available', tier: 4, players: [{ n: "D'Andre Swift", p: 'RB' }, { n: 'Isiah Pacheco', p: 'RB' }, { n: 'Brian Robinson Jr.', p: 'RB' }] },
    { label: 'WR upside — 100% available', tier: 4, players: [{ n: 'Rome Odunze', p: 'WR' }, { n: 'Chris Godwin', p: 'WR' }, { n: 'Deebo Samuel', p: 'WR' }] },
  ] },
  { r: 7, pick: '#82', keeper: 'Trey McBride', kpos: 'TE' },
  { r: 8, pick: '#87', tag: 'skip the QB run — stack RB/WR', note: 'This used to be your QB1 window. Others will spend R8–R10 chasing Nix/Baker/Herbert — you have Maye for an 11th. Take the best RB/WR they pass over.', groups: [
    { label: 'Best available RB/WR', tier: 4, players: [{ n: 'Jaylen Warren', p: 'RB' }, { n: 'Keon Coleman', p: 'WR' }, { n: 'Chris Olave', p: 'WR' }] },
  ] },
  { r: 9, pick: '#106', tag: 'rehab discounts + upside', note: 'Judkins (ankle/fibula, Dec) and Skattebo (ankle, cleared) are big talents at an injury discount. Corum is no longer YOUR handcuff — he backs up a Kyren you didn’t keep — but he’s still a value/trade chip if he slides.', groups: [
    { label: 'Upside swings', tier: 4, players: [{ n: 'Quinshon Judkins', p: 'RB' }, { n: 'Cam Skattebo', p: 'RB' }, { n: 'Jayden Reed', p: 'WR' }, { n: 'Josh Downs', p: 'WR' }] },
  ] },
  { r: 10, pick: '#111', tag: 'handcuff your RB1 + darts', note: 'If you took Jeremiyah Love at 2.15, Trey Benson (ARI) is now YOUR handcuff — grab him here. Otherwise best dart standing.', groups: [
    { label: 'Your handcuff (if you drafted Love)', tier: 4, players: [{ n: 'Trey Benson', p: 'RB' }] },
    { label: 'Best dart on the board', tier: 5, players: [{ n: 'Braelon Allen', p: 'RB' }, { n: 'Blake Corum', p: 'RB' }, { n: 'Rashid Shaheed', p: 'WR' }, { n: 'Marvin Mims Jr.', p: 'WR' }] },
  ] },
  { r: 11, pick: '#130', keeper: 'Drake Maye', kpos: 'QB' },
];
// R12+ (picks #135 · #154 · #159 · #178) — late-round sleeper pools, not
// per-round: draft whoever's left by group priority. K/DST stay out of the ⭐
// board merge. Deliberately skipped: Ricky Pearsall (knee — 2026 season in
// doubt) and Isaac Guerendo (PUP, pec).
const TURN_SLEEPERS = [
  { label: '🧢 Handcuff lottery tickets — bell-cow upside one injury away', tier: 5, players: [{ n: 'Jaylen Wright', p: 'RB' }, { n: 'Tank Bigsby', p: 'RB' }, { n: 'Tyjae Spears', p: 'RB' }] },
  { label: '🚀 WR darts & rookie fliers', tier: 5, players: [{ n: 'Carnell Tate', p: 'WR' }, { n: 'Zachariah Branch', p: 'WR' }, { n: 'Jauan Jennings', p: 'WR' }] },
  { label: '🧊 Maye insurance — one cheap QB2 at the very end, or just stream', tier: 5, players: [{ n: 'Kyler Murray', p: 'QB' }, { n: 'Jordan Love', p: 'QB' }, { n: 'Dak Prescott', p: 'QB' }] },
  { label: '🦵 K & 🛡 DST — your last two picks, never earlier', tier: 5, players: [{ n: 'Brandon Aubrey', p: 'K' }, { n: 'Jake Bates', p: 'K' }, { n: 'Eagles D/ST', p: 'DST' }, { n: 'Broncos D/ST', p: 'DST' }] },
];
// 💰 Contract Angle — players whose 2026 contract situation is a reason to
// target them: either just signed/re-signed for big money (team commitment =
// locked-in role and volume) or in a contract year playing for the next deal.
// Curated from verified Aug-2026 reporting (web-checked like the v141 plan
// facts); `deal` is the one-line why, `tier` feeds the ⭐ board merge. Edit
// here as extensions get signed — a contract-year guy who gets paid moves up
// to the `paid` group.
const CONTRACT_WATCH = [
  { key: 'paid', label: '💰 Just paid — big new money, locked-in role', color: '#3ad29f',
    note: 'A big signing is the team telling you its plans: guaranteed money buys guaranteed touches. These deals all closed this offseason.',
    players: [
      { n: 'Jaxon Smith-Njigba', p: 'WR', tier: 1, deal: '4yr/$168.6M extension (SEA) — highest-paid WR in NFL history' },
      { n: "De'Von Achane", p: 'RB', tier: 2, deal: 'Extended — Miami named him one of three "pillars" to build around' },
      { n: 'Kenneth Walker III', p: 'RB', tier: 2, deal: '3yr/$43M with the Chiefs, fresh off the Super Bowl LX MVP' },
      { n: 'Mike Evans', p: 'WR', tier: 3, deal: '3yr deal in San Francisco — a real target-earner move at 32' },
      { n: 'Aaron Jones', p: 'RB', tier: 4, deal: 'Re-upped in Minnesota — committee, but the trusted half of it' },
      { n: 'Alec Pierce', p: 'WR', tier: 5, deal: 'Re-signed IND 4yr/$114M ($84M gtd) — paid like a true WR1' },
    ] },
  { key: 'year', label: '🔥 Contract year — playing for the next deal', color: '#d9b341',
    note: 'Final-year guys with no extension done. The incentive is obvious — and their teams will feed them to see what they have before paying.',
    players: [
      { n: 'Puka Nacua', p: 'WR', tier: 1, deal: 'Last year of a Day-3 rookie deal ($1.2M cap hit), no extension yet' },
      { n: 'Chase Brown', p: 'RB', tier: 3, deal: 'Unextended in CIN — 22 TDs the last two years, tag talk looming' },
      { n: 'Rashee Rice', p: 'WR', tier: 3, deal: 'Final rookie year; KC has said no extension before the season' },
      { n: 'Sam LaPorta', p: 'TE', tier: 4, deal: 'Final year of his rookie deal — elite per-route numbers when healthy' },
      { n: 'Kyler Murray', p: 'QB', tier: 5, deal: '1-yr prove-it in Minnesota after the ARI release' },
    ] },
];
// Why a pick was interesting beyond its board rank: the contract angle it fits
// (💰 just paid / 🔥 contract year) and whether it was on the Draft-Turn Plan.
// Powers the mock draft's post-draft footnotes — a "-13 reach" on a guy you
// deliberately targeted for a real reason isn't the same as a random reach.
function pickAngles(name) {
  const out = [];
  CONTRACT_WATCH.forEach((g) => {
    const p = (g.players || []).find((x) => keepNorm(x.n) === keepNorm(name));
    if (p) out.push({ icon: g.key === 'paid' ? '💰' : '🔥', color: g.color, kind: g.key === 'paid' ? 'Just paid' : 'Contract year', note: p.deal });
  });
  let planned = null;
  TURN_ROUNDS.forEach((rd) => {
    (rd.groups || []).forEach((grp) => {
      if (!planned && (grp.players || []).some((x) => keepNorm(x.n) === keepNorm(name))) {
        planned = { icon: '🎯', color: '#8fb0ff', kind: `Plan target · R${rd.r}`, note: grp.label };
      }
    });
  });
  if (!planned) {
    TURN_SLEEPERS.forEach((grp) => {
      if (!planned && (grp.players || []).some((x) => keepNorm(x.n) === keepNorm(name))) {
        planned = { icon: '🎯', color: '#8fb0ff', kind: 'Sleeper-pool target', note: grp.label };
      }
    });
  }
  if (planned) out.push(planned);
  return out;
}
// Owner's league scoring (edit here if the league settings change).
const NFL_SCORING = 'Half-PPR (0.5 per reception)';
const daysUntil = (iso) => Math.ceil((new Date(iso + 'T12:00:00') - new Date()) / 86400000);

function renderFantasyFootball() {
  const box = $('#fantasy-football');
  if (!box) return;
  const board = loadNflBoard();
  const filter = fanState.nflFilter || 'ALL';
  // First open with an empty board: pull ESPN's real draft rankings once, then
  // re-render. Guarded so re-renders (filter/tier taps) don't re-fetch.
  if (!board.length && !fanState.nflRankTried) {
    fanState.nflRankTried = true;
    // Re-render ONLY if we're still on the Football sub-view — this resolves
    // async (network + fallback), and without the guard a late resolution would
    // repaint football content over the baseball view the user switched to.
    autoFillNflBoard().then((r) => { if (r.ok && fanState.sport === 'football') renderFantasyFootball(); });
  }
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
    ? shown.map((p) => `<div class="bd-row"><select class="bd-tier-sel t${p.tier}" data-name="${esc(p.name)}" aria-label="Tier for ${esc(p.name)}">${[1, 2, 3, 4, 5].map((t) => `<option value="${t}"${t === p.tier ? ' selected' : ''}>T${t}</option>`).join('')}</select><span class="bd-name">${esc(p.name)}</span><span class="bd-pos">${esc(p.pos)}</span><button class="bd-rm" data-name="${esc(p.name)}" aria-label="Remove ${esc(p.name)}">×</button></div>`).join('')
    : '<div class="muted" style="padding:8px 2px">No targets yet — add players below, or tap a suggestion.</div>';

  const rMeta = loadNflRankMeta();
  const rankNote = !rMeta
    ? "Tap to pre-fill the board from real fantasy draft ranks (then edit tiers freely)."
    : (rMeta.source === 'builtin'
      ? "Pre-filled from a built-in ranked board (ESPN live ranks weren't reachable). Tiers are editable — tap to add any missing names."
      : "Ranked from ESPN's real fantasy draft ranks. Tiers are editable — tap to add any missing names.");
  const filterChips = ['ALL', 'QB', 'RB', 'WR', 'TE'].map((f) =>
    `<button class="chip${f === filter ? ' active' : ''}" data-filter="${f}">${f === 'ALL' ? 'All' : f}</button>`).join('');
  const sugg = Object.entries(NFL_SUGGEST).map(([pos, names]) =>
    `<div class="pp-sugg-row"><span class="pp-sugg-pos">${pos}</span>${names.map((n) =>
      `<button class="chip sm" data-add="${esc(n)}" data-pos="${pos}">${esc(n)}</button>`).join('')}</div>`).join('');

  // 🎯 Draft-Turn Plan — round-by-round plan, each round a collapsed
  // tap-to-expand <details> row (native, no JS wiring; inline styles so it
  // always renders regardless of stylesheet state — see the v74 note).
  const tierColor = { 1: '#3ad29f', 2: '#d9b341', 3: '#8fb0ff', 4: '#c9a2e8', 5: '#9fb3c8' };
  // A target that another team has KEPT can't be drafted — render it struck
  // through with who holds it, so a stale plan can't send you hunting a player
  // who was never going to be there.
  const tpGroup = (g) => `
    <div style="margin:8px 0">
      <div style="font-size:12px;font-weight:700;color:${tierColor[g.tier] || 'var(--muted)'};margin-bottom:5px">${esc(g.label)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${g.players.map((pl) => {
        const k = keptEntry(pl.n);
        if (k) return `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px dashed var(--line);border-radius:999px;font-size:12.5px;background:transparent;opacity:.6"><b style="text-decoration:line-through">${esc(pl.n)}</b><span style="color:var(--muted);font-size:11px">🔒 ${esc(k.you ? 'your keeper' : k.team)}</span></span>`;
        return `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px solid var(--line);border-radius:999px;font-size:12.5px;background:var(--card)"><b>${esc(pl.n)}</b><span style="color:var(--muted);font-size:11px">${esc(pl.p)}</span></span>`;
      }).join('')}</div>
    </div>`;
  const tpSummary = (left, pick, tag) => `
    <summary class="tp-sum" style="display:flex;align-items:center;gap:8px;padding:11px 12px;cursor:pointer;list-style:none;min-height:44px;box-sizing:border-box">
      <b style="font-size:13px;flex:none">${left}</b>
      <span style="color:var(--muted);font-size:11.5px;font-variant-numeric:tabular-nums;flex:none">${esc(pick)}</span>
      <span style="flex:1;font-size:12.5px;font-weight:700;min-width:0">${esc(tag)}</span>
      <span class="tp-chev" style="color:var(--muted);flex:none">▸</span></summary>`;
  const turnPlanHTML = TURN_ROUNDS.map((rd) => {
    if (rd.keeper) return `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;margin:6px 0;border:1px dashed var(--line);border-radius:10px;font-size:12.5px;background:var(--card)">
        <b style="font-size:13px;flex:none">R${rd.r}</b>
        <span style="color:var(--muted);font-size:11.5px;font-variant-numeric:tabular-nums;flex:none">${esc(rd.pick)}</span>
        <span style="flex:1;min-width:0">🔒 Keeper — <b>${esc(rd.keeper)}</b> <span style="color:var(--muted);font-size:11px">${esc(rd.kpos)}</span></span>
      </div>`;
    return `
      <details class="tp-r" style="margin:6px 0;border:1px solid var(--line);border-radius:10px;background:var(--card)">
        ${tpSummary('R' + rd.r, rd.pick, rd.tag)}
        <div style="padding:0 12px 10px">
          ${rd.note ? `<div style="font-size:11.5px;color:var(--muted)">${esc(rd.note)}</div>` : ''}
          ${rd.groups.map(tpGroup).join('')}
        </div>
      </details>`;
  }).join('') + `
      <details class="tp-r" style="margin:6px 0;border:1px solid var(--line);border-radius:10px;background:var(--card)">
        ${tpSummary('R12+', '#135+', '😴 late-round sleepers')}
        <div style="padding:0 12px 10px">
          <div style="font-size:11.5px;color:var(--muted)">Picks #135 · #154 · #159 · #178 (R11 #130 goes to your Maye keeper) — draft whoever's left, in group order.</div>
          ${TURN_SLEEPERS.map(tpGroup).join('')}
        </div>
      </details>`;

  // 💰 Contract Angle — one row per player (name · pos · the deal detail),
  // grouped paid vs contract-year. Inline styles per the v74 lesson.
  const contractHTML = CONTRACT_WATCH.map((g) => `
    <div style="margin:10px 0 14px">
      <div style="font-size:12.5px;font-weight:700;color:${g.color};margin-bottom:3px">${esc(g.label)}</div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:7px">${esc(g.note)}</div>
      ${g.players.map((pl) => `
        <div style="display:flex;align-items:baseline;gap:8px;padding:7px 10px;margin:4px 0;border:1px solid var(--line);border-radius:10px;background:var(--card);flex-wrap:wrap">
          <b style="font-size:13px;flex:none">${esc(pl.n)}</b>
          <span style="color:var(--muted);font-size:11px;flex:none">${esc(pl.p)}</span>
          <span style="flex:1;min-width:180px;font-size:11.5px;color:var(--muted)">${esc(pl.deal)}</span>
        </div>`).join('')}
    </div>`).join('');

  // 🔒 League Keepers — the whole league in real draft order, so it reads like
  // the draft room: who picks where, what they've locked up, and who hasn't
  // reported. Keep-the-round means a keeper costs that team that round's pick.
  const keepersOf = (team) => LEAGUE_KEEPERS.filter((k) => k.team === team).sort((a, b) => a.r - b.r);
  const keeperHTML = LEAGUE_ORDER.map((t) => {
    const ks = t.team ? keepersOf(t.team) : [];
    const body = !t.team
      ? '<span style="font-size:11.5px;color:var(--muted)">keepers not reported yet</span>'
      : ks.length
        ? ks.map((k) => `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;margin:2px 3px 2px 0;border:1px solid var(--line);border-radius:999px;font-size:12px;background:var(--card)"><b>${esc(k.n)}</b><span style="color:var(--muted);font-size:10.5px">${esc(k.p)} · R${k.r}</span></span>`).join('')
        : '<span style="font-size:11.5px;color:var(--muted)">no keepers</span>';
    return `
      <div style="display:flex;gap:9px;padding:9px 10px;margin:4px 0;border:1px solid ${t.you ? 'var(--accent)' : 'var(--line)'};border-radius:10px;background:var(--card);align-items:flex-start">
        <b style="font-size:12.5px;flex:none;width:22px;text-align:right;color:var(--muted);font-variant-numeric:tabular-nums">${t.slot}</b>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:3px">${esc(t.mgr)}${t.you ? ' <span style="color:var(--accent);font-weight:600">— you</span>' : ''}${t.team ? ` <span style="color:var(--muted);font-weight:500;font-size:11px">${esc(t.team)}</span>` : ''}</div>
          <div>${body}</div>
        </div>
      </div>`;
  }).join('');
  // Who actually picks between your two turn picks (snake: R1 …10,11,12 →
  // R2 12,11,10). Knowing their keepers tells you what they still NEED.
  const missingFromPool = keepersMissingFromPool();
  const turnFoes = [11, 12].map((s) => LEAGUE_ORDER.find((t) => t.slot === s)).filter(Boolean);
  const turnInsight = turnFoes.map((t) => {
    const ks = t.team ? keepersOf(t.team) : [];
    const pos = [...new Set(ks.map((k) => k.p))];
    return `<b>${esc(t.mgr)}</b> ${ks.length ? `has ${esc(pos.join('/'))} locked (${ks.map((k) => esc(k.n)).join(', ')})` : 'hasn\'t reported keepers'}`;
  }).join(' · ');

  const liveOn = !!(fanState.cfg && fanState.cfg.football);
  box.innerHTML = `
    ${liveOn ? '<div style="margin-bottom:10px"><button id="pp-live" class="fan-btn ghost">← Back to live league</button></div>' : ''}
    <div class="setup-card pp-hero">
      <div class="pp-kicker">🏈 NFL Fantasy — ${liveOn ? 'Draft Tools' : 'Preseason Prep'}</div>
      <div class="pp-count">${status}</div>
      <div class="pp-scoring">🏆 League scoring: <b>${esc(NFL_SCORING)}</b></div>
      <div class="muted" style="margin-top:8px">${liveOn ? 'Your live league is connected — tap “Back to live league” for matchups, standings & roster. These draft tools stay here year-round.' : 'Your live ESPN league — matchups, roster, standings — will sync here once the season starts and the league is connected. Until then, get your draft ready below.'}</div>
    </div>

    <h2 class="section-title">📰 Fantasy Advice</h2>
    <div class="muted" style="font-size:11.5px;margin:2px 0 8px">Latest draft strategy, sleepers and waiver advice from <b>FantasyPros</b>, pulled through the backend (their site can't be read from the browser). Opens on their site.</div>
    <div id="pp-articles"></div>

    <h2 class="section-title">Team Research</h2>
    <div id="tr-nav" class="tr-nav"></div>
    <div class="tr-bar"><label for="tr-team">Team</label><select id="tr-team"><option>Loading teams…</option></select></div>
    <div class="muted" style="font-size:11.5px;margin:2px 0 8px">Projected offensive fantasy starters from the latest depth chart (QB · RB · WR · TE). Tap a player for more info.</div>
    <div id="tr-content" class="tr-content"></div>

    <h2 class="section-title">🔒 League Keepers &amp; Draft Order</h2>
    <div class="muted" style="font-size:11.5px;margin:2px 0 8px">The league in draft order — <b>${LEAGUE_KEEPERS.length} players off the board</b>, ${LEAGUE_TEAMS_OUT ? `from ${LEAGUE_TEAMS_IN} of ${LEAGUE_TEAMS_TOTAL} teams <b>(${LEAGUE_TEAMS_OUT} still to report)</b>` : `<b>all ${LEAGUE_TEAMS_TOTAL} teams reported</b>`}. Keep-the-round: a keeper costs that team that round's pick, so R1–R2 stay full while this much talent is gone — the board at your <b>1.10</b> is <b>deeper than a normal draft</b>.</div>
    <div class="setup-card" style="padding:12px 14px">${keeperHTML}
      ${missingFromPool.length ? `<div style="margin-top:10px;padding:9px 11px;border:1px dashed #e0655f;border-radius:10px;font-size:11.5px;line-height:1.5">
        <b style="color:#e0655f">⚠️ Not on the mock-draft board:</b> ${missingFromPool.map((k) => `<b>${esc(k.n)}</b>`).join(', ')}. The sim still places ${missingFromPool.length > 1 ? 'them' : 'him'} as ${missingFromPool.length > 1 ? 'keepers' : 'a keeper'}, but with no pro team and a bottom-of-board rank — add to <code>MOCK_POOL_RAW</code> to fix.
      </div>` : ''}
      <div style="margin-top:10px;padding:9px 11px;border:1px dashed var(--gold);border-radius:10px;font-size:11.5px;line-height:1.5">
        <b style="color:var(--gold)">🔄 Your turn (1.10 → 2.15):</b> only <b>4 picks</b> happen in between, from just two managers — ${turnInsight}. Read what they still need to guess what survives back to you.
      </div>
    </div>

    <h2 class="section-title">🎯 Draft-Turn Plan</h2>
    <div class="muted" style="font-size:11.5px;margin:2px 0 8px">Your full draft from <b>slot 10</b> (12-team half-PPR snake; keepers <b>McBride R7</b> + <b>Maye R11</b> — Kyren goes back in the pool). Tap a round to expand its targets — R12+ is the sleeper pool.</div>
    <div class="setup-card" style="padding:12px 14px">${turnPlanHTML}
      <div style="margin-top:10px"><button id="tp-add" class="fan-btn">⭐ Add these targets to my board</button> <span id="tp-note" class="muted" style="font-size:11.5px"></span></div>
    </div>

    <h2 class="section-title">💰 Contract Angle</h2>
    <div class="muted" style="font-size:11.5px;margin:2px 0 8px">Follow the money: guys who just got <b>paid big</b> (the team is committing volume) and guys in a <b>contract year</b> with everything to play for. Verified this offseason — an extension moves a player up a group.</div>
    <div class="setup-card" style="padding:12px 14px">${contractHTML}
      <div style="margin-top:4px"><button id="cw-add" class="fan-btn">⭐ Add contract targets to my board</button> <span id="cw-note" class="muted" style="font-size:11.5px"></span></div>
    </div>

    <h2 class="section-title">My Draft Board</h2>
    <details class="tp-r" id="bd-wrap"${fanState.bdOpen ? ' open' : ''} style="border:1px solid var(--line);border-radius:10px;background:var(--card);margin-bottom:4px">
      <summary class="tp-sum" style="display:flex;align-items:center;gap:8px;padding:11px 12px;cursor:pointer;list-style:none;min-height:44px;box-sizing:border-box">
        <b style="font-size:13px;flex:none">📋 ${board.length} player${board.length === 1 ? '' : 's'}</b>
        <span style="flex:1;font-size:11.5px;color:var(--muted);min-width:0">tap to ${fanState.bdOpen ? 'collapse' : 'open'} · add, re-tier, filter</span>
        <span class="tp-chev" style="color:var(--muted);flex:none">▸</span>
      </summary>
      <div style="padding:0 12px 12px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
          <button id="bd-autofill" class="fan-btn">⚡ Auto-fill ESPN rankings</button>
          <span id="bd-rank-note" class="muted" style="font-size:11.5px">${rankNote}</span>
        </div>
        <div class="chips" style="margin-bottom:10px">${filterChips}</div>
        <div class="bd-list">${boardHTML}</div>
        <div class="muted" style="font-size:11px;margin:4px 0 0">Tap a player's <b>tier</b> dropdown to re-rank them; the board re-sorts by position then tier.</div>
        <div class="pp-add">
          <input id="bd-name" type="text" placeholder="Add a player…" autocomplete="off" />
          <select id="bd-pos">${NFL_POS.map((p) => `<option>${p}</option>`).join('')}</select>
          <select id="bd-tier">${[1, 2, 3, 4, 5].map((t) => `<option value="${t}"${t === 3 ? ' selected' : ''}>Tier ${t}</option>`).join('')}</select>
          <button id="bd-add" class="fan-btn">Add</button>
        </div>
        <div class="muted" style="font-size:12px;margin:12px 0 6px">Quick add — popular names to start (tap to add, then edit freely; not a ranking):</div>
        ${sugg}
      </div>
    </details>

    <h2 class="section-title">Prep Tips</h2>
    <ul class="pp-tips">
      <li>Your league is <b>half-PPR</b> (0.5/reception) — a middle ground: pass-catching backs and slot receivers get a modest bump, but volume and TDs still rule. Value receptions; don't over-chase them.</li>
      <li>Plan the early rounds as <b>tiers</b>, not exact names — your slot and position runs will move the board.</li>
      <li>Track <b>bye weeks</b> so you don't stack too many starters on the same week.</li>
      <li>Don't reach for <b>QB or TE</b> early unless it's a truly elite one — both are deep.</li>
      <li><b>Handcuff</b> your stud RB late, and save a bench spot for a Week-1 waiver dart.</li>
    </ul>

    <h2 class="section-title">Offseason Timeline</h2>
    <div class="tl-list">${tl}</div>
    <div class="muted" style="font-size:11px;margin-top:6px">Expected 2026 dates — may shift when the official calendar is set.</div>`;

  const addPlayer = (name, pos, tier) => {
    name = (name || '').trim();
    if (!name) return;
    const list = loadNflBoard();
    if (list.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
    list.push({ name, pos, tier });
    fanState.bdOpen = true;
    saveNflBoard(list);
    renderFantasyFootball();
  };
  // Remember whether the Draft Board is expanded — every edit (add, remove,
  // re-tier, filter, auto-fill) re-renders the view, and collapsing the board
  // out from under you mid-edit would be maddening.
  const bdWrap = box.querySelector('#bd-wrap');
  if (bdWrap) bdWrap.addEventListener('toggle', () => { fanState.bdOpen = bdWrap.open; });
  box.querySelectorAll('[data-filter]').forEach((b) => (b.onclick = () => { fanState.bdOpen = true; fanState.nflFilter = b.dataset.filter; renderFantasyFootball(); }));
  box.querySelectorAll(".bd-rm").forEach((b) => (b.onclick = () => { fanState.bdOpen = true; saveNflBoard(loadNflBoard().filter((p) => p.name !== b.dataset.name)); renderFantasyFootball(); }));
  box.querySelectorAll('.bd-tier-sel').forEach((s) => (s.onchange = () => {
    const list = loadNflBoard();
    const pl = list.find((p) => p.name === s.dataset.name);
    if (pl) { pl.tier = Number(s.value) || pl.tier; fanState.bdOpen = true; saveNflBoard(list); renderFantasyFootball(); }
  }));
  box.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => addPlayer(b.dataset.add, b.dataset.pos, 3)));
  const addBtn = box.querySelector('#bd-add');
  if (addBtn) addBtn.onclick = () => addPlayer(box.querySelector('#bd-name').value, box.querySelector('#bd-pos').value, Number(box.querySelector('#bd-tier').value) || 3);
  const afBtn = box.querySelector('#bd-autofill');
  if (afBtn) afBtn.onclick = async () => {
    afBtn.disabled = true; afBtn.textContent = '⚡ Loading…';
    const r = await autoFillNflBoard();
    if (r.ok) { renderFantasyFootball(); return; } // re-render rebuilds the button
    const note = box.querySelector('#bd-rank-note');
    if (note) note.textContent = r.msg;
    afBtn.disabled = false; afBtn.textContent = '⚡ Auto-fill ESPN rankings';
  };
  // Merge every round's targets + the sleeper pool into the editable board
  // (non-destructive; tier = draft priority). Skips K/DST (board noise) and the
  // keepers (already rostered).
  const tpBtn = box.querySelector('#tp-add');
  if (tpBtn) tpBtn.onclick = () => {
    const list = loadNflBoard();
    const have = new Set(list.map((p) => (p.name || '').toLowerCase()));
    let added = 0;
    const groups = TURN_ROUNDS.flatMap((rd) => rd.groups || []).concat(TURN_SLEEPERS);
    let skipped = 0;
    groups.forEach((g) => g.players.forEach((pl) => {
      if (pl.p === 'K' || pl.p === 'DST') return;
      if (have.has(pl.n.toLowerCase())) return;
      if (keptEntry(pl.n)) { skipped++; return; } // kept by a league team — undraftable
      list.push({ name: pl.n, pos: pl.p, tier: g.tier });
      have.add(pl.n.toLowerCase());
      added++;
    }));
    const n = box.querySelector('#tp-note');
    if (added) {
      saveNflBoard(list);
      if (skipped) fanState.tpSkipped = skipped;
      renderFantasyFootball();
    } else if (n) {
      n.textContent = skipped
        ? `All draftable turn targets are already on your board (${skipped} skipped — kept by other teams).`
        : 'All turn targets are already on your board.';
    }
  };
  // Same non-destructive merge for the 💰 Contract Angle names (tier comes
  // from each player's entry; skips anyone already on the board).
  const cwBtn = box.querySelector('#cw-add');
  if (cwBtn) cwBtn.onclick = () => {
    const list = loadNflBoard();
    const have = new Set(list.map((p) => (p.name || '').toLowerCase()));
    let added = 0;
    CONTRACT_WATCH.forEach((g) => g.players.forEach((pl) => {
      if (have.has(pl.n.toLowerCase())) return;
      list.push({ name: pl.n, pos: pl.p, tier: pl.tier });
      have.add(pl.n.toLowerCase());
      added++;
    }));
    if (added) { saveNflBoard(list); renderFantasyFootball(); }
    else { const n = box.querySelector('#cw-note'); if (n) n.textContent = 'All contract targets are already on your board.'; }
  };
  const liveBtn = box.querySelector('#pp-live');
  if (liveBtn) liveBtn.onclick = () => { fanState.footballView = 'live'; renderFantasy(); };
  initTeamResearch();
  renderFantasyArticles();
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
    fbSeasonData((y) => `${FBCORE}/seasons/${y}/teams/${id}/depthcharts`, 24 * 3600000,
      (d) => (d.items || []).length).then((r) => r.data),
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
  fanState.researchRole = fanState.researchRole || {}; // per-athlete depth-chart role, read by the player modal's 2026 outlook
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
      + starters.map((a) => {
        fanState.researchRole[a.id] = { pos, starter: true, slots: n };
        return row(a, true, null, nwOf(a));
      }).join('')
      + backups.map((a, i) => {
        const o = stealOdds(pos, i + 1, starters, a);
        const nw = nwOf(a);
        let { pct, note } = o;
        if (starterDown && i === 0) { pct = Math.max(pct, 80); note = 'starter sidelined (news)'; }
        if (nw && nw.signal === 'promote') { pct = Math.max(pct, i === 0 ? 66 : 46); note = 'beat buzz: first-team reps'; }
        pct = Math.min(94, pct);
        const cls = pct >= 45 ? 'hi' : pct >= 22 ? 'mid' : 'lo';
        fanState.researchRole[a.id] = { pos, starter: false, depth: i + 1, slots: n, pct };
        return row(a, false, { pct, note, cls }, nw);
      }).join('')
      + '</div>';
  }).join('')
    + '<div class="muted" style="font-size:11px;margin-top:6px">“% to start” is our estimate from depth-chart rank, the starter’s injury status, age &amp; recent ESPN news — not a real probability.'
    + (data.fallback ? ' Depth order unavailable, so it’s roster-by-position here.' : '') + '</div>';
  c.querySelectorAll('.tr-player').forEach((b) => (b.onclick = () => openPlayerModal(b.dataset.aid)));
}

// --- Player health (live) + 2026 outlook -----------------------------------
// ESPN's common-v3 athlete card carries much richer injury objects than the
// roster feed: status + body part/detail/side + an expected return date + a
// written beat-report comment. Same CORS-open ESPN family as SITE. The modal
// paints instantly from the roster injury, then this refreshes it live;
// unreachable → the roster read stands, honestly labeled.
const WEBAPI = 'https://site.web.api.espn.com/apis/common/v3/sports';
async function athleteHealth(aid) {
  const r = await fetchJSON(`${WEBAPI}/football/nfl/athletes/${aid}`, 15 * 60000);
  const ath = r?.athlete || r || {};
  const list = (ath.injuries || []).filter((i) => i && (i.status || i.longComment || i.shortComment));
  if (!list.length) return { status: 'Active', healthy: true, checked: true };
  const i = list[0]; // newest first
  const d = i.details || {};
  const side = d.side && !/not specified/i.test(d.side) ? ` (${d.side.toLowerCase()})` : '';
  return {
    status: i.status || 'Injured',
    healthy: false,
    type: d.type ? d.type + side : '',
    detail: d.detail && d.detail !== d.type ? d.detail : '',
    comment: i.longComment || i.shortComment || '',
    date: i.date || '',
    returnDate: d.returnDate || '',
    checked: true,
  };
}
// Date-only strings ("2026-10-01") parse as UTC midnight and can shift a day
// locally — anchor them to noon before formatting.
const fmtHDate = (s) => {
  if (!s) return '';
  const dt = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T12:00' : s);
  return isNaN(dt) ? '' : dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
const healthSev = (h) => (h.healthy ? 0 : (injSeverity(h.status) || 1));
function healthCardHTML(h) {
  const sev = healthSev(h);
  const cls = sev >= 3 ? 'out' : sev >= 1 ? 'warn' : 'ok';
  const icon = sev >= 3 ? '🩹' : sev >= 1 ? '⚠️' : '✅';
  const src = h.checked ? 'live from ESPN' : h.failed ? 'from team roster (live check unreachable)' : 'from team roster · checking latest…';
  const meta = [h.returnDate ? 'Est. return ' + fmtHDate(h.returnDate) : '', h.date ? 'reported ' + fmtHDate(h.date) : '', src].filter(Boolean).join(' · ');
  return `<div class="pl-health ${cls}">
    <div class="pl-h-top"><span class="pl-h-pill">${icon} ${esc(h.status || 'Active')}</span>${h.type ? `<span class="pl-h-type">${esc(h.type)}${h.detail ? ' — ' + esc(h.detail) : ''}</span>` : ''}</div>
    ${h.comment ? `<div class="pl-h-desc">${esc(h.comment)}</div>` : (sev === 0 ? '<div class="pl-h-desc">No injuries reported.</div>' : '')}
    <div class="pl-h-meta">${esc(meta)}</div>
  </div>`;
}
// Short auto-generated 2026 fantasy read: depth-chart role + age curve +
// health + news signal. A heuristic, clearly labeled — not a scouting report.
function outlook2026(a, role, sev, nw) {
  const pos = (role?.pos || a.position?.abbreviation || '').toUpperCase();
  const posName = { QB: 'quarterback', RB: 'running back', WR: 'receiver', TE: 'tight end' }[pos] || 'the position';
  const age = a.age, exp = a.experience?.years;
  const s = [];
  if (role && !role.starter) {
    const slot = (role.slots || 1) + (role.depth || 1);
    if (role.pct >= 45) s.push(`Sits ${pos}${slot} on the depth chart but is one injury from a lead role — we estimate a ${role.pct}% shot at starter duties in 2026.`);
    else s.push(`Sits ${pos}${slot} on the depth chart (~${role.pct}% shot at the starting job by our estimate) — a watch-list name for 2026 unless the picture changes.`);
  } else if (role?.starter) {
    s.push(`Projected 2026 starter at ${posName} on the latest depth chart.`);
  }
  if (exp === 0) s.push('Rookie season ahead, so the range of outcomes is wide — early-season usage will tell the story.');
  else if (pos === 'RB' && age >= 29) s.push(`Age ${age} is real risk at running back — production at the position tends to fall off fast.`);
  else if (pos === 'WR' && age >= 31) s.push(`At ${age}, on the back side of the age curve for a receiver.`);
  else if (pos === 'TE' && age >= 32) s.push(`At ${age}, on the back side of the age curve at tight end.`);
  else if (pos === 'QB' && age >= 37) s.push(`At ${age}, age is the thing to watch — though quarterbacks tend to age gracefully.`);
  else if (age && ((pos === 'RB' && age <= 26) || (pos === 'WR' && age <= 28) || (pos === 'TE' && age <= 29) || (pos === 'QB' && age <= 33))) s.push(`At ${age}, squarely in the prime window for ${posName}.`);
  if (sev >= 3) s.push('The current injury designation is the swing factor — confirm the recovery timeline before investing a pick.');
  else if (sev >= 1) s.push('Carrying an injury tag — worth monitoring, not necessarily disqualifying.');
  if (nw?.signal === 'promote') s.push('Recent team news points the right way on the role — see the headline below.');
  else if (nw?.signal === 'downgrade') s.push('Recent team news is a red flag — read the latest headline below.');
  return s.slice(0, 3).join(' ') || `In the mix at ${posName} for 2026.`;
}

// --- Player modal → My Draft Board ----------------------------------------
// Team Research is where you're actually sizing a guy up, so the modal can put
// him straight onto the SAME on-device draft board the Fantasy → Football view
// edits (`sportshub:fantasy:nflboard`) — no scrolling back down to retype the
// name. Kept players are refused, not silently added: they can't be drafted.
const BOARD_POS = { QB: 'QB', RB: 'RB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', K: 'K', PK: 'K', DEF: 'DST', DST: 'DST' };
const boardPosFor = (abbr) => BOARD_POS[(abbr || '').toUpperCase()] || 'FLEX';
// If he's already a Draft-Turn Plan target, add him at that group's tier so
// this button and "⭐ Add these targets to my board" agree; else neutral T3.
function planTierFor(name) {
  let t = null;
  TURN_ROUNDS.forEach((rd) => (rd.groups || []).forEach((g) => {
    if (t == null && (g.players || []).some((x) => keepNorm(x.n) === keepNorm(name))) t = g.tier;
  }));
  if (t == null) TURN_SLEEPERS.forEach((g) => {
    if (t == null && (g.players || []).some((x) => keepNorm(x.n) === keepNorm(name))) t = g.tier;
  });
  return t || 3;
}
const onBoard = (name) => loadNflBoard().find((p) => keepNorm(p.name) === keepNorm(name)) || null;

// Inline styles (see the v74 lesson) so the card renders regardless of
// stylesheet state.
function draftPlanHTML(name, pos) {
  const kept = keptEntry(name);
  const on = onBoard(name);
  const tier = on ? on.tier : planTierFor(name);
  const pills = pickAngles(name).map((x) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border:1px solid ${x.color};border-radius:999px;font-size:11px;font-weight:700;color:${x.color}">${x.icon} ${esc(x.kind)}</span>`).join('');
  const tierSel = `<select id="pl-bd-tier" aria-label="Tier" style="font:inherit;font-size:13px;padding:8px 10px;min-height:44px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--text)">${[1, 2, 3, 4, 5].map((t) => `<option value="${t}"${t === tier ? ' selected' : ''}>Tier ${t}</option>`).join('')}</select>`;
  let body;
  if (kept) {
    body = `<div style="padding:9px 11px;border:1px dashed #e0655f;border-radius:10px;font-size:12.5px;line-height:1.5">
      <b style="color:#e0655f">🔒 ${kept.you ? 'Your keeper' : 'Kept by ' + esc(kept.team)}</b> — costs round <b>R${kept.r}</b>, so he never enters the draft. Nothing to plan here.</div>`;
  } else if (on) {
    body = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:700;color:var(--accent);flex:1;min-width:130px">✅ On your draft board</span>
        ${tierSel}
        <button id="pl-bd-rm" class="fan-btn ghost" type="button">Remove</button>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">Listed as <b>${esc(on.pos)}</b>. Change the tier here or on the board.</div>`;
  } else {
    body = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${tierSel}
        <button id="pl-bd-add" class="fan-btn" type="button" style="flex:1;min-width:170px">⭐ Add to my draft board</button>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">Adds as <b>${esc(pos)}</b> — editable on the board any time.</div>`;
  }
  return `<div style="border:1px solid var(--line);border-radius:10px;background:var(--card);padding:10px 12px;margin-bottom:4px">
    ${pills ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${pills}</div>` : ''}
    ${body}
    <div style="font-size:10.5px;color:var(--muted);font-weight:700;margin-top:7px">Saved on this device with your Fantasy → Football draft board.</div>
  </div>`;
}

async function openPlayerModal(aid) {
  const a = (fanState.researchAthletes || {})[aid];
  modal().classList.remove('hidden');
  const body = $('#modal-body');
  if (!a) { body.innerHTML = '<div class="muted" style="padding:20px">Player info unavailable.</div>'; return; }
  body.dataset.aid = String(aid);
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
  const rosterH = inj ? {
    status: inj.status,
    healthy: false,
    type: inj.details?.type || '',
    detail: inj.details?.detail && inj.details.detail !== inj.details.type ? inj.details.detail : '',
    comment: inj.longComment || inj.shortComment || '',
    date: inj.date || '',
    returnDate: inj.details?.returnDate || '',
  } : { status: 'Active', healthy: true };
  const role = (fanState.researchRole || {})[aid];
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
    <div class="md-section-title">Health Status</div>
    <div id="pl-health">${healthCardHTML(rosterH)}</div>
    <div class="md-section-title">2026 Outlook</div>
    <div class="pl-outlook"><span id="pl-outlook">${esc(outlook2026(a, role, healthSev(rosterH), nw))}</span>
      <div class="pl-o-note">Auto-generated from the depth chart, age &amp; injury data — not a scouting report.</div></div>
    <div class="md-section-title">Draft Plans</div>
    <div id="pl-draft"></div>
    ${nw ? `<div class="md-section-title">Latest News</div><button class="pl-news-card" id="pl-news-open" type="button"><div class="pl-news-h">${esc(nw.headline)}</div><div class="pl-news-w">${nwWhen ? esc(nwWhen) + ' · ' : ''}tap for in-app summary</div></button>` : ''}
    <div class="pl-bio">${bio.map(([k, v]) => `<div class="pl-b"><span class="pl-bk">${k}</span><span class="pl-bv">${esc(String(v))}</span></div>`).join('')}</div>
    <a class="fan-btn" href="${espn}" target="_blank" rel="noopener" style="display:inline-block;margin-top:14px;text-decoration:none">Full profile &amp; stats on ESPN ↗</a>`;
  if (nw?.article) {
    const btn = body.querySelector('#pl-news-open');
    if (btn) btn.onclick = () => openNewsSummary(nw.article, () => openPlayerModal(aid));
  }
  // Draft Plans card — repaints itself in place (so the modal doesn't jump)
  // and re-renders the prep view underneath, keeping the board count honest.
  const pname = a.displayName || '';
  const bpos = boardPosFor(role?.pos || a.position?.abbreviation);
  const paintPlan = () => {
    if (body.dataset.aid !== String(aid)) return;
    const host = body.querySelector('#pl-draft');
    if (!host) return;
    host.innerHTML = draftPlanHTML(pname, bpos);
    const tierSel = host.querySelector('#pl-bd-tier');
    const addBtn = host.querySelector('#pl-bd-add');
    const rmBtn = host.querySelector('#pl-bd-rm');
    // Keep the board (and its collapsed/expanded state) in sync behind the modal.
    // Only repaint when the prep view is what's actually mounted (#bd-wrap is
    // its board) — never over the live-league view.
    const sync = () => {
      fanState.bdOpen = true;
      const view = $('#fantasy-football');
      if (fanState.sport === 'football' && view && view.querySelector('#bd-wrap')) renderFantasyFootball();
    };
    if (addBtn) addBtn.onclick = () => {
      const list = loadNflBoard();
      if (!list.some((p) => keepNorm(p.name) === keepNorm(pname))) {
        list.push({ name: pname, pos: bpos, tier: Number(tierSel && tierSel.value) || 3 });
        saveNflBoard(list);
      }
      paintPlan(); sync();
    };
    if (rmBtn) rmBtn.onclick = () => {
      saveNflBoard(loadNflBoard().filter((p) => keepNorm(p.name) !== keepNorm(pname)));
      paintPlan(); sync();
    };
    if (tierSel && !addBtn) tierSel.onchange = () => {
      const list = loadNflBoard();
      const pl = list.find((p) => keepNorm(p.name) === keepNorm(pname));
      if (!pl) return;
      pl.tier = Number(tierSel.value) || pl.tier;
      saveNflBoard(list); paintPlan(); sync();
    };
  };
  paintPlan();
  // Live health refresh — only touch the DOM if this modal still shows this player.
  const repaint = (h) => {
    if (body.dataset.aid !== String(aid)) return;
    const box = body.querySelector('#pl-health');
    if (box) box.innerHTML = healthCardHTML(h);
    const o = body.querySelector('#pl-outlook');
    if (o) o.textContent = outlook2026(a, role, healthSev(h), nw);
  };
  athleteHealth(aid).then(repaint).catch(() => repaint({ ...rosterH, failed: true }));
}

// --- Fantasy: NFL mock draft (client-side snake draft vs CPU GMs) ----------
// Built-in SAMPLE big board (~100 players) — for practice, not live ADP.
const MOCK_POOL_RAW = `Jahmyr Gibbs|RB|DET
Ja'Marr Chase|WR|CIN
Jaxon Smith-Njigba|WR|SEA
Bijan Robinson|RB|ATL
Justin Jefferson|WR|MIN
CeeDee Lamb|WR|DAL
Christian McCaffrey|RB|SF
Jonathan Taylor|RB|IND
Amon-Ra St. Brown|WR|DET
Puka Nacua|WR|LAR
Ashton Jeanty|RB|LV
De'Von Achane|RB|MIA
Saquon Barkley|RB|PHI
Jeremiyah Love|RB|ARI
Nico Collins|WR|HOU
Brian Thomas Jr.|WR|JAX
A.J. Brown|WR|PHI
Drake London|WR|ATL
Derrick Henry|RB|BAL
Brock Bowers|TE|LV
Josh Jacobs|RB|GB
Bucky Irving|RB|TB
Ladd McConkey|WR|LAC
Tee Higgins|WR|CIN
Kyren Williams|RB|LAR
Chase Brown|RB|CIN
Trey McBride|TE|ARI
Garrett Wilson|WR|NYJ
Davante Adams|WR|LAR
Terry McLaurin|WR|WSH
Malik Nabers|WR|NYG
Marvin Harrison Jr.|WR|ARI
George Pickens|WR|DAL
James Cook|RB|BUF
Kenneth Walker III|RB|KC
Breece Hall|RB|NYJ
DK Metcalf|WR|PIT
Mike Evans|WR|SF
DJ Moore|WR|CHI
Josh Allen|QB|BUF
Lamar Jackson|QB|BAL
Jayden Daniels|QB|WSH
Jalen Hurts|QB|PHI
George Kittle|TE|SF
Omarion Hampton|RB|LAC
Alvin Kamara|RB|NO
Rashee Rice|WR|KC
Courtland Sutton|WR|DEN
Jaylen Waddle|WR|DEN
Zay Flowers|WR|BAL
DeVonta Smith|WR|PHI
Chuba Hubbard|RB|CAR
TreVeyon Henderson|RB|NE
Drake Maye|QB|NE
Sam LaPorta|TE|DET
James Conner|RB|ARI
Aaron Jones|RB|MIN
Jerry Jeudy|WR|CLE
Calvin Ridley|WR|TEN
Jameson Williams|WR|DET
Tetairoa McMillan|WR|CAR
Jadarian Price|RB|SEA
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
Brian Robinson Jr.|RB|WSH
Rome Odunze|WR|CHI
Chris Godwin|WR|TB
Stefon Diggs|WR|NE
Bo Nix|QB|DEN
Baker Mayfield|QB|TB
Kaleb Johnson|RB|PIT
Tyrone Tracy Jr.|RB|NYG
Jaylen Warren|RB|PIT
Khalil Shakir|WR|BUF
Deebo Samuel|WR|WSH
Keon Coleman|WR|BUF
Ricky Pearsall|WR|SF
Dallas Goedert|TE|PHI
David Njoku|TE|LAC
Evan Engram|TE|DEN
Caleb Williams|QB|CHI
Kyler Murray|QB|MIN
Justin Fields|QB|NYJ
Najee Harris|RB|LAC
Rhamondre Stevenson|RB|NE
Jauan Jennings|WR|SF
Cooper Kupp|WR|SEA
Jordan Mason|RB|MIN
Tyler Warren|TE|IND
Colston Loveland|TE|CHI
Travis Kelce|TE|KC
Dak Prescott|QB|DAL
Brock Purdy|QB|SF
Chris Olave|WR|NO
Quinshon Judkins|RB|CLE
Cam Skattebo|RB|NYG
Dalton Kincaid|TE|BUF
Juwan Johnson|TE|NO
Kyle Pitts|TE|ATL
Brenton Strange|TE|JAX
Jayden Reed|WR|GB
Keenan Allen|WR|LAC
Tank Bigsby|RB|PHI
Josh Downs|WR|IND
Michael Wilson|WR|ARI
Tyjae Spears|RB|TEN
Marvin Mims Jr.|WR|DEN
Braelon Allen|RB|NYJ
Rashid Shaheed|WR|NO
Trey Benson|RB|ARI
Blake Corum|RB|LAR
Jaylen Wright|RB|MIA
Isaac Guerendo|RB|SF
Justin Herbert|QB|LAC
Jordan Love|QB|GB
Jared Goff|QB|DET
Michael Pittman Jr.|WR|PIT
Emeka Egbuka|WR|TB
Darnell Mooney|WR|ATL
Matthew Golden|WR|GB
Zach Charbonnet|RB|SEA
Rachaad White|RB|TB
Javonte Williams|RB|DAL
Luther Burden III|WR|CHI
Tucker Kraft|TE|GB
Chig Okonkwo|TE|TEN
Jonnu Smith|TE|PIT
Dalton Schultz|TE|HOU
Nick Chubb|RB|HOU
Tre Harris|WR|LAC
Jayden Higgins|WR|HOU
Rashod Bateman|WR|BAL
Isaiah Likely|TE|NYG
Alec Pierce|WR|IND
Austin Ekeler|RB|WSH
Jake Ferguson|TE|DAL
Terrance Ferguson|TE|LAR
Quentin Johnston|WR|LAC
Bhayshul Tuten|RB|JAX
Kyle Williams|WR|NE
Denzel Boston|WR|CLE
Trevor Lawrence|QB|JAX
C.J. Stroud|QB|HOU
Aaron Rodgers|QB|PIT
Ray Davis|RB|BUF
Romeo Doubs|WR|GB
Malik Washington|WR|MIA
Hunter Henry|TE|NE
Elijah Arroyo|TE|SEA
Xavier Legette|WR|CAR
Dylan Sampson|RB|CLE
Wan'Dale Robinson|WR|NYG
Michael Penix Jr.|QB|ATL
Cam Ward|QB|TEN
Jaxson Dart|QB|NYG
Trevor Etienne|RB|CAR
Adonai Mitchell|WR|NYJ
Cade Otton|TE|TB
Mike Gesicki|TE|CIN
Woody Marks|RB|HOU
Troy Franklin|WR|DEN
J.J. McCarthy|QB|MIN
Daniel Jones|QB|IND
Jack Bech|WR|LV
Mason Taylor|TE|NYJ
DJ Giddens|RB|IND
Christian Kirk|WR|HOU
Tua Tagovailoa|QB|MIA
Tyler Shough|QB|NO
Kimani Vidal|RB|LAC
Pat Freiermuth|TE|PIT
Greg Dulcich|TE|MIA
Dontayvion Wicks|WR|GB
Jalen Tolbert|WR|MIA
Devin Neal|RB|NO
Elic Ayomanor|WR|TEN
Matthew Stafford|QB|LAR
Harold Fannin Jr.|TE|CLE
Jarquez Hunter|RB|LAR
DeMario Douglas|WR|NE
Sam Darnold|QB|SEA
Shedeur Sanders|QB|CLE
Roschon Johnson|RB|CHI
Zach Ertz|TE|WSH
Tommy Tremble|TE|CAR
Ollie Gordon II|RB|MIA
Geno Smith|QB|LV
Jacoby Brissett|QB|ARI
Sean Tucker|RB|TB
Bryce Young|QB|CAR
Emanuel Wilson|RB|GB
Brandon Aubrey|K|DAL
Jake Bates|K|DET
Cameron Dicker|K|LAC
Harrison Butker|K|KC
Chris Boswell|K|PIT
Jake Elliott|K|PHI
Ka'imi Fairbairn|K|HOU
Tyler Bass|K|BUF
Younghoe Koo|K|ATL
Wil Lutz|K|DEN
Jason Sanders|K|MIA
Evan McPherson|K|CIN
Eagles D/ST|DST|PHI
Ravens D/ST|DST|BAL
Broncos D/ST|DST|DEN
Texans D/ST|DST|HOU
Steelers D/ST|DST|PIT
Vikings D/ST|DST|MIN
Bills D/ST|DST|BUF
Packers D/ST|DST|GB
Lions D/ST|DST|DET
Chiefs D/ST|DST|KC
49ers D/ST|DST|SF
Chargers D/ST|DST|LAC
Seahawks D/ST|DST|SEA`;
const MOCK_POOL = MOCK_POOL_RAW.trim().split('\n').map((l, i) => {
  const [name, pos, team] = l.split('|');
  return { name, pos, team, rank: i + 1 };
});
const MOCK_CAP = { QB: 2, RB: 6, WR: 7, TE: 2, K: 1, DST: 1, FLEX: 9 };

// Owner's 2-keeper league: kept players cost the round they're kept in, so the
// user forfeits their pick in that round and the keeper fills it. Edit here if
// the keepers change. (2026: Maye in the 11th replaced Kyren in the 6th — an
// ~ADP-52 QB for pick #130; Kyren went back into the draft pool.)
const MOCK_KEEPERS = [
  { name: 'Trey McBride', round: 7, pos: 'TE', team: 'ARI' },
  { name: 'Drake Maye', round: 11, pos: 'QB', team: 'NE' },
];
// The user's 0-based overall pick number in a given (1-based) snake round.
function mockUserOverallInRound(m, round) {
  return mockOverallFor(m, m.userIdx, round);
}
// Any team's 0-based overall pick number in a given (1-based) snake round.
function mockOverallFor(m, teamIdx, round) {
  const rnd = round - 1;
  const pos = rnd % 2 === 0 ? teamIdx : m.teams - 1 - teamIdx;
  return rnd * m.teams + pos;
}

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
// Keepers a team hasn't received yet still fill a roster spot, so they have to
// count toward positional need — otherwise the sim hands you a round-3 QB when
// your QB keeper is already locked in for round 11.
function mockPendingKeepers(m, teamIdx) {
  const out = [];
  if (teamIdx === m.userIdx && m.keeperAt) {
    Object.entries(m.keeperAt).forEach(([ov, pl]) => { if (Number(ov) > m.onClock) out.push(pl); });
  }
  if (m.leagueKeeperAt) {
    Object.entries(m.leagueKeeperAt).forEach(([ov, e]) => {
      if (e.teamIdx === teamIdx && Number(ov) > m.onClock) out.push(e.player);
    });
  }
  return out;
}
function mockCpuChoose(m) {
  if (!m.pool.length) return mockFiller(m);
  const t = mockTeamOnClock(m.onClock, m.teams);
  const counts = mockCounts(m.rosters[t].concat(mockPendingKeepers(m, t)));
  const round = Math.floor(m.onClock / m.teams) + 1;
  let best = null, bestScore = -Infinity;
  for (const p of m.pool) {
    const s = mockScore(p, counts, round, m.rounds);
    if (s >= 0 && s > bestScore) { bestScore = s; best = p; }
  }
  return best || m.pool.find((p) => (counts[p.pos] || 0) < (MOCK_CAP[p.pos] || 9)) || m.pool[0];
}

function mockAssign(m, teamIdx, player, keeper) {
  m.pool = m.pool.filter((p) => p !== player);
  m.picks.push({ overall: m.onClock, round: Math.floor(m.onClock / m.teams) + 1, teamIdx, player, keeper: !!keeper });
  m.rosters[teamIdx].push(player);
  m.onClock++;
}
// Auto-run CPU picks until it's the user's turn (or the draft is done). The
// user's keeper rounds auto-fill with the kept player instead of stopping.
function mockAdvance(m) {
  const total = m.teams * m.rounds;
  while (m.onClock < total) {
    const t = mockTeamOnClock(m.onClock, m.teams);
    if (t === m.userIdx) {
      const kept = m.keeperAt && m.keeperAt[m.onClock];
      if (!kept) break; // real user pick — hand control back
      mockAssign(m, m.userIdx, kept, true);
      continue;
    }
    const rival = m.leagueKeeperAt && m.leagueKeeperAt[m.onClock];
    mockAssign(m, t, rival ? rival.player : mockCpuChoose(m), !!rival);
  }
}
const mockDone = (m) => m.onClock >= m.teams * m.rounds;

function mockStart(m) {
  m.userIdx = Math.max(0, Math.min(m.teams - 1, (m.slot || 1) - 1));
  m.pool = MOCK_POOL.slice();
  // League-wide keepers (real league shape only — 12 teams). Keep-the-round
  // means a rival who keeps a player in R6 does NOT pick in R6: that slot is
  // consumed by the keeper. Modelling only the pool removal (and letting rivals
  // still make every pick) would drain the board faster than the real draft, so
  // each rival keeper is scheduled at its owner's slot in that round.
  // Rivals are mapped by draft slot (LEAGUE_ORDER[i] → team index i); the
  // user's own index is skipped, since m.keepers drives their side and can be
  // toggled off.
  m.leagueKeeperAt = {};
  if (m.teams === LEAGUE_TEAMS_TOTAL) {
    const mineNames = new Set((m.keepers || []).map((k) => keepNorm(k.name)));
    LEAGUE_ORDER.forEach((t, idx) => {
      if (!t.team || idx === m.userIdx) return; // unreported, or that's you
      LEAGUE_KEEPERS.filter((k) => k.team === t.team).forEach((k) => {
        if (mineNames.has(keepNorm(k.n))) return; // don't double-assign your own
        let pl = m.pool.find((p) => keepNorm(p.name) === keepNorm(k.n));
        if (pl) m.pool = m.pool.filter((p) => p !== pl);
        else pl = { name: k.n, pos: k.p || 'FLEX', team: '', rank: 900 };
        pl._keeper = true;
        // Keeper rounds beyond the sim's length just stay off the board.
        if (k.r <= (m.rounds || 0)) m.leagueKeeperAt[mockOverallFor(m, idx, k.r)] = { teamIdx: idx, player: pl };
      });
    });
  }
  // Keepers: pull each kept player off the board (so no CPU can draft them) and
  // schedule them to fill the user's pick in the round they cost. Any keeper
  // whose round is beyond the draft length is simply pre-rostered up front.
  m.keeperAt = {};
  (m.keepers || []).forEach((k) => {
    let pl = m.pool.find((p) => p.name.toLowerCase() === (k.name || '').toLowerCase());
    if (pl) m.pool = m.pool.filter((p) => p !== pl);
    else pl = { name: k.name, pos: k.pos || 'FLEX', team: k.team || '', rank: 900 };
    pl._keeper = true;
    if (k.round <= (m.rounds || 0)) m.keeperAt[mockUserOverallInRound(m, k.round)] = pl;
    else k._pre = pl; // round beyond draft — roster it at start
  });
  // The sample board (~100 names) can be shorter than a deep draft needs
  // (e.g. 12 teams × 10 rounds = 120 picks). Pad with generic depth players so
  // the board never empties mid-draft. Filler carries rank ≥900 → shown as "–"
  // and excluded from the draft grade.
  const need = m.teams * m.rounds + 4;
  const fillPos = ['WR', 'RB', 'WR', 'RB', 'TE', 'QB'];
  // Number each filler PER POSITION — the old `i / fillPos.length` math reused
  // a number for the two WR (and two RB) slots in every group of six, so the
  // draft log showed two different players both called "Depth WR 1".
  const fillN = {};
  for (let i = 0; m.pool.length < need; i++) {
    const pos = fillPos[i % fillPos.length];
    fillN[pos] = (fillN[pos] || 0) + 1;
    m.pool.push({ name: `Depth ${pos} ${fillN[pos]}`, pos, team: 'FA', rank: 901 + i });
  }
  m.rosters = Array.from({ length: m.teams }, () => []);
  m.picks = [];
  m.onClock = 0;
  m.setup = false;
  // Keepers whose round is beyond the draft length: just put them on the roster.
  (m.keepers || []).forEach((k) => { if (k._pre) { m.rosters[m.userIdx].push(k._pre); delete k._pre; } });
  mockAdvance(m);
}
function mockUserPick(m, player) { mockAssign(m, m.userIdx, player); mockAdvance(m); }
function mockSimRest(m) {
  const total = m.teams * m.rounds;
  while (m.onClock < total) {
    const t = mockTeamOnClock(m.onClock, m.teams);
    const kept = t === m.userIdx
      ? (m.keeperAt && m.keeperAt[m.onClock])
      : (m.leagueKeeperAt && m.leagueKeeperAt[m.onClock] || {}).player;
    mockAssign(m, t, kept || mockCpuChoose(m), !!kept);
  }
}
function mockGrade(m) {
  // Keepers aren't draft decisions, so they don't count toward the value grade.
  const mine = m.picks.filter((p) => p.teamIdx === m.userIdx && !p.keeper && p.player.rank < 900);
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
        <div class="mock-setrow"><label>Rounds</label><select id="mk-rounds">${[8, 10, 12, 15].map((n) => `<option value="${n}"${n === m.rounds ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="mock-setrow"><label>Keepers</label><label class="mk-keep-toggle"><input type="checkbox" id="mk-keepers"${(m.keepers || []).length ? ' checked' : ''}> Use mine</label></div>
        ${MOCK_KEEPERS.length ? `<div class="muted" style="font-size:11.5px;margin-top:2px">Keeping <b>${MOCK_KEEPERS.map((k) => `${esc(k.name)} (R${k.round})`).join('</b>, <b>')}</b>. Those rounds are auto-filled with your keeper. Your league-mates' keepers (${LEAGUE_KEEPERS.filter((k) => !k.you).length} players from ${LEAGUE_TEAMS_IN - 1} teams) are pulled off the board too, so the pool matches your real draft.</div>` : ''}
        <div class="fan-actions">
          <button id="mk-go" class="fan-btn">Start draft</button>
          <button id="mk-cancel" class="fan-btn ghost">Cancel</button>
        </div>
      </div>`;
    const teamsSel = box.querySelector('#mk-teams');
    teamsSel.onchange = () => { m.teams = Number(teamsSel.value); if (m.slot > m.teams) m.slot = m.teams; renderMockDraft(); };
    box.querySelector('#mk-slot').onchange = (e) => { m.slot = Number(e.target.value); };
    box.querySelector('#mk-rounds').onchange = (e) => { m.rounds = Number(e.target.value); };
    box.querySelector('#mk-go').onclick = () => {
      m.slot = Number(box.querySelector('#mk-slot').value);
      m.rounds = Number(box.querySelector('#mk-rounds').value);
      m.keepers = box.querySelector('#mk-keepers').checked ? MOCK_KEEPERS.map((k) => ({ ...k })) : [];
      mockStart(m);
      renderMockDraft();
    };
    box.querySelector('#mk-cancel').onclick = closeMockDraft;
    return;
  }

  const done = mockDone(m);
  const round = Math.floor(m.onClock / m.teams) + 1;
  const inRound = (m.onClock % m.teams) + 1;
  // Real league managers when the sim matches the real league shape (12 teams),
  // so the draft room reads like the actual room; generic otherwise.
  const teamLabel = (i) => {
    if (i === m.userIdx) return 'You';
    const t = m.teams === LEAGUE_TEAMS_TOTAL ? LEAGUE_ORDER[i] : null;
    return t ? t.mgr : `Team ${i + 1}`;
  };

  // Your roster panel. Keepers you haven't received yet (their round hasn't come
  // up) are shown alongside the real picks, dimmed with the round they land —
  // they're already yours, so drafting without seeing them invites doubling up.
  const mine = m.rosters[m.userIdx];
  const pendingRows = [];
  if (m.keeperAt) {
    Object.entries(m.keeperAt).forEach(([ov, pl]) => {
      if (Number(ov) > m.onClock) pendingRows.push({ p: pl, round: Math.floor(Number(ov) / m.teams) + 1 });
    });
  }
  const posOrder = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST'];
  const teamHTML = posOrder.map((pos) => {
    const list = mine.filter((p) => p.pos === pos);
    const pend = pendingRows.filter((x) => x.p.pos === pos);
    if (!list.length && !pend.length) return '';
    return `<div class="pos-h">${pos}</div>`
      + list.map((p) => `<div class="mk-pick-line">${esc(p.name)} <span class="mk-meta">${esc(p.team || '')}${p._keeper ? ' · 🔒 kept' : ''}</span></div>`).join('')
      + pend.map((x) => `<div class="mk-pick-line" style="opacity:.65">${esc(x.p.name)} <span class="mk-meta">${esc(x.p.team || '')} · 🔒 keeper, lands R${x.round}</span></div>`).join('');
  }).join('') || '<div class="muted">No picks yet.</div>';

  // Recent picks log (last 8)
  const log = m.picks.slice(-8).reverse().map((pk) =>
    `<div class="mk-log-row"><span class="mk-meta">R${pk.round} · ${teamLabel(pk.teamIdx)}</span> ${esc(pk.player.name)} <span class="mk-meta">${esc(pk.player.pos)}</span></div>`).join('');

  if (done) {
    const g = mockGrade(m);
    // Every one of your picks, in draft order, with its value vs the slot it was
    // taken (+ = fell to you past its board rank, − = a reach).
    const myPicks = m.picks.filter((p) => p.teamIdx === m.userIdx).sort((a, b) => a.overall - b.overall);
    const noteRows = [];
    const picksHTML = myPicks.map((pk) => {
      const slot = pk.overall + 1;
      const real = pk.player.rank < 900;
      const val = pk.keeper ? null : (real ? slot - pk.player.rank : null);
      const cls = pk.keeper ? 'na' : val == null ? 'na' : val > 0 ? 'pos' : val < 0 ? 'neg' : 'zero';
      const txt = pk.keeper ? '🔒 kept' : val == null ? '–' : (val > 0 ? '+' : '') + val;
      const angles = pickAngles(pk.player.name);
      angles.forEach((a) => noteRows.push({ ...a, name: pk.player.name, round: pk.round }));
      const badges = angles.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px">${angles.map((a) =>
            `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;border:1px solid ${a.color};color:${a.color}">${a.icon} ${esc(a.kind)}</span>`).join('')}</div>`
        : '';
      return `<div class="mk-pick"><span class="mk-pk-slot">R${pk.round} · #${slot}</span><span class="mk-pk-name">${esc(pk.player.name)} <span class="mk-meta">${esc(pk.player.pos)}·${esc(pk.player.team || '')}</span>${badges}</span><span class="mk-pk-val ${cls}">${txt}</span></div>`;
    }).join('');
    // Footnotes: the story behind the tagged picks, since +/- vs board rank
    // says nothing about WHY a player was worth taking.
    const notesHTML = noteRows.length ? `
      <h2 class="section-title">Why These Picks</h2>
      <div class="muted" style="font-size:11.5px;margin:2px 0 8px">The value column only compares to board rank. These are the angles you actually drafted for.</div>
      <div class="setup-card" style="padding:10px 12px">
        ${noteRows.map((n) => `
          <div style="display:flex;gap:8px;padding:7px 2px;border-bottom:1px solid var(--line);align-items:baseline;flex-wrap:wrap">
            <span style="flex:none;font-size:11px;font-weight:700;color:${n.color};min-width:104px">${n.icon} ${esc(n.kind)}</span>
            <b style="flex:none;font-size:12.5px">${esc(n.name)}</b>
            <span style="flex:1;min-width:160px;font-size:11.5px;color:var(--muted)">${esc(n.note)}</span>
          </div>`).join('')}
      </div>` : '';
    box.innerHTML = `
      <div class="setup-card pp-hero"><div class="pp-kicker">🏈 Draft Complete</div>
        <div class="pp-count"><span class="pp-big">${g.letter}</span> your draft grade</div>
        <div class="muted" style="margin-top:6px">Value vs slot: ${g.diff >= 0 ? '+' : ''}${g.diff.toFixed(1)} per pick (positive = you landed players below where they went).</div>
      </div>
      <h2 class="section-title">Your Picks</h2>
      <div class="mk-picks">${picksHTML}</div>
      <div class="muted" style="font-size:11px;margin-top:6px"><b class="mk-pk-val pos">+</b> value (fell to you) · <b class="mk-pk-val neg">−</b> reach vs board rank · badges = the angle you targeted</div>
      ${notesHTML}
      <div class="fan-actions">
        <button id="mk-new" class="fan-btn">New draft</button>
        <button id="mk-exit" class="fan-btn ghost">Close</button>
      </div>`;
    box.querySelector('#mk-new').onclick = () => { fanState.mock = { setup: true, teams: m.teams, slot: m.slot, rounds: m.rounds, keepers: m.keepers }; renderMockDraft(); box.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
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
    <div class="fan-actions">
      <button id="mk-auto" class="fan-btn">Auto-pick best</button>
      <button id="mk-sim" class="fan-btn ghost">Sim rest</button>
      <button id="mk-exit" class="fan-btn ghost">Exit</button>
    </div>
    <h2 class="section-title">Your Team <span class="season-tag">${mine.length} pick${mine.length === 1 ? '' : 's'}</span></h2>
    <div class="mk-team">${teamHTML}</div>
    <h2 class="section-title">Recent Picks</h2>
    <div class="mk-log">${log || '<div class="muted">Draft just started.</div>'}</div>
    <h2 class="section-title">Best Available</h2>
    <div class="chips" style="margin-bottom:8px">${filterChips}
      <input id="mk-search" type="text" placeholder="Search…" autocomplete="off" style="flex:1 1 120px;min-width:100px" />
    </div>
    <div id="mk-list" class="mk-board"></div>`;

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
  // Baseball has a live category league; Football is shown year-round for
  // preseason prep (its live-league sections will come once an NFL league is
  // wired up and in season). NOTE: we do NOT hit the backend here — the health
  // check is deferred to the baseball branch so the Football prep view (and the
  // sport chips) render instantly even when the free backend is cold-starting.
  // ⚾ SHELVED (Aug 2026): the owner's fantasy-baseball season is done, so the
  // baseball live-league view is parked until next spring. ALL baseball code
  // (syncFromLeague, matchup/projection/opponent/waivers/standings/playoffs
  // renderers, the backend wiring) is intact and dormant — to bring it back,
  // re-add ['baseball', '⚾ Baseball'] to this list and flip the fanState
  // default back to 'baseball' if wanted. Nothing else needs to change.
  const sports = [['football', '🏈 Football']];
  if (!sports.some(([s]) => s === fanState.sport)) fanState.sport = 'football';

  // sport chips (hidden while only one sport is live — see shelf note above)
  const chips = $('#fantasy-sport');
  chips.innerHTML = '';
  chips.style.display = sports.length > 1 ? '' : 'none';
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
    const cfg = fanState.cfg;
    // Live NFL league configured on the backend → show the points-based live
    // view (unless the user opened the draft-prep tools). Otherwise the prep view.
    if (cfg && cfg.football && fanState.footballView !== 'prep') {
      fanState.synced = fanState.synced || {};
      if (!fanState.synced.football || fanState.forceSync) {
        await syncFromLeague('football', !!fanState.forceSync);
        fanState.synced.football = true;
        fanState.forceSync = false;
      }
      await renderFootballLive();
      return;
    }
    renderFantasyFootball();
    injectJumpNav('fantasy');
    // Haven't checked config yet? Learn it, and upgrade to the live view if a
    // league exists (deferred so the prep view still paints instantly).
    if (cfg === undefined) leagueConfig().then((c) => {
      if (c.football && fanState.sport === 'football' && fanState.footballView !== 'prep') renderFantasy();
    });
    return;
  }
  if (liveWrap) liveWrap.style.display = '';
  if (fbBox) fbBox.innerHTML = '';

  // Baseball needs the backend league — check it now (long timeout so a Render
  // cold-start is awaited rather than instantly falling back to "offline").
  const cfg = await leagueConfig();

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
  try { fanState.cfg = (await fetchJSON(`${FANTASY_API}/api/health`, 300000)).configured || {}; fanState.backendDown = false; }
  catch (_) { fanState.cfg = {}; fanState.backendDown = true; }
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
      team: sport === 'baseball' ? proTeamToFull(p.proTeam) : (p.proTeam || ''),
    }));
    if (!roster.length) return false;
    saveRoster(sport, roster);
    let matchup = null, standings = null, freeAgents = null, opponent = null, catranks = null, playoffs = null;
    try { matchup = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/matchup${q()}`, 60000); } catch (_) {}
    try { standings = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/standings${q()}`, 60000); } catch (_) {}
    try { freeAgents = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/freeagents${q('size=40')}`, 300000); } catch (_) {}
    try { opponent = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/opponent${q()}`, 60000); } catch (_) {}
    // catranks/playoffs are category-league (baseball) concepts — skip for football.
    if (sport === 'baseball') {
      try { catranks = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/catranks${q()}`, 60000); } catch (_) {}
      try { playoffs = await fetchJSON(`${FANTASY_API}/api/fantasy/${sport}/playoffs${q('slots=6')}`, 60000); } catch (_) {}
    }
    fanState.league = fanState.league || {};
    fanState.league[sport] = { team: data.team, record: data.record, rosterFull: data.roster || [], matchup, standings, freeAgents, opponent, catranks, playoffs, syncedAt: Date.now() };
    return true;
  } catch (_) { return false; }
}

// Header card above the roster: team name, record, live matchup, resync button.
function renderLeagueHeader(sport) {
  const box = $('#fantasy-league');
  if (!box) return;
  const L = (fanState.league || {})[sport];
  if (!L) {
    // Backend confirmed unreachable → say so, instead of leaving the live-league
    // sections blank (which reads as broken). Roster + Snapshot still work locally.
    // The free host cold-starts, so offer a wake-and-retry that waits it out.
    box.innerHTML = fanState.backendDown
      ? `<div class="lg-card"><div style="font-size:12.5px;line-height:1.55;color:var(--muted)">⚠️ <b style="color:var(--text)">Live league sync is offline.</b> The fantasy backend isn't reachable right now, so this week's <b>matchup, waivers, standings &amp; opponent</b> can't load. Your <b>roster and snapshot</b> below still work from your saved team.</div><button id="lg-wake" class="fan-btn ghost" style="margin-top:8px">🔄 Wake backend &amp; retry</button></div>`
      : '';
    const wb = $('#lg-wake');
    if (wb) wb.onclick = async () => {
      wb.textContent = '🔄 Waking… (can take a minute)'; wb.disabled = true;
      fanState.cfg = null; fanState.synced = {}; fanState.forceSync = true;
      await renderFantasy();
    };
    return;
  }
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

// --- Live football league view (points H2H) --------------------------------
// Rendered into #fantasy-football when an NFL league is configured on the
// backend (health → configured.football). Football is POINTS-based (not
// categories like baseball), so it's its own compact view: a weekly points
// matchup, standings, roster with weekly/projected points, and top waiver adds.
// All fields are read defensively (the shapes come from espn-api's football
// League, which couldn't be tested here — no league existed at build time).
const NFL_SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'RB/WR', 'WR/TE', 'D/ST', 'DST', 'K'];
const NFL_BUCKETS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const fpts = (v) => (v == null || v === '' || Number.isNaN(Number(v))) ? null : Math.round(Number(v) * 10) / 10;
// Bucket a fantasy player into a scoring position (from pos/eligibility, so a
// FLEX or benched player still lands in their real position group).
function nflBucket(p) {
  const s = `${p.pos || ''} ${p.lineupSlot || ''} ${(p.eligibleSlots || []).join(' ')}`.toUpperCase();
  if (/\bQB\b/.test(s)) return 'QB';
  if (/D\/ST|\bDST\b|\bDEF\b/.test(s)) return 'DST';
  if (/\bRB\b/.test(s)) return 'RB';
  if (/\bWR\b/.test(s)) return 'WR';
  if (/\bTE\b/.test(s)) return 'TE';
  if (/\bK\b|\bPK\b/.test(s)) return 'K';
  return (p.pos || '?').toUpperCase();
}
const nflPlayed = (p) => { const pt = fpts(p.points); return pt != null && pt !== 0; };
const nflProjOrPts = (p) => { const pt = fpts(p.points); if (pt != null && pt !== 0) return pt; const pr = fpts(p.projected); return pr != null ? pr : 0; };
// P(win the week) from projected-or-actual totals and how many players are still
// to play (more left → more variance). A heuristic estimate, not ESPN's.
function footballWinProb(myS, opS) {
  const myTot = myS.reduce((s, p) => s + nflProjOrPts(p), 0);
  const opTot = opS.reduce((s, p) => s + nflProjOrPts(p), 0);
  const remaining = myS.filter((p) => !nflPlayed(p)).length + opS.filter((p) => !nflPlayed(p)).length;
  const sd = Math.max(6, Math.sqrt(Math.max(remaining, 1)) * 8);
  const prob = 1 / (1 + Math.exp(-1.702 * ((myTot - opTot) / sd)));
  return { myTot: Math.round(myTot * 10) / 10, opTot: Math.round(opTot * 10) / 10, prob: Math.round(prob * 100), remaining };
}
// Start/Sit: bench players who out-project a startable starter at the same slot
// (incl. a FLEX swap for RB/WR/TE). Returns the top upgrades by projected gain.
function startSitAdvice(full) {
  const starters = full.filter((p) => (p.status || '') === 'active');
  const bench = full.filter((p) => (p.status || '') === 'bench');
  const prj = (p) => fpts(p.projected);
  const recs = [];
  bench.forEach((b) => {
    const bp = prj(b); if (bp == null) return;
    const bb = nflBucket(b);
    const cands = starters.filter((s) => nflBucket(s) === bb
      || (['RB', 'WR', 'TE'].includes(bb) && String(s.lineupSlot || '').toUpperCase().includes('FLEX')));
    let worst = null;
    cands.forEach((s) => { const sp = prj(s); if (sp == null) return; if (worst == null || sp < prj(worst)) worst = s; });
    if (worst && prj(worst) != null && bp - prj(worst) >= 1.5) recs.push({ start: b, sit: worst, gain: Math.round((bp - prj(worst)) * 10) / 10 });
  });
  recs.sort((a, b) => b.gain - a.gain);
  const seen = new Set(), out = [];
  recs.forEach((r) => { if (!seen.has(r.sit.name)) { seen.add(r.sit.name); out.push(r); } });
  return out.slice(0, 4);
}
// This week's NFL games keyed by team abbrev, from ESPN's FREE public scoreboard
// (no fantasy backend needed). Teams absent from the map are on bye this week.
async function nflWeekGames() {
  try {
    const games = await getGames('nfl'); // no date → ESPN's current-week slate
    const map = {};
    games.forEach((g) => {
      const h = g.home || {}, a = g.away || {};
      if (h.abbr) map[String(h.abbr).toUpperCase()] = { opp: a.abbr || '', at: false, date: g.date, state: g.state };
      if (a.abbr) map[String(a.abbr).toUpperCase()] = { opp: h.abbr || '', at: true, date: g.date, state: g.state };
    });
    return map;
  } catch (_) { return {}; }
}
const gameChipText = (g) => {
  if (!g) return 'BYE';
  let when = '';
  try { const d = new Date(g.date); if (!isNaN(d)) when = d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (_) {}
  return `${g.at ? '@' : 'vs'} ${g.opp}${when ? ' · ' + when : ''}`;
};

async function renderFootballLive() {
  const box = $('#fantasy-football');
  if (!box) return;
  const L = (fanState.league || {}).football || {};
  const r = L.record || {};
  const rec = [r.wins, r.losses, r.ties].every((x) => x == null) ? ''
    : `${r.wins ?? 0}-${r.losses ?? 0}${r.ties ? '-' + r.ties : ''}`;
  const synced = L.syncedAt ? (Date.now() - L.syncedAt < 60000 ? 'synced just now' : `synced ${timeAgo(L.syncedAt)}`) : '';
  const week = await nflWeekGames();

  const full = L.rosterFull || [];
  const starters = full.filter((p) => (p.status || '') === 'active');
  const bench = full.filter((p) => (p.status || '') !== 'active');
  const oppFull = ((L.opponent || {}).roster) || [];
  const oppStarters = oppFull.filter((p) => (p.status || '') === 'active');
  const oppEff = oppStarters.length ? oppStarters : oppFull; // fallback if opp has no status
  const projFor = (list) => { let s = 0, any = false; list.forEach((p) => { const v = fpts(p.projected); if (v != null) { s += v; any = true; } }); return any ? Math.round(s * 10) / 10 : null; };

  // --- Matchup + win probability ---
  const M = L.matchup || null;
  let matchupHTML;
  if (M && M.me) {
    const meScore = fpts(M.me.score), opScore = fpts(M.opponent && M.opponent.score);
    const meVal = meScore != null ? meScore : projFor(starters);
    const opVal = opScore != null ? opScore : projFor(oppEff);
    const wp = (starters.length && oppEff.length) ? footballWinProb(starters, oppEff) : null;
    const verdict = (meVal != null && opVal != null)
      ? (meVal > opVal ? '<span style="color:var(--accent);font-weight:700">Leading</span>'
        : meVal < opVal ? '<span style="color:#e2564d;font-weight:700">Trailing</span>' : 'Tied')
      : 'Not started';
    const pct = wp ? wp.prob : ((meVal != null && opVal != null && (meVal + opVal) > 0) ? Math.round(100 * meVal / (meVal + opVal)) : 50);
    const col = pct >= 55 ? 'var(--accent)' : pct >= 45 ? 'var(--gold,#d9b341)' : '#e2564d';
    const row = (name, val) => `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <span class="lg-name">${esc(name || '')}</span><span style="font-weight:800;font-size:20px">${val != null ? val : '–'}</span></div>`;
    matchupHTML = `<div class="lg-card">
        ${row(M.me.team || 'My Team', meVal)}
        <div style="height:8px;border-radius:999px;background:rgba(128,128,128,.22);overflow:hidden;margin:8px 0"><div style="height:100%;width:${Math.max(2, Math.min(98, pct))}%;background:${col}"></div></div>
        ${row((M.opponent && M.opponent.team) || 'Opponent', opVal)}
        ${wp ? `<div style="text-align:center;margin-top:8px;font-weight:800;color:${col}">${wp.prob}% to win${wp.remaining ? ` <span class="muted" style="font-weight:400;font-size:12px">· ${wp.remaining} to play</span>` : ''}</div>` : ''}
        <div class="muted" style="font-size:12px;margin-top:6px">${verdict}${meScore == null ? ' · projected' : ' · live / final'}${synced ? ' · ' + synced : ''} · <span title="estimate">win% is an estimate</span></div>
        <button id="fbl-resync" class="fan-btn ghost" style="margin-top:8px">🔄 Refresh from ESPN</button>
      </div>`;
  } else {
    matchupHTML = `<div class="lg-card"><div class="muted">No matchup posted this week yet.${rec ? ' Season record: ' + rec + '.' : ''}</div><button id="fbl-resync" class="fan-btn ghost" style="margin-top:8px">🔄 Refresh from ESPN</button></div>`;
  }

  // --- Lineup alerts: byes + injuries among starters ---
  const byeS = starters.filter((p) => p.proTeam && week[String(p.proTeam).toUpperCase()] === undefined);
  const injS = starters.filter((p) => p.injuryStatus && !/ACTIVE|NORMAL/i.test(p.injuryStatus));
  let alertHTML = '';
  if (byeS.length || injS.length) {
    const parts = [];
    if (byeS.length) parts.push(`<div>🛌 <b>${byeS.length}</b> starter${byeS.length === 1 ? '' : 's'} on <b>bye</b>: ${byeS.map((p) => esc(p.name)).join(', ')}</div>`);
    if (injS.length) parts.push(`<div style="margin-top:4px">🩹 <b>${injS.length}</b> injury flag${injS.length === 1 ? '' : 's'}: ${injS.map((p) => `${esc(p.name)} <span style="color:#e2564d">${esc(p.injuryStatus)}</span>`).join(', ')}</div>`);
    alertHTML = `<h2 class="section-title">⚠️ Lineup Alerts</h2><div class="lg-card" style="font-size:12.5px;line-height:1.5">${parts.join('')}</div>`;
  }

  // --- Start / Sit optimizer (projection-based) ---
  const ss = startSitAdvice(full);
  const startSitHTML = ss.length
    ? `<div class="lg-card">${ss.map((r) => `<div style="padding:6px 2px;border-top:1px solid var(--line);font-size:13px">▲ <b style="color:var(--accent)">Start ${esc(r.start.name)}</b> <span class="muted">(${fpts(r.start.projected)})</span> over ▼ ${esc(r.sit.name)} <span class="muted">(${fpts(r.sit.projected)})</span> <span style="color:var(--accent);font-size:11px">+${r.gain}</span></div>`).join('')}<div class="muted" style="font-size:11px;margin-top:6px">By ESPN projection — matchup/gut still your call.</div></div>`
    : `<div class="lg-card"><div class="muted">✅ Your lineup looks optimal by projection${bench.length ? '' : ' (no bench to compare)'}.</div></div>`;

  // --- Opponent scouting: projected points by position ---
  const sumB = (list, b) => Math.round(list.filter((p) => nflBucket(p) === b).reduce((s, p) => s + (fpts(p.projected) || 0), 0) * 10) / 10;
  const oppName = (M && M.opponent && M.opponent.team) || (L.opponent || {}).opponent || 'Opponent';
  const scoutHTML = oppEff.length
    ? `<div class="lg-card">${NFL_BUCKETS.map((b) => {
        const mv = sumB(starters, b), ov = sumB(oppEff, b);
        if (mv === 0 && ov === 0) return '';
        const meAhead = mv > ov;
        return `<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:5px 4px;border-top:1px solid var(--line)">
          <div style="text-align:right;font-weight:700;color:${meAhead ? 'var(--accent)' : 'var(--text)'}">${mv}</div>
          <div style="text-align:center;font-size:11px;color:var(--muted);min-width:38px">${b}</div>
          <div style="text-align:left;font-weight:700;color:${ov > mv ? 'var(--text)' : 'var(--muted)'}">${ov}</div></div>`;
      }).join('')}
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;padding:6px 4px;border-top:2px solid var(--line);font-size:11.5px"><div style="text-align:right;font-weight:800">${projFor(starters) ?? '–'}</div><div style="text-align:center;color:var(--muted)">TOTAL</div><div style="text-align:left;font-weight:800">${projFor(oppEff) ?? '–'}</div></div>
      <div class="muted" style="font-size:11px;margin-top:4px">Projected points · you vs ${esc(oppName)} · green = your edge.</div></div>`
    : `<div class="lg-card"><div class="muted">Opponent scouting shows once this week's matchup is set.</div></div>`;

  // --- Standings ---
  const teams = ((L.standings || {}).teams) || [];
  const standHTML = teams.length ? `<div class="lg-card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:left;color:var(--muted)"><th style="padding:4px 6px;font-weight:600">Team</th><th style="font-weight:600">W-L</th><th style="font-weight:600">Strk</th><th style="text-align:right;padding-right:6px;font-weight:600">Pwr</th></tr></thead>
      <tbody>${teams.map((t) => `<tr style="border-top:1px solid var(--line)${t.isMe ? ';background:rgba(58,210,159,.10)' : ''}">
        <td style="padding:5px 6px;font-weight:${t.isMe ? '700' : '400'}">${esc(t.team || '')}</td>
        <td>${t.wins ?? 0}-${t.losses ?? 0}${t.ties ? '-' + t.ties : ''}</td>
        <td class="muted">${esc(t.streak || '')}</td>
        <td style="text-align:right;padding-right:6px">${t.powerScore ?? '–'}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="lg-card"><div class="muted">Standings will show once the league syncs.</div></div>';

  // --- Roster (starters + bench, with weekly/projected points) ---
  const posRank = (p) => { const i = NFL_SLOT_ORDER.indexOf((p.lineupSlot || p.pos || '').toUpperCase()); return i < 0 ? 90 : i; };
  const rosterRow = (p) => {
    const pts = fpts(p.points), proj = fpts(p.projected);
    const g = week[String(p.proTeam || '').toUpperCase()];
    const bye = p.proTeam && g === undefined;
    const ctx = p.proTeam ? (bye ? '<span style="color:#e2564d">BYE</span>' : esc(gameChipText(g))) : '';
    const inj = (p.injuryStatus && !/ACTIVE|NORMAL/i.test(p.injuryStatus)) ? ` <span style="color:#e2564d;font-size:10px">${esc(p.injuryStatus)}</span>` : '';
    const val = pts != null ? `<b>${pts}</b>` : (proj != null ? `${proj} <span class="muted" style="font-size:10px">proj</span>` : '–');
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 2px;border-top:1px solid var(--line)">
        <span><b style="font-size:10.5px;color:var(--muted);display:inline-block;min-width:34px">${esc(p.lineupSlot || p.pos || '')}</b> ${esc(p.name)}${inj} <span class="muted" style="font-size:11px">${esc(p.proTeam || '')}${ctx ? ' · ' + ctx : ''}</span></span>
        <span style="font-size:12px">${val}</span></div>`;
  };
  const rosterHTML = full.length
    ? `<div class="lg-card"><div style="font-size:11px;font-weight:700;color:var(--accent);margin:2px 0 4px">STARTERS</div>${starters.slice().sort((a, b) => posRank(a) - posRank(b)).map(rosterRow).join('')}${bench.length ? `<div style="font-size:11px;font-weight:700;color:var(--muted);margin:10px 0 4px">BENCH</div>${bench.map(rosterRow).join('')}` : ''}</div>`
    : '<div class="lg-card"><div class="muted">Roster will show once the league syncs.</div></div>';

  // --- Waiver wire (top available) ---
  const fas = ((L.freeAgents || {}).players) || [];
  const waiverHTML = fas.length
    ? `<div class="lg-card">${fas.slice(0, 12).map((p) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 2px;border-top:1px solid var(--line)">
        <span>${esc(p.name)} <span class="muted" style="font-size:11px">${esc(p.pos || '')}${p.proTeam ? ' · ' + esc(p.proTeam) : ''}</span></span>
        <span class="muted" style="font-size:12px">${fpts(p.projected) != null ? fpts(p.projected) + ' proj' : (p.owned != null ? Math.round(p.owned) + '% own' : '')}</span></div>`).join('')}</div>`
    : '<div class="lg-card"><div class="muted">Top available players will show once the league syncs.</div></div>';

  box.innerHTML = `
    <div class="setup-card pp-hero">
      <div class="pp-kicker">🏈 ${esc(L.team || 'My Team')}${rec ? ' · ' + rec : ''}</div>
      <div class="muted" style="margin-top:4px">Live ESPN football league — points scoring (${esc(NFL_SCORING)}).</div>
    </div>
    <h2 class="section-title">This Week</h2>
    ${matchupHTML}
    ${alertHTML}
    <h2 class="section-title">Start / Sit</h2>
    ${startSitHTML}
    <h2 class="section-title">Opponent Scouting</h2>
    ${scoutHTML}
    <h2 class="section-title">Standings</h2>
    ${standHTML}
    <h2 class="section-title">My Roster</h2>
    ${rosterHTML}
    <h2 class="section-title">Waiver Wire</h2>
    ${waiverHTML}
    <div style="margin-top:12px"><button id="fbl-prep" class="fan-btn ghost">🏈 Draft board & prep tools →</button></div>
    <div class="muted" style="font-size:11px;margin-top:6px">Live league view — first pass; verify against ESPN once your season is underway.</div>`;

  const rs = box.querySelector('#fbl-resync');
  if (rs) rs.onclick = async () => { rs.textContent = '🔄 Refreshing…'; rs.disabled = true; fanState.synced = fanState.synced || {}; fanState.synced.football = false; fanState.forceSync = true; await renderFantasy(); };
  const pp = box.querySelector('#fbl-prep');
  if (pp) pp.onclick = () => { fanState.footballView = 'prep'; renderFantasy(); };
  injectJumpNav('fantasy');
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
// Canonical display order for category-league stats: ALL hitting first
// (R, HR, RBI, OPS, SB, then other bat cats), then ALL pitching (counting:
// QS/SV/K, then ratios: ERA/WHIP). ESPN sends them in scoring-config order,
// which interleaves the two — this regroups them the way you'd read a box.
const CAT_ORDER = {
  R: 1, HR: 2, RBI: 3, OPS: 4, SB: 5, AVG: 6, OBP: 7, SLG: 8, H: 9, TB: 10, '2B': 11, '3B': 12, BB: 13, CS: 14, SO: 15,
  W: 30, QS: 31, SV: 32, SVHD: 33, HD: 34, K: 35, 'K/9': 36, ERA: 40, WHIP: 41, 'K/BB': 42,
};
const catRank = (c) => { const k = String(c || '').toUpperCase(); return CAT_ORDER[k] != null ? CAT_ORDER[k] : 25; };
const orderCats = (cats) => (cats || []).slice().sort((a, b) => catRank(a) - catRank(b));

function renderMatchup(sport) {
  const box = $('#fantasy-matchup');
  if (!box) return;
  const m = ((fanState.league || {})[sport] || {}).matchup;
  if (!m || !m.me || !m.categories || !m.categories.length) { box.innerHTML = ''; return; }
  const won = m.me.catsWon ?? 0, lost = m.opponent.catsWon ?? 0, tied = m.tied ?? 0;
  const cats = m.categories.slice().sort((a, b) => catRank(a.cat) - catRank(b.cat)).map((c) => {
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
    const cut = i === slots ? 'border-top:2px dashed rgba(224,164,88,.7);' : '';
    const bg = t.isMe ? 'background:rgba(58,210,159,.14);' : '';
    return `<div style="${cut}${bg}display:grid;grid-template-columns:22px 1fr auto;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--line)">
        <div style="color:var(--muted);font-size:.85em;text-align:center">${i + 1}</div>
        <div style="min-width:0">
          <div style="font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.team)}${t.isMe ? ' <span style="color:var(--accent);font-size:.8em">you</span>' : ''}${tag(t)}</div>
          <div style="height:5px;border-radius:3px;background:rgba(128,128,128,.22);margin-top:4px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(2, Math.round(o))}%;background:${col}"></span></div>
        </div>
        <div style="text-align:right;min-width:92px">
          <div style="font-weight:800;color:${col}">${o}%</div>
          <div style="color:var(--muted);font-size:.78em">${rec} · proj ${t.projWins}</div>
        </div>
      </div>`;
  }).join('');
  const model = P.usedCategoryModel ? 'category-strength model' : 'record-based';
  const verdict = me ? `You: <b style="color:${oddColor(me.playoffOdds)}">${me.playoffOdds}% to make it</b> (proj seed ${me.avgSeed}). ` : '';
  box.innerHTML = `<h2 class="section-title">Playoff Predictor</h2>
    <div class="none" style="margin-bottom:8px">${verdict}${slots}-team playoff · ${wkLeft} ${wkLeft === 1 ? 'week' : 'weeks'} to go · ${(P.sims || 0).toLocaleString()} sims · ${model}. Dashed line = playoff cut.</div>
    <div style="border:1px solid var(--line);border-radius:12px;overflow:hidden">${rows}</div>`;
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
  const rows = orderCats(C.categories).map((cat) => {
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
// The season ESPN files football stats under. It rolls over in the summer, so
// from July onward we ask for the new one. (v161: this was hardcoded to 2025 —
// which meant that on kickoff weekend the Eagles tab and Team Research would
// still have been serving last season's numbers.)
const footballSeason = (d = new Date()) => (d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1);
const STAT_SEASON = footballSeason();      // live season (stats/leaders/depth)
const SCHEDULE_SEASON = STAT_SEASON;       // schedule year = the live season
const SCHEDULE_LABEL = `${SCHEDULE_SEASON}-${String((SCHEDULE_SEASON + 1) % 100).padStart(2, '0')}`;
// Current-season stats, leaders and depth charts don't exist until games are
// played, so every core-stats read asks for the live season FIRST and falls
// back to the last completed one. It returns which season actually answered so
// the UI can label it honestly rather than passing last year's numbers off as
// this year's — and it flips itself over the moment real data lands, with no
// code change needed on kickoff weekend.
async function fbSeasonData(urlFor, ttl, hasData) {
  for (const yr of [STAT_SEASON, STAT_SEASON - 1]) {
    const data = await safeJSON(urlFor(yr), ttl);
    if (data && (!hasData || hasData(data))) return { data, season: yr };
  }
  return { data: null, season: STAT_SEASON };
}
const refId = (ref) => (ref || '').match(/\/(?:athletes|teams)\/(\d+)/)?.[1];
const safeJSON = (url, ttl) => fetchJSON(url, ttl).catch(() => null);

// Build a row of quick "form" stat chips for a team-tab hero from the ESPN team
// object's record items — current streak, home/away split, last-10 (MLB), and
// run/point differential. Replaces the old "Next:" line, which just duplicated
// the Next Game section right below the hero. Only chips with data are shown;
// returns '' when nothing is available so the hero stays clean.
function heroFormChips(t, sport) {
  const items = t?.record?.items || [];
  const byType = (types) => items.find((r) => types.includes(String(r.type || '').toLowerCase()));
  const totalItem = byType(['total']) || items[0];
  const statObj = (names) => (totalItem?.stats || []).find((x) => names.includes(String(x.name || '').toLowerCase()));
  const numOf = (names) => {
    const s = statObj(names);
    if (!s) return null;
    const v = s.value != null ? Number(s.value) : parseFloat(s.displayValue);
    return isNaN(v) ? null : v;
  };
  const chips = [];

  // Streak — ESPN sometimes gives displayValue "W3"/"L2", sometimes a bare/signed
  // number (positive = wins, negative = losses). Derive the W/L prefix either way.
  const sk = statObj(['streak']);
  if (sk) {
    const dv = sk.displayValue != null ? String(sk.displayValue) : '';
    let label = null;
    if (/^[WL]\s*\d/i.test(dv)) label = dv.replace(/\s+/g, '').toUpperCase();
    else {
      const n = sk.value != null ? Number(sk.value) : parseFloat(dv);
      if (!isNaN(n) && n !== 0) label = (n > 0 ? 'W' : 'L') + Math.abs(Math.round(n));
    }
    if (label) chips.push(['Streak', label, 'streak']);
  }

  const home = byType(['home'])?.summary;
  if (home) chips.push(['Home', home, 'home']);
  const away = (byType(['road', 'away']) || {}).summary;
  if (away) chips.push(['Away', away, 'away']);
  // Last 10 is appended by injectHeroLastGame from the schedule (ESPN's team
  // object doesn't reliably carry a "last ten" record item), so it's not here.

  // Run/Point differential — prefer a clean total from pointsFor − pointsAgainst.
  // ESPN's `differential` is often a per-game AVERAGE (e.g. 0.2999…), so convert
  // it to a season total using games played and round to a whole number.
  const gp = (() => { const m = String(totalItem?.summary || '').match(/(\d+)\D+(\d+)/); return m ? (+m[1] + +m[2]) : null; })();
  const pf = numOf(['pointsfor']);
  const pa = numOf(['pointsagainst']);
  let diffN = null;
  if (pf != null && pa != null) {
    diffN = pf - pa;
  } else {
    let d = numOf(['pointdifferential', 'pointdiff', 'differential', 'rundifferential', 'avgpointdifferential']);
    if (d != null) diffN = (Math.abs(d) < 3 && gp) ? d * gp : d; // per-game avg → season total
  }
  if (diffN != null) {
    const r = Math.round(diffN);
    if (r !== 0) chips.push([sport === 'mlb' ? 'Run Diff' : 'Pt Diff', (r > 0 ? '+' : '') + r, 'diff']);
  }

  if (!chips.length) return '';
  return '<div class="hero-chips">' + chips.map(([l, v, k]) =>
    `<div class="hero-chip" data-chip="${k}"><span class="hc-v">${esc(String(v))}</span><span class="hc-l">${esc(l)}</span></div>`
  ).join('') + '</div>';
}

// Fixed left-to-right order for the hero chips regardless of which render path
// (sync record chips vs async schedule chips) added them.
const HERO_CHIP_ORDER = ['last', 'streak', 'last10', 'home', 'away', 'diff'];
function orderHeroChips(wrap) {
  if (!wrap) return;
  const rank = (el) => { const i = HERO_CHIP_ORDER.indexOf(el.dataset.chip); return i < 0 ? 99 : i; };
  [...wrap.children].sort((a, b) => rank(a) - rank(b)).forEach((el) => wrap.appendChild(el));
}

// Async companion to heroFormChips: fetch the team's schedule and inject two
// chips computed from it — a "Last · vs OPP  W 5-3" chip at the FRONT of the
// hero's chip row (most recent completed game, within ~15 days so an offseason
// team doesn't surface a months-old result), and a "Last 10  7-3" chip at the
// END. Creates the chip row if the record chips were empty.
async function injectHeroLastGame(sport, path, teamId, heroSel) {
  try {
    const data = await safeJSON(`${SITE}/${path}/teams/${teamId}/schedule`, 3 * 3600000);
    const now = Date.now();
    // Completed games, newest first.
    const done = (data?.events || [])
      .filter((e) => e.date)
      .map((ev) => ({ ev, t: new Date(ev.date).getTime(), comp: ev.competitions?.[0] || {} }))
      .filter((x) => x.t < now && x.comp.status?.type?.completed)
      .sort((a, b) => b.t - a.t);
    if (!done.length) return;
    // Skip ALL schedule chips (last game + last 10 together) when the most recent
    // completed game is stale, so an offseason team never shows a partial/stale
    // subset. Keeps the Eagles and Red Sox heroes behaving identically.
    if (now - done[0].t > 15 * 86400000) return;

    const heroEl = $(heroSel);
    if (!heroEl) return;
    const ensureWrap = () => {
      let w = heroEl.querySelector('.hero-chips');
      if (!w) { heroEl.insertAdjacentHTML('beforeend', '<div class="hero-chips"></div>'); w = heroEl.querySelector('.hero-chips'); }
      return w;
    };

    // Last game.
    const last = done[0];
    {
      const me = (last.comp.competitors || []).find((c) => String(c.team?.id) === String(teamId));
      const opp = (last.comp.competitors || []).find((c) => String(c.team?.id) !== String(teamId));
      if (me) {
        const win = me.winner === true;
        const ms = me.score?.displayValue ?? me.score?.value ?? '';
        const os = opp?.score?.displayValue ?? opp?.score?.value ?? '';
        const home = me.homeAway === 'home';
        const oppAbbr = opp?.team?.abbreviation || opp?.team?.shortDisplayName || 'OPP';
        ensureWrap().insertAdjacentHTML('beforeend',
          `<div class="hero-chip last" data-chip="last"><span class="hc-v ${win ? 'w' : 'l'}">${win ? 'W' : 'L'} ${esc(String(ms))}-${esc(String(os))}</span><span class="hc-l">Last · ${home ? 'vs' : '@'} ${esc(oppAbbr)}</span></div>`);
      }
    }

    // Last 10 — W-L over the 10 most recent completed games.
    let w10 = 0, l10 = 0;
    done.slice(0, 10).forEach(({ comp }) => {
      const me = (comp.competitors || []).find((c) => String(c.team?.id) === String(teamId));
      if (!me) return;
      if (me.winner === true) w10++; else l10++;
    });
    if (w10 + l10 > 0) {
      const n = w10 + l10;
      ensureWrap().insertAdjacentHTML('beforeend',
        `<div class="hero-chip" data-chip="last10"><span class="hc-v">${w10}-${l10}</span><span class="hc-l">Last ${n < 10 ? n : 10}</span></div>`);
    }
    // Put every chip in the fixed order: Last · Streak · Last 10 · Home · Away · Diff.
    orderHeroChips(heroEl.querySelector('.hero-chips'));
  } catch (e) { /* schedule unreachable — hero still shows record chips */ }
}

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
  hero += heroFormChips(t, 'nfl');
  $('#eagles-hero').innerHTML = hero;
  injectHeroLastGame('nfl', 'football/nfl', EAGLES.teamId, '#eagles-hero');

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
  const navItems = [['sec-nextopp', 'Next Opp'], ['sec-standings', 'Standings'], ['sec-playoff', 'Playoff'], ['sec-news', 'News'], ['sec-stats', 'Stats'], ['sec-schedule', 'Schedule'], ['sec-depth', 'Depth'], ['sec-leaders', 'Leaders'], ['sec-numbers', 'Numbers'], ['sec-staff', 'Staff']];
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
  renderStandingsBlock('nfl', (teamR.status === 'fulfilled' && teamR.value.team?.displayName) || 'Philadelphia Eagles', '#eagles-standings', '#eagles-playoff');
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
  // Secondary on top (corners flanking the safeties, + any nickel back),
  // linebackers in the middle, D-line on the bottom — a base 3-4-4 read
  // (bottom→top) instead of a lopsided middle row of corners+LBs.
  defense: [['LCB', 'CB', 'RCB', 'FS', 'SS', 'S', 'DB', 'SAF', 'NB'], ['WLB', 'MLB', 'SLB', 'LB', 'ILB', 'OLB', 'LILB', 'RILB'], ['LDE', 'DE', 'DT', 'NT', 'DI', 'DL', 'RDE', 'EDGE', 'WDE', 'SDE']],
  special: [['PK', 'K', 'P', 'H', 'LS', 'KR', 'PR', 'ST']],
};
const FIELD_ORDER = { LT: 1, LG: 2, C: 3, RG: 4, RT: 5, LCB: 0, CB: 4, RCB: 9, FS: 4, SS: 5, NB: 7, WLB: 2, MLB: 4, SLB: 8, LB: 4, LILB: 4, RILB: 6, LDE: 1, DE: 2, DT: 3, NT: 4, DI: 4, RDE: 9, EDGE: 2 };
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
  const dc = (await fbSeasonData((y) => `${FBCORE}/seasons/${y}/teams/${EAGLES.teamId}/depthcharts`,
    24 * 3600000, (d) => (d.items || []).length)).data;
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
  const elx = $('#eagles-teamstats');
  const { data, season } = await fbSeasonData(
    (y) => `${FBCORE}/seasons/${y}/types/2/teams/${EAGLES.teamId}/statistics`, 6 * 3600000,
    (d) => (d?.splits?.categories || []).some((c) => (c.stats || []).some((st) => st.rank)));
  $('#eagles-stats-season').textContent = `(${season}${season < STAT_SEASON ? ' — last season' : ''})`;
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
  const { data } = await fbSeasonData((y) => `${FBCORE}/seasons/${y}/types/2/teams/${EAGLES.teamId}/leaders`,
    6 * 3600000, (d) => (d?.categories || []).some((c) => (c.leaders || []).length));
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
  $('#eagles-sched-season').textContent = `(${SCHEDULE_LABEL})`;
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

// --- Red Sox tab (MLB deep-dive, mirrors the Eagles tab) ------------------
const REDSOX = { teamId: 2, manager: 'Alex Cora' }; // ESPN MLB team id for BOS = 2
const MLB_TEAM = `${SITE}/baseball/mlb/teams/${REDSOX.teamId}`;
const MLB_SEASON = new Date().getFullYear();

async function renderRedSox() {
  const id = REDSOX.teamId;
  const [teamR, rosterR, newsR] = await Promise.allSettled([
    fetchJSON(MLB_TEAM, 5 * 60000),
    fetchJSON(`${MLB_TEAM}/roster`, 30 * 60000),
    fetchJSON(`${SITE}/baseball/mlb/news?team=${id}`, 10 * 60000),
  ]);

  // hero
  const t = teamR.status === 'fulfilled' ? teamR.value.team : null;
  const logo = t?.logos?.[0]?.href;
  const rec = t?.record?.items?.[0]?.summary;
  const standing = t?.standingSummary;
  const next = t?.nextEvent?.[0];
  let hero = `<h2>${logo ? `<img src="${esc(logo)}" style="height:30px;vertical-align:middle;margin-right:8px">` : '⚾ '}${esc(t?.displayName || 'Boston Red Sox')}</h2>`;
  if (rec || standing) hero += `<div class="muted">${[rec ? `Record ${rec}` : '', standing].filter(Boolean).join(' • ')}</div>`;
  hero += heroFormChips(t, 'mlb');
  $('#redsox-hero').innerHTML = hero;
  injectHeroLastGame('mlb', 'baseball/mlb', REDSOX.teamId, '#redsox-hero');

  $('#redsox-staff').innerHTML = `<div class="staff-card"><div class="role">Manager</div><div class="who">${esc(REDSOX.manager)}</div></div>`;

  // roster map (id -> player)
  const groups = rosterR.status === 'fulfilled' ? (rosterR.value.athletes || []) : [];
  const allPlayers = [];
  const idMap = {};
  groups.forEach((grp) => (grp.items || grp.athletes || []).forEach((a) => { allPlayers.push(a); if (a.id) idMap[a.id] = a; }));
  const card = (val, lbl) => `<div class="fan-card"><div class="big">${val}</div><div class="lbl">${lbl}</div></div>`;

  const ages = allPlayers.map((a) => a.age).filter((n) => typeof n === 'number');
  const avgAge = ages.length ? (ages.reduce((s, n) => s + n, 0) / ages.length).toFixed(1) : '–';
  const youngest = allPlayers.filter((a) => a.age).sort((a, b) => a.age - b.age)[0];
  const oldest = allPlayers.filter((a) => a.age).sort((a, b) => b.age - a.age)[0];
  $('#redsox-analytics').innerHTML = allPlayers.length
    ? card(allPlayers.length, 'Players on roster') + card(avgAge, 'Average age') +
      (youngest ? card(`${youngest.age}`, `Youngest · ${esc(youngest.displayName)}`) : '') +
      (oldest ? card(`${oldest.age}`, `Oldest · ${esc(oldest.displayName)}`) : '')
    : card('–', 'Roster loading');

  const articles = newsR.status === 'fulfilled' ? (newsR.value.articles || []) : [];
  const newsEl = $('#redsox-news');
  if (!articles.length) {
    newsEl.innerHTML = '<div class="empty">No recent Red Sox news right now.</div>';
  } else {
    newsEl.innerHTML = articles.slice(0, 12).map((a, idx) => {
      const img = a.images?.[0]?.url;
      const when = a.published ? new Date(a.published).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
      return `<div class="news-item" data-news="${idx}">${img ? `<img src="${esc(img)}" alt="" onerror="this.style.display='none'">` : ''}<div><div class="nh">${esc(a.headline || '')}</div><div class="nd">${esc(a.description || '')}</div><div class="nt">${when} · tap for summary</div></div></div>`;
    }).join('');
    newsEl.querySelectorAll('.news-item').forEach((it) => { it.onclick = () => openNewsSummary(articles[+it.dataset.news]); });
  }

  const navItems = [['rs-nextgame', 'Next'], ['rs-standings', 'Standings'], ['rs-playoff', 'Playoff'], ['rs-news', 'News'], ['rs-stats', 'Stats'], ['rs-schedule', 'Schedule'], ['rs-roster', 'Roster'], ['rs-leaders', 'Leaders'], ['rs-numbers', 'Numbers'], ['rs-staff', 'Manager']];
  const navEl = $('#redsox-nav');
  navEl.innerHTML = navItems.map(([tg, l]) => `<button class="chip" data-target="${tg}">${l}</button>`).join('');
  navEl.querySelectorAll('button').forEach((b) => (b.onclick = () => { const elx = document.getElementById(b.dataset.target); if (elx?._accSet) elx._accSet(true); elx?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));

  makeAccordion(document.getElementById('redsox'), '.section-title', 2);

  renderRedSoxRoster(allPlayers, idMap);
  renderRedSoxTeamStats();
  renderRedSoxLeaders(idMap);
  renderRedSoxSchedule();
  renderRedSoxNextGame(t);
  renderStandingsBlock('mlb', t?.displayName || 'Boston Red Sox', '#redsox-standings', '#redsox-playoff');
}

// Roster laid out the way a baseball fan reads a staff: Starting Rotation (in
// order) → Bullpen → Closer, then Catchers/Infielders/Outfielders/DH. Pitcher
// roles come from ESPN's position label (Starting Pitcher / Relief Pitcher /
// Closer); the rotation ORDER and the closer are refined with the season
// Games-Started and Saves leaders (a cache hit — the Leaders section fetches the
// same feed). Degrades gracefully: no role data → a single "Pitchers" group.
async function renderRedSoxRoster(allPlayers, idMap) {
  const elx = $('#redsox-roster');
  if (!allPlayers || !allPlayers.length) { elx.innerHTML = '<div class="empty">Roster not available right now.</div>'; return; }

  const posOf = (a) => {
    const p = a.position || {};
    return { abbr: String(p.abbreviation || '').toUpperCase(), name: String(p.displayName || p.name || '').toLowerCase() };
  };
  const isPitcher = (a) => { const { abbr, name } = posOf(a); return ['P', 'SP', 'RP', 'CP', 'CL'].includes(abbr) || name.includes('pitch'); };
  const isStarterPos = (a) => { const { abbr, name } = posOf(a); return abbr === 'SP' || name.includes('starting') || name.includes('starter'); };
  const isCloserPos = (a) => { const { abbr, name } = posOf(a); return ['CP', 'CL'].includes(abbr) || name.includes('closer'); };

  // Real rotation order (games started) + closer (saves) from the cached leaders feed.
  let gsIds = [], closerId = null;
  try {
    const ld = await safeJSON(`${BBCORE}/seasons/${MLB_SEASON}/types/2/teams/${REDSOX.teamId}/leaders`, 6 * 3600000);
    const cats = ld?.categories || [];
    const gsCat = cats.find((c) => /games.?started|gamesstart/i.test(String(c.name || c.displayName || '')) || /^gs$/i.test(String(c.abbreviation || '')));
    if (gsCat) gsIds = (gsCat.leaders || []).map((l) => refId(l.athlete?.$ref)).filter(Boolean);
    const svCat = cats.find((c) => /^(sv|svo)$/i.test(String(c.abbreviation || '')) || /\bsaves?\b/i.test(String(c.name || c.displayName || '')));
    if (svCat && (svCat.leaders || []).length) closerId = refId(svCat.leaders[0].athlete?.$ref);
  } catch (e) { /* leaders unavailable — fall back to position labels only */ }
  const gsIdx = {}; gsIds.forEach((id, i) => { if (id != null && gsIdx[id] == null) gsIdx[id] = i; });

  const pitchers = allPlayers.filter(isPitcher);
  const closer = pitchers.find((p) => String(p.id) === String(closerId)) || pitchers.find(isCloserPos) || null;
  const starters = pitchers.filter((p) => p !== closer && (gsIdx[p.id] != null || isStarterPos(p)))
    .sort((a, b) => (gsIdx[a.id] ?? 999) - (gsIdx[b.id] ?? 999));
  const bullpen = pitchers.filter((p) => p !== closer && !starters.includes(p));

  const posPlayers = allPlayers.filter((a) => !isPitcher(a));
  const inSet = (a, set) => set.includes(posOf(a).abbr);
  const catchers = posPlayers.filter((a) => posOf(a).abbr === 'C' || posOf(a).name.includes('catcher'));
  const infield = posPlayers.filter((a) => inSet(a, ['1B', '2B', '3B', 'SS', 'IF', 'INF']) || /base|shortstop|infield/.test(posOf(a).name));
  const outfield = posPlayers.filter((a) => inSet(a, ['LF', 'CF', 'RF', 'OF']) || posOf(a).name.includes('outfield'));
  const dh = posPlayers.filter((a) => posOf(a).abbr === 'DH' || posOf(a).name.includes('designated'));
  const used = new Set([...catchers, ...infield, ...outfield, ...dh]);
  const other = posPlayers.filter((a) => !used.has(a));

  const chip = (a, badge) => {
    const j = badge != null ? badge : (posOf(a).abbr || '—');
    const age = a.age ? ` <span class="age">${a.age}y</span>` : '';
    return `<span class="depth-player"><span class="jersey">${esc(j)}</span> ${esc(a.displayName || a.fullName || '')}${a.jersey ? ` #${esc(a.jersey)}` : ''}${age}</span>`;
  };
  const group = (label, arr, opts = {}) => {
    if (!arr.length) return '';
    const body = arr.map((a, i) => chip(a, opts.number ? `SP${i + 1}` : (opts.badge != null ? opts.badge : undefined))).join('');
    return `<div class="depth-group"><h4>${esc(label)} <span class="grp-n">${arr.length}</span></h4><div>${body}</div></div>`;
  };

  let html = '';
  if (!starters.length && !closer) {
    html += group('Pitchers', bullpen);
  } else {
    html += group('Starting Rotation', starters, { number: true });
    html += group('Bullpen', bullpen);
    if (closer) html += group('Closer', [closer], { badge: '🔒' });
  }
  html += group('Catchers', catchers);
  html += group('Infielders', infield);
  html += group('Outfielders', outfield);
  html += group('Designated Hitter', dh);
  html += group('Other', other);
  elx.innerHTML = html || '<div class="empty">Roster not available right now.</div>';
}

async function renderRedSoxTeamStats() {
  $('#redsox-stats-season').textContent = `(${MLB_SEASON})`;
  const elx = $('#redsox-teamstats');
  const data = await safeJSON(`${BBCORE}/seasons/${MLB_SEASON}/types/2/teams/${REDSOX.teamId}/statistics`, 6 * 3600000);
  const flat = [];
  (data?.splits?.categories || []).forEach((c) => (c.stats || []).forEach((s) => { if (s.displayValue != null) flat.push(s); }));
  if (!flat.length) { elx.innerHTML = '<div class="empty">Team stats will appear once the season is underway.</div>'; return; }
  const WANT = ['AVG', 'R', 'HR', 'RBI', 'OBP', 'SLG', 'OPS', 'SB', 'ERA', 'WHIP', 'SO', 'K', 'SV', 'W'];
  const seen = new Set();
  const take = (s) => { const k = (s.abbreviation || s.name || '').toUpperCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; };
  let picked = flat.filter((s) => WANT.includes((s.abbreviation || '').toUpperCase())).filter(take);
  if (picked.length < 6) flat.filter((s) => s.rank).forEach((s) => { if (picked.length < 10 && take(s)) picked.push(s); });
  if (picked.length < 6) flat.forEach((s) => { if (picked.length < 10 && take(s)) picked.push(s); });
  elx.innerHTML = picked.slice(0, 10).map((s) => {
    const rank = s.rank;
    const rc = rank ? (rank <= 8 ? 'top' : rank >= 23 ? 'bot' : '') : '';
    const rankHtml = rank ? `<span class="rank ${rc}">${esc(s.rankDisplayValue || ('#' + rank))}</span>` : '';
    return `<div class="stat-row"><div class="sname">${esc(s.displayName || s.name)}</div><div class="sval"><span class="v">${esc(s.displayValue)}</span>${rankHtml}</div></div>`;
  }).join('');
}

async function renderRedSoxLeaders(idMap) {
  const elx = $('#redsox-leaders');
  const data = await safeJSON(`${BBCORE}/seasons/${MLB_SEASON}/types/2/teams/${REDSOX.teamId}/leaders`, 6 * 3600000);
  const cats = (data?.categories || []).filter((c) => (c.leaders || []).length);
  if (!cats.length) { elx.innerHTML = '<div class="empty">Player leaders will appear during the season.</div>'; return; }
  // The core leaders feed gives the athlete only as a $ref; resolve names from
  // the roster map first, and fetch any that aren't on it (deduped + cached) so
  // rows don't fall back to "—".
  const entries = cats.slice(0, 12).map((c) => {
    const top = c.leaders[0];
    const ref = top.athlete?.$ref ? top.athlete.$ref.replace(/^http:/, 'https:') : null;
    const who = idMap[refId(top.athlete?.$ref)]?.displayName || top.athlete?.displayName || top.athlete?.fullName || '';
    return { cat: c.displayName || c.name, who, ref, val: top.displayValue ?? top.value ?? '' };
  });
  const missing = [...new Set(entries.filter((e) => !e.who && e.ref).map((e) => e.ref))];
  const nameByRef = {};
  await Promise.all(missing.map(async (u) => { const a = await safeJSON(u, 24 * 3600000); nameByRef[u] = a?.displayName || a?.fullName || ''; }));
  elx.innerHTML = entries.map((e) => {
    const who = e.who || (e.ref ? nameByRef[e.ref] : '') || '—';
    return `<div class="leader-row"><span class="cat">${esc(e.cat)}</span><span class="who">${esc(who)}</span><span class="val">${esc(e.val)}</span></div>`;
  }).join('');
}

async function renderRedSoxSchedule() {
  const elx = $('#redsox-schedule');
  const data = await safeJSON(`${MLB_TEAM}/schedule`, 3 * 3600000);
  const events = (data?.events || []).filter((e) => e.date);
  if (!events.length) { elx.innerHTML = '<div class="empty">Schedule not available.</div>'; return; }
  const now = Date.now();
  const sorted = events.map((ev) => ({ ev, t: new Date(ev.date).getTime() })).sort((a, b) => a.t - b.t);
  const past = sorted.filter((x) => x.t < now);
  const future = sorted.filter((x) => x.t >= now);
  const show = [...past.slice(-6), ...future.slice(0, 8)].map((x) => x.ev);
  let wins = 0, losses = 0; const trend = [];
  past.slice(-10).forEach(({ ev }) => {
    const comp = ev.competitions?.[0] || {};
    const me = (comp.competitors || []).find((c) => String(c.team?.id) === String(REDSOX.teamId));
    if (comp.status?.type?.completed && me) { if (me.winner === true) { wins++; trend.push('w'); } else { losses++; trend.push('l'); } }
  });
  const trendHTML = trend.length ? `<div class="trend"><span class="rec">Last ${trend.length}: ${wins}-${losses}</span>${trend.map((r) => `<span class="pill ${r}">${r.toUpperCase()}</span>`).join('')}</div>` : '';
  const rows = show.map((ev) => {
    const comp = ev.competitions?.[0] || {};
    const me = (comp.competitors || []).find((c) => String(c.team?.id) === String(REDSOX.teamId));
    const opp = (comp.competitors || []).find((c) => String(c.team?.id) !== String(REDSOX.teamId));
    const home = me?.homeAway === 'home';
    const done = comp.status?.type?.completed;
    const when = ev.date ? new Date(ev.date).toLocaleDateString([], { month: 'numeric', day: 'numeric' }) : '';
    const oppName = opp?.team?.abbreviation || opp?.team?.displayName || 'TBD';
    let res = `<span class="res up">${ev.date ? fmtTime(ev.date) : '—'}</span>`;
    if (done && me) {
      const win = me.winner === true;
      const ms = me.score?.displayValue ?? me.score?.value ?? '';
      const os = opp?.score?.displayValue ?? opp?.score?.value ?? '';
      res = `<span class="res ${win ? 'w' : 'l'}">${win ? 'W' : 'L'} ${ms}-${os}</span>`;
    }
    return `<div class="sched-row"><span class="wk">${esc(when)}</span><span class="opp">${home ? 'vs' : '@'} ${esc(oppName)}</span>${res}</div>`;
  }).join('');
  elx.innerHTML = trendHTML + rows;
}

async function renderRedSoxNextGame(team) {
  const elx = $('#redsox-nextgame');
  const next = team?.nextEvent?.[0];
  const comp = next?.competitions?.[0];
  const opp = (comp?.competitors || []).find((c) => String(c.team?.id) !== String(REDSOX.teamId));
  if (!opp?.team) { elx.innerHTML = '<div class="empty">No upcoming game scheduled.</div>'; return; }
  const od = await safeJSON(`${SITE}/baseball/mlb/teams/${opp.team.id}`, 60 * 60000);
  const ot = od?.team;
  const rec = ot?.record?.items?.[0]?.summary;
  const standing = ot?.standingSummary;
  const oLogo = ot?.logos?.[0]?.href || opp.team.logo;
  const when = next.date ? new Date(next.date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) + ' · ' + fmtTime(next.date) : '';
  elx.innerHTML = `<div class="opp-card">${oLogo ? `<img src="${esc(oLogo)}" alt="">` : ''}<div><div class="on">${esc(ot?.displayName || opp.team.displayName)}</div><div class="od">${[rec ? `Record ${rec}` : '', standing].filter(Boolean).join(' • ') || ''}</div><div class="od">${esc(next.name || '')}${when ? ' · ' + when : ''}</div></div></div>`;
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
  if (!panel || name === 'eagles' || name === 'redsox' || name === 'nfl' || name === 'cfb' || name === 'home') return;
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

// ======================= Betting board (shared) ===========================
// The gambling read for a whole slate in one scan, used by the NFL and CFB
// tabs. Everything here already existed per-game inside the modal's Game
// Report; this puts the same three numbers — the book's line, the model's
// price, and where the money is — side by side for every game on the card, so
// the week can be read without opening fifteen modals.
//
// It obeys the v157 rule: the Render backend is raced under a hard cap and the
// board renders without it, so a sleeping backend costs the sharp-money row
// and nothing else.
const BB_MAX_GAMES = 16; // keeps a full CFB Saturday from firing 60 profile fetches

async function renderBettingBoard(sport, host, games) {
  if (!host) return;
  // Finals have no line left to read; the Game Report in the modal still
  // carries their closing numbers.
  const open = (games || []).filter((g) => g.id && gameState(g) !== 'final');
  const slate = open.slice(0, BB_MAX_GAMES);
  if (!slate.length) {
    host.innerHTML = `<div class="empty">${(games || []).length ? 'Every game on this slate is final — open a card for its closing report.' : 'No games on the board right now.'}</div>`;
    return;
  }
  host.innerHTML = '<div class="empty">📊 Pulling lines &amp; money…</div>';
  const reportP = getBettingReport(sport).catch(() => null);
  const report = await raceReport(reportP, SHARP_WAIT.picks);
  const preds = await Promise.all(slate.map((g) => (g.seasonType === 1
    ? Promise.resolve(null)
    : predictGame(sport, g, { splits: splitsFor(report, g) }).catch(() => null))));

  let withSplits = 0, edges = 0;
  const rows = slate.map((g, i) => {
    const p = preds[i];
    const info = normOdds(g.odds, g.home.name, g.away.name);
    const sp = splitsFor(report, g);
    if (sp) withSplits++;
    const gap = p && info ? marketGap(p, info) : null;
    const isEdge = !!(p && info && info.favName && p.winner.name !== info.favName && (gap == null || gap >= 5));
    if (isEdge) edges++;
    const st = gameState(g);
    const when = st === 'live' ? (g.statusText || 'LIVE')
      : new Date(g.date).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

    const ml = (v) => (Number(v) > 0 ? `+${v}` : `${v}`);
    let lineTxt = info?.details || '';
    if (!lineTxt && info && (info.hML != null || info.aML != null)) {
      lineTxt = [info.aML != null ? `${g.away.abbr || 'Away'} ${ml(info.aML)}` : '',
                 info.hML != null ? `${g.home.abbr || 'Home'} ${ml(info.hML)}` : ''].filter(Boolean).join(' / ');
    }
    const lineBits = [lineTxt, info?.ou != null ? `O/U ${info.ou}` : '', g.tv || ''].filter(Boolean).join(' · ');

    let modelTxt;
    if (g.seasonType === 1) modelTxt = '<span class="bb-muted">🤖 Preseason — the model sits these out</span>';
    else if (!p) modelTxt = '<span class="bb-muted">🤖 Not enough game data yet</span>';
    else {
      const gapTag = gap == null ? ''
        : `<span class="bb-gap${isEdge ? ' edge' : ''}">${gap > 0 ? '+' : ''}${gap} vs market</span>`;
      const tot = p.projTotal != null && info?.ou != null
        ? ` · total ${p.projTotal.toFixed(1)} vs ${info.ou}` : '';
      modelTxt = `🤖 <b>${esc(p.winner.name)}</b> ${p.conf}%${tot} ${gapTag}`;
    }
    const sharpRows = sharpSignals(g, sp, null).map((t) => `<div class="bb-sharp">${t}</div>`).join('');
    return `<div class="bb-row${isEdge ? ' edge' : ''}">
      <div class="bb-top"><span class="bb-match">${rankHTML(g.away)}${esc(g.away.abbr || g.away.name)} @ ${rankHTML(g.home)}${esc(g.home.abbr || g.home.name)}</span><span class="bb-when${st === 'live' ? ' live' : ''}">${esc(when)}</span></div>
      <div class="bb-line">${lineBits ? `📊 ${esc(lineBits)}` : '<span class="bb-muted">No line posted yet</span>'}</div>
      <div class="bb-model">${modelTxt}</div>${sharpRows}</div>`;
  }).join('');

  // Say plainly what the board is standing on. A missing backend is stated,
  // never papered over — the lines are ESPN's either way.
  const moneyNote = !BETTING_SPORTS.has(sport)
    ? 'No betting-splits feed for this league.'
    : report ? (withSplits
        ? `Dollars-vs-tickets from DraftKings via VSiN on ${withSplits} of ${slate.length} games.`
        : 'DraftKings splits loaded but none matched this slate yet.')
      : 'Splits feed asleep or unreachable — lines and model prices only.';
  host.innerHTML = `<div class="ai-why" style="margin:2px 0 8px">Lines are ESPN's. ${esc(moneyNote)} ${edges ? `⚡ = the model disagrees with the book by 5+ points (${edges} today).` : 'No model-vs-book edges on this slate.'} For fun — not betting advice.</div>${rows}` +
    // Only say "top N" when the BOARD actually truncated. Finals are excluded
    // above by design, not hidden, so they must not inflate this count.
    (open.length > slate.length ? `<div class="ai-why" style="margin-top:8px">Showing the top ${slate.length} of ${open.length} games with a line — tap any card above for the rest.</div>` : '');
}

// =========================== College football tab =========================
// Top 25 only, by design (see LEAGUES.cfb): the ranked slate, the poll itself,
// the projected playoff field, the betting board and league news — the same
// surfaces the NFL tab carries, sized to the part of college football the
// owner actually watches.
async function renderCFB() {
  const navItems = [['cfb-sec-week', 'Ranked Games'], ['cfb-sec-betting', 'Betting'],
    ['cfb-sec-rank', 'Top 25'], ['cfb-sec-playoff', 'Playoff Field'], ['cfb-sec-news', 'News']];
  const navEl = $('#cfb-nav');
  navEl.innerHTML = navItems.map(([t, l]) => `<button class="chip" data-target="${t}">${l}</button>`).join('');
  navEl.querySelectorAll('button').forEach((b) =>
    (b.onclick = () => { const t = document.getElementById(b.dataset.target); if (t?._accSet) t._accSet(true); t?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  makeAccordion(document.getElementById('cfb'), '.section-title', 2);
  renderCFBWeek();
  renderCFBRankings();
  renderCFBNews();
}

// Hero + this week's ranked slate + the betting board built from it.
async function renderCFBWeek() {
  const heroEl = $('#cfb-hero'), box = $('#cfb-week');
  let sb = null;
  try { sb = await scoreboard('cfb'); } catch (_) {}
  const all = sb?.games || [];
  const games = all.length ? await onlyRanked('cfb', all).catch(() => []) : [];
  const stype = Number(sb?.json?.season?.type ?? sb?.json?.leagues?.[0]?.season?.type) || null;
  const week = sb?.json?.week?.number ?? null;
  const phase = stype === 3 ? 'Bowls & Playoff'
    : stype === 2 ? `Regular Season${week ? ` · Week ${week}` : ''}`
    : `${footballSeason()} Season`;
  heroEl.innerHTML = `
    <h2 style="margin:0">College Football</h2><div class="muted">${esc(phase)}</div>
    <div class="muted" style="margin-top:4px;font-size:.85rem">Ranked teams only — a game shows up here (and on the Home slate) when a Top 25 team is playing in it.</div>`;
  if (setMode && games.length) setMode(true);

  renderBettingBoard('cfb', $('#cfb-betting'), games);
  renderCFBPlayoff();

  if (!games.length) {
    box.innerHTML = `<div class="empty">${all.length
      ? 'No Top 25 teams on this week\'s board yet.'
      : sb ? 'No games on the board right now.' : 'Scoreboard unreachable right now.'}</div>`;
    return;
  }
  box.innerHTML = '';
  const byDay = {};
  games.forEach((g) => {
    const key = new Date(g.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
    (byDay[key] = byDay[key] || []).push(g);
  });
  Object.entries(byDay).forEach(([day, arr]) => {
    box.appendChild(el('div', 'nfl-day', day));
    const grid = el('div', 'games-grid');
    arr.forEach((g) => grid.appendChild(gameCard('cfb', g, { odds: true })));
    box.appendChild(grid);
  });
}

// The poll itself. Movement is computed against each team's previous rank, so
// the table shows who is climbing without needing a second feed.
async function renderCFBRankings() {
  const box = $('#cfb-rankings');
  const rk = await cfbRankings().catch(() => null);
  if (!rk || !rk.entries.length) {
    box.innerHTML = '<div class="empty">Rankings feed unreachable right now — the ranked slate above falls back to the ranks ESPN stamps on each game.</div>';
    return;
  }
  const head = `<div class="ai-why" style="margin:2px 0 8px">${esc(rk.poll)}${rk.asOf ? ` · ${esc(String(rk.asOf))}` : ''}. Every other section on this tab is filtered to these teams.</div>`;
  box.innerHTML = head + rk.entries.map((e) => {
    const mv = e.prev && e.prev > 0 && e.prev !== e.rank ? e.prev - e.rank : 0;
    const mvTxt = mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '—';
    return `<div class="pw-row">
      <span class="pw-rank">${e.rank}</span>
      <span class="pw-team">${e.logo ? `<img src="${esc(e.logo)}" alt="" loading="lazy">` : ''}${esc(e.name)}${e.votes ? ` <span class="cfb-votes">(${e.votes})</span>` : ''}</span>
      <span class="pw-rec">${esc(e.record || '')}</span>
      <span class="pw-diff ${mv > 0 ? 'up' : mv < 0 ? 'dn' : ''}">${mvTxt}</span>
    </div>`;
  }).join('') + (rk.others.length
    ? `<div class="ai-why" style="margin-top:8px">Also receiving votes: ${esc(rk.others.slice(0, 8).join(', '))}</div>` : '');
}

// Projected playoff field. The 12-team bracket takes the five highest-ranked
// conference champions plus seven at-large teams, which no free feed resolves —
// so this is honestly labelled a read of the poll's top 12, not a bracket.
async function renderCFBPlayoff() {
  const box = $('#cfb-playoff');
  if (!box) return;
  const rk = await cfbRankings().catch(() => null);
  if (!rk || rk.entries.length < 12) { box.innerHTML = '<div class="empty">Appears once a full poll is out.</div>'; return; }
  const isCFP = /playoff|cfp/i.test(rk.poll);
  const note = isCFP
    ? 'The committee\'s current top 12. The real bracket reserves five spots for conference champions, so seeding will shift — this is the field as ranked, not an official bracket.'
    : `Read off the ${esc(rk.poll)} — the committee's own rankings don't start until November. Top 12 make the playoff.`;
  box.innerHTML = `<div class="ai-why" style="margin:2px 0 8px">${note}</div>` +
    rk.entries.slice(0, 16).map((e, i) => `${i === 12 ? '<div class="npo-cut"></div>' : ''}<div class="npo-row">
      <span class="npo-seed">${i < 12 ? e.rank : '—'}</span>
      <span class="pw-team">${e.logo ? `<img src="${esc(e.logo)}" alt="" loading="lazy">` : ''}${esc(e.name)}</span>
      <span class="pw-rec">${esc(e.record || '')}</span></div>`).join('') +
    '<div class="ai-why" style="margin-top:6px">Dashed line = the cut. Below it: first teams out.</div>';
}

async function renderCFBNews() {
  const nb = $('#cfb-news');
  let arts = [];
  try { arts = (await fetchJSON(`${SITE}/football/college-football/news?limit=12`, 5 * 60000))?.articles || []; } catch (_) {}
  if (!arts.length) { nb.innerHTML = '<div class="empty">No college football news right now.</div>'; return; }
  nb.innerHTML = arts.slice(0, 12).map((a, idx) => {
    const img = a.images?.[0]?.url;
    const when = a.published ? new Date(a.published).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
    return `<div class="news-item" data-news="${idx}">
      ${img ? `<img src="${esc(img)}" alt="" onerror="this.style.display='none'">` : ''}
      <div><div class="nh">${esc(a.headline || '')}</div><div class="nd">${esc(a.description || '')}</div><div class="nt">${when} · tap for summary</div></div></div>`;
  }).join('');
  nb.querySelectorAll('.news-item').forEach((it) => { it.onclick = () => openNewsSummary(arts[+it.dataset.news]); });
}

// ============================== NFL tab ===================================
// League-wide NFL lens (the Eagles tab stays the team deep-dive): weekly
// slate, league headlines, a model-flavored Power Board, and the playoff
// picture. Everything degrades to honest empty-states when feeds are down.
async function renderNFL() {
  const navItems = [['nfl-sec-week', 'Week'], ['nfl-sec-betting', 'Betting'], ['nfl-sec-news', 'News'], ['nfl-sec-power', 'Power Board'], ['nfl-sec-playoff', 'Playoffs']];
  const navEl = $('#nfl-nav');
  navEl.innerHTML = navItems.map(([t, l]) => `<button class="chip" data-target="${t}">${l}</button>`).join('');
  navEl.querySelectorAll('button').forEach((b) =>
    (b.onclick = () => { const t = document.getElementById(b.dataset.target); if (t?._accSet) t._accSet(true); t?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  makeAccordion(document.getElementById('nfl'), '.section-title', 2);
  // each section fetches + renders independently, in parallel
  renderNFLWeek();
  renderNFLNews();
  renderNFLPower();
}

// Hero + this week's slate. NFL is a weekly sport — the bare scoreboard call
// returns the CURRENT week's full Thu–Mon slate plus week/season metadata,
// which is exactly the view the daily Home slate can't give.
async function renderNFLWeek() {
  const heroEl = $('#nfl-hero'), box = $('#nfl-week');
  let sb = null;
  try { sb = await scoreboard('nfl'); } catch (_) {}
  const json = sb?.json || null;
  const events = sb?.games || [];
  const stype = Number(json?.season?.type ?? json?.leagues?.[0]?.season?.type) || events.find((g) => g.seasonType)?.seasonType || null;
  const week = json?.week?.number ?? null;
  const kick = daysUntil(NFL_KICKOFF);
  const phase = stype === 3 ? 'Playoffs'
    : stype === 2 ? `Regular Season${week ? ` · Week ${week}` : ''}`
    : stype === 1 ? `Preseason${week ? ` · Week ${week}` : ''}`
    : '2026 Season';
  heroEl.innerHTML = `
    <h2 style="margin:0">NFL</h2><div class="muted">${esc(phase)}</div>
    ${stype !== 2 && stype !== 3 && kick > 0 ? `<div class="nfl-kick">🏈 Kickoff in <b>${kick} day${kick === 1 ? '' : 's'}</b> — Thu Sep 10</div>` : ''}
    ${stype === 1 ? '<div class="muted" style="margin-top:4px;font-size:.85rem">Preseason results don\'t feed the AI model — backups play, nothing predictive.</div>' : ''}`;
  if (setMode && events.length) setMode(true);
  // The betting board reads the same slate — no second scoreboard fetch.
  renderBettingBoard('nfl', $('#nfl-betting'), events);
  if (!events.length) {
    box.innerHTML = `<div class="empty">${json ? 'No games on this week\'s slate.' : 'Scoreboard unreachable right now.'}</div>`;
    return;
  }
  box.innerHTML = '';
  const byDay = {};
  events.forEach((g) => {
    const key = new Date(g.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
    (byDay[key] = byDay[key] || []).push(g);
  });
  Object.entries(byDay).forEach(([day, arr]) => {
    box.appendChild(el('div', 'nfl-day', day));
    const grid = el('div', 'games-grid');
    arr.forEach((g) => grid.appendChild(gameCard('nfl', g, { odds: true })));
    box.appendChild(grid);
  });
}

async function renderNFLNews() {
  const nb = $('#nfl-news');
  let arts = [];
  try { arts = (await fetchJSON(`${SITE}/football/nfl/news?limit=12`, 5 * 60000))?.articles || []; } catch (_) {}
  if (!arts.length) { nb.innerHTML = '<div class="empty">No league news right now.</div>'; return; }
  nb.innerHTML = arts.slice(0, 12).map((a, idx) => {
    const img = a.images?.[0]?.url;
    const when = a.published ? new Date(a.published).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
    return `<div class="news-item" data-news="${idx}">
      ${img ? `<img src="${esc(img)}" alt="" onerror="this.style.display='none'">` : ''}
      <div><div class="nh">${esc(a.headline || '')}</div><div class="nd">${esc(a.description || '')}</div><div class="nt">${when} · tap for summary</div></div></div>`;
  }).join('');
  nb.querySelectorAll('.news-item').forEach((it) => { it.onclick = () => openNewsSummary(arts[+it.dataset.news]); });
}

// Power Board (all 32 by record + per-game point diff — one standings pull,
// prior-season final standings until 2026 games count) and the Playoff
// Picture (seeds 1–7 per conference off ESPN's playoffSeed).
const NFL_CONF = (r) => {
  const s = `${r.league || ''} ${r.division || ''}`;
  return /American|^AFC|\bAFC\b/.test(s) ? 'AFC' : /National|^NFC|\bNFC\b/.test(s) ? 'NFC' : '?';
};
async function renderNFLPower() {
  const pb = $('#nfl-power'), po = $('#nfl-playoff');
  let rows = await getStandings('nfl').catch(() => []);
  const played = rows.some((r) => (r.wins + r.losses) > 0);
  let src = 'live';
  if (!rows.length || !played) {
    const prev = await getStandings('nfl', STAT_SEASON - 1).catch(() => []);
    if (prev.length && prev.some((r) => r.wins + r.losses > 0)) { rows = prev; src = 'prior'; }
  }
  if (!rows.length) {
    pb.innerHTML = '<div class="empty">Standings feed unreachable right now.</div>';
    po.innerHTML = '<div class="empty">Needs the standings feed — try again later.</div>';
    return;
  }
  const scored = rows.map((r) => {
    const g = (r.wins || 0) + (r.losses || 0), wp = g ? r.wins / g : 0;
    const dpg = g && r.diff != null ? r.diff / g
      : g && r.pf != null && r.pa != null ? (r.pf - r.pa) / g : 0;
    return { ...r, g, wp, dpg, score: wp + dpg / 28 }; // ~14 pts/gm diff ≈ a .500 swing
  }).sort((a, b) => b.score - a.score);
  const note = src === 'prior'
    ? `No ${STAT_SEASON} games yet — ranked on final ${STAT_SEASON - 1} record + point diff until real games count.`
    : `Ranked on ${STAT_SEASON} record + per-game point differential (the same signals the AI model reads).`;
  pb.innerHTML = `<div class="ai-why" style="margin:2px 0 8px">${note}</div>` + scored.map((r, i) => {
    const barPct = clamp(((r.score + 0.45) / 1.9) * 100, 4, 100);
    const d = r.dpg ? (r.dpg > 0 ? '+' : '') + r.dpg.toFixed(1) : '—';
    return `<div class="pw-row${/eagles/i.test(r.team) ? ' you' : ''}">
      <span class="pw-rank">${i + 1}</span>
      <span class="pw-team">${r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy">` : ''}${esc(r.team)}</span>
      <span class="pw-rec">${r.wins}-${r.losses}</span>
      <span class="pw-diff ${r.dpg > 0 ? 'up' : r.dpg < 0 ? 'dn' : ''}">${d}</span>
      <span class="pw-bar"><i style="width:${barPct}%"></i></span>
    </div>`;
  }).join('');
  if (src === 'prior' || !played) {
    po.innerHTML = `<div class="empty">Appears once ${STAT_SEASON} regular-season games count — the Power Board carries the offseason read for now.</div>`;
    return;
  }
  const conf = { AFC: [], NFC: [] };
  scored.forEach((r) => { const c = NFL_CONF(r); if (conf[c]) conf[c].push(r); });
  const hasSeeds = scored.some((r) => r.seed != null && r.seed > 0);
  po.innerHTML = `<div class="ai-why" style="margin:2px 0 8px">${hasSeeds ? 'Seeds from ESPN standings.' : 'Approximate seeding by record — ESPN hasn\'t sent playoff seeds yet.'} Top 7 make it.</div>` +
    Object.entries(conf).map(([c, arr]) => {
      if (!arr.length) return '';
      const seeded = hasSeeds ? arr.slice().sort((a, b) => (a.seed || 99) - (b.seed || 99)) : arr;
      const field = seeded.slice(0, 7), hunt = seeded.slice(7, 10);
      const row = (r, i) => `<div class="npo-row${/eagles/i.test(r.team) ? ' you' : ''}">
        <span class="npo-seed">${hasSeeds && r.seed ? r.seed : i + 1}</span>
        <span class="pw-team">${r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy">` : ''}${esc(r.team)}</span>
        <span class="pw-rec">${r.wins}-${r.losses}</span></div>`;
      return `<div class="npo-conf">${c}</div>${field.map(row).join('')}<div class="npo-cut"></div>` +
        (hunt.length ? `<div class="ai-why" style="margin:2px 0 4px;font-size:.78rem">In the hunt</div>${hunt.map((r, i) => row(r, i + 7)).join('')}` : '');
    }).join('');
}

const renderers = { home: renderHome, eagles: renderEagles, nfl: renderNFL, cfb: renderCFB, redsox: renderRedSox, predictions: renderPredictions, fantasy: renderFantasy, labs: () => {}, about: () => {} };
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
  fanState.mock = { setup: true, teams: 12, slot: 10, rounds: 15, keepers: MOCK_KEEPERS.map((k) => ({ ...k })) };
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

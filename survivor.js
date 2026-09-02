/* Family Survivor League — all logic, no build step, no framework.
   ------------------------------------------------------------------
   HOUSE RULES (settled with the commissioner, 2 Sep 2026):
     1. Missed week   -> 0 points, NOT a loss, and the team is NOT used up.
     2. Deadline      -> per game. You may pick or change until that game
                         kicks off. Once your team's game starts you are locked.
     3. Visibility    -> a pick is hidden from everyone else until its game
                         starts, then it is public.
     4. Season        -> regular season only, weeks 1-18.
     5. Standings     -> wins first, cumulative margin ("points") as tiebreak.
     6. Ties          -> neither a win nor a loss. Margin 0. Team still used.
   ------------------------------------------------------------------
   STORAGE: picks are the ONLY thing stored. Results, records and standings
   are computed live from ESPN's free public scoreboard every time the page
   renders, which is why there is no results table, no cron job and no way
   for a viewer to poison a score. It also means standings tick live on a
   Sunday afternoon, which is the point. */

'use strict';

const SEASON = 2026;
const LAST_WEEK = 18;                 // regular season only (house rule 4)
const ESPN_SB = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

/* ---- Supabase config -------------------------------------------------
   Leave these blank to run in on-device mode (great for testing, useless
   for a 20-person league). Paste your project's URL and its anon /
   publishable key to go multi-device. The anon key is DESIGNED to sit in a
   public file: every write goes through a database function that checks the
   token, and the players table itself is not readable. See schema.sql.
   You can also paste them on the Admin screen instead of editing this file. */
let SUPABASE_URL = '';
let SUPABASE_KEY = '';

const TEAMS = {
  ARI: ['Arizona Cardinals', 'Cardinals'],  ATL: ['Atlanta Falcons', 'Falcons'],
  BAL: ['Baltimore Ravens', 'Ravens'],      BUF: ['Buffalo Bills', 'Bills'],
  CAR: ['Carolina Panthers', 'Panthers'],   CHI: ['Chicago Bears', 'Bears'],
  CIN: ['Cincinnati Bengals', 'Bengals'],   CLE: ['Cleveland Browns', 'Browns'],
  DAL: ['Dallas Cowboys', 'Cowboys'],       DEN: ['Denver Broncos', 'Broncos'],
  DET: ['Detroit Lions', 'Lions'],          GB:  ['Green Bay Packers', 'Packers'],
  HOU: ['Houston Texans', 'Texans'],        IND: ['Indianapolis Colts', 'Colts'],
  JAX: ['Jacksonville Jaguars', 'Jaguars'], KC:  ['Kansas City Chiefs', 'Chiefs'],
  LAC: ['Los Angeles Chargers', 'Chargers'],LAR: ['Los Angeles Rams', 'Rams'],
  LV:  ['Las Vegas Raiders', 'Raiders'],    MIA: ['Miami Dolphins', 'Dolphins'],
  MIN: ['Minnesota Vikings', 'Vikings'],    NE:  ['New England Patriots', 'Patriots'],
  NO:  ['New Orleans Saints', 'Saints'],    NYG: ['New York Giants', 'Giants'],
  NYJ: ['New York Jets', 'Jets'],           PHI: ['Philadelphia Eagles', 'Eagles'],
  PIT: ['Pittsburgh Steelers', 'Steelers'], SEA: ['Seattle Seahawks', 'Seahawks'],
  SF:  ['San Francisco 49ers', '49ers'],    TB:  ['Tampa Bay Buccaneers', 'Buccaneers'],
  TEN: ['Tennessee Titans', 'Titans'],      WSH: ['Washington Commanders', 'Commanders'],
};
const ABBRS = Object.keys(TEAMS);
const teamName  = (a) => (TEAMS[a] || [a, a])[0];
const teamShort = (a) => (TEAMS[a] || [a, a])[1];
const teamLogo  = (a) => `https://a.espncdn.com/i/teamlogos/nfl/500/${String(a).toLowerCase()}.png`;

/* ESPN sometimes uses a different code than we key on. Normalize on the way in. */
const ABBR_FIX = { WAS: 'WSH', JAC: 'JAX', LA: 'LAR', SD: 'LAC', OAK: 'LV', STL: 'LAR' };
const fixAbbr = (a) => ABBR_FIX[String(a || '').toUpperCase()] || String(a || '').toUpperCase();

/* ---- tiny helpers ----------------------------------------------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const lsDel = (k)    => { try { localStorage.removeItem(k); } catch (e) {} };
const jGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const jSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

/* Turn a name into a URL-safe token: "Nana Rose" -> "nana-rose". */
function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'player';
}
const signed = (n) => (n > 0 ? `+${n}` : String(n));

function fmtKick(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/* ---- app state -------------------------------------------------------- */
const S = {
  me: null,          // { id, display_name, is_admin, token }
  players: [],       // [{ id, display_name, is_admin }]
  picks: [],         // [{ player_id, week, team, entered_by }]
  week: 1,           // the week the Pick screen defaults to
  games: {},         // week -> [game]
  screen: 'pick',
  demo: lsGet('survivor:demo', '0') === '1',
  store: null,
  msg: null,         // { kind:'ok'|'bad', text }
};

/* ======================================================================
   STORAGE
   Two implementations behind one interface. LocalStore is this device only
   (fine for testing, useless for a league); SupaStore is the real one.
   Nothing above or below this block knows which is in use.
   ====================================================================== */

const LocalStore = {
  kind: 'local',
  _db() { return jGet('survivor:local', { players: [], picks: [], seq: 1 }); },
  _save(db) { jSet('survivor:local', db); },
  _isAdmin(db, token) {
    const a = db.players.find((p) => p.token === token);
    return !!(a && a.is_admin);
  },

  async listPlayers() {
    return this._db().players.map((p) => ({ id: p.id, display_name: p.display_name, is_admin: !!p.is_admin }));
  },
  async listPicks() {
    return this._db().picks.filter((p) => p.season === SEASON);
  },
  async whoami(token) {
    const p = this._db().players.find((x) => x.token === token);
    return p ? { id: p.id, display_name: p.display_name, is_admin: !!p.is_admin, token: p.token } : null;
  },
  async tokenFor(adminToken, playerId) {
    const db = this._db();
    if (!this._isAdmin(db, adminToken)) return null;
    return (db.players.find((p) => p.id === playerId) || {}).token || null;
  },

  async submitPick(token, week, team, kickoffISO) {
    const db = this._db();
    const me = db.players.find((p) => p.token === token);
    if (!me) return { ok: false, error: 'Unknown link.' };
    if (kickoffISO && new Date(kickoffISO) <= new Date()) return { ok: false, error: 'That game has already started.' };
    const dup = db.picks.find((p) => p.player_id === me.id && p.season === SEASON && p.team === team && p.week !== week);
    if (dup) return { ok: false, error: `You already used the ${teamShort(team)} in week ${dup.week}.` };
    const cur = db.picks.find((p) => p.player_id === me.id && p.season === SEASON && p.week === week);
    if (cur) { cur.team = team; cur.entered_by = 'self'; cur.updated_at = new Date().toISOString(); }
    else db.picks.push({ id: db.seq++, player_id: me.id, season: SEASON, week, team, entered_by: 'self', updated_at: new Date().toISOString() });
    this._save(db);
    return { ok: true };
  },

  async addPlayer(adminToken, name) {
    const db = this._db();
    if (db.players.length && !this._isAdmin(db, adminToken)) return { ok: false, error: 'Not an admin.' };
    let token = slug(name), n = 2;
    while (db.players.some((p) => p.token === token)) token = `${slug(name)}-${n++}`;
    const first = db.players.length === 0;   // the very first player is the commissioner
    db.players.push({ id: db.seq++, display_name: name, token, is_admin: first });
    this._save(db);
    return { ok: true, token };
  },
  async removePlayer(adminToken, playerId) {
    const db = this._db();
    if (!this._isAdmin(db, adminToken)) return { ok: false, error: 'Not an admin.' };
    db.players = db.players.filter((p) => p.id !== playerId);
    db.picks = db.picks.filter((p) => p.player_id !== playerId);
    this._save(db);
    return { ok: true };
  },
  async adminSetPick(adminToken, playerId, week, team) {
    const db = this._db();
    if (!this._isAdmin(db, adminToken)) return { ok: false, error: 'Not an admin.' };
    if (team) {
      const dup = db.picks.find((p) => p.player_id === playerId && p.season === SEASON && p.team === team && p.week !== week);
      if (dup) return { ok: false, error: `They already used the ${teamShort(team)} in week ${dup.week}.` };
    }
    db.picks = db.picks.filter((p) => !(p.player_id === playerId && p.season === SEASON && p.week === week));
    if (team) db.picks.push({ id: db.seq++, player_id: playerId, season: SEASON, week, team, entered_by: 'admin', updated_at: new Date().toISOString() });
    this._save(db);
    return { ok: true };
  },
};

/* --- Supabase. Plain fetch against PostgREST; no SDK, no build step. ---- */
const SupaStore = {
  kind: 'cloud',
  async _rpc(fn, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`${fn} failed (${r.status})`);
    return r.json();
  },
  async _get(path) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) throw new Error(`Read failed (${r.status})`);
    return r.json();
  },

  // players_public is a VIEW that omits the token column, so the anon key can
  // read the roster without handing out everybody's personal link.
  listPlayers() { return this._get('players_public?select=id,display_name,is_admin&order=display_name'); },
  listPicks()   { return this._get(`picks?season=eq.${SEASON}&select=player_id,week,team,entered_by`); },
  async whoami(token) {
    const r = await this._rpc('whoami', { p_token: token });
    return r && r.id ? r : null;
  },
  async tokenFor(adminToken, playerId) {
    const r = await this._rpc('admin_token_for', { p_admin_token: adminToken, p_player_id: playerId });
    return r && r.token ? r.token : null;
  },
  submitPick(token, week, team, kickoffISO) {
    return this._rpc('submit_pick', { p_token: token, p_week: week, p_team: team, p_kickoff: kickoffISO || null });
  },
  addPlayer(adminToken, name)        { return this._rpc('admin_add_player', { p_admin_token: adminToken, p_name: name }); },
  removePlayer(adminToken, id)       { return this._rpc('admin_del_player', { p_admin_token: adminToken, p_player_id: id }); },
  adminSetPick(adminToken, id, w, t) { return this._rpc('admin_set_pick',   { p_admin_token: adminToken, p_player_id: id, p_week: w, p_team: t || null }); },
};

function pickStore() {
  const cfg = jGet('survivor:sb', null);
  if (cfg && cfg.url && cfg.key) { SUPABASE_URL = cfg.url; SUPABASE_KEY = cfg.key; }
  return (SUPABASE_URL && SUPABASE_KEY) ? SupaStore : LocalStore;
}

/* ======================================================================
   GAMES — real ones from ESPN, or a deterministic demo season.
   The demo exists because the real season does not start until 10 Sep 2026,
   so without it there is literally nothing to grade and the standings and
   history screens cannot be exercised at all.
   ====================================================================== */

const DEMO_WEEK = 4;   // the demo "today": weeks 1-3 are played, week 4 is live

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Circle-method round robin: 16 games, all 32 teams, nobody twice. */
function roundRobin(round) {
  const rest = ABBRS.slice(1);
  const r = round % rest.length;
  const rot = rest.slice(r).concat(rest.slice(0, r));
  const arr = [ABBRS[0]].concat(rot);
  const out = [];
  for (let i = 0; i < 16; i++) out.push([arr[i], arr[31 - i]]);
  return out;
}

function demoGames(week) {
  const rnd = mulberry32(week * 7919 + 13);
  const dayMs = 86400000;
  return roundRobin(week - 1).map((pair, i) => {
    let dayOff, state;
    if (week < DEMO_WEEK)      { dayOff = (week - DEMO_WEEK) * 7; state = 'post'; }
    else if (week > DEMO_WEEK) { dayOff = (week - DEMO_WEEK) * 7; state = 'pre'; }
    else if (i === 0)          { dayOff = -3; state = 'post'; }   // Thursday night, in the books
    else if (i >= 14)          { dayOff = 3;  state = 'pre'; }    // Monday night
    else                       { dayOff = 2;  state = 'pre'; }    // Sunday
    const date = new Date(Date.now() + dayOff * dayMs);
    date.setHours(i >= 14 ? 20 : (i === 0 ? 20 : 13), 0, 0, 0);
    const hs = state === 'post' ? 10 + Math.floor(rnd() * 29) : null;
    const as = state === 'post' ? 10 + Math.floor(rnd() * 29) : null;
    return {
      id: `demo-${week}-${i}`, week, date: date.toISOString(), state,
      statusText: state === 'post' ? 'Final' : fmtKick(date.toISOString()),
      away: { abbr: pair[0], score: as }, home: { abbr: pair[1], score: hs },
    };
  });
}

function normGame(ev, week) {
  const comp = (ev.competitions || [])[0] || {};
  const cs = comp.competitors || [];
  const h = cs.find((c) => c.homeAway === 'home') || cs[0] || {};
  const a = cs.find((c) => c.homeAway === 'away') || cs[1] || {};
  const st = (ev.status && ev.status.type) || (comp.status && comp.status.type) || {};
  const side = (c) => ({
    abbr: fixAbbr((c.team || {}).abbreviation),
    score: c.score == null || c.score === '' ? null : Number(c.score),
    rec: ((c.records || []).find((r) => r.type === 'total') || (c.records || [])[0] || {}).summary || '',
  });
  return {
    id: ev.id, week,
    date: ev.date || comp.date,
    state: st.state || 'pre',                       // 'pre' | 'in' | 'post'
    statusText: st.shortDetail || st.detail || st.description || '',
    home: side(h), away: side(a),
  };
}

const memCache = {};
async function weekGames(week) {
  if (S.games[week]) return S.games[week];
  if (S.demo) return (S.games[week] = demoGames(week));

  // A week whose games are all final never changes again, so it is worth
  // keeping on the device — grandma's phone then loads history instantly.
  const ck = `survivor:wk:${SEASON}:${week}`;
  const cached = jGet(ck, null);
  if (cached && cached.length) return (S.games[week] = cached);

  const mk = `w${week}`;
  const hit = memCache[mk];
  if (hit && Date.now() - hit.at < 45000) return (S.games[week] = hit.games);

  let games = [];
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(`${ESPN_SB}?dates=${SEASON}&seasontype=2&week=${week}`, { signal: ctl.signal });
    clearTimeout(to);
    const j = await r.json();
    games = (j.events || []).map((ev) => normGame(ev, week)).filter((g) => g.home.abbr && g.away.abbr);
  } catch (e) {
    console.warn('[survivor] week', week, 'unavailable', e);
  }
  memCache[mk] = { at: Date.now(), games };
  if (games.length && games.every((g) => g.state === 'post')) jSet(ck, games);
  S.games[week] = games;
  return games;
}

/* Which week are we in? ESPN's dateless scoreboard tells us directly. */
async function currentWeek() {
  if (S.demo) return DEMO_WEEK;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(ESPN_SB, { signal: ctl.signal });
    clearTimeout(to);
    const j = await r.json();
    const type = Number(j.season && j.season.type);
    const n = Number(j.week && j.week.number);
    if (type === 2 && n >= 1 && n <= LAST_WEEK) return n;
    if (type === 3) return LAST_WEEK;      // playoffs: league is over, show the last week
    return 1;                               // preseason / anything odd: week 1
  } catch (e) {
    return 1;
  }
}

/* ======================================================================
   SCORING
   ====================================================================== */

function gameForTeam(games, team) {
  return games.find((g) => g.home.abbr === team || g.away.abbr === team) || null;
}

/* One pick -> { status, margin, game, opp }.
   status: 'win' | 'loss' | 'tie' | 'pending' | 'nogame' */
function gradePick(team, games) {
  const g = gameForTeam(games, team);
  if (!g) return { status: 'nogame', margin: 0, game: null };   // bye week or feed gap
  const mine = g.home.abbr === team ? g.home : g.away;
  const opp  = g.home.abbr === team ? g.away : g.home;
  if (g.state !== 'post' || mine.score == null || opp.score == null) {
    return { status: 'pending', margin: 0, game: g, opp: opp.abbr };
  }
  const margin = mine.score - opp.score;
  return {
    status: margin > 0 ? 'win' : margin < 0 ? 'loss' : 'tie',
    margin, game: g, opp: opp.abbr, mine: mine.score, them: opp.score,
  };
}

/* House rule 3: a pick is secret until its own game starts. */
function pickVisible(team, games) {
  const g = gameForTeam(games, team);
  return !g || g.state !== 'pre';
}

function picksOf(playerId) {
  return S.picks.filter((p) => p.player_id === playerId);
}
function pickIn(playerId, week) {
  return S.picks.find((p) => p.player_id === playerId && p.week === week) || null;
}
function usedTeams(playerId, exceptWeek) {
  const m = {};
  for (const p of picksOf(playerId)) if (p.week !== exceptWeek) m[p.team] = p.week;
  return m;
}

/* Full-season tally for one player. Missed weeks contribute nothing at all
   (house rule 1): not a loss, no points, no team burned. */
function tallyFor(playerId, allGames) {
  let w = 0, l = 0, t = 0, pts = 0;
  const rows = [];
  for (let wk = 1; wk <= LAST_WEEK; wk++) {
    const p = pickIn(playerId, wk);
    if (!p) { rows.push({ week: wk, pick: null }); continue; }
    const g = gradePick(p.team, allGames[wk] || []);
    if (g.status === 'win') { w++; pts += g.margin; }
    else if (g.status === 'loss') { l++; pts += g.margin; }
    else if (g.status === 'tie') { t++; }
    rows.push({ week: wk, pick: p, ...g, running: pts });
  }
  return { w, l, t, pts, rows, used: picksOf(playerId).length };
}

/* House rule 5: wins first, cumulative margin as the tiebreak. */
function standings(allGames) {
  return S.players
    .map((p) => ({ p, ...tallyFor(p.id, allGames) }))
    .sort((a, b) => b.w - a.w || b.pts - a.pts || a.p.display_name.localeCompare(b.p.display_name))
    .map((r, i, arr) => {
      const prev = arr[i - 1];
      r.rank = prev && prev.w === r.w && prev.pts === r.pts ? prev.rank : i + 1;
      return r;
    });
}

/* ======================================================================
   RENDER
   ====================================================================== */

function msgHTML() {
  if (!S.msg) return '';
  const h = `<div class="msg ${S.msg.kind === 'ok' ? 'ok' : 'bad'}">${esc(S.msg.text)}</div>`;
  S.msg = null;            // one shot: a message never survives the next render
  return h;
}

function weekNavHTML(week) {
  const prev = week > 1 ? week - 1 : null;
  const next = week < LAST_WEEK ? week + 1 : null;
  return `<div class="wknav">
    <button class="btn sm" data-week="${prev}" ${prev ? '' : 'disabled'} aria-label="Previous week">‹</button>
    <span class="wknav-l">Week ${week}</span>
    <button class="btn sm" data-week="${next}" ${next ? '' : 'disabled'} aria-label="Next week">›</button>
  </div>`;
}

function teamBtnHTML(abbr, opts) {
  const o = opts || {};
  const cls = ['pk', o.chosen ? 'chosen' : '', o.used ? 'used' : ''].filter(Boolean).join(' ');
  const tag = o.used ? `<span class="pk-used-tag">USED WK ${o.used}</span>` : (o.rec ? `<span class="pk-rec">${esc(o.rec)}</span>` : '');
  const score = o.score == null ? '' : `<span class="pk-rec">${o.score}</span>`;
  return `<button class="${cls}" type="button" data-team="${abbr}" ${o.disabled ? 'disabled' : ''}>
    <img src="${teamLogo(abbr)}" alt="" loading="lazy" onerror="this.remove()">
    <span class="pk-name">${esc(teamShort(abbr))}</span>
    ${score || tag}
  </button>`;
}

function renderPick() {
  const host = $('#s-pick');
  const games = (S.games[S.week] || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const mine = pickIn(S.me.id, S.week);
  const used = usedTeams(S.me.id, S.week);
  const myGame = mine ? gameForTeam(games, mine.team) : null;
  const locked = !!(mine && myGame && myGame.state !== 'pre');

  let h = msgHTML() + weekNavHTML(S.week);

  if (locked) {
    const g = gradePick(mine.team, games);
    const res = g.status === 'pending' ? 'Playing now…'
      : g.status === 'win'  ? `Won by ${g.margin} — ${g.mine}-${g.them}`
      : g.status === 'loss' ? `Lost by ${Math.abs(g.margin)} — ${g.mine}-${g.them}`
      : g.status === 'tie'  ? 'Tied — 0 points' : '';
    h += `<div class="locked">
      <div class="lk-k">Your Week ${S.week} pick — locked in</div>
      <div class="lk-team">${esc(teamName(mine.team))}</div>
      <div class="lk-sub">${esc(res)}</div>
    </div>`;
  } else if (mine) {
    h += `<div class="locked">
      <div class="lk-k">Your Week ${S.week} pick</div>
      <div class="lk-team">${esc(teamName(mine.team))}</div>
      <div class="lk-sub">You can still change it — just tap a different team.</div>
    </div>`;
  } else {
    h += `<h2 class="hh">Week ${S.week} — tap who you think wins</h2>
      <p class="sub">Pick one team. You can change your mind right up until that game starts.</p>`;
  }

  if (!games.length) {
    h += `<div class="card"><p class="note">No games loaded for week ${S.week} yet.${
      S.demo ? '' : ' If this keeps saying that, the NFL schedule feed may be unreachable right now.'}</p></div>`;
    host.innerHTML = h;
    return;
  }

  const open = games.filter((g) => g.state === 'pre');
  const shut = games.filter((g) => g.state !== 'pre');

  const gameHTML = (g, started) => {
    const row = (side) => {
      const abbr = g[side].abbr;
      const isUsed = used[abbr];
      return teamBtnHTML(abbr, {
        chosen: mine && mine.team === abbr,
        used: isUsed,
        rec: g[side].rec,
        score: started ? g[side].score : null,
        disabled: started || !!isUsed,
      });
    };
    return `<div class="game ${started ? 'started' : ''}">
      <div class="game-when">${esc(started ? (g.statusText || 'Final') : fmtKick(g.date))}</div>
      <div class="game-pair">${row('away')}<span class="game-at">at</span>${row('home')}</div>
    </div>`;
  };

  h += open.map((g) => gameHTML(g, false)).join('');
  if (shut.length) {
    h += `<h2 class="hh">Already started</h2><p class="sub">These can't be picked any more.</p>`;
    h += shut.map((g) => gameHTML(g, true)).join('');
  }

  const usedList = Object.entries(used).sort((a, b) => a[1] - b[1]);
  h += `<details class="usedstrip">
    <summary>Teams you've already used (${usedList.length} of 32)</summary>
    <div class="ub">${usedList.length
      ? usedList.map(([t, w]) => `<span class="uchip"><b>${esc(teamShort(t))}</b> · wk ${w}</span>`).join('')
      : '<span class="note">None yet — every team is still available to you.</span>'}</div>
  </details>`;

  host.innerHTML = h;
}

function renderStandings() {
  const host = $('#s-standings');
  const rows = standings(S.games);
  const games = S.games[S.week] || [];

  let h = msgHTML() + `<h2 class="hh">Standings</h2>
    <p class="sub">Sorted by wins. Points are how much your teams have won or lost by, added up all season — that's the tiebreaker.</p>`;

  h += `<div class="card" style="padding:6px 16px"><table class="st">
    <thead><tr><th>#</th><th>Name</th><th>W-L-T</th><th>Points</th><th>Left</th></tr></thead><tbody>`;
  for (const r of rows) {
    const cls = r.pts > 0 ? 'p' : r.pts < 0 ? 'n' : '';
    h += `<tr class="${r.p.id === S.me.id ? 'you' : ''}">
      <td>${r.rank}</td>
      <td class="nm">${esc(r.p.display_name)}</td>
      <td>${r.w}-${r.l}${r.t ? `-${r.t}` : ''}</td>
      <td class="pts ${cls}">${signed(r.pts)}</td>
      <td>${32 - r.used}</td>
    </tr>`;
  }
  h += `</tbody></table></div>`;

  // Who still owes a pick this week — this is the commissioner's chase list.
  const missing = S.players.filter((p) => !pickIn(p.id, S.week));
  if (missing.length) {
    h += `<div class="card waiting"><b>Still to pick for week ${S.week}:</b> ${
      esc(missing.map((p) => p.display_name).join(', '))}</div>`;
  } else if (S.players.length) {
    h += `<div class="card waiting">Everybody has picked for week ${S.week}. 🎉</div>`;
  }

  h += `<h2 class="hh">Week ${S.week} picks</h2>
    <p class="sub">A pick stays secret until that team's game kicks off.</p>`
    + weekNavHTML(S.week) + `
    <div class="card"><div class="wk-picks">`;
  for (const p of S.players) {
    const pk = pickIn(p.id, S.week);
    let team = '<span class="wp-hidden">no pick yet</span>', res = '', rc = '';
    if (pk) {
      const own = p.id === S.me.id;
      if (own || pickVisible(pk.team, games)) {
        team = `<span class="wp-team">${esc(teamShort(pk.team))}</span>`;
        const g = gradePick(pk.team, games);
        if (g.status === 'win')  { res = signed(g.margin); rc = 'w'; }
        if (g.status === 'loss') { res = signed(g.margin); rc = 'l'; }
        if (g.status === 'tie')  { res = 'tie'; rc = 't'; }
        if (own && !pickVisible(pk.team, games)) team += ' <span class="wp-hidden">only you see this</span>';
      } else {
        team = '<span class="wp-hidden">🔒 hidden until kickoff</span>';
      }
    }
    h += `<div class="wp-row"><span class="wp-nm">${esc(p.display_name)}</span>${team}<span class="wp-res ${rc}">${esc(res)}</span></div>`;
  }
  h += `</div></div>`;
  host.innerHTML = h;
}

function renderHistory() {
  const host = $('#s-history');
  const t = tallyFor(S.me.id, S.games);
  let h = msgHTML() + `<h2 class="hh">${esc(S.me.display_name)}</h2>
    <p class="sub">Every week you've picked, and how your points added up.</p>`;

  h += `<div class="tot">
    <div><div class="k">Record</div><div class="v">${t.w}-${t.l}${t.t ? `-${t.t}` : ''}</div></div>
    <div><div class="k">Points</div><div class="v" style="color:${t.pts > 0 ? 'var(--pos)' : t.pts < 0 ? 'var(--neg)' : 'inherit'}">${signed(t.pts)}</div></div>
    <div><div class="k">Teams left</div><div class="v">${32 - t.used}</div></div>
  </div>`;

  const shown = t.rows.filter((r) => r.pick || r.week <= S.week);
  h += `<div class="card">`;
  for (const r of shown) {
    if (!r.pick) {
      h += `<div class="hrow miss"><span class="h-wk">WK ${r.week}</span>
        <span class="h-team">no pick — 0 points, no team used</span><span></span><span></span></div>`;
      continue;
    }
    const cls = r.status === 'win' ? 'w' : r.status === 'loss' ? 'l' : r.status === 'tie' ? 't' : '';
    const mar = r.status === 'pending' ? '—'
      : r.status === 'nogame' ? 'bye'
      : r.status === 'tie' ? 'tie' : signed(r.margin);
    const line = r.status === 'pending'
      ? (r.opp ? `vs ${teamShort(r.opp)} · ${fmtKick(r.game.date)}` : 'not played yet')
      : r.opp ? `vs ${teamShort(r.opp)} · ${r.mine}-${r.them}` : '';
    h += `<div class="hrow">
      <span class="h-wk">WK ${r.week}</span>
      <span><span class="h-team">${esc(teamShort(r.pick.team))}</span><span class="h-opp">${esc(line)}</span></span>
      <span class="h-mar ${cls}">${esc(mar)}</span>
      <span class="h-run">${r.status === 'pending' || r.status === 'nogame' ? '' : signed(r.running)}</span>
    </div>`;
  }
  h += `</div>`;

  const used = Object.entries(usedTeams(S.me.id, null)).sort((a, b) => a[1] - b[1]);
  h += `<h2 class="hh">Teams you've used</h2>
    <div class="card"><div class="ub" style="border:0;padding:0;background:none;display:flex;flex-wrap:wrap;gap:8px">${
      used.length ? used.map(([tm, w]) => `<span class="uchip"><b>${esc(teamShort(tm))}</b> · wk ${w}</span>`).join('')
                  : '<span class="note">None yet.</span>'}</div></div>`;
  host.innerHTML = h;
}

/* ---- admin ------------------------------------------------------------ */

function linkFor(token) {
  return `${location.origin}${location.pathname}?u=${encodeURIComponent(token)}`;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  try {
    const ta = el('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0;font-size:16px';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove(); return ok;
  } catch (e) { return false; }
}

async function renderAdmin() {
  const host = $('#s-admin');
  const cloud = S.store.kind === 'cloud';
  let h = msgHTML() + `<h2 class="hh">Commissioner</h2>`;

  h += `<div class="card"><b>${cloud ? '☁️ Shared database' : '📱 This device only'}</b>
    <p class="note" style="margin:6px 0 0">${cloud
      ? 'Picks are saved to your Supabase project, so everyone in the family sees the same league.'
      : 'Picks are saved in this browser only. Nobody else can see them and they do not sync. Fine for trying it out — connect Supabase below before you send links to the family.'}</p></div>`;

  // --- people ---
  h += `<h2 class="hh">Family (${S.players.length})</h2>
    <p class="sub">Each person gets their own link. That link <em>is</em> their login — no password, no app to install.</p>
    <div class="card">`;
  for (const p of S.players) {
    h += `<div class="plrow">
      <span class="pn">${esc(p.display_name)}${p.is_admin ? ' 👑' : ''}</span>
      <button class="btn sm" data-copy="${p.id}">Copy link</button>
      <button class="btn sm" data-view="${p.id}">View as</button>
      <button class="btn sm" data-del="${p.id}" title="Remove">✕</button>
    </div>`;
  }
  if (!S.players.length) h += `<p class="note">Nobody yet. Add yourself first — the first person added becomes the commissioner.</p>`;
  h += `</div>
    <div class="card">
      <label class="fld"><span>Add somebody</span><input id="ad-name" type="text" placeholder="e.g. Nana" autocomplete="off"></label>
      <button class="btn pri wide" id="ad-add">Add to the league</button>
      <button class="btn wide" id="ad-copyall">Copy everyone's links (for the group text)</button>
    </div>`;

  // --- enter a pick on someone's behalf ---
  h += `<h2 class="hh">Enter a pick for someone</h2>
    <p class="sub">For when Nana texts you her pick instead of tapping it.</p>
    <div class="card">
      <label class="fld"><span>Who</span><select id="ap-who">${
        S.players.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}</select></label>
      <label class="fld"><span>Week</span><select id="ap-week">${
        Array.from({ length: LAST_WEEK }, (_, i) => i + 1)
          .map((w) => `<option value="${w}" ${w === S.week ? 'selected' : ''}>Week ${w}</option>`).join('')}</select></label>
      <label class="fld"><span>Team</span><select id="ap-team"><option value="">— clear their pick —</option>${
        ABBRS.map((a) => `<option value="${a}">${esc(teamName(a))}</option>`).join('')}</select></label>
      <button class="btn pri wide" id="ap-save">Save that pick</button>
    </div>`;

  // --- connection ---
  const cfg = jGet('survivor:sb', { url: '', key: '' });
  h += `<h2 class="hh">Shared database</h2>
    <p class="sub">Paste your Supabase project URL and its anon (publishable) key. Run <code>schema.sql</code> in the Supabase SQL editor first.</p>
    <div class="card">
      <label class="fld"><span>Project URL</span><input id="sb-url" type="url" placeholder="https://xxxx.supabase.co" value="${esc(cfg.url || '')}"></label>
      <label class="fld"><span>Anon key</span><input id="sb-key" type="text" placeholder="eyJ..." value="${esc(cfg.key || '')}"></label>
      <button class="btn pri wide" id="sb-save">Save &amp; reload</button>
      <button class="btn wide" id="sb-clear">Disconnect (back to this device only)</button>
    </div>`;

  // --- demo ---
  h += `<h2 class="hh">Demo season</h2>
    <p class="sub">The real season starts 10 Sep 2026, so until then there is nothing to grade. Demo mode invents three finished weeks plus a live week 4 so you can try every screen.</p>
    <div class="card">
      <button class="btn ${S.demo ? 'pri' : ''} wide" id="dm-toggle">${S.demo ? 'Demo mode is ON — turn it off' : 'Turn demo mode ON'}</button>
      <button class="btn wide" id="dm-seed">Load a demo family &amp; three weeks of picks</button>
      <button class="btn wide" id="dm-wipe">Erase everything on this device</button>
    </div>`;

  host.innerHTML = h;
}

/* ---- demo seed -------------------------------------------------------- */
const DEMO_FAMILY = ['Jack', 'Nana', 'Uncle Bob', 'Aunt Mary', 'Cousin Dave', 'Kate', 'Tommy', 'Grandpa Joe'];

async function seedDemo() {
  lsSet('survivor:demo', '1');
  S.demo = true;
  jSet('survivor:local', { players: [], picks: [], seq: 1 });
  const store = LocalStore;
  const tokens = {};
  for (const n of DEMO_FAMILY) {
    const r = await store.addPlayer(tokens.Jack || null, n);
    if (r.ok) tokens[n] = r.token;
  }
  const db = store._db();
  const admin = db.players[0].token;
  const rnd = mulberry32(20260902);
  for (const p of db.players) {
    const used = new Set();
    // Weeks 1-3 are played; most people also have a week-4 pick in already.
    for (let wk = 1; wk <= 4; wk++) {
      if (wk === 4 && rnd() < 0.3) continue;          // a couple of stragglers
      if (wk === 2 && p.display_name === 'Nana') continue; // and one genuine miss
      const games = demoGames(wk);
      const options = [];
      for (const g of games) { options.push(g.away.abbr); options.push(g.home.abbr); }
      const free = options.filter((t) => !used.has(t));
      const team = free[Math.floor(rnd() * free.length)];
      if (!team) continue;
      used.add(team);
      await store.adminSetPick(admin, p.id, wk, team);
    }
  }
  lsSet('survivor:me', admin);   // land on the commissioner
}

/* ---- identity --------------------------------------------------------- */

function renderPicker() {
  $('#boot').hidden = true;
  const host = $('#s-pick');
  host.hidden = false;
  $('#tabs').hidden = true;
  const cloud = S.store.kind === 'cloud';
  let h = `<h2 class="hh">Who are you?</h2>`;
  if (!S.players.length) {
    h += `<p class="sub">Nothing set up on this device yet.</p>
      <div class="card">
        <p class="note">Start by adding yourself — the first person added becomes the commissioner.</p>
        <label class="fld"><span>Your name</span><input id="first-name" type="text" placeholder="e.g. Jack" autocomplete="off"></label>
        <button class="btn pri wide" id="first-go">Start the league</button>
        <button class="btn wide" id="first-demo">Or load a demo family to poke around</button>
      </div>`;
  } else if (cloud) {
    h += `<p class="sub">Open your own personal link to pick. Ask Jack to text it to you again if you've lost it.</p>`;
  } else {
    h += `<p class="sub">Tap your name.</p><div class="card">`;
    h += S.players.map((p) => `<button class="btn wide" data-be="${p.id}">${esc(p.display_name)}</button>`).join('');
    h += `</div>`;
  }
  host.innerHTML = h;
}

/* ======================================================================
   WIRING + BOOT
   ====================================================================== */

function setScreen(name) {
  S.screen = name;
  for (const s of ['pick', 'standings', 'history', 'admin']) $(`#s-${s}`).hidden = s !== name;
  $$('#tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.screen === name));
  window.scrollTo(0, 0);
}

function render() {
  $('#boot').hidden = true;
  $('#tabs').hidden = false;
  $('#tab-admin').hidden = !S.me.is_admin;
  $('#whoami').hidden = false;
  $('#whoami').innerHTML = `Signed in as <b>${esc(S.me.display_name)}</b> · Week ${S.week}${S.demo ? ' · <b>DEMO</b>' : ''}`;
  $('#ft-mode').innerHTML = `<span class="pillmode">${S.store.kind === 'cloud' ? '☁️ shared league' : '📱 this device only'}${S.demo ? ' · demo season' : ''}</span>`;
  if (S.screen === 'pick') renderPick();
  else if (S.screen === 'standings') renderStandings();
  else if (S.screen === 'history') renderHistory();
  else if (S.screen === 'admin') renderAdmin();
  setScreen(S.screen);
}

async function reloadPicks() {
  try { S.picks = await S.store.listPicks(); } catch (e) { console.warn('[survivor] picks reload failed', e); }
}
async function reloadPlayers() {
  try { S.players = await S.store.listPlayers(); } catch (e) { console.warn('[survivor] players reload failed', e); }
}
async function ensureWeeks(weeks) {
  await Promise.all(weeks.filter((w) => w >= 1 && w <= LAST_WEEK && !S.games[w]).map((w) => weekGames(w)));
}

function say(kind, text) { S.msg = { kind, text }; }

/* One delegated listener for the whole app — every screen is re-rendered
   from scratch, so per-element handlers would leak. */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;

  // --- header ---
  if (t.id === 'pal-btn') {
    const now = document.documentElement.getAttribute('data-palette') === 'onyx' ? 'champagne' : 'onyx';
    document.documentElement.setAttribute('data-palette', now);
    document.documentElement.setAttribute('data-theme', now === 'onyx' ? 'dark' : 'light');
    lsSet('survivor:palette', now);
    return;
  }
  if (t.id === 'big-btn') {
    const on = document.documentElement.hasAttribute('data-big');
    if (on) { document.documentElement.removeAttribute('data-big'); lsSet('survivor:big', '0'); }
    else { document.documentElement.setAttribute('data-big', '1'); lsSet('survivor:big', '1'); }
    return;
  }
  if (t.dataset.screen) { setScreen(t.dataset.screen); render(); return; }

  // --- first run / identity picker ---
  if (t.id === 'first-go') {
    const name = ($('#first-name') || {}).value;
    if (!name || !name.trim()) return;
    const r = await S.store.addPlayer(null, name.trim());
    if (!r.ok) { alert(r.error || 'Could not add.'); return; }
    lsSet('survivor:me', r.token);
    location.search = `?u=${encodeURIComponent(r.token)}`;
    return;
  }
  if (t.id === 'first-demo') { await seedDemo(); location.search = ''; return; }
  if (t.dataset.be) {
    const tok = await LocalStore.tokenFor(null, Number(t.dataset.be))
      || (LocalStore._db().players.find((p) => p.id === Number(t.dataset.be)) || {}).token;
    if (tok) { lsSet('survivor:me', tok); location.search = `?u=${encodeURIComponent(tok)}`; }
    return;
  }

  // --- week nav ---
  if (t.dataset.week && t.dataset.week !== 'null') {
    S.week = Number(t.dataset.week);
    await ensureWeeks([S.week]);
    render();
    return;
  }

  // --- making a pick ---
  if (t.dataset.team && S.screen === 'pick') {
    const team = t.dataset.team;
    const g = gameForTeam(S.games[S.week] || [], team);
    t.disabled = true;
    const r = await S.store.submitPick(S.me.token, S.week, team, g && g.date).catch((err) => ({ ok: false, error: String(err.message || err) }));
    if (r && r.ok) { say('ok', `Locked in: the ${teamShort(team)} for week ${S.week}.`); await reloadPicks(); }
    else say('bad', (r && r.error) || 'Could not save that pick.');
    render();
    return;
  }

  // --- admin ---
  if (t.dataset.copy) {
    const tok = await S.store.tokenFor(S.me.token, Number(t.dataset.copy));
    const p = S.players.find((x) => x.id === Number(t.dataset.copy));
    if (!tok) { say('bad', 'Could not read that link.'); render(); return; }
    const ok = await copyText(`${p.display_name}, here's your Family Survivor link — bookmark it:\n${linkFor(tok)}`);
    say(ok ? 'ok' : 'bad', ok ? `Copied ${p.display_name}'s link.` : `Could not copy. Link: ${linkFor(tok)}`);
    render(); return;
  }
  if (t.id === 'ad-copyall') {
    const lines = [];
    for (const p of S.players) {
      const tok = await S.store.tokenFor(S.me.token, p.id);
      if (tok) lines.push(`${p.display_name}: ${linkFor(tok)}`);
    }
    const ok = await copyText(lines.join('\n'));
    say(ok ? 'ok' : 'bad', ok ? `Copied ${lines.length} links.` : 'Could not copy.');
    render(); return;
  }
  if (t.dataset.view) {
    const tok = await S.store.tokenFor(S.me.token, Number(t.dataset.view));
    if (tok) { lsSet('survivor:me', tok); location.search = `?u=${encodeURIComponent(tok)}`; }
    return;
  }
  if (t.dataset.del) {
    const p = S.players.find((x) => x.id === Number(t.dataset.del));
    if (!confirm(`Remove ${p ? p.display_name : 'this player'} and all their picks?`)) return;
    const r = await S.store.removePlayer(S.me.token, Number(t.dataset.del));
    say(r && r.ok ? 'ok' : 'bad', r && r.ok ? 'Removed.' : (r && r.error) || 'Could not remove.');
    await reloadPlayers(); await reloadPicks(); render(); return;
  }
  if (t.id === 'ad-add') {
    const name = ($('#ad-name') || {}).value;
    if (!name || !name.trim()) return;
    const r = await S.store.addPlayer(S.me.token, name.trim());
    say(r && r.ok ? 'ok' : 'bad', r && r.ok ? `Added ${name.trim()}.` : (r && r.error) || 'Could not add.');
    await reloadPlayers(); render(); return;
  }
  if (t.id === 'ap-save') {
    const who = Number(($('#ap-who') || {}).value);
    const wk = Number(($('#ap-week') || {}).value);
    const team = ($('#ap-team') || {}).value;
    const r = await S.store.adminSetPick(S.me.token, who, wk, team || null);
    say(r && r.ok ? 'ok' : 'bad', r && r.ok ? 'Saved.' : (r && r.error) || 'Could not save.');
    await reloadPicks(); render(); return;
  }
  if (t.id === 'sb-save') {
    const url = (($('#sb-url') || {}).value || '').trim().replace(/\/+$/, '');
    const key = (($('#sb-key') || {}).value || '').trim();
    if (!url || !key) { say('bad', 'Need both the URL and the key.'); render(); return; }
    jSet('survivor:sb', { url, key });
    location.reload(); return;
  }
  if (t.id === 'sb-clear') { lsDel('survivor:sb'); location.reload(); return; }
  if (t.id === 'dm-toggle') { lsSet('survivor:demo', S.demo ? '0' : '1'); location.reload(); return; }
  if (t.id === 'dm-seed') {
    if (!confirm('This replaces everything stored on this device with a demo family. Continue?')) return;
    await seedDemo(); location.search = ''; return;
  }
  if (t.id === 'dm-wipe') {
    if (!confirm('Erase the league stored on this device? (A connected Supabase league is not touched.)')) return;
    lsDel('survivor:local'); lsDel('survivor:me'); lsSet('survivor:demo', '0');
    location.search = ''; return;
  }
});

async function boot() {
  S.store = pickStore();
  try {
    S.players = await S.store.listPlayers();
    S.picks = await S.store.listPicks();
  } catch (e) {
    $('#boot').innerHTML = `<p>Couldn't reach the league database.</p><p class="note">${esc(e.message || e)}</p>`;
    return;
  }

  const urlTok = new URLSearchParams(location.search).get('u');
  const token = urlTok || lsGet('survivor:me', '');
  if (token) {
    try { S.me = await S.store.whoami(token); } catch (e) { S.me = null; }
    if (S.me) lsSet('survivor:me', S.me.token);
  }
  if (!S.me) { renderPicker(); return; }

  S.week = await currentWeek();
  const weeks = [];
  for (let w = 1; w <= S.week; w++) weeks.push(w);
  for (const p of S.picks) if (!weeks.includes(p.week)) weeks.push(p.week);
  await ensureWeeks(weeks);
  render();

  // While games are in progress the standings genuinely move, so refresh.
  setInterval(async () => {
    if (document.hidden) return;
    const live = (S.games[S.week] || []).some((g) => g.state === 'in');
    if (!live) return;
    delete S.games[S.week]; memCache[`w${S.week}`] = null;
    await ensureWeeks([S.week]);
    if (S.screen !== 'admin') render();
  }, 60000);
}

boot();

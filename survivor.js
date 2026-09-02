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

/* Named in the "ask X for your link" message. Change it to the commissioner. */
const LEAGUE_ADMIN_NAME = 'Jack';

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
function setThemeColor(pal) {
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', pal === 'onyx' ? '#14130f' : '#f3f1ec');
  const sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (sb) sb.setAttribute('content', pal === 'onyx' ? 'black' : 'default');
}

/* Every cached week. The cache is written once a week is entirely final and
   then never re-fetched, so a bad snapshot (a corrected score, a game marked
   final before it was played) would otherwise be permanent. */
function clearWeekCache() {
  let n = 0;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('survivor:wk:')) { localStorage.removeItem(k); n++; }
    }
  } catch (e) {}
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

/* A personal link is the whole security model, so the token cannot be the
   person's name — "?u=nana" and "?u=jack" were guessable, and guessing the
   commissioner's got you admin. Name stays as a readable prefix; the tail is
   random. */
function randTail(n = 6) {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';   // no look-alike characters
  const a = new Uint32Array(n);
  (crypto || window.crypto).getRandomValues(a);
  return Array.from(a, (x) => abc[x % abc.length]).join('');
}
const mintToken = (name) => `${slug(name)}-${randTail()}`;

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
  apWeek: 1,         // the week the admin "enter a pick" card is looking at
  weekPinned: false, // true once the user navigates weeks by hand
  stView: 'table',   // 'table' | 'grid' — the standings' two looks
  sheet: null,       // id of the game whose matchup card is open
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
    return this._db().players.map((p) => ({
      id: p.id, display_name: p.display_name, is_admin: !!p.is_admin, claimed: !!p.claimed_at,
    }));
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
    // No kickoff means no game: the team is on bye (or the page is stale).
    // House rule 1 makes NO pick free, so burning a team on a bye would be
    // strictly worse than doing nothing — refuse it.
    if (!kickoffISO) return { ok: false, error: `The ${teamShort(team)} are not playing in week ${week}.` };
    if (new Date(kickoffISO) <= new Date()) return { ok: false, error: 'That game has already started.' };
    const dup = db.picks.find((p) => p.player_id === me.id && p.season === SEASON && p.team === team && p.week !== week);
    if (dup) return { ok: false, error: `You already used the ${teamShort(team)} in week ${dup.week}.` };
    const cur = db.picks.find((p) => p.player_id === me.id && p.season === SEASON && p.week === week);
    if (cur) { cur.team = team; cur.entered_by = 'self'; cur.updated_at = new Date().toISOString(); }
    else db.picks.push({ id: db.seq++, player_id: me.id, season: SEASON, week, team, entered_by: 'self', updated_at: new Date().toISOString() });
    this._save(db);
    return { ok: true };
  },

  async claimPlayer(playerId) {
    const db = this._db();
    const p = db.players.find((x) => x.id === playerId);
    if (!p) return { ok: false, error: 'That name is not in the league.' };
    if (p.claimed_at) return { ok: false, error: 'Somebody has already taken that name. Ask the commissioner.' };
    p.claimed_at = new Date().toISOString();
    this._save(db);
    return { ok: true, token: p.token, display_name: p.display_name, is_admin: !!p.is_admin };
  },
  async joinLeague(name) {
    const db = this._db();
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, error: 'Please type your name.' };
    if (db.players.some((p) => p.display_name.toLowerCase() === nm.toLowerCase())) {
      return { ok: false, error: 'That name is already in the league — tap it in the list instead.' };
    }
    let token = mintToken(nm);
    while (db.players.some((p) => p.token === token)) token = mintToken(nm);
    db.players.push({ id: db.seq++, display_name: nm, token, is_admin: false, claimed_at: new Date().toISOString() });
    this._save(db);
    return { ok: true, token };
  },
  async unclaim(adminToken, playerId) {
    const db = this._db();
    if (!this._isAdmin(db, adminToken)) return { ok: false, error: 'Not an admin.' };
    const p = db.players.find((x) => x.id === playerId);
    if (p) { p.claimed_at = null; this._save(db); }
    return { ok: true };
  },

  async addPlayer(adminToken, name) {
    const db = this._db();
    if (db.players.length && !this._isAdmin(db, adminToken)) return { ok: false, error: 'Not an admin.' };
    let token = mintToken(name);
    while (db.players.some((p) => p.token === token)) token = mintToken(name);
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
  async adminSetPick(adminToken, playerId, week, team, kickoffISO) {
    const db = this._db();
    if (!this._isAdmin(db, adminToken)) return { ok: false, error: 'Not an admin.' };
    if (team && !kickoffISO) return { ok: false, error: `The ${teamShort(team)} are on bye in week ${week}.` };
    // Without this the commissioner could enter a pick on a game that has
    // already kicked off — or finished — which is a pick made with hindsight.
    if (team && new Date(kickoffISO) <= new Date()) {
      return { ok: false, error: `That game has already started — you cannot enter a pick for it.` };
    }
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
  listPlayers() { return this._get('players_public?select=id,display_name,is_admin,claimed&order=display_name'); },
  claimPlayer(playerId) { return this._rpc('claim_player', { p_player_id: playerId }); },
  joinLeague(name)      { return this._rpc('join_league', { p_name: name }); },
  unclaim(adminToken, id) { return this._rpc('admin_unclaim', { p_admin_token: adminToken, p_player_id: id }); },
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
  adminSetPick(adminToken, id, w, t, kickoffISO) {
    return this._rpc('admin_set_pick', { p_admin_token: adminToken, p_player_id: id, p_week: w, p_team: t || null, p_kickoff: kickoffISO || null });
  },
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
/* Games REMOVED from a demo week, to put teams on bye. Without this the demo
   plays all 32 teams every week and bye handling cannot be exercised at all —
   which is exactly how the admin bye hole survived the first test pass. */
const DEMO_BYES = { 3: 1, 4: 2 };

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

/* Records as they stood BEFORE the given week, from the demo season itself,
   so the matchup card's numbers agree with its own standings. */
const _demoRecCache = {};
function demoRecords(beforeWeek) {
  if (_demoRecCache[beforeWeek]) return _demoRecCache[beforeWeek];
  const r = {};
  for (const a of ABBRS) r[a] = { w: 0, l: 0, t: 0, hw: 0, hl: 0, aw: 0, al: 0 };
  for (let w = 1; w < beforeWeek; w++) {
    for (const g of demoGames(w)) {
      if (g.state !== 'post') continue;
      const d = g.home.score - g.away.score;
      const H = r[g.home.abbr], A = r[g.away.abbr];
      if (!H || !A) continue;
      if (d > 0) { H.w++; H.hw++; A.l++; A.al++; }
      else if (d < 0) { H.l++; H.hl++; A.w++; A.aw++; }
      else { H.t++; A.t++; }
    }
  }
  return (_demoRecCache[beforeWeek] = r);
}
const recStr = (o) => `${o.w}-${o.l}${o.t ? `-${o.t}` : ''}`;

function demoGames(week) {
  const rnd = mulberry32(week * 7919 + 13);
  const dayMs = 86400000;
  const rec = week > 1 ? demoRecords(week) : null;
  const drop = DEMO_BYES[week] || 0;
  return roundRobin(week - 1).slice(0, 16 - drop).map((pair, i) => {
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

    // A plausible, deterministic line so the matchup card is testable offline.
    const homeFav = rnd() < 0.58;                       // home teams are favoured more often
    const by = Math.round((1 + rnd() * 12) * 2) / 2;    // 1.0 .. 13.0, on the half point
    const favAbbr = homeFav ? pair[1] : pair[0];
    const ml = (fav) => {
      const p = ncdf(by / 13.5);                        // the favourite's win probability
      const q = fav ? p : 1 - p;
      return q >= 0.5 ? -Math.round((q / (1 - q)) * 100) : Math.round(((1 - q) / q) * 100);
    };
    const side = (abbr, isHome) => {
      const o = rec && rec[abbr];
      return {
        abbr, score: isHome ? hs : as,
        rec: o ? recStr(o) : '0-0',
        recHome: o ? `${o.hw}-${o.hl}` : '0-0',
        recRoad: o ? `${o.aw}-${o.al}` : '0-0',
      };
    };
    return {
      id: `demo-${week}-${i}`, week, date: date.toISOString(), state,
      statusText: state === 'post' ? 'Final' : fmtKick(date.toISOString()),
      tv: i === 0 ? 'Prime Video' : i >= 14 ? 'ESPN' : (i % 3 === 0 ? 'CBS' : 'FOX'),
      odds: {
        det: `${favAbbr} -${by}`, favAbbr, favBy: by,
        ou: Math.round((38 + rnd() * 14) * 2) / 2,
        hML: ml(homeFav), aML: ml(!homeFav),
        homeFav, awayFav: !homeFav, provider: 'Demo book',
      },
      away: side(pair[0], false), home: side(pair[1], true),
    };
  });
}

function normOdds(comp) {
  const o = (comp.odds || [])[0];
  if (!o) return null;
  const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
  const det = o.details || '';                       // e.g. "BAL -6.5"
  let favAbbr = null, favBy = null;
  const m = det.match(/([A-Z]{2,4})\s*[-]\s*(\d+(?:\.\d)?)/);
  if (m) { favAbbr = fixAbbr(m[1]); favBy = Math.abs(Number(m[2])); }
  if (favBy == null && num(o.spread) != null) {
    // ESPN's bare `spread` is home-oriented: negative means the home side is laying points.
    favBy = Math.abs(num(o.spread));
  }
  return {
    det, favAbbr, favBy,
    ou: num(o.overUnder),
    hML: num(o.homeTeamOdds && o.homeTeamOdds.moneyLine),
    aML: num(o.awayTeamOdds && o.awayTeamOdds.moneyLine),
    homeFav: !!(o.homeTeamOdds && o.homeTeamOdds.favorite),
    awayFav: !!(o.awayTeamOdds && o.awayTeamOdds.favorite),
    provider: (o.provider && o.provider.name) || '',
  };
}

function normGame(ev, week) {
  const comp = (ev.competitions || [])[0] || {};
  const cs = comp.competitors || [];
  const h = cs.find((c) => c.homeAway === 'home') || cs[0] || {};
  const a = cs.find((c) => c.homeAway === 'away') || cs[1] || {};
  const st = (ev.status && ev.status.type) || (comp.status && comp.status.type) || {};
  const recOf = (c, type) => {
    const rs = c.records || [];
    const hit = rs.find((r) => r.type === type) || (type === 'total' ? rs[0] : null);
    return (hit && hit.summary) || '';
  };
  const side = (c) => ({
    abbr: fixAbbr((c.team || {}).abbreviation),
    score: c.score == null || c.score === '' ? null : Number(c.score),
    rec: recOf(c, 'total'),
    recHome: recOf(c, 'home'),
    recRoad: recOf(c, 'road'),
  });
  const bc = (comp.broadcasts || [])[0] || {};
  return {
    id: ev.id, week,
    date: ev.date || comp.date,
    state: st.state || 'pre',                       // 'pre' | 'in' | 'post'
    statusText: st.shortDetail || st.detail || st.description || '',
    tv: (bc.names || []).join(', '),
    odds: normOdds(comp),
    home: side(h), away: side(a),
  };
}

const memCache = {};
async function weekGames(week) {
  // `.length` matters: an empty array is truthy, so a single failed fetch used
  // to pin the week to "no games" for the whole session. A real NFL week is
  // never empty, so treating [] as "not loaded" is safe and self-healing.
  if (S.games[week] && S.games[week].length) return S.games[week];
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

/* Teams with NO game in a given week. Derived from the schedule rather than
   stored, like everything else here — if ESPN lists 13 games, the other 6
   teams are on bye by definition. */
function byeTeams(week) {
  const games = S.games[week];
  if (!games || !games.length) return null;          // week not loaded: unknown, not "none"
  const playing = new Set();
  for (const g of games) { playing.add(g.home.abbr); playing.add(g.away.abbr); }
  return ABBRS.filter((a) => !playing.has(a));
}
/* The game a team plays in a week, or null if they are on bye. */
function gameFor(week, team) {
  return ((S.games[week] || []).find((g) => g.home.abbr === team || g.away.abbr === team)) || null;
}

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
   MATCHUP READ
   The "projected winner" here is THE BETTING MARKET'S view, not a model of
   our own. That is deliberate: porting Sports-Hub's model would drag half of
   app.js into a page twenty relatives can open, and the market is both a
   better forecaster and far easier to state honestly. When no line is posted
   we fall back to records and say so.
   ====================================================================== */

/* Standard normal CDF (Abramowitz & Stegun 26.2.17). */
function ncdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}
/* An American moneyline as an implied probability (still carrying the vig). */
function mlProb(ml) {
  if (ml == null || isNaN(ml)) return null;
  return ml < 0 ? (-ml) / (-ml + 100) : 100 / (ml + 100);
}
const fmtML = (v) => (v == null ? '' : v > 0 ? `+${v}` : String(v));
const NFL_SD = 13.5;   // points; the usual spread-to-win-probability conversion

function recTotals(str) {
  const m = String(str || '').match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  return { w: +m[1], l: +m[2], t: +(m[3] || 0) };
}

/* Everything the matchup card needs, derived from one game object. */
function matchupRead(g) {
  const o = g.odds || {};
  let homeSpread = null;                 // negative = the home side is laying points
  if (o.favBy != null) {
    if (o.favAbbr) homeSpread = o.favAbbr === g.home.abbr ? -o.favBy : o.favBy;
    else if (o.homeFav) homeSpread = -o.favBy;
    else if (o.awayFav) homeSpread = o.favBy;
  }

  // Win probability: de-vigged moneylines if both are posted, else the spread.
  let pHome = null, basis = null;
  const ph = mlProb(o.hML), pa = mlProb(o.aML);
  if (ph != null && pa != null && ph + pa > 0) { pHome = ph / (ph + pa); basis = 'moneyline'; }
  else if (homeSpread != null) { pHome = ncdf(-homeSpread / NFL_SD); basis = 'spread'; }

  let favSide = null;
  if (pHome != null) favSide = pHome >= 0.5 ? 'home' : 'away';
  else if (homeSpread != null) favSide = homeSpread < 0 ? 'home' : 'away';

  // No market at all — fall back to records, and label it as the weaker read.
  let fromRecords = false;
  if (!favSide) {
    const rh = recTotals(g.home.rec), ra = recTotals(g.away.rec);
    const pct = (r) => (r && r.w + r.l + r.t ? (r.w + r.t / 2) / (r.w + r.l + r.t) : null);
    const a = pct(rh), b = pct(ra);
    if (a != null && b != null && a !== b) { favSide = a > b ? 'home' : 'away'; fromRecords = true; }
    else if (a != null && b != null) { favSide = 'home'; fromRecords = true; }   // home field breaks a tie
  }

  const fav = favSide ? g[favSide] : null;
  const dog = favSide ? g[favSide === 'home' ? 'away' : 'home'] : null;
  const pFav = pHome == null ? null : (favSide === 'home' ? pHome : 1 - pHome);
  return {
    homeSpread, pHome, pFav, basis, favSide, fav, dog, fromRecords,
    ou: o.ou == null ? null : o.ou,
    favBy: homeSpread == null ? null : Math.abs(homeSpread),
    hML: o.hML, aML: o.aML, provider: o.provider || '',
    hasLine: homeSpread != null || (o.hML != null && o.aML != null),
  };
}

function confidenceWord(p) {
  if (p == null) return null;
  if (p >= 0.78) return 'one of the safer picks on the board';
  if (p >= 0.66) return 'a solid favourite';
  if (p >= 0.57) return 'a modest favourite';
  return 'close to a coin flip';
}

/* A short written read. Every sentence is built from a real number — nothing
   here is invented, and when a number is missing the sentence is dropped. */
function matchupBlurb(g, r) {
  const out = [];
  const homeName = teamShort(g.home.abbr), awayName = teamShort(g.away.abbr);

  if (g.state === 'post') {
    const d = g.home.score - g.away.score;
    out.push(d === 0
      ? `Final: ${awayName} ${g.away.score}, ${homeName} ${g.home.score} — a tie, so it is worth 0 points either way.`
      : `Final: ${d > 0 ? homeName : awayName} won by ${Math.abs(d)}, ${g.away.score}-${g.home.score}.`);
    return out;
  }

  if (r.fav && r.hasLine) {
    const where = r.favSide === 'home' ? 'at home' : 'on the road';
    const pct = r.pFav == null ? null : Math.round(r.pFav * 100);
    out.push(`${teamShort(r.fav.abbr)} are favoured by ${r.favBy} ${where}`
      + (pct ? `, which the betting market puts at about a ${pct}% chance of winning.` : '.'));
  } else if (r.fav && r.fromRecords) {
    out.push(`No line is posted yet. On records alone ${teamShort(r.fav.abbr)} (${r.fav.rec}) look the stronger side — a much rougher guide than a real line.`);
  } else {
    out.push('No line is posted for this game yet, and neither side has a record to separate them.');
  }

  const rh = recTotals(g.home.rec), ra = recTotals(g.away.rec);
  if (rh && ra && (rh.w + rh.l + rh.t > 0 || ra.w + ra.l + ra.t > 0)) {
    out.push(`${homeName} come in ${g.home.rec}${g.home.recHome ? ` (${g.home.recHome} at home)` : ''}. `
      + `${awayName} are ${g.away.rec}${g.away.recRoad ? ` (${g.away.recRoad} on the road)` : ''}.`);
  }

  if (r.ou != null) {
    out.push(r.ou >= 48 ? `The total is set at ${r.ou}, so a high-scoring game is expected.`
      : r.ou <= 41 ? `The total is set at ${r.ou} — the books expect a low-scoring game.`
      : `The total is set at ${r.ou}, about an average night for points.`);
  }

  const word = confidenceWord(r.pFav);
  if (word && r.fav) out.push(`For survivor purposes that makes ${teamShort(r.fav.abbr)} ${word}.`);
  return out;
}

function matchupHTML(g) {
  const r = matchupRead(g);
  const used = usedTeams(S.me.id, S.week);
  const mine = pickIn(S.me.id, S.week);
  const nm = (side) => teamName(g[side].abbr);

  let h = `<div class="sh-head">
      <div class="sh-title">${esc(nm('away'))} <span class="sh-at">at</span> ${esc(nm('home'))}</div>
      <div class="sh-when">${esc(g.state === 'post' ? (g.statusText || 'Final') : fmtKick(g.date))}${g.tv ? ` · ${esc(g.tv)}` : ''}</div>
    </div>`;

  if (r.fav) {
    const pct = r.pFav == null ? null : Math.round(r.pFav * 100);
    h += `<div class="sh-proj">
      <div class="sh-k">${g.state === 'post' ? 'Was projected to win' : 'Projected winner'}</div>
      <div class="sh-team">${esc(teamName(r.fav.abbr))}</div>
      <div class="sh-sub">${r.fromRecords ? 'on records only — no line posted'
        : `${esc(teamShort(r.fav.abbr))} by ${r.favBy}${pct ? ` · about ${pct}%` : ''}`}</div>
      ${pct ? `<div class="sh-bar"><i style="width:${Math.max(2, Math.min(98, pct))}%"></i></div>
        <div class="sh-split"><span>${esc(teamShort(r.fav.abbr))} ${pct}%</span><span>${esc(teamShort(r.dog.abbr))} ${100 - pct}%</span></div>` : ''}
    </div>`;
  }

  h += `<h3 class="sh-h">The read</h3><div class="sh-blurb">${
    matchupBlurb(g, r).map((p) => `<p>${esc(p)}</p>`).join('')}</div>`;

  h += `<h3 class="sh-h">Vegas line</h3>`;
  if (r.hasLine) {
    h += `<table class="sh-t"><tbody>
      <tr><td>Spread</td><td>${esc(r.fav ? `${teamShort(r.fav.abbr)} -${r.favBy}` : '—')}</td></tr>
      <tr><td>Total</td><td>${r.ou == null ? '—' : `O/U ${r.ou}`}</td></tr>
      <tr><td>Moneyline <span class="sh-gloss">(straight-up odds)</span></td><td>${r.hML != null && r.aML != null
        ? `${esc(g.away.abbr)} ${fmtML(r.aML)} · ${esc(g.home.abbr)} ${fmtML(r.hML)}`
        : '—'}</td></tr>
    </tbody></table>
    <p class="note sh-note">${r.provider ? `Line from ${esc(r.provider)}. ` : ''}For reference only — it is what the book is offering, not a guarantee.</p>`;
  } else {
    h += `<p class="note">No line posted for this game yet. Books usually put NFL numbers up early in the week.</p>`;
  }

  h += `<h3 class="sh-h">Records</h3>
    <table class="sh-t"><thead><tr><th></th><th>Overall</th><th>Home</th><th>Away</th></tr></thead><tbody>
      <tr><td class="sh-tm">${esc(teamShort(g.away.abbr))}</td><td>${esc(g.away.rec || '—')}</td><td>${esc(g.away.recHome || '—')}</td><td>${esc(g.away.recRoad || '—')}</td></tr>
      <tr><td class="sh-tm">${esc(teamShort(g.home.abbr))}</td><td>${esc(g.home.rec || '—')}</td><td>${esc(g.home.recHome || '—')}</td><td>${esc(g.home.recRoad || '—')}</td></tr>
    </tbody></table>`;

  // The single most useful line in a survivor pool: can you even take them?
  const notes = [];
  for (const side of ['away', 'home']) {
    const ab = g[side].abbr;
    if (used[ab]) notes.push(`You already used the ${teamShort(ab)} in week ${used[ab]}, so they are not available.`);
    else if (mine && mine.team === ab) notes.push(`The ${teamShort(ab)} are your current week ${S.week} pick.`);
  }
  if (notes.length) h += `<div class="sh-you">${notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>`;

  // Pick straight from the card, when it is still legal to.
  if (g.state === 'pre') {
    const opts = ['away', 'home'].filter((sd) => !used[g[sd].abbr]);
    if (opts.length) {
      h += `<div class="sh-act">${opts.map((sd) =>
        `<button class="btn ${mine && mine.team === g[sd].abbr ? '' : 'pri'}" data-team="${g[sd].abbr}" data-sheetpick="1">${
          mine && mine.team === g[sd].abbr ? `✓ ${esc(teamShort(g[sd].abbr))}` : `Pick ${esc(teamShort(g[sd].abbr))}`}</button>`).join('')}</div>`;
    }
  }
  return h;
}

let _scrollY = 0;
function openSheet(gameId) {
  const g = (S.games[S.week] || []).find((x) => x.id === gameId);
  if (!g) return;
  S.sheet = gameId;
  $('#sheet-body').innerHTML = matchupHTML(g);
  $('#sheet').hidden = false;
  // iOS Safari ignores `overflow:hidden` on <body>, so the page carries on
  // scrolling behind the sheet. Pinning it is the only lock that holds.
  _scrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_scrollY}px`;
  document.body.style.width = '100%';
  $('#sheet-close').focus({ preventScroll: true });
}
function closeSheet() {
  if (!S.sheet) return;
  S.sheet = null;
  $('#sheet').hidden = true;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, _scrollY);
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

  let h = msgHTML();

  const seen = lsGet('survivor:welcomed', '0') === '1';
  if (!seen && !picksOf(S.me.id).length) {
    h += `<div class="welcome">
      <b>Hi ${esc(S.me.display_name)} 👋</b>
      <p>This is the family football pool. Every week you pick <b>one team you think will win</b>.</p>
      <p>You are never knocked out — you play all season. The only rule is you can't pick the same team twice.</p>
      <p>Nothing to install and nothing to remember. Just open this same link each week.</p>
      <button class="btn pri wide" id="wl-ok">Got it — let's pick</button>
    </div>`;
  }

  h += weekNavHTML(S.week);

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
    const r = matchupRead(g);
    const tip = started ? '' : (r.fav && r.hasLine
      ? `${teamShort(r.fav.abbr)} -${r.favBy}`
      : r.fav ? `${teamShort(r.fav.abbr)} favoured` : 'no line yet');
    return `<div class="game ${started ? 'started' : ''}">
      <div class="game-when">
        <span>${esc(started ? (g.statusText || 'Final') : fmtKick(g.date))}</span>
        <button class="ibtn" type="button" data-info="${esc(g.id)}" aria-label="Matchup details">${
          tip ? `<span class="ibtn-l">${esc(tip)}</span>` : ''}<span class="ibtn-i">ⓘ</span></button>
      </div>
      <div class="game-pair">${row('away')}<span class="game-at">at</span>${row('home')}</div>
    </div>`;
  };

  h += open.map((g) => gameHTML(g, false)).join('');
  if (shut.length) {
    h += `<h2 class="hh">Already started</h2><p class="sub">These can't be picked any more.</p>`;
    h += shut.map((g) => gameHTML(g, true)).join('');
  }

  const bye = byeTeams(S.week);
  if (bye && bye.length) {
    h += `<div class="byebar"><b>On bye in week ${S.week}</b><span>${
      esc(bye.map(teamShort).join(' · '))}</span>
      <em>These teams are not playing this week. Skipping them costs you nothing — no loss, and you don't use them up.</em></div>`;
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


/* The week-by-week board the family already knows from their old pool:
   one row per player, one column per week, coloured by result. It reads the
   SAME tallyFor() the table does, so the two views can never disagree. */
function seasonGridHTML(rows) {
  const upto = Math.max(S.week, ...S.picks.map((p) => p.week), 1);
  const weeks = Array.from({ length: upto }, (_, i) => i + 1);

  let h = `<div class="grid-wrap"><table class="gr">
    <thead><tr><th class="gnm">Player</th><th></th>${
      weeks.map((w) => `<th>Wk ${w}</th>`).join('')}</tr></thead><tbody>`;

  for (const r of rows) {
    h += `<tr class="${r.p.id === S.me.id ? 'you' : ''}">
      <td class="gnm">${esc(r.p.display_name)}</td>
      <td class="grec">${r.w}-${r.l}${r.t ? `-${r.t}` : ''}</td>`;
    for (const wk of weeks) {
      const row = r.rows[wk - 1];
      if (!row || !row.pick) { h += `<td><span class="gcell none">—</span></td>`; continue; }
      const own = r.p.id === S.me.id;
      // House rule 3 applies here too: another player's unstarted pick is secret.
      if (!own && !pickVisible(row.pick.team, S.games[wk] || [])) {
        h += `<td><span class="gcell p" title="hidden until kickoff">🔒</span></td>`;
        continue;
      }
      const cls = row.status === 'win' ? 'w' : row.status === 'loss' ? 'l'
        : row.status === 'tie' ? 't' : 'p';
      const mar = row.status === 'win' || row.status === 'loss' ? signed(row.margin)
        : row.status === 'tie' ? 'tie' : '·';
      const tip = `${teamShort(row.pick.team)} ${mar}`;
      h += `<td><span class="gcell ${cls}" title="${esc(tip)}">
        <b>${esc(row.pick.team)}</b><i>${esc(mar)}</i></span></td>`;
    }
    h += `</tr>`;
  }
  h += `</tbody></table></div>
    <div class="gr-legend">
      <span><i class="w"></i> won</span><span><i class="l"></i> lost</span>
      <span><i></i> tie / not played</span><span><i class="n"></i> no pick</span>
      <span>🔒 hidden until kickoff</span>
      <span>The number under each team is how much they won or lost by.</span>
    </div>
    <p class="note" style="margin-top:10px">Scroll sideways for later weeks.</p>`;
  return h;
}

function renderStandings() {
  const host = $('#s-standings');
  const rows = standings(S.games);
  const games = S.games[S.week] || [];

  const grid = S.stView === 'grid';
  let h = msgHTML() + `<h2 class="hh">Standings</h2>
    <p class="sub">${grid
      ? 'Every pick of the season, week by week.'
      : "Sorted by wins. Points are how much your teams have won or lost by, added up all season — that's the tiebreaker."}</p>
    <div class="vtog">
      <button type="button" data-stview="table" class="${grid ? '' : 'on'}">Table</button>
      <button type="button" data-stview="grid" class="${grid ? 'on' : ''}">Week by week</button>
    </div>`;

  if (grid) {
    h += seasonGridHTML(rows);
    // The current week is the one people care about; without this the grid
    // opens on week 1 and the live column is off the right edge.
    requestAnimationFrame(() => {
      const w = $('#s-standings .grid-wrap');
      if (w) w.scrollLeft = w.scrollWidth;
    });
  } else {

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
  }

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
      : r.status === 'nogame' ? '⚠️'
      : r.status === 'tie' ? 'tie' : signed(r.margin);
    const line = r.status === 'pending'
      ? (r.opp ? `vs ${teamShort(r.opp)} · ${fmtKick(r.game.date)}` : 'not played yet')
      : r.status === 'nogame' ? 'they were on bye — tell the commissioner, this should not happen'
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
/* True only when picks actually travel between devices. */
const isShared = () => S.store && S.store.kind === 'cloud';

/* Guard on anything that hands a link to another human. */
function linkWarnOK(what) {
  if (isShared()) return true;
  return confirm(
    `This league is NOT connected to a shared database yet.\n\n` +
    `${what} will not work for anyone else — they would open an empty app on ` +
    `their own phone, and their picks would never reach you.\n\n` +
    `Connect Supabase first (Admin \u2192 Shared database).\n\nCopy anyway, just to test?`
  );
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

  h += cloud
    ? `<div class="card"><b>☁️ Shared league — connected</b>
        <p class="note" style="margin:6px 0 0">Picks are saved to your Supabase project. Everyone in the family reads and writes the same league, and standings update for all of them.</p></div>`
    : `<div class="warnbox">
        <b>⚠️ Not shared yet — do not send links</b>
        <p>Picks are saved <b>in this browser only</b>. If you send someone a link right now they will open an empty app on their own phone, make picks nobody can see, and none of it will reach you.</p>
        <p>Connect a free Supabase project below and this becomes a real league. Everything you have built so far keeps working — only where the picks live changes.</p>
      </div>`;

  // --- people ---
  // ONE link for the whole family. Everybody opens the same address and taps
  // their own name — tapping beats typing for the people this exists for.
  const joined = S.players.filter((p) => p.claimed).length;
  h += `<h2 class="hh">The league link</h2>
    <p class="sub">Text this one address to the whole family. Each person taps their own name once, and that phone remembers them from then on.</p>
    <div class="card">
      <p class="mono">${esc(location.origin + location.pathname)}</p>
      <button class="btn pri wide" id="ad-copyjoin">Copy the league link</button>
      <p class="note" style="margin-top:10px">${joined} of ${S.players.length} have joined so far.</p>
    </div>`;

  h += `<h2 class="hh">Family (${S.players.length})</h2>
    <p class="sub">Add everyone's name in advance so they only have to tap. Anyone you miss can type their own name on the join screen.</p>
    <div class="card">`;
  for (const p of S.players) {
    h += `<div class="plrow">
      <span class="pn">${esc(p.display_name)}${p.is_admin ? ' 👑' : ''}${
        p.claimed ? '' : ' <span class="pn-wait">not joined yet</span>'}</span>
      ${p.claimed ? `<button class="btn sm" data-unclaim="${p.id}" title="Free this name up again">Release</button>` : ''}
      <button class="btn sm" data-copy="${p.id}">Link</button>
      <button class="btn sm" data-view="${p.id}">View as</button>
      <button class="btn sm" data-del="${p.id}" title="Remove" aria-label="Remove ${esc(p.display_name)}">✕</button>
    </div>`;
  }
  if (!S.players.length) h += `<p class="note">Nobody yet. Add yourself first — the first person added becomes the commissioner.</p>`;
  h += `</div>
    <div class="card">
      <label class="fld"><span>Add somebody</span><input id="ad-name" type="text" placeholder="e.g. Nana" autocomplete="off"></label>
      <button class="btn pri wide" id="ad-add">Add to the league</button>
      <button class="btn wide" id="ad-copyall">Copy every personal link (rarely needed)</button>
    </div>`;

  // --- enter a pick on someone's behalf ---
  h += `<h2 class="hh">Enter a pick for someone</h2>
    <p class="sub">For when Nana texts you her pick instead of tapping it.</p>
    <div class="card">
      <label class="fld"><span>Who</span><select id="ap-who">${
        S.players.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}</select></label>
      <label class="fld"><span>Week</span><select id="ap-week">${
        Array.from({ length: LAST_WEEK }, (_, i) => i + 1)
          .map((w) => `<option value="${w}" ${w === S.apWeek ? 'selected' : ''}>Week ${w}</option>`).join('')}</select></label>
      <label class="fld"><span>Team</span><select id="ap-team">${adminTeamOptions()}</select></label>
      <p class="note">${adminTeamNote()}</p>
      <button class="btn pri wide" id="ap-save">Save that pick</button>
    </div>`;

  // --- connection ---
  const cfg = jGet('survivor:sb', { url: '', key: '' });
  h += `<h2 class="hh">Shared database</h2>
    <p class="sub">This is what makes it a real league. Free, about five minutes, once.</p>
    <ol class="steps">
      <li>Make a free project at <b>supabase.com</b>.</li>
      <li>SQL Editor → paste all of <b>schema.sql</b> → Run.</li>
      <li>Still in the SQL editor, make yourself commissioner:<br>
        <code>select admin_add_player('bootstrap', 'Jack');</code><br>
        then <code>select display_name, token from players;</code> and keep your token.</li>
      <li>Settings → API → copy the <b>Project URL</b> and the <b>anon</b> key into the boxes below.</li>
      <li>Save &amp; reload, open your own link, then add everyone else.</li>
    </ol>
    <p class="note">Step 3 matters: whoever is added first becomes commissioner, and the key below is public once the site is live. Claim it from the SQL editor, not from the app.</p>
    <div class="card">
      <label class="fld"><span>Project URL</span><input id="sb-url" type="url" placeholder="https://xxxx.supabase.co" value="${esc(cfg.url || '')}"></label>
      <label class="fld"><span>Anon key</span><input id="sb-key" type="text" placeholder="eyJ..." value="${esc(cfg.key || '')}"></label>
      <button class="btn pri wide" id="sb-save">Save &amp; reload</button>
      <button class="btn wide" id="sb-copycfg">Copy the 2 lines for the deployed app</button>
      <button class="btn wide" id="sb-clear">Disconnect (back to this device only)</button>
    </div>
    <div class="warnbox">
      <b>⚠️ Saving here only configures THIS phone</b>
      <p>The boxes above are stored on this device. Everyone else opens the same web address on their own phone, where there is nothing saved — so they would still be offline.</p>
      <p>To make it work for the whole family the two values must be written into <b>survivor.js</b> itself and redeployed. Tap <b>Copy the 2 lines</b> and send them to whoever maintains the app.</p>
    </div>`;

  // --- demo ---
  h += `<h2 class="hh">Demo season</h2>
    <p class="sub">The real season starts 10 Sep 2026, so until then there is nothing to grade. Demo mode invents three finished weeks plus a live week 4 so you can try every screen.</p>
    <div class="card">
      <button class="btn ${S.demo ? 'pri' : ''} wide" id="dm-toggle">${S.demo ? 'Demo mode is ON — turn it off' : 'Turn demo mode ON'}</button>
      <button class="btn wide" id="dm-seed">Load a demo family &amp; three weeks of picks</button>
      <button class="btn wide" id="dm-wipe">Erase everything on this device</button>
    </div>
    <h2 class="hh">Cached results</h2>
    <p class="sub">Finished weeks are stored on this device so history loads instantly. If a score ever looks wrong, clear it and it will be fetched fresh.</p>
    <div class="card">
      <button class="btn wide" id="ck-clear">Re-fetch all results from ESPN</button>
    </div>`;

  host.innerHTML = h;
}

/* Only teams that actually PLAY in the chosen week may be offered — this list
   used to be all 32, which is how a commissioner could burn somebody's team on
   a bye by taking a pick over the phone. */
function adminTeamOptions() {
  const wk = S.apWeek;
  const games = S.games[wk];
  let h = '<option value="">— clear their pick —</option>';
  if (!games || !games.length) return h;
  const playing = [];
  // Only games that have not kicked off. The player-facing pick screen has
  // always done this; the admin form did not.
  for (const g of games) {
    if (g.state !== 'pre') continue;
    playing.push(g.away.abbr); playing.push(g.home.abbr);
  }
  playing.sort((a, b) => teamName(a).localeCompare(teamName(b)));
  for (const a of playing) h += `<option value="${a}">${esc(teamName(a))}</option>`;
  return h;
}
function adminTeamNote() {
  const wk = S.apWeek;
  const games = S.games[wk];
  if (!games || !games.length) return `Loading week ${wk}'s schedule…`;
  const bye = byeTeams(wk) || [];
  const started = games.filter((g) => g.state !== 'pre').length;
  let n = `Only teams whose week ${wk} game has not kicked off yet are listed.`;
  if (started) n += ` ${started} game${started > 1 ? 's have' : ' has'} already started.`;
  if (bye.length) n += ` On bye: ${bye.map(teamShort).join(', ')}.`;
  return n;
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
  // Writes go STRAIGHT into the store, not through adminSetPick. The demo
  // backfills weeks that have already been played, and the commissioner path
  // now correctly refuses a pick on a game that has kicked off — this is
  // fixture generation, not a commissioner action, so it must not pretend to
  // be one.
  for (const p of db.players) {
    const used = new Set();
    for (let wk = 1; wk <= 4; wk++) {
      if (wk === 4 && rnd() < 0.3) continue;                 // a couple of stragglers
      if (wk === 2 && p.display_name === 'Nana') continue;   // and one genuine miss
      const byTeam = {};
      for (const g of demoGames(wk)) { byTeam[g.away.abbr] = g; byTeam[g.home.abbr] = g; }
      const free = Object.keys(byTeam).filter((t) => !used.has(t));
      const team = free[Math.floor(rnd() * free.length)];
      if (!team) continue;
      used.add(team);
      db.picks.push({
        id: db.seq++, player_id: p.id, season: SEASON, week: wk, team,
        entered_by: 'self', updated_at: new Date().toISOString(),
      });
    }
  }
  store._save(db);
  lsSet('survivor:me', admin);   // land on the commissioner
}

/* ---- identity --------------------------------------------------------- */

function renderPicker() {
  $('#boot').hidden = true;
  const host = $('#s-pick');
  host.hidden = false;
  $('#tabs').hidden = true;
  const cloud = isShared();
  const hadToken = !!new URLSearchParams(location.search).get('u');

  // A personal link that did not resolve. Never offer to start a league here —
  // they would create an empty one of their own and be lost.
  if (hadToken) {
    host.innerHTML = `<h2 class="hh">This link isn't working</h2>
      <div class="warnbox">
        <b>⚠️ We couldn't sign you in</b>
        <p>${cloud
          ? 'That link is not recognised. It may have been cut short by a text message.'
          : "This league hasn't been switched on yet, so there is nothing for the link to open."}</p>
        <p>Ask ${esc(LEAGUE_ADMIN_NAME)} to send you the league link again — nothing is wrong with your phone.</p>
      </div>`;
    return;
  }

  // Nobody in the league at all: this is the commissioner's very first visit.
  if (!S.players.length) {
    host.innerHTML = msgHTML() + `<h2 class="hh">Set up the league</h2>
      <p class="sub">Nothing on this device yet.</p>
      <div class="card">
        <p class="note">Add yourself first — whoever is added first is the commissioner.</p>
        <label class="fld"><span>Your name</span><input id="first-name" type="text" placeholder="e.g. Jack" autocomplete="off"></label>
        <button class="btn pri wide" id="first-go">Start the league</button>
        <button class="btn wide" id="first-demo">Or load a demo family to poke around</button>
      </div>`;
    return;
  }

  // THE JOIN SCREEN. One link goes to the whole family; each person taps their
  // own name. Tapping beats typing for the people this league exists for.
  const free = S.players.filter((p) => !p.claimed);
  let h = msgHTML() + `<h2 class="hh">Welcome 👋</h2>
    <p class="sub">This is the family football pool. Tap your name to get started — you only do this once on this phone.</p>`;

  if (free.length) {
    h += `<div class="card namelist">${free.map((p) =>
      `<button class="btn wide namebtn" data-claim="${p.id}">${esc(p.display_name)}</button>`).join('')}</div>`;
  } else {
    h += `<div class="card"><p class="note">Everyone on the list has already joined.</p></div>`;
  }

  h += `<details class="usedstrip" ${free.length ? '' : 'open'}>
      <summary>My name isn't on the list</summary>
      <div class="ub" style="display:block">
        <label class="fld"><span>Type your name</span><input id="join-name" type="text" placeholder="e.g. Aunt Mary" autocomplete="name"></label>
        <button class="btn pri wide" id="join-go">Join the league</button>
      </div>
    </details>
    <p class="note" style="margin-top:14px">Tap the wrong one? Ask ${esc(LEAGUE_ADMIN_NAME)} — he can put it back.</p>`;
  host.innerHTML = h;
}

/* Sign in on this device and put the token in the address bar, so a bookmark
   or Home Screen icon captures it and they never see this screen again. */
function signInWith(token) {
  lsSet('survivor:me', token);
  location.search = `?u=${encodeURIComponent(token)}`;
}

/* ======================================================================
   WIRING + BOOT
   ====================================================================== */

function setScreen(name, scroll) {
  const changed = S.screen !== name;
  S.screen = name;
  for (const s of ['pick', 'standings', 'history', 'admin']) $(`#s-${s}`).hidden = s !== name;
  $$('#tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.screen === name));
  // Only a genuine screen change jumps to the top. render() runs after every
  // pick and every week change too, and yanking the page up each time loses
  // the reader's place in a long list of games.
  if (changed || scroll) window.scrollTo(0, 0);
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
  await Promise.all(weeks
    .filter((w) => w >= 1 && w <= LAST_WEEK && !(S.games[w] && S.games[w].length))
    .map((w) => weekGames(w)));
}
/* Every week ANY player has a pick in, plus the current one. The standings sum
   over all 18 weeks, so a week that was never fetched grades as 'nogame' and
   silently vanishes from that player's record — which made two people looking
   at the same standings see different numbers. */
function weeksInPlay() {
  const set = new Set([S.week]);
  for (const p of S.picks) set.add(p.week);
  return Array.from(set);
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
    setThemeColor(now);
    return;
  }
  if (t.id === 'big-btn') {
    const on = document.documentElement.hasAttribute('data-big');
    if (on) { document.documentElement.removeAttribute('data-big'); lsSet('survivor:big', '0'); }
    else { document.documentElement.setAttribute('data-big', '1'); lsSet('survivor:big', '1'); }
    return;
  }
  if (t.dataset.screen) {
    const to = t.dataset.screen;
    setScreen(to, true); render();
    if (to === 'standings' || to === 'history') {
      // Load every week that has a pick before trusting the totals.
      const before = weeksInPlay().filter((w) => !(S.games[w] && S.games[w].length)).length;
      if (before) { await ensureWeeks(weeksInPlay()); render(); }
    }
    return;
  }

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
  if (t.id === 'wl-ok') { lsSet('survivor:welcomed', '1'); render(); return; }
  if (t.id === 'first-demo') { await seedDemo(); location.search = ''; return; }
  if (t.dataset.claim) {
    t.disabled = true;
    const r = await S.store.claimPlayer(Number(t.dataset.claim))
      .catch((e) => ({ ok: false, error: String(e.message || e) }));
    if (r && r.ok && r.token) { signInWith(r.token); return; }
    say('bad', (r && r.error) || 'Could not sign you in.');
    await reloadPlayers(); renderPicker(); return;
  }
  if (t.id === 'join-go') {
    const nm = (($('#join-name') || {}).value || '').trim();
    if (!nm) { say('bad', 'Please type your name.'); renderPicker(); return; }
    t.disabled = true;
    const r = await S.store.joinLeague(nm).catch((e) => ({ ok: false, error: String(e.message || e) }));
    if (r && r.ok && r.token) { signInWith(r.token); return; }
    say('bad', (r && r.error) || 'Could not join.');
    await reloadPlayers(); renderPicker(); return;
  }
  if (t.dataset.unclaim) {
    const r = await S.store.unclaim(S.me.token, Number(t.dataset.unclaim));
    say(r && r.ok ? 'ok' : 'bad', r && r.ok ? 'That name is free again.' : (r && r.error) || 'Could not release it.');
    await reloadPlayers(); render(); return;
  }
  if (t.dataset.be) {
    const tok = await LocalStore.tokenFor(null, Number(t.dataset.be))
      || (LocalStore._db().players.find((p) => p.id === Number(t.dataset.be)) || {}).token;
    if (tok) { lsSet('survivor:me', tok); location.search = `?u=${encodeURIComponent(tok)}`; }
    return;
  }

  if (t.dataset.stview) { S.stView = t.dataset.stview; render(); return; }

  // --- matchup sheet ---
  if (t.dataset.info) { openSheet(t.dataset.info); return; }
  if (t.dataset.close) { closeSheet(); return; }
  if (t.dataset.sheetpick) {
    const team = t.dataset.team;
    const g = (S.games[S.week] || []).find((x) => x.id === S.sheet);
    t.disabled = true;
    const r = await S.store.submitPick(S.me.token, S.week, team, g && g.date)
      .catch((err) => ({ ok: false, error: String(err.message || err) }));
    if (r && r.ok) { say('ok', `Locked in: the ${teamShort(team)} for week ${S.week}.`); await reloadPicks(); }
    else say('bad', (r && r.error) || 'Could not save that pick.');
    closeSheet();
    render();
    return;
  }

  // --- week nav ---
  if (t.dataset.week && t.dataset.week !== 'null') {
    S.week = Number(t.dataset.week);
    S.weekPinned = true;
    await ensureWeeks([S.week]);
    render();
    return;
  }

  // --- making a pick ---
  if (t.dataset.team && S.screen === 'pick') {
    const team = t.dataset.team;
    const g = gameForTeam(S.games[S.week] || [], team);
    // Lock the whole board, not just this button: two quick taps on different
    // teams used to race, and the pick that landed last won rather than the
    // one tapped last.
    $$('#s-pick .pk').forEach((b) => { b.disabled = true; });
    const r = await S.store.submitPick(S.me.token, S.week, team, g && g.date).catch((err) => ({ ok: false, error: String(err.message || err) }));
    if (r && r.ok) { say('ok', `Locked in: the ${teamShort(team)} for week ${S.week}.`); await reloadPicks(); }
    else say('bad', (r && r.error) || 'Could not save that pick.');
    render();
    return;
  }

  // --- admin ---
  if (t.dataset.copy) {
    if (!linkWarnOK('That personal link')) return;
    const tok = await S.store.tokenFor(S.me.token, Number(t.dataset.copy));
    const p = S.players.find((x) => x.id === Number(t.dataset.copy));
    if (!tok) { say('bad', 'Could not read that link.'); render(); return; }
    const ok = await copyText(`${p.display_name}, here's your Family Survivor link — bookmark it:\n${linkFor(tok)}`);
    say(ok ? 'ok' : 'bad', ok ? `Copied ${p.display_name}'s link.` : `Could not copy. Link: ${linkFor(tok)}`);
    render(); return;
  }
  if (t.id === 'ad-copyjoin') {
    if (!linkWarnOK('The league link')) return;
    const url = location.origin + location.pathname;
    const ok2 = await copyText(`Family survivor pool — tap this, then tap your name:\n${url}`);
    say(ok2 ? 'ok' : 'bad', ok2 ? 'Copied. Paste it into the family group text.' : `Could not copy. The link is ${url}`);
    render(); return;
  }
  if (t.id === 'ad-copyall') {
    if (!linkWarnOK('These personal links')) return;
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
    const g = team ? gameFor(wk, team) : null;
    if (team && !g) { say('bad', `The ${teamShort(team)} are on bye in week ${wk} — pick somebody who is playing.`); render(); return; }
    if (g && new Date(g.date) <= new Date()) { say('bad', `That game has already started — you cannot enter a pick for it.`); render(); return; }
    const r = await S.store.adminSetPick(S.me.token, who, wk, team || null, g && g.date);
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
  if (t.id === 'sb-copycfg') {
    const url = (($('#sb-url') || {}).value || '').trim().replace(/\/+$/, '');
    const key = (($('#sb-key') || {}).value || '').trim();
    if (!url || !key) { say('bad', 'Fill in both boxes first.'); render(); return; }
    const snippet = `let SUPABASE_URL = '${url}';\nlet SUPABASE_KEY = '${key}';`;
    const ok2 = await copyText(snippet);
    say(ok2 ? 'ok' : 'bad', ok2
      ? 'Copied. Those two lines replace the empty ones at the top of survivor.js.'
      : 'Could not copy — the two lines are the URL and key you typed above.');
    render(); return;
  }
  if (t.id === 'sb-clear') { lsDel('survivor:sb'); location.reload(); return; }
  if (t.id === 'dm-toggle') { lsSet('survivor:demo', S.demo ? '0' : '1'); location.reload(); return; }
  if (t.id === 'dm-seed') {
    if (!confirm('This replaces everything stored on this device with a demo family. Continue?')) return;
    await seedDemo(); location.search = ''; return;
  }
  if (t.id === 'ck-clear') {
    const n = clearWeekCache();
    for (const k of Object.keys(S.games)) delete S.games[k];
    await ensureWeeks(weeksInPlay());
    say('ok', `Cleared ${n} cached week${n === 1 ? '' : 's'} and re-fetched.`);
    render(); return;
  }
  if (t.id === 'dm-wipe') {
    if (!confirm('Erase the league stored on this device? (A connected Supabase league is not touched.)')) return;
    lsDel('survivor:local'); lsDel('survivor:me'); lsSet('survivor:demo', '0');
    clearWeekCache();
    location.search = ''; return;
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'ap-week') return;
  S.apWeek = Number(e.target.value) || 1;
  await ensureWeeks([S.apWeek]);          // we cannot know the byes until it is loaded
  render();
});
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('sheet-back')) closeSheet();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) closeSheet(); });

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
  S.apWeek = S.week;
  const weeks = [];
  for (let w = 1; w <= S.week; w++) weeks.push(w);
  for (const p of S.picks) if (!weeks.includes(p.week)) weeks.push(p.week);
  await ensureWeeks(weeks);
  render();

  // While games are in progress the standings genuinely move, so refresh.
  setInterval(async () => {
    if (document.hidden) return;
    // Refresh whenever the week is UNFINISHED, not only when we can already
    // see something live — deciding from the stale snapshot meant we could
    // never discover the first kickoff of the day.
    const games = S.games[S.week] || [];
    const unfinished = !games.length || games.some((g) => g.state !== 'post');
    if (!unfinished) return;
    delete S.games[S.week]; memCache[`w${S.week}`] = null;
    const wk = await currentWeek();            // a tab left open crosses weeks
    if (wk !== S.week && !S.weekPinned) { S.week = wk; S.apWeek = wk; }
    await ensureWeeks([S.week]);
    if (S.screen !== 'admin' && !S.sheet) render();
  }, 60000);
}

boot();

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

/* Shown in the footer so the commissioner can ask "what does yours say?" and
   tell instantly whether somebody is on an old copy. It is the app's BUILD
   NUMBER — one per shipped change to survivor/ — so a bigger number is
   always newer and two people can compare at a glance.
   ⚠️ BUMP THIS ON EVERY SHIP. It is only a diagnostic (the service worker is
   what actually delivers updates), but a version that lies is worse than no
   version — that is exactly how `?v=1` went stale for sixteen releases. */
const APP_V = 'v42';

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

/* The helmets, and what happens when one does not arrive.
   ⚠️ These used to be `onerror="this.remove()"`, which is permanent: a single
   failed load — a tunnel, a dead spot, an ESPN hiccup — deleted that logo for
   the life of the render, and since a whole slate loads at once a bad moment
   could strip every helmet on the page. Now it retries once and, only if that
   also fails, leaves the team's abbreviation in the same space. There is
   always SOMETHING, the hole never appears, and nothing shifts. */
function logoHTML(abbr, lazy) {
  return `<img src="${teamLogo(abbr)}" alt="" data-abbr="${esc(String(abbr).toUpperCase())}"${
    lazy ? ' loading="lazy"' : ''} decoding="async" onerror="logoFail(this)">`;
}
function logoFail(img) {
  if (!img || !img.parentNode) return;
  if (!img.dataset.retried) {
    img.dataset.retried = '1';
    const src = img.src.split('?')[0];
    setTimeout(() => { if (img.parentNode) img.src = `${src}?r=${Date.now()}`; }, 700);
    return;
  }
  const fb = document.createElement('span');
  fb.className = 'lg-fb';
  fb.textContent = img.dataset.abbr || '';
  img.replaceWith(fb);
}
window.logoFail = logoFail;

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

/* Does this browser actually remember anything? Safari in private mode throws
   on access, and iOS evicts site storage from apps that have not been opened
   in a while — which is precisely this app's usage pattern, once a week. When
   storage is dead the app cannot sign anybody in, and the difference between
   "your link is wrong" and "your phone is not saving anything" is the
   difference between texting the commissioner and fixing it yourself. */
function storageWorks() {
  try {
    const k = 'survivor:canary';
    localStorage.setItem(k, '1');
    const ok = localStorage.getItem(k) === '1';
    localStorage.removeItem(k);
    return ok;
  } catch (e) { return false; }
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

/* The condensed list splits the kickoff string: the day becomes a section
   heading, the clock stays on the row. A locale with no comma degrades to
   the whole string on the row, which is wrong-looking but never wrong. */
const other = (k) => (k === 'home' ? 'away' : 'home');
/* Every kickoff a GAME shows goes through this. A real ESPN game formats its
   own timestamp; the demo carries `whenLabel` instead, because its instants
   have to stay relative to Date.now() (or opening it in the evening finds
   every game already kicked off) while the CLOCK it shows has to be a real
   NFL slot. One is the deadline, the other is the label — they are different
   jobs and only the fixture ever needs them to disagree. */
const kickWhen  = (g) => (g && g.whenLabel) || fmtKick(g && g.date);
const kickClock = (g) => String(kickWhen(g)).split(',').pop().trim();
const kickDay   = (g) => String(kickWhen(g)).split(',').slice(0, 2).join(',').trim();

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
  liveWeek: null,    // the week the NFL is actually on, so we can offer a way back
  stView: 'table',   // 'table' | 'grid' — the standings' two looks
  fullWeek: null,    // the week the user asked to see in full, once locked
  sheet: null,       // id of the game whose matchup card is open
  confirming: null,  // { team, gameId } while the confirm step is up
  naming: null,      // player id awaiting "are you X?" confirmation
  reloading: false,  // guards the one-shot reload when a new version lands
  saving: false,     // a pick is being written — hold any auto-reload
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
  /* ⚠️ Returns whether it actually stored. `jSet` swallows its exception, so
     a full or disabled localStorage used to look identical to a successful
     write — and `submitPick` returned {ok:true} regardless, so the app said
     "Locked in" over a pick that was never saved and the very next render
     showed no pick at all. */
  _save(db) {
    // ⚠️ NOT via `jSet` — that swallows the exception, and reading the key back
    // afterwards proves nothing because the PREVIOUS value is still sitting
    // there. Write directly so a refusal is actually visible.
    try { localStorage.setItem('survivor:local', JSON.stringify(db)); return true; }
    catch (e) { return false; }
  },
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
    // ⚠️ Fail CLOSED. `new Date('nonsense') <= new Date()` is FALSE, so a
    // corrupt kickoff from ESPN made the deadline check silently never fire
    // and the game pickable forever. A date we cannot read is a game we
    // cannot judge, which is the same as no game at all.
    const kick = new Date(kickoffISO);
    if (isNaN(kick)) return { ok: false, error: `We can't read the kickoff time for the ${teamShort(team)} — try again in a minute.` };
    if (kick <= new Date()) return { ok: false, error: 'That game has already started.' };
    const dup = db.picks.find((p) => p.player_id === me.id && p.season === SEASON && p.team === team && p.week !== week);
    if (dup) return { ok: false, error: `You already used the ${teamShort(team)} in week ${dup.week}.` };
    const cur = db.picks.find((p) => p.player_id === me.id && p.season === SEASON && p.week === week);
    // 🚨 Your week locks when YOUR game starts, not when the new one does.
    // Without this you could pick a Thursday team, watch it lose, then switch
    // to a Sunday team — the loss vanishes AND the spent team comes back,
    // because the row is overwritten rather than added to. That breaks "never
    // the same team twice", which is not a matter of interpretation.
    if (cur && cur.team !== team && cur.kickoff && new Date(cur.kickoff) <= new Date()) {
      return { ok: false, error: `Your ${teamShort(cur.team)} game has already started, so week ${week} is locked in.` };
    }
    if (cur) { cur.team = team; cur.kickoff = kickoffISO; cur.entered_by = 'self'; cur.updated_at = new Date().toISOString(); }
    else db.picks.push({ id: db.seq++, player_id: me.id, season: SEASON, week, team, kickoff: kickoffISO, entered_by: 'self', updated_at: new Date().toISOString() });
    if (!this._save(db)) {
      return { ok: false, error: 'This phone would not save your pick — its storage may be full, or Private Browsing is on.' };
    }
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
    // `maxlength` is a keyboard courtesy, not a rule — a paste or a stale page
    // walks straight past it, and a 500-character name breaks a card layout
    // somewhere for everybody.
    if (nm.length > 28) return { ok: false, error: 'That name is too long — 28 letters at most.' };
    if (db.players.some((p) => p.display_name.toLowerCase() === nm.toLowerCase())) {
      return { ok: false, error: 'That name is already in the league — tap it in the list instead.' };
    }
    let token = mintToken(nm);
    while (db.players.some((p) => p.token === token)) token = mintToken(nm);
    db.players.push({ id: db.seq++, display_name: nm, token, is_admin: false, claimed_at: new Date().toISOString() });
    this._save(db);
    return { ok: true, token };
  },
  async releaseMe(token) {
    const db = this._db();
    const me = db.players.find((x) => x.token === token);
    if (!me) return { ok: false, error: 'Unknown link.' };
    if (db.picks.some((x) => x.player_id === me.id && x.season === SEASON)) {
      return { ok: false, error: 'You have already made picks — ask the commissioner to sort this out.' };
    }
    me.claimed_at = null;
    this._save(db);
    return { ok: true };
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
    if (team && isNaN(new Date(kickoffISO))) {
      return { ok: false, error: `We can't read the kickoff time for the ${teamShort(team)} — try again in a minute.` };
    }
    if (team && new Date(kickoffISO) <= new Date()) {
      return { ok: false, error: `That game has already started — you cannot enter a pick for it.` };
    }
    if (team) {
      const dup = db.picks.find((p) => p.player_id === playerId && p.season === SEASON && p.team === team && p.week !== week);
      if (dup) return { ok: false, error: `They already used the ${teamShort(team)} in week ${dup.week}.` };
    }
    // 🚨 A decided week is decided for the commissioner too — otherwise
    // "helping Nana with her late pick" erases the result she already has and
    // hands her spent team back. Same guard as submitPick.
    const cur = db.picks.find((p) => p.player_id === playerId && p.season === SEASON && p.week === week);
    if (cur && cur.team !== team && cur.kickoff && new Date(cur.kickoff) <= new Date()) {
      return { ok: false, error: `Their ${teamShort(cur.team)} game has already started, so week ${week} is locked in.` };
    }
    db.picks = db.picks.filter((p) => !(p.player_id === playerId && p.season === SEASON && p.week === week));
    if (team) db.picks.push({ id: db.seq++, player_id: playerId, season: SEASON, week, team, kickoff: kickoffISO, entered_by: 'admin', updated_at: new Date().toISOString() });
    this._save(db);
    return { ok: true };
  },
};

/* --- Supabase. Plain fetch against PostgREST; no SDK, no build step. ---- */
const SupaStore = {
  kind: 'cloud',
  async _rpc(fn, body) {
    // ⚠️ A ceiling, like the ESPN calls have. Without one, a phone on a bad
    // signal sits on a silently pending write with the dialog already closed
    // and no way to tell whether it worked.
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 20000);
    let r;
    try {
      r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST', signal: ctl.signal,
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
    } catch (e) {
      throw new Error(e && e.name === 'AbortError'
        ? 'That took too long — check your signal and try again.'
        : "Couldn't reach the league. Check your signal and try again.");
    } finally { clearTimeout(to); }
    if (!r.ok) {
      // ⚠️ Read the body. Postgres puts the useful sentence in `message`, and
      // throwing the bare status put "submit_pick failed (409)" on a
      // 95-year-old's screen — which reads as "the app is broken" and ends in
      // a phone call to the commissioner.
      let why = '';
      try { const j = await r.json(); why = j && (j.message || j.hint || j.details) || ''; } catch (e) {}
      throw new Error(why || (r.status >= 500
        ? 'The league is not answering right now. Try again in a minute.'
        : 'That did not save. Try again.'));
    }
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
  releaseMe(token)        { return this._rpc('release_me', { p_token: token }); },
  listPicks()   { return this._get(`picks?season=eq.${SEASON}&select=player_id,week,team,kickoff,entered_by`); },
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

const DEMO_WEEK = 10;  // the demo "today": weeks 1-9 are played, week 10 is in progress
/* Games REMOVED from a demo week, to put teams on bye. Without this the demo
   plays all 32 teams every week and bye handling cannot be exercised at all —
   which is exactly how the admin bye hole survived the first test pass. */
const DEMO_BYES = { 5: 1, 6: 2, 7: 3, 8: 3, 9: 2, 10: 2 };
/* One real tie, so the "neither a win nor a loss" rule can be seen. */
const DEMO_TIE = { week: 3, game: 5 };

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

/* The real slots an NFL week is played in, Eastern, in the order they run.
   `at` is hours from the Sunday-1:00 kickoff, so the whole week hangs off one
   anchor; `state` is what that slot looks like from a Sunday just after one.
   Everyone in this league is on the east coast, so ET labels are the times
   they will actually see on television. */
const DEMO_SLOTS = [
  { key: 'THU',  day: 4, at: -68.75, label: '8:15 PM', state: 'post' },  // Thursday night
  { key: 'SUN1', day: 0, at:   0,    label: '1:00 PM', state: 'in'   },  // the early window
  { key: 'SUN4', day: 0, at:   3.08, label: '4:05 PM', state: 'pre'  },  // late afternoon
  { key: 'SUN425', day: 0, at: 3.42, label: '4:25 PM', state: 'pre'  },
  { key: 'SNF',  day: 0, at:   7.33, label: '8:20 PM', state: 'pre'  },  // Sunday night
  { key: 'MON',  day: 1, at:  31.25, label: '8:15 PM', state: 'pre'  },  // Monday night
];

/* Which slot each game of a week lands in. A real week is one Thursday game,
   most of the slate at 1:00, a handful in the late afternoon, then the two
   night games — and it has to keep that SHAPE at any slate size, because bye
   weeks change how many games there are. */
function demoSlotFor(i, n) {
  if (i === 0) return DEMO_SLOTS[0];                    // Thursday
  if (n >= 5 && i === n - 1) return DEMO_SLOTS[5];      // Monday night
  if (n >= 5 && i === n - 2) return DEMO_SLOTS[4];      // Sunday night
  const mid = n - (n >= 5 ? 3 : 1);                     // games between them
  const late = Math.max(2, Math.round(mid * 0.3));      // the 4:05 / 4:25 window
  const early = mid - late;
  if (i <= early) return DEMO_SLOTS[1];                 // 1:00
  return (i - early) % 2 ? DEMO_SLOTS[2] : DEMO_SLOTS[3];
}

/* The Sunday a demo week is played on, so its labels carry a real date.
   Week 1 of the 2026 season opens Thursday 10 Sep, so Sunday of week N is
   13 Sep + (N-1) weeks. Display only — never a deadline. */
function demoSunday(week) {
  const d = new Date(Date.UTC(SEASON, 8, 13, 17, 0, 0));   // 13 Sep, 1:00 PM ET
  d.setUTCDate(d.getUTCDate() + (week - 1) * 7);
  return d;
}

function demoGames(week) {
  const rnd = mulberry32(week * 7919 + 13);
  const dayMs = 86400000;
  const rec = week > 1 ? demoRecords(week) : null;
  const drop = DEMO_BYES[week] || 0;
  const n = 16 - drop;
  return roundRobin(week - 1).slice(0, n).map((pair, i) => {
    // ⚠️ The INSTANT stays relative to Date.now(), always. Pinning it to a
    // clock time meant opening the demo in the evening found every upcoming
    // game already kicked off and refused every pick. The LABEL is separate
    // (`whenLabel`) and carries the real NFL slot, which is what makes the
    // slate readable — a 5:00 AM kickoff is not a thing.
    const slot = demoSlotFor(i, n);
    let state, date, whenLabel = null;
    const hours = (h) => new Date(Date.now() + h * 3600000);
    const sun = demoSunday(week);
    const dayName = (off) => new Date(sun.getTime() + off * dayMs)
      .toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
    if (week < DEMO_WEEK)      { state = 'post'; date = new Date(Date.now() + (week - DEMO_WEEK) * 7 * dayMs); }
    else if (week > DEMO_WEEK) { state = 'pre';  date = new Date(Date.now() + (week - DEMO_WEEK) * 7 * dayMs); }
    else {
      state = slot.state;
      // 20 minutes past the 1:00 kickoff: the early window is under way, the
      // afternoon and both night games are still there to be picked.
      date = hours(slot.at - 0.34);
    }
    // Every demo game gets a real-looking kickoff, past weeks included.
    const dayOff = slot.day === 4 ? -3 : slot.day === 1 ? 1 : 0;
    whenLabel = `${dayName(dayOff)}, ${slot.label}`;
    if (week === DEMO_WEEK) date.setSeconds(0, 0); else date.setMinutes(0, 0, 0);
    const scored = state === 'post' || state === 'in';
    let hs = scored ? 10 + Math.floor(rnd() * 29) : null;
    let as = scored ? 10 + Math.floor(rnd() * 29) : null;
    // Twenty minutes in is the FIRST QUARTER, so these are first-quarter
    // scores. The old 0.6 scaling put 20-odd points on the board next to a
    // "1Q" clock, which is the kind of detail that makes a fixture feel fake.
    if (state === 'in') { hs = Math.floor(hs * 0.2); as = Math.floor(as * 0.2); }
    if (state === 'post' && week === DEMO_TIE.week && i === DEMO_TIE.game) { as = hs; }

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
      id: `demo-${week}-${i}`, week, date: date.toISOString(), state, whenLabel,
      statusText: state === 'post' ? 'Final'
        // 20 minutes of real time in, allowing for stoppages: mid-first-quarter.
        : state === 'in' ? `1Q · ${5 + Math.floor(rnd() * 5)}:${10 + Math.floor(rnd() * 49)}`
        : whenLabel,
      tv: slot.key === 'THU' ? 'Prime Video' : slot.key === 'MON' ? 'ESPN'
        : slot.key === 'SNF' ? 'NBC' : (i % 3 === 0 ? 'CBS' : 'FOX'),
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
  // ESPN publishes the channel in two shapes and which one it uses varies by
  // sport and by week, so read both — the main Sports-Hub app learned this the
  // same way. `geoBroadcasts` is the richer one when it is there.
  const names = [];
  (comp.geoBroadcasts || []).forEach((b) => {
    const n = (b.media && (b.media.shortName || b.media.callLetters)) || '';
    if (n) names.push(n);
  });
  if (!names.length) (comp.broadcasts || []).forEach((b) => (b.names || []).forEach((n) => n && names.push(n)));
  return {
    id: ev.id, week,
    date: ev.date || comp.date,
    state: st.state || 'pre',                       // 'pre' | 'in' | 'post'
    statusText: st.shortDetail || st.detail || st.description || '',
    tv: [...new Set(names)].join(', '),
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
  // ⚠️ Re-check on the way OUT as well as on the way in: a copy written by a
  // version before this guard existed is already sitting on real phones, and
  // it must not be trusted just because it is there. A bad one is dropped and
  // re-fetched.
  const usable = cached && cached.length && cached.every((g) => g && g.home && g.away
    && typeof g.home.score === 'number' && typeof g.away.score === 'number');
  if (usable) return (S.games[week] = cached);
  if (cached) { try { localStorage.removeItem(ck); } catch (e) {} }

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
  /* 🚨 "Final" is not enough to cache forever — it also has to have SCORES.
     ESPN can report a game `post` with one side's score still null for a
     moment at the final whistle. Caching that pinned the broken copy to the
     device permanently: `gradePick` reads it as pending, so the result never
     counted, the week was never re-fetched, and two relatives could see
     different standings for the same finished game for the rest of the season.
     A week is only frozen once every game is final AND both scores are real
     numbers; anything else is re-fetched next load, which self-heals. */
  const settled = games.length && games.every((g) => g.state === 'post'
    && typeof g.home.score === 'number' && typeof g.away.score === 'number');
  if (settled) jSet(ck, games);
  S.games[week] = games;
  return games;
}

/* Which week are we in? ESPN's dateless scoreboard tells us directly. */
/* ======================================================================
   WHEN THE LEAGUE MOVES ON
   The owner's rule: the app rolls to the following week on **TUESDAY at
   4 AM Eastern** — after Monday night is finished and everyone is asleep,
   and Eastern because everybody in this league is.
   ⚠️ This is the league's OWN clock, not ESPN's. ESPN flips its `week.number`
   on its own schedule (often Tuesday afternoon, sometimes Wednesday), so the
   app could sit on a finished week for a day and a half, still offering picks
   for games that had already been played. The clock decides now; ESPN is only
   asked for scores.
   ⚠️ 4 AM, not midnight, for the same reason Sports-Hub's `sportsDate()` uses
   it: a west-coast Monday-night game can run past midnight Eastern, and
   somebody looking at the app right after it should still see that week.
   ====================================================================== */
const ROLLOVER_HOUR = 4;                       // 4 AM, Eastern
const ROLLOVER_TZ = 'America/New_York';
/* The first rollover of the season: the Tuesday after week 1's Monday night
   game. Week 1 opens Thu 10 Sep 2026, so week 2 begins Tue 15 Sep at 4 AM.
   ⚠️ ONE DATE TO CHANGE EACH SEASON, and it must be a TUESDAY. */
const WEEK2_TUESDAY = Date.UTC(2026, 8, 15);   // 15 Sep 2026

/* Eastern wall-clock parts of an instant. Uses Intl rather than a fixed UTC
   offset so the November switch out of daylight saving is handled for us —
   4 AM Eastern is 08:00 UTC in September and 09:00 UTC in December, and
   hardcoding either one would slip the rollover by an hour for half the
   season. */
function etParts(d) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: ROLLOVER_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  });
  const p = {};
  for (const part of f.formatToParts(d)) if (part.type !== 'literal') p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24 };
}

/* The date the league considers "today": Eastern, with anything before 4 AM
   still belonging to the day before. */
function leagueDay(now) {
  const t = etParts(now);
  const ms = Date.UTC(t.y, t.m - 1, t.d);
  return t.h < ROLLOVER_HOUR ? ms - 86400000 : ms;
}

/* Which week the league is on, from the clock alone. */
function weekFromClock(now) {
  const day = leagueDay(now || new Date());
  if (day < WEEK2_TUESDAY) return 1;
  return Math.min(LAST_WEEK, 2 + Math.floor((day - WEEK2_TUESDAY) / (7 * 86400000)));
}

async function currentWeek() {
  if (S.demo) return DEMO_WEEK;
  return weekFromClock();
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

/* 🚨 The same thing, but safe to show ABOUT SOMEBODY ELSE.
   House rule 3 hides a pick until its own game starts — and a count can give
   it away as surely as a name can. "Teams left" and "best left" are computed
   from what a player has spent, so folding in this week's secret pick drops
   their count by one and removes that team from their best-left list. Since
   the sensible play is usually your best remaining team, the name that
   disappeared very often IS the hidden pick.
   Your own hidden pick is still yours to see; everyone else's is withheld
   until kickoff, exactly as the season grid already does. */
function usedTeamsVisible(playerId, exceptWeek) {
  const mine = S.me && S.me.id === playerId;
  const m = {};
  for (const p of picksOf(playerId)) {
    if (p.week === exceptWeek) continue;
    if (!mine && !pickVisible(p.team, S.games[p.week] || [])) continue;
    m[p.team] = p.week;
  }
  return m;
}

/* Full-season tally for one player. Missed weeks contribute nothing at all
   (house rule 1): not a loss, no points, no team burned. */
function tallyFor(playerId, allGames, uptoWeek) {
  let w = 0, l = 0, t = 0, pts = 0;
  const rows = [];
  // `uptoWeek` exists ONLY so the standings can rank the league as it stood a
  // week ago and show which way each person is moving. Every other caller
  // omits it and gets the full season, unchanged.
  const last = uptoWeek == null ? LAST_WEEK : uptoWeek;
  for (let wk = 1; wk <= last; wk++) {
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

/* The last week that is FINISHED — every game in it final.
   ⚠️ This used to be the last week with any GRADED pick, which mid-week is the
   week in progress: the arrows then measured a half-played week, so they sat
   empty all Sunday morning and appeared one at a time as games ended. The
   owner: "The trend should still be live from the week before... just make it
   show the trend that we have and then when final game in finished we update
   standings for the new." So the arrows hold the completed week's shake-up and
   only move on once the next week is genuinely done. */
function lastCompleteWeek(allGames) {
  for (let wk = LAST_WEEK; wk >= 1; wk--) {
    const games = allGames[wk] || [];
    if (!games.length) continue;
    if (games.every((g) => g.state === 'post')) return wk;
  }
  return 0;
}

/* Where each player sat a week ago, so the table can show an arrow. Returns
   null when there is nothing to compare against (week 1, or a fresh league) —
   an arrow with no history behind it would be a lie. */
function trendMap(allGames) {
  const wk = lastCompleteWeek(allGames);
  if (wk < 2) return null;
  // Both sides are settled weeks, so the arrows are stable: they say what the
  // completed week did to the table and do not flicker while the next one is
  // being played. The note above the table names the week they belong to.
  const baseline = wk;                     // the week whose results these are
  const before = standings(allGames, wk - 1);
  const now = standings(allGames, wk);
  const was = new Map(before.map((r) => [r.p.id, r.rank]));
  const m = new Map();
  for (const r of now) {
    const w = was.get(r.p.id);
    if (w != null) m.set(r.p.id, w - r.rank);   // positive = climbed
  }
  m.baseline = baseline;
  return m;
}

/* House rule 5: wins first, cumulative margin as the tiebreak. */
function standings(allGames, uptoWeek) {
  return S.players
    .map((p) => ({ p, ...tallyFor(p.id, allGames, uptoWeek) }))
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
/* ⚠️ Deliberately UNUSED for win probability since v39 — the percentage comes
   from the moneyline only. Kept as the demo's own spread-to-price conversion
   (`demoGames` prices its fixtures with it) and as a note that the conversion
   exists and was rejected for the real read. */
const NFL_SD = 13.5;   // points; the textbook spread-to-win-probability scale

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

  /* Win probability comes from the DE-VIGGED MONEYLINE and nothing else.
     ⚠️ It used to fall back to converting the spread through a normal curve
     (`ncdf(-spread / 13.5)`), which is a rule of thumb, not a market price:
     it assumes every game has the same scoring variance and it invents a
     precision the book never quoted. The owner's call — "the win percentage
     should be based on money line not the spread as well" — and he is right,
     because the two look identical on screen while only one of them is
     actually somebody's money.
     The SPREAD is still read, still shown on the card and still names the
     favourite when no moneyline is posted; it just no longer becomes a
     percentage. When there is no moneyline the card shows the projected
     winner with no number, which is the honest amount to say. */
  let pHome = null, basis = null;
  const ph = mlProb(o.hML), pa = mlProb(o.aML);
  if (ph != null && pa != null && ph + pa > 0) { pHome = ph / (ph + pa); basis = 'moneyline'; }

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
      + (pct ? `, and the moneyline puts them at about a ${pct}% chance of winning.`
             : '. No moneyline is posted, so there is no percentage to quote.'));
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
      <div class="sh-when">${esc(g.state === 'post' ? (g.statusText || 'Final') : kickWhen(g))}${g.tv ? ` · ${esc(g.tv)}` : ''}</div>
    </div>`;

  if (r.fav) {
    const pct = r.pFav == null ? null : Math.round(r.pFav * 100);
    h += `<div class="sh-proj">
      <div class="sh-k">${g.state === 'post' ? 'Was projected to win' : 'Projected winner'}</div>
      <div class="sh-team">${esc(teamName(r.fav.abbr))}</div>
      <div class="sh-sub">${r.fromRecords ? 'on records only — no line posted'
        : `${esc(teamShort(r.fav.abbr))} by ${r.favBy}${pct ? ` · about ${pct}% on the moneyline` : ''}`}</div>
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
let _pinned = 0;
function pinBody() {
  if (_pinned++) return;
  _scrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_scrollY}px`;
  document.body.style.width = '100%';
}
function unpinBody(force) {
  if (force) _pinned = 0; else if (--_pinned > 0) return;
  _pinned = 0;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, _scrollY);
}

/* ---- confirm a pick ---------------------------------------------------
   A tap on a team never saves straight away. Shaky hands, pockets and
   scrolling all produce accidental taps, and a pick spends a team for the
   whole season — so it always goes through this. */
/* "away at the Lions · Thu, 11/19, 8:15 PM" — the one description of a game,
   used by the pick card and the confirmation alike so they can never word the
   same fixture differently. */
function matchupLine(g, team) {
  if (!g) return '';
  const opp = g.home.abbr === team ? g.away.abbr : g.home.abbr;
  const where = g.home.abbr === team ? 'at home to' : 'away at';
  return `${where} the ${teamShort(opp)} · ${kickWhen(g)}`;
}

function askConfirm(team) {
  const games = S.games[S.week] || [];
  const g = gameForTeam(games, team);
  if (!g) { say('bad', `The ${teamShort(team)} are not playing in week ${S.week}.`); render(); return; }
  closeSheet();                                  // never stack two overlays
  S.confirming = { team, gameId: g.id };
  const opp = g.home.abbr === team ? g.away.abbr : g.home.abbr;
  const where = g.home.abbr === team ? 'at home to' : 'away at';
  const current = pickIn(S.me.id, S.week);
  const replacing = current && current.team !== team ? current.team : null;

  $('#confirm-body').innerHTML = `
    <div class="cf-k">Week ${S.week} — is this right?</div>
    <div class="cf-team">
      ${logoHTML(team, false)}
      <span>${esc(teamName(team))}</span>
    </div>
    <p class="cf-game">${esc(matchupLine(g, team))}</p>
    ${g.tv ? `<p class="cf-tv">📺 ${esc(g.tv)}</p>` : ''}
    ${replacing ? `<p class="cf-replace">This replaces your pick of the ${esc(teamShort(replacing))}.</p>` : ''}
    <button class="btn pri wide cf-yes" id="cf-yes">Yes — that's my pick</button>
    <button class="btn wide cf-no" id="cf-no">No, go back</button>
    <p class="cf-note">You can still change it any time before this game starts.</p>`;
  $('#confirm').hidden = false;
  pinBody();
  $('#cf-no').focus({ preventScroll: true });    // the SAFE option takes focus
}
/* Choosing who you are is a bigger commitment than a pick — it takes a name
   off the list for everybody else — so it confirms too. */
function askName(playerId) {
  const p = S.players.find((x) => x.id === playerId);
  if (!p) return;
  S.naming = playerId;
  S.confirming = { name: p.display_name };
  $('#confirm-body').innerHTML = `
    <div class="cf-k">Just to be sure</div>
    <div class="cf-team"><span>Are you ${esc(p.display_name)}?</span></div>
    <p class="cf-game">This phone will remember you, and this name comes off the list for everyone else.</p>
    <button class="btn pri wide cf-yes" id="nm-yes">Yes — that's me</button>
    <button class="btn wide cf-no" id="nm-no">No, go back</button>`;
  $('#confirm').hidden = false;
  pinBody();
  $('#nm-no').focus({ preventScroll: true });
}

function closeConfirm() {
  if (!S.confirming) return;
  S.confirming = null;
  $('#confirm').hidden = true;
  unpinBody();
}

function openSheet(gameId) {
  const g = (S.games[S.week] || []).find((x) => x.id === gameId);
  if (!g) return;
  S.sheet = gameId;
  $('#sheet-body').innerHTML = matchupHTML(g);
  $('#sheet').hidden = false;
  // iOS Safari ignores `overflow:hidden` on <body>, so the page carries on
  // scrolling behind the sheet. Pinning it is the only lock that holds.
  pinBody();
  $('#sheet-close').focus({ preventScroll: true });
}
function closeSheet() {
  if (!S.sheet) return;
  S.sheet = null;
  $('#sheet').hidden = true;
  unpinBody();
}

/* ======================================================================
   DEEP STATS
   Everything here is derived from picks x the ESPN scoreboard. Two rules it
   must never break:
     1. Anything that reads MORE THAN ONE player's picks goes through
        pickVisible() — a stats screen must not become a side channel for
        reading somebody's hidden pick before kickoff.
     2. Anything built on the betting market states how many picks it could
        actually use. We only ever see a finished game's LAST posted line, so
        these are closing-line approximations, not pick-time ones.
   ====================================================================== */

/* Every team's win rate, from the most recent record we have seen for them. */
function teamWinPct() {
  const out = {};
  const weeks = Object.keys(S.games).map(Number).sort((a, b) => a - b);
  for (const wk of weeks) {
    for (const g of S.games[wk] || []) {
      for (const side of ['home', 'away']) {
        const r = recTotals(g[side].rec);
        if (!r) continue;
        const n = r.w + r.l + r.t;
        if (n) out[g[side].abbr] = (r.w + r.t / 2) / n;
      }
    }
  }
  return out;
}

/* The market's probability that a given pick won, or null when no line. */
function pickProb(team, week) {
  const g = gameForTeam(S.games[week] || [], team);
  if (!g) return null;
  const r = matchupRead(g);
  if (r.pHome == null) return null;
  return g.home.abbr === team ? r.pHome : 1 - r.pHome;
}

function statsFor(playerId) {
  const t = tallyFor(playerId, S.games);
  const graded = t.rows.filter((r) => r.pick && ['win', 'loss', 'tie'].includes(r.status));

  // Luck vs skill: actual wins against what the market expected.
  let xw = 0, xwN = 0;
  for (const r of graded) {
    const p = pickProb(r.pick.team, r.week);
    if (p != null) { xw += p; xwN++; }
  }

  // Chalk vs dog: how big a favourite they tend to back (all picks, not just
  // graded — this is about style, not results).
  let chalk = 0, chalkN = 0, dogWins = 0;
  for (const r of t.rows) {
    if (!r.pick) continue;
    const p = pickProb(r.pick.team, r.week);
    if (p == null) continue;
    chalk += p; chalkN++;
    if (p < 0.5 && r.status === 'win') dogWins++;
  }

  // Streaks. A missed week neither extends nor breaks a run (house rule 1).
  let cur = 0, best = 0;
  for (const r of t.rows) {
    if (!r.pick) continue;
    if (r.status === 'win') { cur++; best = Math.max(best, cur); }
    else if (r.status === 'loss' || r.status === 'tie') cur = 0;
  }

  // Bench strength: how good are the teams they have NOT spent.
  // ⚠️ The VISIBLE view — this is rendered about other people.
  const pct = teamWinPct();
  const used = usedTeamsVisible(playerId, null);
  const left = ABBRS.filter((a) => !used[a]);
  const rated = left.filter((a) => pct[a] != null);
  const bench = rated.length ? rated.reduce((s, a) => s + pct[a], 0) / rated.length : null;
  const benchTop = rated.slice().sort((a, b) => pct[b] - pct[a]).slice(0, 3);

  const wins = graded.filter((r) => r.status === 'win');
  const losses = graded.filter((r) => r.status === 'loss');
  const blowout = wins.length ? wins.reduce((a, b) => (b.margin > a.margin ? b : a)) : null;
  const beat = losses.length ? losses.reduce((a, b) => (b.margin < a.margin ? b : a)) : null;

  return {
    t, graded: graded.length,
    xw, xwN, luck: xwN ? t.w - xw : null,
    chalk: chalkN ? chalk / chalkN : null, chalkN, dogWins,
    streak: cur, best,
    bench, benchTop, teamsLeft: left.length,
    blowout, beat,
    avgWin: wins.length ? wins.reduce((s, r) => s + r.margin, 0) / wins.length : null,
    avgLoss: losses.length ? losses.reduce((s, r) => s + r.margin, 0) / losses.length : null,
  };
}

/* How often somebody went their own way. Only weeks where at least two picks
   are PUBLIC count, so this can never leak a hidden pick. */
function contrarianFor(playerId) {
  let sum = 0, n = 0;
  for (let wk = 1; wk <= LAST_WEEK; wk++) {
    const games = S.games[wk] || [];
    if (!games.length) continue;
    const field = S.picks.filter((p) => p.week === wk && pickVisible(p.team, games));
    if (field.length < 2) continue;
    const mine = field.find((p) => p.player_id === playerId);
    if (!mine) continue;
    const same = field.filter((p) => p.player_id !== playerId && p.team === mine.team).length;
    sum += same / (field.length - 1);
    n++;
  }
  return n ? { score: 1 - sum / n, weeks: n } : null;
}

/* Who had the best week. Same sort key as the season standings. */
function weeklyWinners() {
  const out = [];
  for (let wk = 1; wk <= LAST_WEEK; wk++) {
    const games = S.games[wk] || [];
    if (!games.length) continue;
    let best = null;
    for (const p of S.players) {
      const pk = pickIn(p.id, wk);
      if (!pk) continue;
      const g = gradePick(pk.team, games);
      if (g.status !== 'win' && g.status !== 'loss' && g.status !== 'tie') continue;
      const rank = (g.status === 'win' ? 1 : 0) * 1000 + g.margin;
      if (!best || rank > best.rank) best = { rank, p, team: pk.team, margin: g.margin, status: g.status };
    }
    if (best && best.status === 'win') out.push({ week: wk, ...best });
  }
  return out.reverse();
}

/* Which teams the family has leaned on. Public picks only. */
function teamPopularity() {
  const n = {};
  for (const p of S.picks) {
    const games = S.games[p.week] || [];
    if (!games.length || !pickVisible(p.team, games)) continue;
    n[p.team] = (n[p.team] || 0) + 1;
  }
  return Object.entries(n).sort((a, b) => b[1] - a[1]);
}

/* With the crowd, or against it.
   For every week that is settled, work out which team the family piled onto
   and how that pick did — then, per person, how often they were on it and
   what happened when they were not.
   ⚠️ Everything here reads MORE THAN ONE player's picks, so every read goes
   through `pickVisible()`. Without that this card would be a side channel for
   seeing a hidden Thursday pick, which house rule 3 exists to prevent. */
function crowdStats() {
  const weeks = [];
  for (let wk = 1; wk <= LAST_WEEK; wk++) {
    const games = S.games[wk] || [];
    if (!games.length) continue;
    const picks = S.picks.filter((p) => p.week === wk && pickVisible(p.team, games)
      && ['win', 'loss', 'tie'].includes(gradePick(p.team, games).status));
    if (picks.length < 3) continue;              // no "crowd" to speak of
    const n = {};
    for (const p of picks) n[p.team] = (n[p.team] || 0) + 1;
    const best = Math.max(...Object.values(n));
    if (best < 2) continue;                      // everyone went their own way
    const top = Object.keys(n).filter((t) => n[t] === best);
    if (top.length > 1) continue;                // no single crowd pick
    weeks.push({ wk, team: top[0], share: best / picks.length,
      status: gradePick(top[0], games).status, picks });
  }

  const crowdW = weeks.filter((w) => w.status === 'win').length;
  const crowdL = weeks.filter((w) => w.status === 'loss').length;
  const crowdT = weeks.filter((w) => w.status === 'tie').length;   // house rule 6

  const per = S.players.map((pl) => {
    let withN = 0, alone = 0, aw = 0, al = 0;
    for (const w of weeks) {
      const mine = w.picks.find((p) => p.player_id === pl.id);
      if (!mine) continue;
      if (mine.team === w.team) { withN++; continue; }
      alone++;
      const st = gradePick(mine.team, S.games[w.wk] || []).status;
      if (st === 'win') aw++; else if (st === 'loss') al++;
    }
    const played = withN + alone;
    return { pl, withN, alone, aw, al, played, rate: played ? withN / played : null };
  }).filter((r) => r.played > 0).sort((a, b) => a.rate - b.rate || b.played - a.played);

  return { weeks, crowdW, crowdL, crowdT, per };
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
  const live = S.liveWeek;
  // Wandering a few weeks back and not finding the way home is exactly the
  // kind of stuck this app cannot afford, so the way back is always one tap
  // and always says where it goes.
  const lost = live && week !== live
    ? `<button class="btn pri wide backnow" data-nowweek="${live}">${
        week < live ? '↩︎' : '↩︎'} Back to this week (Week ${live})</button>`
    : '';
  return `<div class="wknav">
    <button class="btn sm" data-week="${prev}" ${prev ? '' : 'disabled'} aria-label="Previous week">‹</button>
    <span class="wknav-l">Week ${week}${live && week !== live ? '<i>not this week</i>' : ''}</span>
    <button class="btn sm" data-week="${next}" ${next ? '' : 'disabled'} aria-label="Next week">›</button>
  </div>${lost}`;
}

function teamBtnHTML(abbr, opts) {
  const o = opts || {};
  const cls = ['pk', o.chosen ? 'chosen' : '', o.used ? 'used' : ''].filter(Boolean).join(' ');
  const tag = o.used ? `<span class="pk-used-tag">USED WK ${o.used}</span>` : (o.rec ? `<span class="pk-rec">${esc(o.rec)}</span>` : '');
  const score = o.score == null ? '' : `<span class="pk-rec">${o.score}</span>`;
  // The market's chance this side wins THIS game — the same number the ⓘ card
  // shows, so the two can never disagree. Absent when no line is posted.
  const win = o.win == null ? '' : `<span class="pk-win">${Math.round(o.win * 100)}% to win</span>`;
  return `<button class="${cls}" type="button" data-team="${abbr}" ${o.disabled ? 'disabled' : ''}>
    ${logoHTML(abbr, true)}
    <span class="pk-name">${esc(teamShort(abbr))}</span>
    ${score || tag}
    ${win}
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

  // Before their first pick, tapping the wrong name is still trivially undone.
  if (!picksOf(S.me.id).length) {
    h += `<p class="notme">Not ${esc(S.me.display_name)}? <button id="notme" class="linkbtn">Tap here to pick a different name</button></p>`;
  }

  h += weekNavHTML(S.week);

  if (locked) {
    const g = gradePick(mine.team, games);
    // "Lost by 7 — 19-26" put an em dash and a hyphen side by side, so the
    // margin and the score read as one run of numbers. The score is its own
    // element now and names both teams, so there is nothing to untangle.
    const score = g.opp && g.mine != null
      ? `${esc(teamShort(mine.team))} ${g.mine},&nbsp;${esc(teamShort(g.opp))} ${g.them}` : '';
    const verdict = g.status === 'win' ? `Won by ${g.margin}`
      : g.status === 'loss' ? `Lost by ${Math.abs(g.margin)}`
      : g.status === 'tie'  ? 'Tied — worth 0 points' : '';
    // ⚠️ A live game's score used to live ONLY in the "Already started" list,
    // which the condensed view folds away — so it moves onto the card, or the
    // one game you care most about becomes the one game with no score.
    const liveScore = myGame && myGame.state === 'in' && myGame.home.score != null
      ? `${esc(teamShort(mine.team))} ${g.mine != null ? g.mine : (myGame.home.abbr === mine.team ? myGame.home.score : myGame.away.score)},&nbsp;${
          esc(teamShort(myGame.home.abbr === mine.team ? myGame.away.abbr : myGame.home.abbr))} ${
          myGame.home.abbr === mine.team ? myGame.away.score : myGame.home.score}` : '';
    const res = g.status === 'pending'
      ? `<span class="lk-res">Playing now…</span>${
          liveScore ? `<span class="lk-score">${esc(myGame.statusText || 'In progress')} · ${liveScore}</span>` : ''}${
          myGame && myGame.tv ? `<span class="lk-meta">📺 ${esc(myGame.tv)}</span>` : ''}`
      : verdict ? `<span class="lk-res ${g.status}">${esc(verdict)}</span>${
          score ? `<span class="lk-score">Final score: ${score}</span>` : ''}`
      : '';
    // The whole card carries the result: green won, red lost, gold still
    // playing. Looking back through the season should not need reading.
    const tone = ['win', 'loss', 'tie'].includes(g.status) ? ` ${g.status}` : '';
    h += `<div class="locked${tone}">
      <div class="lk-k">Your Week ${S.week} pick — locked in</div>
      <div class="lk-team">${esc(teamName(mine.team))}</div>
      <div class="lk-sub">${res}</div>
    </div>`;
  } else if (mine) {
    // Everything you would otherwise have to go hunting for: who they play,
    // when, and where to watch it.
    h += `<div class="locked">
      <div class="lk-k">Your Week ${S.week} pick</div>
      <div class="lk-team">${esc(teamName(mine.team))}</div>
      <div class="lk-sub">${myGame ? `<span class="lk-meta">${esc(matchupLine(myGame, mine.team))}</span>` : ''}${
        myGame && myGame.tv ? `<span class="lk-meta">📺 ${esc(myGame.tv)}</span>` : ''}
        <span class="lk-hint">You can still change it — just tap a different team.</span></div>
    </div>`;
  } else {
    h += `<h2 class="hh">Week ${S.week} — tap who you think wins</h2>
      <p class="sub">Pick one team. You can change your mind right up until that game starts.
        The percentages come from the moneyline — the betting market's own price on each team winning, not a guarantee.</p>`;
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
    const r = matchupRead(g);
    const row = (side) => {
      const abbr = g[side].abbr;
      const isUsed = used[abbr];
      return teamBtnHTML(abbr, {
        chosen: mine && mine.team === abbr,
        used: isUsed,
        rec: g[side].rec,
        score: started ? g[side].score : null,
        disabled: started || !!isUsed,
        // Only before kickoff: a chance-to-win on a game already played is
        // noise at best and contradicts the score at worst.
        win: started || r.pHome == null ? null : (side === 'home' ? r.pHome : 1 - r.pHome),
      });
    };
    const tip = started ? '' : (r.fav && r.hasLine
      ? `${teamShort(r.fav.abbr)} -${r.favBy}`
      : r.fav ? `${teamShort(r.fav.abbr)} favoured` : 'no line yet');
    return `<div class="game ${started ? 'started' : ''}">
      <div class="game-when">
        <span>${esc(started ? (g.statusText || 'Final') : kickWhen(g))}</span>
        <button class="ibtn" type="button" data-info="${esc(g.id)}" aria-label="Matchup details">${
          tip ? `<span class="ibtn-l">${esc(tip)}</span>` : ''}<span class="ibtn-i">ⓘ</span></button>
      </div>
      <div class="game-pair">${row('away')}<span class="game-at">at</span>${row('home')}</div>
    </div>`;
  };

  /* Once YOUR game has kicked off there is nothing left to do this week —
     the pick cannot change and no other team can be picked — so the rest of
     the slate stops being a set of choices and becomes something to follow.
     It folds into one row per game. Nothing is removed: the toggle restores
     the full cards, and every row still opens the same matchup card.
     `S.fullWeek` holds a week number rather than a boolean so that walking
     to another week starts condensed again, with no extra bookkeeping. */
  const showFull = !locked || S.fullWeek === S.week;

  if (showFull) {
    h += open.map((g) => gameHTML(g, false)).join('');
    if (shut.length) {
      h += `<h2 class="hh">Already started</h2><p class="sub">These can't be picked any more.</p>`;
      h += shut.map((g) => gameHTML(g, true)).join('');
    }
    if (locked) h += `<button class="btn wide" id="cg-less" type="button">Back to the short list</button>`;
  } else {
    const rest = games.filter((g) => g !== myGame);
    const cgRow = (g) => {
      const done = g.state !== 'pre';
      const side = (k) => {
        const win = done && g[k].score != null && g[other(k)].score != null && g[k].score > g[other(k)].score;
        return `<span class="cg-side${win ? ' w' : ''}"><span class="cg-t">${esc(teamShort(g[k].abbr))}</span>${
          done ? `<span class="cg-s">${g[k].score == null ? '–' : g[k].score}</span>` : ''}</span>`;
      };
      // Under a FINAL heading, repeating "Final" on every row says nothing —
      // the day it was played does. A status that carries more than that
      // ("Final/OT") still wins.
      // Under a FINAL heading, repeating "Final" on every row says nothing —
      // the DAY it was played does, and the weekday alone says it in a third
      // of the width, which the two long-name-plus-score rows need.
      const when = g.state === 'post'
        ? (g.statusText && !/^final$/i.test(g.statusText.trim()) ? g.statusText
           : String(kickWhen(g)).split(',')[0].trim())
        : g.state === 'in' ? (g.statusText || 'Live') : kickClock(g);
      return `<button class="cg${done ? ' done' : ''}${g.state === 'in' ? ' live' : ''}" type="button" data-info="${esc(g.id)}">
        <span class="cg-when">${esc(when)}</span>
        <span class="cg-body">${side('away')}<span class="cg-at">at</span>${side('home')}</span>
        <span class="cg-go">›</span>
      </button>`;
    };
    const sec = (label, list, byDay) => {
      if (!list.length) return '';
      if (!byDay) return `<div class="cg-lab">${esc(label)}</div>` + list.map(cgRow).join('');
      // A day change has to be visible, or Friday's 5:00 AM reads as today's.
      const days = [...new Set(list.map(kickDay))];
      return days.map((d, i) => `<div class="cg-lab">${esc(i ? d : `${label} · ${d}`)}</div>`
        + list.filter((g) => kickDay(g) === d).map(cgRow).join('')).join('');
    };
    h += `<div class="restbar">
      <div class="rb-h"><b>Rest of week ${S.week}</b><span>${rest.length} game${rest.length === 1 ? '' : 's'}</span></div>
      <p class="rb-n">Your pick is locked in${myGame && myGame.state === 'in' ? ' and playing' : ''} — these are just to follow along.</p>
    </div>
    <div class="cglist">${
      sec('Playing now', rest.filter((g) => g.state === 'in'), false)
      + sec('Final', rest.filter((g) => g.state === 'post'), false)
      + sec('Still to play', rest.filter((g) => g.state === 'pre'), true)}</div>
    <button class="btn wide" id="cg-more" type="button">Show the full matchups</button>`;
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
  // ⚠️ `S.games` (the whole season, week -> games), NOT `games`, which is only
  // THIS week's slate — passing that produced no arrows at all and no error,
  // exactly the kind of silent nothing a test has to catch rather than an eye.
  const trend = trendMap(S.games);
  const trendNote = trend
    ? `▲▼ is how the table moved when week ${trend.baseline} was played.`
    : '';

  const grid = S.stView === 'grid';
  let h = msgHTML() + `<h2 class="hh">Standings</h2>
    <p class="sub">${grid
      ? 'Every pick of the season, week by week.'
      : `Sorted by wins. Points are how much your teams have won or lost by, added up all season — that's the tiebreaker.${
          trendNote ? ` ${trendNote}` : ''}`}</p>
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
    <thead><tr><th>#</th><th>Name</th><th>W-L-T</th><th>Points</th></tr></thead><tbody>`;
  for (const r of rows) {
    const cls = r.pts > 0 ? 'p' : r.pts < 0 ? 'n' : '';
    // Stacked under the rank rather than given a column of its own: the names
    // only just fit, and a "Teams left"-shaped column is what crowded them.
    const mv = trend ? trend.get(r.p.id) : null;
    // ⚠️ Nothing at all when nobody moved. A dash under every rank read as a
    // stray mark — or worse, as a minus sign attached to the number — and
    // mid-week that is EVERY row. Absence is the cleaner way to say "no
    // change", and the note above the table already explains the arrows.
    const arrow = !mv ? ''
      : mv > 0 ? `<span class="tr up" title="Up ${mv} since last week">▲${mv}</span>`
      : `<span class="tr dn" title="Down ${-mv} since last week">▼${-mv}</span>`;
    h += `<tr class="${r.p.id === S.me.id ? 'you' : ''}">
      <td>${r.rank}${arrow}</td>
      <td class="nm">${esc(r.p.display_name)}</td>
      <td>${r.w}-${r.l}${r.t ? `-${r.t}` : ''}</td>
      <td class="pts ${cls}">${signed(r.pts)}</td>
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
      ? (r.opp ? `vs ${teamShort(r.opp)} · ${kickWhen(r.game)}` : 'not played yet')
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

function pctStr(x) { return x == null ? '—' : `${Math.round(x * 100)}%`; }

function renderStats() {
  const host = $('#s-stats');
  let h = msgHTML() + `<h2 class="hh">Stats</h2>
    <p class="sub">The deeper read. None of it changes how the league is scored.</p>`;

  // ---- who's had the best weeks ----
  const wins = weeklyWinners();
  h += `<h2 class="hh">Week winners</h2>
    <p class="sub">Best result each week — it resets every Sunday, so being well behind in the table doesn't stop you winning a week.</p>
    <div class="card">`;
  if (!wins.length) h += `<p class="note">No completed weeks yet.</p>`;
  else h += wins.slice(0, 8).map((w) => `<div class="wp-row">
      <span class="wp-nm">Week ${w.week}</span>
      <span class="wp-team">${esc(w.p.display_name)}</span>
      <span class="wp-res w">${esc(teamShort(w.team))} ${signed(w.margin)}</span>
    </div>`).join('');
  h += `</div>`;

  // ---- per player ----
  h += `<h2 class="hh">Everyone</h2>
    <p class="sub">The big number is how strong each person's <b>unused teams</b> are — you can never pick a team twice, so that is what they have left to play with. Higher is better. Tap anyone for more.</p>
    <div class="card">`;
  const rows = S.players.map((p) => ({ p, s: statsFor(p.id) }))
    .sort((x, y) => (y.s.bench ?? -1) - (x.s.bench ?? -1));
  for (const { p, s: st } of rows) {
    h += `<button class="statrow" data-pstat="${p.id}">
      <span class="sr-nm">${esc(p.display_name)}${p.id === S.me.id ? ' (you)' : ''}</span>
      <span class="sr-v">${st.bench == null ? '—' : pctStr(st.bench)}</span>
      <span class="sr-k">${st.teamsLeft} teams left${st.benchTop.length ? ` · best: ${esc(teamShort(st.benchTop[0]))}` : ''}</span>
      <span class="sr-go">›</span>
    </button>`;
  }
  h += `</div>`;

  // ---- head to head ----
  // ---- with the crowd, or against it ----
  const cw = crowdStats();
  h += `<h2 class="hh">With the crowd, or against it</h2>
    <p class="sub">Most weeks the family piles onto one team. This is who goes along with it, who doesn't, and whether the crowd is actually right.</p>
    <div class="card">`;
  if (!cw.weeks.length) {
    h += `<p class="note">Nothing settled yet — this fills in once a few weeks have been played.</p>`;
  } else {
    const cn = cw.crowdW + cw.crowdL;
    h += `<div class="cw-head">
      <b>The team most of the family picked has won ${cw.crowdW} of ${cn} week${cn === 1 ? '' : 's'}${
        cw.crowdT ? `, and tied ${cw.crowdT}` : ''}.</b>
      <span class="cw-n">${cw.crowdW * 2 > cn ? 'Following the crowd has paid off so far.'
        : cw.crowdW * 2 < cn ? 'Following the crowd has NOT paid off so far.'
        : 'The crowd is exactly even so far.'}</span>
    </div>
    <div class="cw-list">
      <div class="cw-row cw-hd">
        <span></span>
        <span class="cw-h2">Went with them</span>
        <span class="cw-h3">On your own</span>
      </div>`;
    for (const r of cw.per) {
      const solo = r.alone ? `${r.aw}-${r.al}` : '—';
      // ⚠️ A COUNT, not a percentage. "0%" beside "4-1" is what made the owner
      // ask whether 4-1 was somehow 0%, and at five weeks a percentage is
      // false precision anyway — the same reason head to head was a count.
      h += `<div class="cw-row">
        <span class="cw-nm">${esc(r.pl.display_name)}${r.pl.id === S.me.id ? ' (you)' : ''}</span>
        <span class="cw-with">
          <span class="cw-bar"><i style="width:${Math.round(r.rate * 100)}%"></i></span>
          <span class="cw-v">${r.withN} of ${r.played}</span>
        </span>
        <span class="cw-s ${r.aw > r.al ? 'p' : r.al > r.aw ? 'n' : ''}">${solo}</span>
      </div>`;
    }
    h += `</div>
      <p class="cw-n cw-key">Two different sets of weeks: the ones you went with the crowd, and how you did on the rest.</p>`;
  }
  h += `</div>`;

  // ---- team popularity ----
  const pop = teamPopularity();
  h += `<h2 class="hh">Most-picked teams</h2>
    <p class="sub">Most leaned on this season. Only counts games that have kicked off, so nothing upcoming is revealed.</p>
    <div class="card">`;
  if (!pop.length) h += `<p class="note">Nothing to count yet.</p>`;
  else {
    const max = pop[0][1];
    h += pop.slice(0, 10).map(([t, n]) => `<div class="popr">
      <span class="pop-t">${esc(teamShort(t))}</span>
      <span class="pop-bar"><i style="width:${Math.round((n / max) * 100)}%"></i></span>
      <span class="pop-n">${n}</span>
    </div>`).join('');
  }
  h += `</div>`;
  host.innerHTML = h;
}

/* One player's full numbers. Compact rows with a SHORT footnote under each —
   enough to know what a number means, not a lecture. Anyone who wants the
   full definitions opens the accordion at the bottom. */
function statRow(label, value, foot, tone) {
  const col = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : '';
  return `<tr><td>${esc(label)}</td><td${col ? ` style="color:${col}"` : ''}>${value}${
    foot ? `<span class="st-n">${esc(foot)}</span>` : ''}</td></tr>`;
}

function openPlayerStats(playerId) {
  const p = S.players.find((x) => x.id === playerId);
  if (!p) return;
  const st = statsFor(playerId);
  const con = contrarianFor(playerId);
  const you = p.id === S.me.id;
  const yr = you ? 'your' : 'their';

  let h = `<div class="sh-head"><div class="sh-title">${esc(p.display_name)}</div>
    <div class="sh-when">${st.t.w}-${st.t.l}${st.t.t ? `-${st.t.t}` : ''} · ${signed(st.t.pts)} points</div></div>`;

  h += `<h3 class="sh-h">Teams still in hand</h3><table class="sh-t"><tbody>
    ${statRow('How strong', st.bench == null ? '—' : pctStr(st.bench),
      st.bench == null ? 'not enough games played yet' : 'average win rate of unused teams')}
    ${statRow('How many', String(st.teamsLeft), `of 32, over ${LAST_WEEK} weeks`)}
    ${statRow('Best left', st.benchTop.length ? st.benchTop.map(teamShort).map(esc).join(' · ') : '—',
      'strongest teams not yet used')}
  </tbody></table>`;

  h += `<h3 class="sh-h">Luck or judgement</h3>`;
  if (st.xwN >= 3) {
    const l = st.luck;
    h += `<table class="sh-t"><tbody>
      ${statRow('Wins expected', st.xw.toFixed(1), `what the odds valued those ${st.xwN} picks at`)}
      ${statRow('Wins actually', String(st.t.w), `of those ${st.xwN}`)}
      ${statRow('Difference', `<b>${l >= 0 ? '+' : ''}${l.toFixed(1)}</b>`,
        l >= 0 ? 'better than the odds implied' : 'below what the odds implied', l >= 0 ? 'pos' : 'neg')}
    </tbody></table>
    <p class="note sh-note">Final odds, not the odds when the pick was made. ${st.xwN} games is a small sample.</p>`;
  } else {
    h += `<p class="note">Only ${st.xwN} picks so far were on games with a betting line — too few to say anything.</p>`;
  }

  h += `<h3 class="sh-h">Style</h3><table class="sh-t"><tbody>
    ${statRow('Backs favourites', st.chalkN >= 3 ? pctStr(st.chalk) : '—',
      st.chalkN >= 3 ? 'average chance the books gave them' : 'not enough priced games')}
    ${statRow('Underdog wins', String(st.dogWins), 'won with a team expected to lose')}
    ${statRow('Own way', con ? pctStr(con.score) : '—',
      con ? `picks nobody else made, over ${con.weeks} weeks` : 'not enough public picks yet')}
  </tbody></table>`;

  h += `<h3 class="sh-h">Form</h3><table class="sh-t"><tbody>
    ${statRow('Current run', st.streak ? `${st.streak} in a row` : 'none', 'a missed week does not break it')}
    ${statRow('Best run', st.best ? `${st.best} in a row` : '—', 'longest of the season')}
    ${statRow('Average win by', st.avgWin == null ? '—' : `+${st.avgWin.toFixed(1)}`,
      'margin is the tiebreaker', st.avgWin == null ? '' : 'pos')}
    ${statRow('Average loss by', st.avgLoss == null ? '—' : st.avgLoss.toFixed(1),
      'narrow losses cost far less', st.avgLoss == null ? '' : 'neg')}
    ${statRow('Biggest win', st.blowout ? `${esc(teamShort(st.blowout.pick.team))} ${signed(st.blowout.margin)}` : '—',
      st.blowout ? `week ${st.blowout.week}` : '', st.blowout ? 'pos' : '')}
    ${statRow('Worst beat', st.beat ? `${esc(teamShort(st.beat.pick.team))} ${signed(st.beat.margin)}` : '—',
      st.beat ? `week ${st.beat.week}` : '', st.beat ? 'neg' : '')}
  </tbody></table>`;

  // The long version, folded away for anyone who actually wants it.
  h += `<details class="usedstrip statwhat">
    <summary>What do these mean?</summary>
    <div class="ub" style="display:block">
      <p><b>How strong.</b> You can never pick a team twice, so the teams you have not spent are your ammunition. This is their average win rate — higher means the good ones are still available.</p>
      <p><b>Wins expected.</b> Take each pick, ask what chance the bookmakers gave that team, and add them up. That is roughly what those picks were worth to anybody.</p>
      <p><b>Difference.</b> Actual wins minus expected. Positive means results went your way; negative means the picks were fine and the ball was not. It cannot tell good judgement from a hot run.</p>
      <p><b>Backs favourites.</b> The average chance the books gave your picks. Near 50% is coin flips; 70%+ means you stick to safe teams. Neither is better.</p>
      <p><b>Own way.</b> How often you picked a team nobody else in the family picked that week. 100% means you never once doubled up.</p>
      <p><b>Average win / loss by.</b> Margin is the standings tiebreaker, so comfortable wins and narrow losses both help.</p>
    </div>
  </details>`;

  $('#sheet-body').innerHTML = h;
  S.sheet = `stats:${playerId}`;
  $('#sheet').hidden = false;
  pinBody();
  $('#sheet-close').focus({ preventScroll: true });
}

function renderAdmin() {
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
    <details class="usedstrip">
      <summary>What do these buttons do?</summary>
      <div class="ub" style="display:block">
        <p><b>Put back on list</b> — makes their name tappable on the join screen again. Two reasons you'd use it: somebody tapped the <em>wrong</em> name, or somebody got a new phone and needs to sign in on it. Their picks are kept either way, and a phone they are already signed in on keeps working.</p>
        <p><b>View as</b> — see the app exactly as they see it, to help over the phone. A bar across the top brings you back to your own account.</p>
        <p><b>Remove</b> — deletes them <em>and all their picks</em>. There is no undo. If you only want to hand their name to somebody else, use Put back on list instead.</p>
      </div>
    </details>
    <div class="card">`;
  for (const p of S.players) {
    // A <details> per person: eighteen names stay scannable, and the four
    // actions are one tap away instead of 340px of buttons each.
    h += `<details class="plrow">
      <summary><span class="pn">${esc(p.display_name)}${p.is_admin ? ' 👑' : ''}</span>${
        p.claimed ? '' : '<span class="pn-wait">not joined yet</span>'}</summary>
      <div class="plrow-acts">
        ${p.claimed ? `<button class="btn sm" data-unclaim="${p.id}" title="Put this name back on the join list">Put back on list</button>` : ''}
        <button class="btn sm" data-view="${p.id}">View as</button>
        <button class="btn sm" data-del="${p.id}" title="Remove from the league" aria-label="Remove ${esc(p.display_name)}">Remove</button>
      </div>
    </details>`;
  }
  if (!S.players.length) h += `<p class="note">Nobody yet. Add yourself first — the first person added becomes the commissioner.</p>`;
  h += `</div>
    <div class="card">
      <label class="fld"><span>Add somebody</span><input maxlength="28" id="ad-name" type="text" placeholder="e.g. Nana" autocomplete="off"></label>
      <button class="btn pri wide" id="ad-add">Add to the league</button>
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
    <p class="sub">The real season starts 10 Sep 2026, so until then there is nothing to grade. Demo mode invents a season already in progress so every screen has something real in it.</p>
    <div class="card">
      <b>What's loaded, and what to go and look at</b>
      <ul class="steps demo-guide" style="margin-top:10px">
        <li><b>18 relatives, 9 weeks played, week 10 live.</b> One game finished Thursday, three are in progress right now, the rest kick off later.</li>
        <li><b>Standings → Week by week.</b> Scroll it sideways. Green won, red lost, the number under each team is the margin.</li>
        <li><b>Four people haven't joined yet</b> (Colleen, Brian, Maureen, Little Jimmy). Open the league link in a private tab to see the join screen and tap one of them.</li>
        <li><b>Nana missed weeks 2 and 7</b> — check My Picks and see it cost her nothing.</li>
        <li><b>There's a real tie in week 3</b> — neither a win nor a loss.</li>
        <li><b>Grandpa Joe and Patti haven't picked this week</b> — they're on the chase list at the bottom of Standings.</li>
        <li><b>Teams are on bye from week 5 onward</b> — the Pick screen names them, and the admin form below won't offer them.</li>
        <li><b>Tap ⓘ on any game</b> for the projected winner, the line and both records.</li>
      </ul>
    </div>
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
/* Eighteen, to match the real league. The last four are deliberately left
   UNCLAIMED and pickless so the join screen and the first-run welcome can
   both be exercised. */
const DEMO_FAMILY = [
  'Jack', 'Nana', 'Uncle Bob', 'Aunt Mary', 'Cousin Dave', 'Kate', 'Tommy',
  'Grandpa Joe', 'Aunt Sue', 'Michael', 'Rose', 'Danny', 'Patti', 'Uncle Rich',
  'Colleen', 'Brian', 'Maureen', 'Little Jimmy',
];
const DEMO_UNCLAIMED = 4;                       // have not tapped their name yet
const DEMO_NO_PICK_THIS_WEEK = ['Grandpa Joe', 'Patti'];   // the chase list
const DEMO_MISSED = { Nana: [2, 7], 'Uncle Rich': [4] };   // missed weeks cost nothing

async function seedDemo() {
  lsSet('survivor:demo', '1');
  S.demo = true;
  lsDel('survivor:welcomed');
  clearWeekCache();
  jSet('survivor:local', { players: [], picks: [], seq: 1 });
  const store = LocalStore;
  // The first add bootstraps the commissioner; every add after it must carry
  // that token, or addPlayer correctly refuses as "not an admin".
  let adminToken = null;
  for (const n of DEMO_FAMILY) {
    const r = await store.addPlayer(adminToken, n);
    if (r && r.ok && !adminToken) adminToken = r.token;
  }

  const db = store._db();
  const rnd = mulberry32(20260902);

  // Who has actually joined. The last few have not tapped their name yet, so
  // the join screen has something to offer and the welcome card can be seen.
  const claimedCount = db.players.length - DEMO_UNCLAIMED;
  db.players.forEach((p, i) => { p.claimed_at = i < claimedCount ? new Date().toISOString() : null; });

  // Pre-compute each week's schedule once — 10 weeks x 16 games otherwise gets
  // rebuilt for every player.
  const weeks = {};
  for (let wk = 1; wk <= DEMO_WEEK; wk++) {
    const byTeam = {};
    for (const g of demoGames(wk)) { byTeam[g.away.abbr] = g; byTeam[g.home.abbr] = g; }
    weeks[wk] = byTeam;
  }

  for (const p of db.players) {
    if (!p.claimed_at) continue;                       // hasn't joined, so no picks
    const used = new Set();
    const missed = DEMO_MISSED[p.display_name] || [];
    for (let wk = 1; wk <= DEMO_WEEK; wk++) {
      if (missed.includes(wk)) continue;               // a missed week costs nothing
      if (wk === DEMO_WEEK && DEMO_NO_PICK_THIS_WEEK.includes(p.display_name)) continue;
      const free = Object.keys(weeks[wk]).filter((t) => !used.has(t));
      if (!free.length) continue;
      const team = free[Math.floor(rnd() * free.length)];
      used.add(team);
      // ⚠️ The kickoff has to be seeded too, or every demo pick looks like it
      // was made on a game that never started and the "your week is locked"
      // guard has nothing to test — i.e. the fixture could not express the
      // rule it is meant to prove.
      const g = (weeks[wk] || {})[team];
      db.picks.push({
        id: db.seq++, player_id: p.id, season: SEASON, week: wk, team,
        kickoff: g && g.date ? g.date : null,
        entered_by: 'self', updated_at: new Date().toISOString(),
      });
    }
  }
  store._save(db);
  lsSet('survivor:me', db.players[0].token);           // land on the commissioner
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
    // 🚨 Blame the right thing. If the browser is not storing anything, the
    // link is fine and "ask the commissioner" sends somebody down a dead end
    // they cannot get out of — the token is in the URL, so this screen would
    // otherwise be permanent.
    if (!storageWorks()) {
      host.innerHTML = `<h2 class="hh">This phone isn't saving anything</h2>
        <div class="warnbox">
          <b>⚠️ Nothing is wrong with your link</b>
          <p>Your browser is refusing to remember anything, so the app can't sign you in or keep your pick.</p>
          <p>This is usually <b>Private Browsing</b>. Close this tab, open your normal browser window, and tap the link again.</p>
        </div>`;
      return;
    }
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
        <label class="fld"><span>Your name</span><input maxlength="28" id="first-name" type="text" placeholder="e.g. Jack" autocomplete="off"></label>
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
        <label class="fld"><span>Type your name</span><input maxlength="28" id="join-name" type="text" placeholder="e.g. Aunt Mary" autocomplete="name"></label>
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
  for (const s of ['pick', 'standings', 'history', 'stats', 'admin']) $(`#s-${s}`).hidden = s !== name;
  $$('#tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.screen === name));
  // Only a genuine screen change jumps to the top. render() runs after every
  // pick and every week change too, and yanking the page up each time loses
  // the reader's place in a long list of games.
  if (changed || scroll) window.scrollTo(0, 0);
}

function paintViewAs() {
  const bar = $('#viewas');
  if (!bar) return;
  const mine = lsGet('survivor:viewas', '');
  // Stale key (already back on our own account) — clear it rather than nag.
  if (mine && S.me && mine === S.me.token) { lsDel('survivor:viewas'); }
  const on = !!lsGet('survivor:viewas', '') && S.me;
  bar.hidden = !on;
  if (!on) return;
  bar.innerHTML = `<span>👀 You're viewing as <b>${esc(S.me.display_name)}</b></span>
    <button class="btn sm" id="va-back">Back to my account</button>`;
}

function render() {
  $('#boot').hidden = true;
  $('#tabs').hidden = false;
  $('#tab-admin').hidden = !S.me.is_admin;
  $('#whoami').hidden = false;
  $('#whoami').innerHTML = `Signed in as <b>${esc(S.me.display_name)}</b> · Week ${S.week}${S.demo ? ' · <b>DEMO</b>' : ''}`;
  $('#ft-mode').innerHTML = `<span class="pillmode">${S.store.kind === 'cloud' ? '☁️ shared league' : '📱 this device only'}${S.demo ? ' · demo season' : ''} · ${APP_V}</span>`;
  paintViewAs();
  if (S.screen === 'pick') renderPick();
  else if (S.screen === 'standings') renderStandings();
  else if (S.screen === 'history') renderHistory();
  else if (S.screen === 'stats') renderStats();
  else if (S.screen === 'admin') renderAdmin();
  setScreen(S.screen);
}

async function reloadPicks() {
  try { S.picks = await S.store.listPicks(); } catch (e) { console.warn('[survivor] picks reload failed', e); }
}
async function reloadPlayers() {
  try { S.players = await S.store.listPlayers(); } catch (e) { console.warn('[survivor] players reload failed', e); }
}
/* Weeks are fetched a few at a time rather than all at once. On a first visit
   in week 15 the old Promise.all fired 16 scoreboard requests inside 200ms —
   a burst that a CDN is entitled to throttle, and that nobody needs, since
   finished weeks are cached on the device afterwards and never re-fetched. */
const FETCH_LANES = 3;
async function ensureWeeks(weeks) {
  const todo = weeks.filter((w) => w >= 1 && w <= LAST_WEEK && !(S.games[w] && S.games[w].length));
  if (!todo.length) return;
  // The current week first — it is the one the screen is waiting on.
  todo.sort((a, b) => Math.abs(a - S.week) - Math.abs(b - S.week));
  let i = 0;
  const lane = async () => { while (i < todo.length) await weekGames(todo[i++]); };
  await Promise.all(Array.from({ length: Math.min(FETCH_LANES, todo.length) }, lane));
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

/* The only path that writes a pick from the player's side. */
async function savePick(team) {
  const g = gameForTeam(S.games[S.week] || [], team);
  S.saving = true;   // an auto-update must not reload over a pick being written
  // On a bad signal this is a network round trip with the dialog already
  // closed, so SAY something. Silence reads as "did that work?" and the usual
  // answer to that is tapping again.
  say('ok', `Saving your ${teamShort(team)} pick…`);
  render();
  try {
    const r = await S.store.submitPick(S.me.token, S.week, team, g && g.date)
      .catch((err) => ({ ok: false, error: String(err.message || err) }));
    if (r && r.ok) { say('ok', `Locked in: the ${teamShort(team)} for week ${S.week}.`); await reloadPicks(); }
    else say('bad', (r && r.error) || 'Could not save that pick.');
  } finally { S.saving = false; }
  render();
}

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
    if (to === 'standings' || to === 'history' || to === 'stats') {
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
  if (t.dataset.claim) { askName(Number(t.dataset.claim)); return; }
  if (t.id === 'nm-yes') {
    const id = S.naming;
    if (!id) { closeConfirm(); return; }
    t.disabled = true;
    closeConfirm();
    S.naming = null;
    const r = await S.store.claimPlayer(id).catch((e) => ({ ok: false, error: String(e.message || e) }));
    if (r && r.ok && r.token) { signInWith(r.token); return; }
    say('bad', (r && r.error) || 'Could not sign you in.');
    await reloadPlayers(); renderPicker(); return;
  }
  if (t.id === 'nm-no') { S.naming = null; closeConfirm(); renderPicker(); return; }

  // "That isn't me" — undo a mis-tap without needing the commissioner.
  if (t.id === 'notme') {
    const r = await S.store.releaseMe(S.me.token).catch((e) => ({ ok: false, error: String(e.message || e) }));
    if (r && r.ok) { lsDel('survivor:me'); lsDel('survivor:welcomed'); location.search = ''; return; }
    say('bad', (r && r.error) || 'Could not undo that.');
    render(); return;
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
  if (t.dataset.stview) { S.stView = t.dataset.stview; render(); return; }
  if (t.dataset.pstat) { openPlayerStats(Number(t.dataset.pstat)); return; }

  // --- confirm a pick ---
  if (t.id === 'cf-yes') {
    const team = S.confirming && S.confirming.team;
    if (!team) { closeConfirm(); return; }
    t.disabled = true;
    $('#cf-no').disabled = true;
    closeConfirm();
    await savePick(team);
    return;
  }
  if (t.id === 'cf-no' || t.dataset.cfcancel) { closeConfirm(); return; }

  // --- matchup sheet ---
  if (t.id === 'cg-more') { S.fullWeek = S.week; render(); return; }
  if (t.id === 'cg-less') { S.fullWeek = null; render(); return; }
  if (t.dataset.info) { openSheet(t.dataset.info); return; }
  if (t.dataset.close) { closeSheet(); return; }
  if (t.dataset.sheetpick) { askConfirm(t.dataset.team); return; }

  // --- week nav ---
  if (t.dataset.nowweek) {
    S.week = Number(t.dataset.nowweek);
    S.weekPinned = false;          // let it follow the season again
    S.apWeek = S.week;
    await ensureWeeks([S.week]);
    render();
    return;
  }
  if (t.dataset.week && t.dataset.week !== 'null') {
    S.week = Number(t.dataset.week);
    S.weekPinned = true;
    await ensureWeeks([S.week]);
    render();
    return;
  }

  // --- making a pick ---
  if (t.dataset.team && S.screen === 'pick') {
    askConfirm(t.dataset.team);
    return;
  }

  // --- admin ---
  if (t.id === 'ad-copyjoin') {
    if (!linkWarnOK('The league link')) return;
    const url = location.origin + location.pathname;
    const ok2 = await copyText(`Family survivor pool — tap this, then tap your name:\n${url}`);
    say(ok2 ? 'ok' : 'bad', ok2 ? 'Copied. Paste it into the family group text.' : `Could not copy. The link is ${url}`);
    render(); return;
  }
  if (t.dataset.view) {
    const tok = await S.store.tokenFor(S.me.token, Number(t.dataset.view));
    if (!tok) { say('bad', 'Could not open that account.'); render(); return; }
    // Keep the ORIGINAL admin token if we are already viewing as somebody —
    // hopping from one person to another must not lose the way home.
    if (!lsGet('survivor:viewas', '')) lsSet('survivor:viewas', S.me.token);
    lsSet('survivor:me', tok);
    location.search = `?u=${encodeURIComponent(tok)}`;
    return;
  }
  if (t.id === 'va-back') {
    const mine = lsGet('survivor:viewas', '');
    lsDel('survivor:viewas');
    if (mine) { lsSet('survivor:me', mine); location.search = `?u=${encodeURIComponent(mine)}`; }
    else location.search = '';
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
    /* ⚠️ The player's own pick flow has asked "is this right?" since v18. This
       one wrote straight through — so a mis-tapped name or week on a phone
       silently replaced somebody's pick, and the commissioner was never even
       told they had one. Two 18-long dropdowns is exactly where that happens. */
    const whoP = S.players.find((x) => x.id === who);
    const had = pickIn(who, wk);
    if (had && had.team !== team) {
      const msg = team
        ? `${whoP ? whoP.display_name : 'They'} already have the ${teamShort(had.team)} for week ${wk}.\n\nReplace it with the ${teamShort(team)}?`
        : `Clear ${whoP ? whoP.display_name + "'s" : 'their'} week ${wk} pick (the ${teamShort(had.team)})?\n\nThey will have no pick for that week.`;
      if (!confirm(msg)) { say('ok', 'Left it alone.'); render(); return; }
    }
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
  if (t.id === 'dm-toggle') {
    // ⚠️ Demo mode swaps the SCHEDULE for a synthetic one but keeps writing to
    // the real league, so a pick made while it is on carries a made-up kickoff
    // and can slip past the real deadline. Fine on a test device, not on a
    // live one — so say so before turning it on.
    if (!S.demo && isShared() && !confirm(
      'Demo mode replaces the real NFL schedule with a made-up one, but this phone is connected to the REAL league.\n\n'
      + 'Any pick you make while it is on is written to the real league with a fake kickoff time.\n\nTurn it on anyway?')) return;
    lsSet('survivor:demo', S.demo ? '0' : '1'); location.reload(); return;
  }
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
  if (!e.target.classList || !e.target.classList.contains('sheet-back')) return;
  if (S.confirming) closeConfirm(); else closeSheet();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (S.confirming) closeConfirm();
  else if (S.sheet) closeSheet();
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
  S.liveWeek = S.week;
  S.apWeek = S.week;
  const weeks = [];
  for (let w = 1; w <= S.week; w++) weeks.push(w);
  for (const p of S.picks) if (!weeks.includes(p.week)) weeks.push(p.week);
  await ensureWeeks(weeks);
  render();

  // While games are in progress the standings genuinely move, so refresh.
  setInterval(async () => {
    if (document.hidden) return;
    /* 🚨 The WEEK is re-derived every time, unconditionally. This used to sit
       behind the "is anything still being played" test below — but once the
       last game of a week goes final that test is false FOREVER on that page,
       so the interval quietly stopped doing anything at all and the app never
       crossed into the next week. On a phone that matters: the app is never
       really closed, so somebody could sit on Monday's finished results until
       they happened to force-quit, and never be shown the new week's games at
       all. Reading the clock is free — there is no reason to gate it. */
    const wk = await currentWeek();
    const rolled = wk !== S.liveWeek;
    S.liveWeek = wk;
    if (wk !== S.week && !S.weekPinned) { S.week = wk; S.apWeek = wk; }

    // Re-FETCHING scores is the expensive half, so that still only happens
    // while something is unfinished — or when the week has just turned over.
    // Deciding that from the stale snapshot is deliberate and safe: an empty
    // week counts as unfinished, so the first kickoff of the day is always
    // discovered.
    const games = S.games[S.week] || [];
    const unfinished = !games.length || games.some((g) => g.state !== 'post');
    if (!unfinished && !rolled) return;
    delete S.games[S.week]; memCache[`w${S.week}`] = null;
    await ensureWeeks([S.week]);
    if (S.screen !== 'admin' && !S.sheet) render();
  }, 60000);
}

/* ======================================================================
   UPDATES — a new version installs itself
   The worker is network-first, so a COLD open always lands on the newest
   deploy. This is the other case, and on a phone it is the common one: the
   app is never really closed. A Home Screen icon resumes the SAME page for
   days, so a change could sit on the server all week and the person holding
   the phone would never see it.

   ⚠️ v23 put a button here instead and the owner rejected it — correctly.
   For this league the whole promise is that nobody has to do anything, and
   an "Update now" bar is a chore handed to twenty relatives who have no way
   to judge whether it matters. It reloads itself again.

   Two independent signals, because each alone has a hole:
     1. A HEAD on survivor.js, comparing the ETag/Last-Modified against the
        copy we booted with. This needs NO version bookkeeping — it notices
        any ship at all. That matters: a version number somebody has to
        remember to bump is a number that eventually lies, which is exactly
        how `?v=1` survived sixteen releases here.
     2. The service worker taking over (`controllerchange`). Free, but it
        only fires when sw.js ITSELF changed, so it is the weaker of the two.
   ====================================================================== */

const UPDATE_POLL_MS = 15 * 60 * 1000;  // a quiet background check
const UPDATE_MIN_GAP = 30 * 1000;       // don't re-check on every tab flap
let updStamp = null;                    // fingerprint of the copy we are RUNNING
let updLastCheck = 0;

/* The fingerprint. Whatever the host gives us — GitHub Pages sends an ETag,
   a plain file server usually sends Last-Modified — as long as BOTH reads
   are taken the same way, a change means a change. Null when the host sends
   neither, in which case signal 2 is all we have and that is fine. */
async function fileStamp() {
  try {
    const res = await fetch('survivor.js', { method: 'HEAD', cache: 'no-store' });
    if (!res || !res.ok) return null;
    const s = [res.headers.get('etag'), res.headers.get('last-modified'),
               res.headers.get('content-length')].map((v) => v || '').join('|');
    return /[^|]/.test(s) ? s : null;
  } catch (e) { return null; }
}

/* The ONE thing a silent reload must not interrupt: a pick being confirmed
   or written. Everything else on screen is re-derived on the way back up, so
   losing it costs nothing. Waits rather than skips — the update still lands,
   a few seconds later. */
function applyUpdate() {
  if (S.reloading) return;
  if (S.confirming || S.saving) { setTimeout(applyUpdate, 4000); return; }
  S.reloading = true;
  // The worker fetches every same-origin file with `cache: 'no-store'`, so a
  // plain reload is enough — there is no stale copy left for it to serve.
  location.reload();
}

async function checkForUpdate(force) {
  if (S.reloading) return;
  const now = Date.now();
  if (!force && now - updLastCheck < UPDATE_MIN_GAP) return;
  updLastCheck = now;
  const s = await fileStamp();
  if (!s) return;
  if (updStamp == null) { updStamp = s; return; }   // the first read IS what we run
  if (s !== updStamp) applyUpdate();
}

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js')
    .then((reg) => { if (reg) setInterval(() => { reg.update().catch(() => {}); }, UPDATE_POLL_MS); })
    .catch((e) => console.warn('[survivor] sw', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;   // first install replaced nothing
    applyUpdate();
  });
}

checkForUpdate(true);
// Coming back to the app is the moment a stale page is most likely, and the
// cheapest moment to swap it.
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
window.addEventListener('focus', () => { checkForUpdate(); });
setInterval(() => { checkForUpdate(); }, UPDATE_POLL_MS);

boot();

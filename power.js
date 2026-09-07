/* ============================================================================
   🏆 POWER RANKINGS LAB — power.js
   ----------------------------------------------------------------------------
   A weekly power ranking for the owner's ESPN fantasy football league
   ("Nectars Bologna", league 993612).

   THE SHAPE OF IT, because it drives every decision below:
     1. The MODEL pre-builds a ranking each week from real league data.
     2. The OWNER overrides it — reorder anyone, write a take on anyone.
     3. The result SHIPS to the league as a link or as plain text.

   The model is the starting point, never the answer. A power ranking is an
   opinion column; the numbers exist so the opinion has something to argue with,
   which is why a row the owner moved says where the model had it.

   ⚠️ THE MODEL IS A HEURISTIC, NOT A FITTED ONE. The weights below are a
   judgment call, not a measurement — there is no graded outcome to fit a power
   ranking against the way app.js fits the betting model (see CLAUDE.md,
   "⏳ Open measurements"). It is labelled as such in the UI. Do not present it
   as validated, and do not "tune" it as though there were a sample.

   Standalone page: no shared code with app.js, its own tiny helpers. It reads
   the same Render backend the Fantasy tab does — one endpoint, /season, which
   the backend serves off its already-cached League snapshot.
   ========================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Same resolution the app uses, including the localStorage override — so
   pointing the app at a different backend points this page at it too. */
const API = (() => {
  try { return localStorage.getItem('sportshub:api'); } catch (_) { return null; }
})() || 'https://sports-hub-fantasy-api.onrender.com';

/* Render's free tier sleeps after ~15 min idle and takes 30-60s to wake, so the
   leash matches the app's (app.js gives any FANTASY_API call 45s). */
const API_TIMEOUT = 45000;

const K_DRAFT = 'powerlab:draft';   // the week being edited (autosaved)
const K_PUB = 'powerlab:pub';       // published weeks, keyed by rank key — drives ▲▼ movement
const K_SEASON = 'powerlab:season'; // last good /season payload, so the page paints offline

const MAX_COMMENT = 240;
const RECENT_N = 3;                 // weeks in the "recent form" window

/* ⚠️ Judgment calls, not fitted numbers — see the header note.
   allPlay is the heaviest because it is the one input immune to schedule luck:
   it scores every team against the WHOLE league each week, so a 1-3 team that
   outscored nine opponents reads as good, which is the entire point of a power
   ranking as opposed to just printing the standings. record is the lightest for
   the mirror-image reason — it is the most luck-contaminated number on the page
   — but it is not zero, because a league argues about records. */
const W = { allPlay: 0.40, ppg: 0.25, recent: 0.25, record: 0.10 };

/* Manager names, mirroring LEAGUE_ORDER in app.js. Display-only garnish: a row
   renders fine with no match, so a renamed team degrades to just its name. */
const MANAGERS = {
  'thurgood marshall': 'Gotch', samrizz: 'Riz', cummish: 'Hurd', 'cheeky clapz': 'Hyman',
  christel: 'Christel', 'slob on my cobb': 'Slemp', 'morning woods': 'Woods',
  'goff hits women': 'Zach', cc: 'CC', 'current champ': 'McD', gmdd: 'Buley', 'future champ': 'Wolff',
};
const mgrFor = (name) => MANAGERS[String(name || '').toLowerCase().trim()] || '';
/* A manager label that just repeats the team name is noise ("CC CC"). */
const mgrLabel = (name) => {
  const m = mgrFor(name);
  return m && m.toLowerCase() !== String(name || '').toLowerCase().trim() ? m : '';
};

/* "2026-09-07" reads like a database field. */
function niceDate(iso) {
  const d = iso ? new Date(iso + 'T12:00:00') : new Date();
  if (isNaN(d)) return iso || '';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const S = {
  season: null,      // /season payload
  byline: '',        // whose rankings these are — carried into the share
  key: null,         // rank key = weeks played (0 = preseason)
  order: [],         // [teamId] — the owner's order
  comments: {},      // teamId -> take
  model: {},         // teamId -> the rank the MODEL gave, so a moved row can say so
  scores: {},        // teamId -> model score
  ready: false,      // did the model have anything to work with?
  stale: false,      // painted from cache rather than a live pull
  shared: null,      // decoded payload when opened via #r=
};

/* ---------------------------------------------------------------- storage -- */
const load = (k, d) => { try { const r = JSON.parse(localStorage.getItem(k) || 'null'); return r == null ? d : r; } catch (_) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

/* ------------------------------------------------------------------ data -- */
async function fetchJSON(url, ms = API_TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function loadSeason() {
  try {
    const d = await fetchJSON(`${API}/api/fantasy/football/season`);
    if (!d || !Array.isArray(d.teams) || !d.teams.length) throw new Error('empty');
    save(K_SEASON, { at: Date.now(), data: d });
    return { data: d, stale: false };
  } catch (_) {
    const c = load(K_SEASON, null);
    if (c && c.data) return { data: c.data, stale: true, at: c.at };
    return null;
  }
}

/* ----------------------------------------------------------------- model -- */
/* A week counts as PLAYED for a team when it posted a score. This deliberately
   matches the backend's own all-play rule (`if not mine: continue`), so the
   two never disagree about how many weeks are in the sample. ESPN pads `scores`
   with 0 for every unplayed week, so a length check would count the whole
   17-week season from day one. */
const played = (scores) => (scores || []).filter((s) => Number(s) > 0);

function weeksPlayed(teams) {
  return teams.reduce((m, t) => Math.max(m, played(t.scores).length), 0);
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/* Map a z-score onto 0..1 so the four inputs are commensurable before they are
   weighted. ±3 SD is the clamp; with a 12-team league nothing realistic gets
   near it, so in practice this is a linear spread around the league average. */
function zNorm(vals) {
  const m = mean(vals);
  const sd = Math.sqrt(mean(vals.map((v) => (v - m) * (v - m)))) || 1;
  return vals.map((v) => Math.max(0, Math.min(1, 0.5 + (v - m) / sd / 6)));
}

/* Builds the week's ranking. Returns { ready, order, model, scores, rows }.
   `ready:false` means the model genuinely has nothing (no games played) — the
   page then hands over an unranked league rather than inventing an order. */
function buildModel(season) {
  const teams = season.teams || [];
  const wp = weeksPlayed(teams);
  if (!wp) {
    return { ready: false, weeks: 0, order: teams.map((t) => t.teamId), model: {}, scores: {}, rows: {} };
  }
  const ap = season.allPlay || {};
  const base = teams.map((t) => {
    const ps = played(t.scores);
    const a = ap[t.teamId] || { w: 0, l: 0 };
    const apGames = (a.w || 0) + (a.l || 0);
    const w = Number(t.wins) || 0, l = Number(t.losses) || 0, ti = Number(t.ties) || 0;
    const games = w + l + ti;
    return {
      teamId: t.teamId,
      ppg: mean(ps),
      recent: mean(ps.slice(-Math.min(RECENT_N, ps.length))),
      allPlayPct: apGames ? a.w / apGames : 0.5,
      winPct: games ? (w + 0.5 * ti) / games : 0.5,
      apW: a.w || 0, apL: a.l || 0,
    };
  });
  const ppgN = zNorm(base.map((b) => b.ppg));
  const recN = zNorm(base.map((b) => b.recent));
  const scores = {}, rows = {};
  base.forEach((b, i) => {
    scores[b.teamId] = 100 * (
      W.allPlay * b.allPlayPct + W.ppg * ppgN[i] + W.recent * recN[i] + W.record * b.winPct
    );
    rows[b.teamId] = b;
  });
  const order = base.slice()
    .sort((x, y) => scores[y.teamId] - scores[x.teamId])
    .map((b) => b.teamId);
  const model = {};
  order.forEach((id, i) => { model[id] = i + 1; });
  return { ready: true, weeks: wp, order, model, scores, rows };
}

/* --------------------------------------------------------------- labels -- */
const keyLabel = (k) => (k === 0 ? 'Preseason' : `After Week ${k}`);
const teamById = (id) => (S.season.teams || []).find((t) => t.teamId === id) || { team: '?', teamId: id };

function recordOf(t) {
  const w = Number(t.wins) || 0, l = Number(t.losses) || 0, ti = Number(t.ties) || 0;
  return ti ? `${w}-${l}-${ti}` : `${w}-${l}`;
}

/* Movement vs the last week the owner actually PUBLISHED. No published prior
   week means no arrows at all — inventing movement against the model's own
   previous guess would be movement the league never saw. */
function prevOrder() {
  const pub = load(K_PUB, {});
  for (let k = S.key - 1; k >= 0; k--) {
    if (pub[k] && Array.isArray(pub[k].order) && pub[k].order.length) return pub[k];
  }
  return null;
}
function moveFor(prev, id, idx) {
  if (!prev) return null;
  const was = prev.order.indexOf(id);
  if (was < 0) return null;
  return was - idx; // positive = climbed
}
/* Only ACTUAL movement renders. A bare "—" under a rank number reads as a
   glitch rather than as "held its spot" — the v196 stray-dash lesson — and
   every real power-ranking column omits it too. */
const moveStr = (m) => (!m ? '' : m > 0 ? `▲${m}` : `▼${-m}`);
const hasMove = (m) => !!m;

/* ---------------------------------------------------------------- state --- */
function restoreOrBuild() {
  const built = buildModel(S.season);
  S.key = built.weeks;
  S.ready = built.ready;
  S.model = built.model;
  S.scores = built.scores;
  S.rows = built.rows;

  const d = load(K_DRAFT, null);
  /* An in-progress draft is only restored for the SAME week. When a new week's
     results land, the key moves and the model builds a fresh ranking — that is
     the "pre-built each week" behaviour, and it can't silently overwrite edits,
     because last week's edits belong to a week that is already published. */
  if (d && d.key === S.key && Array.isArray(d.order) && d.order.length) {
    const live = new Set(S.season.teams.map((t) => t.teamId));
    // Drop anyone who left the league, append anyone who joined, so a roster
    // change can never make a team vanish from the rankings.
    S.order = d.order.filter((id) => live.has(id));
    S.season.teams.forEach((t) => { if (!S.order.includes(t.teamId)) S.order.push(t.teamId); });
    S.comments = d.comments || {};
    S.byline = d.byline || defaultByline();
  } else {
    S.order = built.order.slice();
    S.comments = {};
    S.byline = S.byline || defaultByline();
    persist();
  }
}

/* Default the byline to the owner's own team — it's the name the league knows
   them by, and it means sharing works without filling anything in first. */
function defaultByline() {
  const me = (S.season.teams || []).find((t) => t.isMe);
  return me ? me.team : '';
}

function persist() {
  save(K_DRAFT, { key: S.key, order: S.order, comments: S.comments, byline: S.byline, at: Date.now() });
}

function move(id, to) {
  const from = S.order.indexOf(id);
  if (from < 0) return;
  to = Math.max(0, Math.min(S.order.length - 1, to));
  if (to === from) return;
  S.order.splice(from, 1);
  S.order.splice(to, 0, id);
  persist();
  paintRank();
}

/* ------------------------------------------------------------ share I/O --- */
/* base64url over UTF-8. btoa is Latin-1 only, so an emoji in a take (and there
   will be emoji in the takes) throws unless the string is encoded first. The
   byte array is walked in chunks because String.fromCharCode(...bytes) blows
   the call stack on a payload this size. */
function b64u(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* The payload is SELF-CONTAINED — names, records, takes and all. A recipient
   opens it cold with no backend call: the rankings are the owner's editorial
   content, and a link that re-derives them from a live feed would show a
   different ranking a week later than the one that was sent. */
function payload() {
  const prev = prevOrder();
  return {
    v: 1,
    k: S.key,
    l: keyLabel(S.key),
    b: (S.byline || '').slice(0, 40),
    d: new Date().toISOString().slice(0, 10),
    r: S.ready ? 1 : 0,
    o: S.order.map((id, i) => {
      const t = teamById(id);
      const row = (S.rows || {})[id];
      return [
        t.team || '',
        recordOf(t),
        row ? Math.round(row.ppg * 10) / 10 : null,
        (S.comments[id] || '').slice(0, MAX_COMMENT),
        S.model[id] || null,
        moveFor(prev, id, i),
      ];
    }),
  };
}
const shareURL = () => location.href.split('#')[0] + '#r=' + b64u(JSON.stringify(payload()));

function shareText() {
  const p = payload();
  const L = [`🏆 POWER RANKINGS — ${p.l}`, p.b ? `${p.b}'s rankings` : '', ''].filter((x, i) => i !== 1 || x);
  p.o.forEach((row, i) => {
    const [name, rec, ppg, note, , mv] = row;
    const mgr = mgrLabel(name);
    const bits = [rec];
    if (ppg != null) bits.push(`${ppg} ppg`);
    L.push(`${i + 1}. ${hasMove(mv) ? moveStr(mv) + ' ' : ''}${name}${mgr ? ` (${mgr})` : ''} — ${bits.join(' · ')}`);
    if (note) L.push(`   ${note}`);
  });
  L.push('', 'Full rankings:', shareURL());
  return L.join('\n');
}

async function copyText(txt) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(txt); return true; }
  } catch (_) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, txt.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) { return false; }
}

let TOAST_T = null;
function toast(msg) {
  let n = $('#pr-toast');
  if (!n) { n = el('div', 'pr-toast'); n.id = 'pr-toast'; n.setAttribute('role', 'status'); document.body.appendChild(n); }
  n.textContent = msg;
  n.classList.add('on');
  clearTimeout(TOAST_T);
  TOAST_T = setTimeout(() => n.classList.remove('on'), 2800);
}

/* Neither the share sheet nor the clipboard worked — put it on screen,
   pre-selected. 16px, per the iOS focus-zoom rule. */
function shareFallback(label, txt) {
  const host = $('#pr-share-out');
  if (!host) return;
  host.innerHTML = `<div class="pr-share-out"><div class="t">${esc(label)} — select and copy:</div><textarea readonly rows="8"></textarea></div>`;
  const ta = host.querySelector('textarea');
  ta.value = txt; // set as a value, never interpolated into markup
  ta.focus(); ta.select();
}

/* Sharing IS publishing — it snapshots the week into the archive so next week's
   ▲▼ movement is measured against what the league actually saw. Stated on the
   button's helper line, because a hidden side effect is a bad side effect. */
function publish() {
  const pub = load(K_PUB, {});
  pub[S.key] = { order: S.order.slice(), comments: Object.assign({}, S.comments), at: Date.now(), label: keyLabel(S.key) };
  save(K_PUB, pub);
}

async function doShare(kind) {
  publish();
  const url = shareURL();
  const txt = kind === 'text' ? shareText() : url;
  if (url.length > 8000) toast('Heads up — long takes make a long link. The text copy always works.');
  if (navigator.share) {
    try {
      await navigator.share(kind === 'text'
        ? { title: `Power Rankings — ${keyLabel(S.key)}`, text: txt }
        : { title: `Power Rankings — ${keyLabel(S.key)}`, url });
      paintRank();
      return;
    } catch (e) {
      // A cancelled share sheet is not a failure — don't fall through to a copy.
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) { paintRank(); return; }
    }
  }
  if (await copyText(txt)) toast(kind === 'text' ? 'Rankings copied' : 'Link copied');
  else shareFallback(kind === 'text' ? 'Rankings' : 'Link', txt);
  paintRank();
}



/* ============================================================================
   ⛑️ TEAM HELMETS — generated, never fetched
   ----------------------------------------------------------------------------
   Every team gets a helmet with its own colours and monogram, derived
   DETERMINISTICALLY from the team name. Same name → same helmet, forever, on
   every device, with no state to store and no asset to ship.

   ⚠️ WHY THIS IS GENERATED RATHER THAN ESPN'S REAL LOGO, and it is not
   laziness: drawing a remote image onto a canvas TAINTS it unless the host
   sends CORS headers, and a tainted canvas makes `toBlob`/`toDataURL` throw —
   which would break the one-pager export entirely, at save time, on a feed we
   cannot test from here. A generated crest always works, offline included.
   If ESPN's `Team.logo_url` is ever wired up it belongs BESIDE this as an
   enhancement with this as the fallback, never instead of it.

   ONE implementation, used in both places: the web rows draw it to a small
   canvas and use the data URL as an <img>, the one-pager drawImage()s the same
   canvas. Two hand-kept copies (an SVG one and a canvas one) would drift.
   ========================================================================== */

/* FNV-1a. Stable across engines — Math.random or a Date would make a team's
   helmet change between renders, which is the one thing it must never do. */
function hashName(s) {
  let h = 0x811c9dc5;
  const t = String(s || '').toLowerCase().trim();
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  // Finalising avalanche. Without it, a dozen similar-length names land on a
  // handful of kits — the first contact sheet had five near-identical greens.
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/* Mid-tone shells on purpose: the same helmet has to read on the Champagne
   paper AND the Onyx black, so nothing here is near-white or near-black. */
const KITS = [
  { shell: '#1b3a6b', trim: '#c9d3e0', mask: '#c9d3e0' }, // navy / silver
  { shell: '#0f5136', trim: '#e8c766', mask: '#e8c766' }, // forest / gold
  { shell: '#8f1d24', trim: '#f0e6d8', mask: '#f0e6d8' }, // crimson / bone
  { shell: '#4a2a72', trim: '#e2c14e', mask: '#e2c14e' }, // purple / gold
  { shell: '#0d5c68', trim: '#f08a3c', mask: '#f08a3c' }, // teal / orange
  { shell: '#2b2f33', trim: '#b9c0c7', mask: '#b9c0c7' }, // graphite / silver
  { shell: '#a1471a', trim: '#f2ddb8', mask: '#f2ddb8' }, // rust / cream
  { shell: '#14493f', trim: '#8fd6b0', mask: '#8fd6b0' }, // pine / mint
  { shell: '#6b1540', trim: '#f0c9a0', mask: '#f0c9a0' }, // maroon / peach
  { shell: '#243f7a', trim: '#f2b33c', mask: '#f2b33c' }, // royal / amber
  { shell: '#5a5f16', trim: '#e9edc9', mask: '#e9edc9' }, // olive / chalk
  { shell: '#7a2418', trim: '#d8b26a', mask: '#d8b26a' }, // brick / brass
  { shell: '#1f4d4a', trim: '#e5b7c0', mask: '#e5b7c0' }, // slate teal / rose
  { shell: '#3b2a5a', trim: '#9fd0e8', mask: '#9fd0e8' }, // indigo / sky
];

/* Filler words carry no identity, so "Slob On My Cobb" reads SC, not SO. */
const SKIP = new Set(['on', 'my', 'the', 'of', 'a', 'and', 'in', 'to', 'for', 'is', 'it']);
function monogram(name) {
  const words = String(name || '').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const solid = words.filter((w) => !SKIP.has(w.toLowerCase()));
  const use = solid.length ? solid : words;
  if (!use.length) return '?';
  if (use.length === 1) return use[0].slice(0, 2).toUpperCase();
  // First and LAST significant word — the two a person actually says.
  return (use[0][0] + use[use.length - 1][0]).toUpperCase();
}

const kitFor = (name) => KITS[hashName(name) % KITS.length];

/* Draws a profile helmet inside a `size` box. Everything is expressed against
   a 100x100 design grid and scaled, so one geometry serves every size. */
function drawHelmet(ctx, x, y, size, name) {
  const kit = kitFor(name);
  const s = size / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // ---- facemask. Thin, well-separated bars: at 56px a thick curved cage
  // merges into a single blob, which is what the first two cuts produced.
  ctx.strokeStyle = kit.mask;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.6;
  ctx.beginPath();                        // outer edge of the cage
  ctx.moveTo(74, 44);
  ctx.bezierCurveTo(90, 48, 94, 62, 86, 76);
  ctx.stroke();
  ctx.beginPath();                        // upper bar
  ctx.moveTo(64, 54);
  ctx.bezierCurveTo(76, 53, 85, 55, 90, 59);
  ctx.stroke();
  ctx.beginPath();                        // lower bar
  ctx.moveTo(62, 68);
  ctx.bezierCurveTo(72, 68, 81, 70, 87, 72);
  ctx.stroke();

  // ---- shell. Proportion is what makes this read as a helmet rather than as
  // a bean: the dome must be about as WIDE as it is tall. The first cuts were
  // 54 wide by 77 tall and looked like a shoe.
  ctx.beginPath();
  ctx.moveTo(12, 48);
  ctx.bezierCurveTo(12, 24, 30, 12, 50, 12);      // up over the back and crown
  ctx.bezierCurveTo(68, 12, 78, 26, 78, 43);      // crown down to the front
  ctx.bezierCurveTo(78, 49, 74, 51, 68, 52);      // brow ledge
  ctx.bezierCurveTo(62, 53, 60, 57, 60, 63);      // the face opening
  ctx.bezierCurveTo(60, 75, 50, 83, 38, 83);      // cheek into the earflap
  ctx.bezierCurveTo(24, 83, 12, 70, 12, 48);
  ctx.closePath();
  ctx.fillStyle = kit.shell;
  ctx.fill();
  // A thin trim outline so a dark shell still separates from the Onyx ground.
  ctx.strokeStyle = kit.trim;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ---- crown stripe, clipped to the shell. Inset well away from the outline:
  // hugging the edge read as a fat coloured rim, not as a stripe.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = kit.trim;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(16, 44);
  ctx.bezierCurveTo(16, 27, 32, 18, 50, 18);
  ctx.bezierCurveTo(64, 18, 71, 25, 73, 34);
  ctx.stroke();
  ctx.restore();

  // ---- ear hole + monogram
  ctx.fillStyle = kit.trim;
  ctx.beginPath();
  ctx.arc(31, 60, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = kit.shell;
  ctx.beginPath();
  ctx.arc(31, 60, 3.2, 0, Math.PI * 2);
  ctx.fill();

  const mono = monogram(name);
  ctx.fillStyle = kit.trim;
  ctx.font = `900 ${mono.length > 1 ? 23 : 28}px Archivo, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mono, 43, 46);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

/* A standalone helmet canvas — the DOM uses its data URL as an <img>, the
   one-pager drawImage()s it. 2x for retina. */
function helmetCanvas(name, size) {
  const cv = document.createElement('canvas');
  const r = 2;
  cv.width = size * r; cv.height = size * r;
  const ctx = cv.getContext('2d');
  ctx.scale(r, r);
  drawHelmet(ctx, 0, 0, size, name);
  return cv;
}
const HELM_CACHE = new Map();
function helmetURL(name, size) {
  const k = `${size}|${name}`;
  if (!HELM_CACHE.has(k)) HELM_CACHE.set(k, helmetCanvas(name, size).toDataURL('image/png'));
  return HELM_CACHE.get(k);
}

/* ============================================================================
   🖼️ THE ONE-PAGER
   ----------------------------------------------------------------------------
   The scrolling page is the artefact you LINK. This is the one you POST — a
   single image, sized to fit on one page, that a league-mate saves to Photos
   and drops in the group chat without opening anything.

   It is drawn on a <canvas> rather than screenshotted from the DOM because a
   real PNG is the only form of this that survives the trip: it can be saved,
   it renders inline in every messaging app, and it needs no browser, no
   backend and no link. Nothing is loaded to do it — hand-drawn, no library.

   ⚠️ Colours are READ FROM THE LIVE PALETTE (getComputedStyle on :root), not
   hardcoded, so the image matches the app the maker is looking at and the
   token rules still hold — accent fills take --on-ac, movement is --pos/--neg.
   ========================================================================== */

const OP = {
  w: 1080, pad: 56, row: 96, gap: 10,
  head: 200, foot: 112,
};

function paletteInk() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n, f) => (cs.getPropertyValue(n) || '').trim() || f;
  return {
    bg: g('--bg', '#faf7f0'), card: g('--card', '#fff'), card2: g('--card-2', '#efe9dd'),
    text: g('--text', '#1c1a15'), muted: g('--muted', '#7a7466'), line: g('--line', '#e5dece'),
    accent: g('--accent', '#0b7a5c'), pos: g('--pos', '#1d7a52'), neg: g('--neg', '#b0332a'),
    gold: g('--live', '') || g('--accent', '#b8942f'), onAc: g('--on-ac', '#1a1509'),
  };
}

/* Wrap to at most `max` lines, ellipsing only the last one. Truncating a take
   at one line throws away the content the page exists to carry, so a row sizes
   itself to its take rather than the other way round. */
function wrap(ctx, s, width, maxLines) {
  const words = String(s || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? cur + ' ' + word : word;
    if (ctx.measureText(next).width <= width) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = word;
    if (lines.length === maxLines - 1) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  // Anything left over gets folded into the last line and ellipsed.
  const used = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (used < words.length) {
    lines[lines.length - 1] = fit(ctx, words.slice(lines.slice(0, -1).join(' ').split(/\s+/).filter(Boolean).length).join(' '), width);
  }
  return lines;
}

/* Trim a string to fit a pixel width, with an ellipsis. Canvas has no
   text-overflow, so this is the manual version of it. */
function fit(ctx, s, max) {
  s = String(s || '');
  if (ctx.measureText(s).width <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(s.slice(0, mid) + '…').width <= max) lo = mid; else hi = mid - 1;
  }
  return s.slice(0, lo).replace(/[\s,;:.\-]+$/, '') + '…';
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Builds the image. `p` is the same payload the share link carries, so the
   one-pager and the link can never disagree about what was published. */
function onePager(p) {
  const C = paletteInk();
  const rows = p.o || [];
  const w = OP.w;
  const F = (px, wt = 400) => `${wt} ${px}px Archivo, -apple-system, "Segoe UI", system-ui, sans-serif`;

  // Measure pass: lay every take out first, so the canvas ends up exactly as
  // tall as the content needs and no row is clipped.
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = F(23, 400);
  const takeW = w - OP.pad * 2 - 166 - 30;
  const lines = rows.map((r) => (r[3] ? wrap(meas, r[3], takeW, 2) : []));
  const heights = lines.map((ls) => OP.row + Math.max(0, ls.length - 1) * 30);
  const h = OP.pad + OP.head + heights.reduce((a, b) => a + b + OP.gap, 0) + OP.foot + OP.pad;

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);

  const L = OP.pad, R = w - OP.pad, CW = R - L;
  let y = OP.pad;

  // ---- header
  ctx.fillStyle = C.accent;
  ctx.font = F(22, 800);
  ctx.fillText(String(p.l || '').toUpperCase(), L, y + 22);
  if (p.b) {
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'right';
    ctx.fillText(fit(ctx, `${p.b}`.toUpperCase(), CW * 0.5), R, y + 22);
    ctx.textAlign = 'left';
  }
  y += 54;
  ctx.fillStyle = C.text;
  ctx.font = F(64, 900);
  ctx.fillText('Power Rankings', L, y + 50);
  y += 78;
  ctx.fillStyle = C.muted;
  ctx.font = F(24, 500);
  ctx.fillText(p.d ? niceDate(p.d) : '', L, y + 20);
  y += 44;
  ctx.fillStyle = C.accent;
  ctx.fillRect(L, y, CW, 4);
  y += 24;

  // ---- rows
  rows.forEach((row, i) => {
    const [name, rec, ppg, , , mv] = row;
    const top = i === 0;
    const rh = heights[i];

    ctx.fillStyle = C.card;
    rr(ctx, L, y, CW, rh, 16); ctx.fill();
    ctx.strokeStyle = top ? C.accent : C.line;
    ctx.lineWidth = top ? 3 : 1.5;
    rr(ctx, L, y, CW, rh, 16); ctx.stroke();

    // rank
    ctx.fillStyle = i < 3 ? C.accent : C.text;
    ctx.font = F(top ? 48 : 40, 900);
    ctx.textAlign = 'center';
    // A two-digit rank at full size ran into the crest — "10", "11" and "12"
    // were touching it in the first pass. Narrow the numeral instead of moving
    // the whole column, so the ranks still form a straight edge.
    if (i + 1 >= 10) ctx.font = F(top ? 42 : 34, 900);
    const numY = y + rh / 2 + (mv ? 2 : 14);
    ctx.fillText(String(i + 1), L + 44, numY);
    // Movement rides under its OWN number, not the bottom of the row — on a
    // two-line row anchoring it to the row bottom pulled it away from the
    // number it belongs to.
    if (mv) {
      ctx.fillStyle = mv > 0 ? C.pos : C.neg;
      ctx.font = F(18, 800);
      ctx.fillText(`${mv > 0 ? '▲' : '▼'}${Math.abs(mv)}`, L + 44, numY + 26);
    }
    ctx.textAlign = 'left';

    // Crest between the rank and the name. Same generator the web rows use.
    const hs = 74;
    ctx.drawImage(helmetCanvas(name, hs), L + 80, y + (rh - hs) / 2, hs, hs);

    const tx = L + 166;
    const statW = 210;
    // team + manager
    ctx.fillStyle = C.text;
    ctx.font = F(30, 800);
    const mgr = mgrLabel(name);
    const nameW = ctx.measureText(fit(ctx, name, CW - 166 - statW - 20)).width;
    ctx.fillText(fit(ctx, name, CW - 166 - statW - 20), tx, y + 38);
    if (mgr) {
      ctx.fillStyle = C.muted;
      ctx.font = F(20, 700);
      ctx.fillText(mgr, tx + nameW + 12, y + 37);
    }
    // record · ppg, right-aligned so the numbers form a column
    const bits = [rec, ppg != null ? `${ppg} ppg` : ''].filter(Boolean).join('  ·  ');
    ctx.fillStyle = C.muted;
    ctx.font = F(22, 700);
    ctx.textAlign = 'right';
    ctx.fillText(bits, R - 22, y + 36);
    ctx.textAlign = 'left';
    // the take — the editorial voice is the point of the page, so it wraps
    ctx.fillStyle = C.text;
    ctx.font = F(23, 400);
    lines[i].forEach((ln, k) => ctx.fillText(ln, tx, y + 74 + k * 30));
    y += rh + OP.gap;
  });

  // ---- footer
  y += 14;
  ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
  y += 34;
  ctx.fillStyle = C.muted;
  ctx.font = F(20, 500);
  const note = p.r ? 'Ranked on all-play record, scoring and recent form — then argued with by hand.'
                   : 'Preseason — no games played yet.';
  const mark = 'Sports-Hub';
  ctx.fillText(note, L, y);
  // These two ran into each other in the first render. Measure, and drop the
  // mark onto its own line rather than letting it overprint the sentence.
  const fits = ctx.measureText(note).width + ctx.measureText(mark).width + 40 <= CW;
  ctx.textAlign = 'right';
  ctx.fillText(mark, R, fits ? y : y + 28);
  ctx.textAlign = 'left';
  return cv;
}

const canvasBlob = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

/* Save it the way each platform actually allows. iOS gives no reliable
   <a download> for a blob, but it does take a File through the share sheet —
   which is also the shortest path to "post it in the league chat". Desktop
   gets the download. If both are refused the image is shown inline, which on
   iOS is long-press → Save to Photos, i.e. still a save. */
async function saveOnePager(p) {
  const cv = onePager(p);
  const blob = await canvasBlob(cv);
  if (!blob) { toast("Couldn't build the image"); return; }
  const fname = `power-rankings-${(p.l || '').toLowerCase().replace(/\s+/g, '-') || 'week'}.png`;
  const file = new File([blob], fname, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Power Rankings — ${p.l || ''}` });
      return;
    } catch (e) {
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return;
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('Image saved');
    return;
  } catch (_) {}
  const host = $('#pr-share-out');
  if (host) {
    host.innerHTML = `<p class="pr-note">Long-press the image to save it.</p>`;
    const img = new Image();
    img.src = cv.toDataURL('image/png');
    img.className = 'pr-op-img';
    host.appendChild(img);
  }
}

/* --------------------------------------------------------------- screens -- */
function show(id) {
  ['#pr-load', '#pr-rank', '#pr-shared'].forEach((s) => { const n = $(s); if (n) n.hidden = s !== id; });
}

function paintLoad(msg, retry) {
  show('#pr-load');
  $('#pr-load').innerHTML = `<div class="pr-card pr-load">${msg}</div>`;
  if (retry) {
    const b = el('button', 'pr-btn', '🔄 Try again');
    b.type = 'button';
    b.onclick = () => boot();
    $('#pr-load').querySelector('.pr-load').appendChild(b);
  }
}

/* ---- the editor ---------------------------------------------------------- */
function paintRank() {
  show('#pr-rank');
  const host = $('#pr-rank');
  const prev = prevOrder();
  const n = S.order.length;

  const modelTop = S.ready
    ? Object.keys(S.model).sort((a, b) => S.model[a] - S.model[b]).slice(0, 3).map((id) => esc(teamById(id).team)).join(' · ')
    : '';

  const head = `
    <div class="pr-card pr-head">
      <div class="pr-week">${esc(keyLabel(S.key))}</div>
      <h2>Power Rankings</h2>
      <p class="pr-sub">${S.ready
        ? `Pre-built from ${S.key} week${S.key === 1 ? '' : 's'} of results — then it's yours. Reorder anyone, write the take, send it to the league.`
        : `No games have been played yet, so the model has nothing to rank on and has not invented an order. Drag the league into whatever order you like and write the takes — this is the preseason edition.`}</p>
      ${S.stale ? `<p class="pr-warn">⚠️ Showing the last league data this device saved — the backend didn't answer just now. Records and points may be a week behind.</p>` : ''}
      ${prev ? `<p class="pr-note">▲▼ is movement since <b>${esc(prev.label || 'last week')}</b>, the last set you shared. A team that held its spot shows nothing.</p>`
             : `<p class="pr-note">No movement arrows yet — they appear once you've shared a set and a new week lands.</p>`}
      <label class="pr-by">
        <span>Published by</span>
        <input id="pr-byline" type="text" maxlength="40" placeholder="Your name or team" />
      </label>
      <p class="pr-note">The league sees this on the rankings you send, so they know whose take it is.</p>
    </div>`;

  const rows = S.order.map((id, i) => {
    const t = teamById(id);
    const row = (S.rows || {})[id];
    const mgr = mgrLabel(t.team);
    const mv = moveFor(prev, id, i);
    const modelRank = S.model[id];
    const moved = modelRank && modelRank !== i + 1;
    const stats = [];
    if (S.ready) {
      stats.push(recordOf(t));
      if (row) {
        stats.push(`${(Math.round(row.ppg * 10) / 10).toFixed(1)} ppg`);
        stats.push(`all-play ${row.apW}-${row.apL}`);
      }
    }
    const opts = Array.from({ length: n }, (_, k) =>
      `<option value="${k}"${k === i ? ' selected' : ''}>${k + 1}</option>`).join('');
    const c = S.comments[id] || '';
    return `
      <li class="pr-row${t.isMe ? ' me' : ''}" data-id="${esc(id)}">
        <div class="pr-rank">
          <label class="pr-num">
            <span class="pr-n">${i + 1}</span>
            <select class="pr-jump" aria-label="Move ${esc(t.team)} to position">${opts}</select>
          </label>
          ${hasMove(mv) ? `<span class="pr-mv ${mv > 0 ? 'up' : 'down'}">${moveStr(mv)}</span>` : ''}
        </div>
        <div class="pr-body">
          <div class="pr-team"><img class="pr-helm-sm" src="${helmetURL(t.team, 30)}" alt="" width="30" height="30" /><span class="pr-tn">${esc(t.team)}</span>${mgr ? ` <span class="pr-mgr">${esc(mgr)}</span>` : ''}${t.isMe ? ' <span class="pr-you">you</span>' : ''}</div>
          ${stats.length ? `<div class="pr-stats">${esc(stats.join(' · '))}</div>` : ''}
          ${moved ? `<div class="pr-moved">Model had them <b>${modelRank}${ord(modelRank)}</b> — you moved them ${modelRank > i + 1 ? 'up' : 'down'}.</div>` : ''}
          <textarea class="pr-take" rows="2" maxlength="${MAX_COMMENT}" placeholder="Your take on ${esc(t.team)}…"></textarea>
          <div class="pr-count"><span>${c.length}</span>/${MAX_COMMENT}</div>
        </div>
        <div class="pr-arrows">
          <button type="button" class="pr-ar" data-up aria-label="Move ${esc(t.team)} up"${i === 0 ? ' disabled' : ''}>▲</button>
          <button type="button" class="pr-ar" data-down aria-label="Move ${esc(t.team)} down"${i === n - 1 ? ' disabled' : ''}>▼</button>
        </div>
      </li>`;
  }).join('');

  const foot = `
    <div class="pr-card pr-actions">
      <button type="button" class="pr-btn primary" id="pr-share">📤 Share to the league</button>
      <button type="button" class="pr-btn" id="pr-copy">📋 Copy as text</button>
      <button type="button" class="pr-btn" id="pr-image">🖼️ Save the one-pager</button>
      <p class="pr-note">Three ways out, because they suit different moments: the <b>link</b> is the thing you send, the <b>text</b> is what pastes into the group chat, and the <b>one-pager</b> is a single image that fits on one page — save it to Photos and post it.</p>
      <p class="pr-note">Sharing also locks this week in, so next week's ▲▼ movement is measured against what the league actually saw.</p>
      <div id="pr-share-out"></div>
      <button type="button" class="pr-btn ghost" id="pr-rebuild">🔄 Rebuild from the model</button>
      <p class="pr-note">Rebuilding throws away your order and takes for ${esc(keyLabel(S.key))} and starts again from the model.</p>
    </div>
    <div class="pr-card pr-how">
      <details>
        <summary>How the model ranks — and what it can't know</summary>
        <div class="pr-how-b">
          ${S.ready ? `
          <p>Each team gets one score, and these are the four things in it:</p>
          <ul>
            <li><b>All-play record — 40%.</b> Every week, each team is scored against <i>every other team</i>, not just the one it was scheduled against. It's the luck detector: a 1-3 team that outscored nine opponents has a good roster and a bad schedule.</li>
            <li><b>Points per game — 25%.</b> Season scoring against the league average.</li>
            <li><b>Last ${Math.min(RECENT_N, S.key)} week${Math.min(RECENT_N, S.key) === 1 ? '' : 's'} — 25%.</b> Who's hot now. With only ${S.key} week${S.key === 1 ? '' : 's'} played this overlaps heavily with points per game${S.key < RECENT_N ? ' — early on it is nearly the same number twice, so treat the whole thing as thin' : ''}.</li>
            <li><b>Actual record — 10%.</b> Deliberately the lightest input: it's the most luck-contaminated number here. Not zero, because a league argues about records.</li>
          </ul>
          <p class="pr-warn">⚠️ <b>These weights are a judgment call, not a measurement.</b> A power ranking has no result to be graded against, so nothing here is fitted or validated the way the app's betting model is. It's a defensible starting point for an argument — which is why you can move anyone.</p>
          <p>What it can't see: injuries, a bye week that flattered someone, a trade, who's starting a backup QB. That's what the takes are for.</p>`
          : `<p>Nothing has been played, so there is nothing to rank on. The model deliberately does not guess an order from draft grades or team names — it hands you the league and lets you make the call.</p>
             <p>From the first week of results onward it pre-builds a ranking each week from all-play record, points per game, recent form and actual record.</p>`}
        </div>
      </details>
    </div>`;

  host.innerHTML = head + `<ol class="pr-list">${rows}</ol>` + foot;

  // Textareas get their value assigned, never interpolated into markup.
  $$('.pr-row', host).forEach((li) => {
    const id = li.dataset.id;
    const ta = li.querySelector('.pr-take');
    ta.value = S.comments[id] || '';
    ta.addEventListener('input', () => {
      S.comments[id] = ta.value;
      li.querySelector('.pr-count span').textContent = String(ta.value.length);
      persist();
    });
    li.querySelector('[data-up]').onclick = () => move(id, S.order.indexOf(id) - 1);
    li.querySelector('[data-down]').onclick = () => move(id, S.order.indexOf(id) + 1);
    li.querySelector('.pr-jump').onchange = (e) => move(id, Number(e.target.value));
  });

  const by = $('#pr-byline');
  by.value = S.byline || '';   // assigned, never interpolated into markup
  by.addEventListener('input', () => { S.byline = by.value; persist(); });

  $('#pr-share').onclick = () => doShare('link');
  $('#pr-copy').onclick = () => doShare('text');
  $('#pr-image').onclick = () => { publish(); saveOnePager(payload()); };
  $('#pr-rebuild').onclick = () => {
    if (!confirm(`Rebuild ${keyLabel(S.key)} from the model? Your order and takes for this week will be lost.`)) return;
    const built = buildModel(S.season);
    S.order = built.order.slice();
    S.comments = {};
    persist();
    paintRank();
    toast('Rebuilt from the model');
  };

  if (modelTop) {
    const p = el('p', 'pr-note', `Model's own top 3 this week: ${''}`);
    p.innerHTML = `Model's own top 3 this week: <b>${modelTop}</b>`;
    $('.pr-head', host).appendChild(p);
  }
}

const ord = (n) => (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');

/* ---- the read-only view a league-mate opens ------------------------------ */
function paintShared(p) {
  show('#pr-shared');
  const rows = (p.o || []).map((row, i) => {
    const [name, rec, ppg, note, modelRank, mv] = row;
    const mgr = mgrLabel(name);
    const stats = [];
    if (rec) stats.push(rec);
    if (ppg != null) stats.push(`${ppg} ppg`);
    const moved = modelRank && modelRank !== i + 1;
    return `
      <li class="pr-row ro${i < 3 ? ' podium p' + (i + 1) : ''}">
        <div class="pr-rank">
          <span class="pr-n big">${i + 1}</span>
          ${hasMove(mv) ? `<span class="pr-mv ${mv > 0 ? 'up' : 'down'}">${moveStr(mv)}</span>` : ''}
        </div>
        <div class="pr-body">
          <div class="pr-team"><img class="pr-helm-sm" src="${helmetURL(name, 34)}" alt="" width="34" height="34" /><span class="pr-tn">${esc(name)}</span>${mgr ? ` <span class="pr-mgr">${esc(mgr)}</span>` : ''}</div>
          ${stats.length ? `<div class="pr-stats">${esc(stats.join(' · '))}</div>` : ''}
          ${note ? `<div class="pr-take-ro">${esc(note)}</div>` : ''}
          ${moved ? `<div class="pr-moved">Numbers had them ${modelRank}${ord(modelRank)}.</div>` : ''}
        </div>
      </li>`;
  }).join('');

  $('#pr-shared').innerHTML = `
    <div class="pr-card pr-shared-banner">📬 <b>${esc(p.b || 'Someone')}</b> shared their power rankings with you</div>
    <div class="pr-card pr-head">
      <div class="pr-week">${esc(p.l || '')}${p.d ? ` · ${esc(niceDate(p.d))}` : ''}</div>
      <h2>Power Rankings</h2>
      <p class="pr-sub">${p.b ? `${esc(p.b)}'s` : "One person's"} rankings for the league. ${p.r ? 'Built from all-play record, scoring and form, then argued with by hand.' : 'Preseason — pure opinion, no games played yet.'}</p>
    </div>
    <ol class="pr-list">${rows}</ol>
    <div class="pr-card pr-actions">
      <button type="button" class="pr-btn" id="pr-ro-image">🖼️ Save as a one-page image</button>
      <button type="button" class="pr-btn" id="pr-ro-copy">📋 Copy these rankings</button>
      <div id="pr-share-out"></div>
      <p class="pr-note">Want to make your own? <a href="power.html">Open the Power Rankings Lab</a> — your rankings stay on your own device.</p>
    </div>`;

  $('#pr-ro-image').onclick = () => saveOnePager(p);
  $('#pr-ro-copy').onclick = async () => {
    const L = [`🏆 POWER RANKINGS — ${p.l || ''}`, p.b ? `${p.b}'s rankings` : '', ''].filter((x, i) => i !== 1 || x);
    (p.o || []).forEach((row, i) => {
      const [name, rec, ppg, note, , mv] = row;
      const bits = [rec]; if (ppg != null) bits.push(`${ppg} ppg`);
      L.push(`${i + 1}. ${hasMove(mv) ? moveStr(mv) + ' ' : ''}${name} — ${bits.filter(Boolean).join(' · ')}`);
      if (note) L.push(`   ${note}`);
    });
    const txt = L.join('\n');
    if (await copyText(txt)) toast('Copied'); else shareFallback('Rankings', txt);
  };
}

/* ------------------------------------------------------------------ boot -- */
function sharedFromHash() {
  const m = /[#&]r=([A-Za-z0-9\-_]+)/.exec(location.hash || '');
  if (!m) return null;
  try {
    const p = JSON.parse(unb64u(m[1]));
    return (p && Array.isArray(p.o) && p.o.length) ? p : null;
  } catch (_) { return null; }
}

async function boot() {
  /* A shared link is read-only and needs NO backend call — the payload carries
     everything. That is what makes it survive a sleeping backend, and what
     stops a recipient seeing a different ranking than the one that was sent. */
  const sh = sharedFromHash();
  if (sh) { S.shared = sh; paintShared(sh); return; }
  if (location.hash) {
    // A hash that isn't a valid payload: don't strand the reader on a blank page.
    history.replaceState(null, '', location.pathname + location.search);
  }

  paintLoad(`<b>Loading your league…</b><p>The free-tier backend takes ~30s to wake up if it has been idle.</p>`);
  const res = await loadSeason();
  if (!res) {
    paintLoad(`<b>Can't reach the league right now.</b>
      <p>The rankings are built from your ESPN league, so this page needs the backend — and this device has no saved copy to fall back on yet.</p>
      <p class="pr-note">If the app's Fantasy tab is loading fine, try again in a moment; the free host sleeps after ~15 minutes idle.</p>`, true);
    return;
  }
  S.season = res.data;
  S.stale = !!res.stale;
  restoreOrBuild();
  paintRank();
}

window.addEventListener('hashchange', boot);
boot();

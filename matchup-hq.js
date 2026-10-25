/* ══════════════════════════════════════════════════════════════════════════
   📊 matchup-hq.js — MATCHUP HQ for the Fantasy tab (v319)
   One global, `SportsHubMatchupHQ`: a PURE model (`.model`, tested under Node
   by tests/matchup-hq.test.js) and one renderer (`.render(box, ctx)`) that
   app.js calls with the league object it already holds. Nothing here fetches
   the fantasy backend: the roster, opponent lineup, matchup score, season
   scores and standings all arrive on `ctx.L` (the saved league object), and
   the NFL week slate with its lines arrives on `ctx.games` (normEvent rows
   from the ESPN scoreboard the app already reads). Two reads of its own:
   - ESPN athlete game logs (site.web.api.espn.com), browser-direct — verified
     23 Oct 2026 that this host sends CORS for the app's origin (the
     `/teams/{id}` block of v310 is site.api.espn.com and does not apply).
   - League History's own history.js / espn.js, loaded as <script> on demand
     for the rivalry panel. ⚠️ LINKED, NOT COPIED: the 13-season archive must
     exist exactly once (CLAUDE.md banner), so the data is read live off that
     app's global and never stored here.
   Win chance: projected margin over the combined spread of both teams'
   remaining points; each team's spread is the league's week-to-week scoring
   swing scaled by the share of its projection still to play. A heuristic
   estimate built on ESPN's projections, never ESPN's number.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  const api = factory();
  root.SportsHubMatchupHQ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ───────────────────────────── model ─────────────────────────────
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v))) ? null : Number(v);
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const Phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - tail : tail; };
  const RESERVE = new Set(['IR', 'IL', 'NA', 'ER']);
  const BENCH = new Set(['BE', 'BENCH']);
  const slotOf = (p) => String((p && p.lineupSlot) || (p && p.slot) || '').toUpperCase().trim();
  const isReserve = (p) => RESERVE.has(slotOf(p)) || (p && p.status) === 'il';
  const isBenched = (p) => !isReserve(p) && (BENCH.has(slotOf(p)) || (p && p.status) === 'bench');
  const isStarting = (p) => !isReserve(p) && !isBenched(p) && ((p && p.status) || 'active') === 'active';
  const EXACT = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', PK: 'K', 'D/ST': 'D/ST', DST: 'D/ST', DEF: 'D/ST' };
  function posOf(p) {
    const s = slotOf(p); if (EXACT[s]) return EXACT[s];
    for (const e of (p.eligibleSlots || [])) { const u = String(e).toUpperCase().trim(); if (EXACT[u]) return EXACT[u]; }
    const str = `${p.pos || ''} ${s}`.toUpperCase();
    if (/\bQB\b/.test(str)) return 'QB'; if (/D\/ST|DST|DEF/.test(str)) return 'D/ST'; if (/\bRB\b/.test(str)) return 'RB'; if (/\bWR\b/.test(str)) return 'WR'; if (/\bTE\b/.test(str)) return 'TE'; if (/\bK\b/.test(str)) return 'K';
    return String(p.pos || '?').toUpperCase();
  }
  const displaySlot = (p) => { const s = slotOf(p); return /RB\/WR\/TE|FLEX|RB\/WR|WR\/TE/.test(s) ? 'FLEX' : s === 'DST' || s === 'DEF' ? 'D/ST' : s; };
  const SLOT_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3, FLEX: 4, 'D/ST': 5, K: 6 };
  const ET = 'America/New_York';

  // ESPN odds → per-team spread / implied total. `details` reads "DEN -4.5".
  function parseLine(g) {
    const o = g && g.odds; if (!o) return null;
    const ou = num(o.overUnder);
    const m = String(o.details || '').match(/^([A-Z]{2,4})\s+([+-]?\d+(?:\.5)?)$/);
    const home = String((g.home || {}).abbr || '').toUpperCase(), away = String((g.away || {}).abbr || '').toUpperCase();
    let spread = {};
    if (m && (m[1] === home || m[1] === away)) { const v = Number(m[2]); spread[m[1]] = v; spread[m[1] === home ? away : home] = -v; }
    else if (/EVEN|PK/i.test(o.details || '')) { spread[home] = 0; spread[away] = 0; }
    const implied = (abbr) => (ou != null && spread[abbr] != null) ? r2((ou - spread[abbr]) / 2) : null;
    return { total: ou, details: o.details || '', spread, implied: { [home]: implied(home), [away]: implied(away) } };
  }
  // Kickoff window label in Eastern time.
  function windowOf(dateStr) {
    const d = new Date(dateStr); if (isNaN(d)) return { label: 'TBD', order: 8 };
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false }).formatToParts(d);
    const get = (t) => (parts.find((x) => x.type === t) || {}).value;
    const wd = get('weekday'), h = Number(get('hour')) + Number(get('minute')) / 60;
    if (wd === 'Thu') return { label: 'Thu night', order: 0 };
    if (wd === 'Fri') return { label: 'Fri', order: 0.5 };
    if (wd === 'Sat') return { label: 'Sat', order: 0.7 };
    if (wd === 'Sun') { if (h < 12) return { label: 'Sun early', order: 1 }; if (h < 16) return { label: 'Sun 1:00', order: 2 }; if (h < 16.2) return { label: 'Sun 4:05', order: 3 }; if (h < 19) return { label: 'Sun 4:25', order: 4 }; return { label: 'Sun night', order: 5 }; }
    if (wd === 'Mon') return { label: 'Mon night', order: 6 };
    return { label: wd, order: 7 };
  }
  const kickoffET = (dateStr) => { const d = new Date(dateStr); if (isNaN(d)) return ''; return new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(d).replace(',', ''); };

  // Index the week's slate by team abbreviation.
  function gameIndex(games) {
    const idx = {};
    (games || []).forEach((g) => {
      const line = parseLine(g); const w = windowOf(g.date);
      const h = String((g.home || {}).abbr || '').toUpperCase(), a = String((g.away || {}).abbr || '').toUpperCase();
      const hs = num((g.home || {}).score), as = num((g.away || {}).score);
      const base = { id: g.id, game: `${a} @ ${h}`, date: g.date, state: g.state || 'pre', window: w.label, windowOrder: w.order, kickoffET: kickoffET(g.date), total: line ? line.total : null, lineText: line ? line.details : '', statusText: g.statusText || '', score: (hs != null && as != null) ? `${a} ${as} – ${h} ${hs}` : '' };
      idx[h] = Object.assign({}, base, { vs: 'vs ' + a, opp: a, spread: line ? line.spread[h] : null, implied: line ? line.implied[h] : null, oppImplied: line ? line.implied[a] : null });
      idx[a] = Object.assign({}, base, { vs: '@ ' + h, opp: h, spread: line ? line.spread[a] : null, implied: line ? line.implied[a] : null, oppImplied: line ? line.implied[h] : null });
    });
    return idx;
  }

  // One flat row per player on both sides, with this week's game context.
  function buildPlayers(L, games) {
    const idx = gameIndex(games);
    const weekOK = Object.keys(idx).length > 0;
    const rows = [];
    const add = (p, side) => {
      const team = String(p.proTeam || '').toUpperCase();
      const g = idx[team] || null;
      const starter = isStarting(p);
      const pts = num(p.points), proj = num(p.projected);
      const played = g ? g.state === 'post' : false;
      const live = g ? g.state === 'in' : false;
      const bye = weekOK && !g;
      const injury = String(p.injuryStatus || 'ACTIVE').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()).replace('Injury reserve', 'IR').replace('Normal', 'Active');
      rows.push({
        side, id: p.id != null ? String(p.id) : null, player: p.name, nfl: team, slot: displaySlot(p), starter, bench: isBenched(p), pos: posOf(p), injury,
        played, live, bye, points: pts, proj: proj == null ? 0 : proj, projectionAvailable: proj != null,
        current: played || live ? (pts || 0) : (proj || 0),
        seasonAvg: num(p.avg), projAvg: num(p.projAvg), prk: num(p.prk),
        weeks: Array.isArray(p.weeks) ? p.weeks.filter((w) => w && typeof w.pts === 'number') : [],
        game: g ? g.game : (bye ? 'Bye' : ''), vs: g ? g.vs : (bye ? 'Bye' : ''), window: g ? g.window : (bye ? 'Bye' : ''), windowOrder: g ? g.windowOrder : 9,
        kickoffET: g ? g.kickoffET : '', spread: g ? g.spread : null, implied: g ? g.implied : null, oppImplied: g ? g.oppImplied : null, gameTotal: g ? g.total : null, lineText: g ? g.lineText : '',
      });
    };
    ((L && L.rosterFull) || []).forEach((p) => add(p, 'me'));
    (((L && L.opponent) || {}).roster || []).forEach((p) => add(p, 'opp'));
    return rows;
  }

  // League-wide week-to-week scoring swing: SD of every team's scores around its own average.
  function leagueSd(seasonTeams) {
    let ss = 0, n = 0;
    (seasonTeams || []).forEach((t) => {
      const a = (t.scores || []).filter((v) => typeof v === 'number' && v > 0);
      if (a.length < 2) return;
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      a.forEach((v) => { ss += (v - m) ** 2; n++; });
    });
    return n ? Math.sqrt(ss / n) : 19;
  }

  // Projected finals, win chance and P10/P90. `override` maps player → points
  // for the scenario lab. In-progress players: what they have plus half the
  // unplayed share of their projection (we do not know how much game is left).
  function outlook(players, score, seasonTeams, override) {
    const sd = leagueSd(seasonTeams);
    const side = (s, banked) => {
      const st = players.filter((p) => p.side === s && p.starter);
      const full = st.reduce((t, p) => t + (p.proj || 0), 0);
      let rem = 0;
      st.forEach((p) => {
        if (p.played) return;
        const ov = override && override[p.player] != null ? override[p.player] : null;
        if (p.live) rem += ov != null ? Math.max(0, ov - (p.points || 0)) : Math.max(0, (p.proj || 0) - (p.points || 0)) * 0.5;
        else rem += ov != null ? ov : (p.proj || 0);
      });
      const left = st.filter((p) => !p.played).length;
      const o = { side: s, banked: r2(banked), remaining: r2(rem), projFinal: r2(banked + rem), left, sd: r2(sd * Math.sqrt(full ? Math.min(1, rem / full) : 0)), leagueSd: r2(sd) };
      o.p10 = r1(o.projFinal - 1.2816 * o.sd); o.p90 = r1(o.projFinal + 1.2816 * o.sd);
      return o;
    };
    const a = side('me', score.me || 0), b = side('opp', score.opp || 0);
    const denom = Math.sqrt(a.sd ** 2 + b.sd ** 2);
    const z = denom > 0 ? (a.projFinal - b.projFinal) / denom : (a.projFinal > b.projFinal ? 9 : a.projFinal < b.projFinal ? -9 : 0);
    a.winPct = r1(Phi(z) * 100); b.winPct = r1(100 - a.winPct);
    a.margin = r2(a.projFinal - b.projFinal); b.margin = -a.margin;
    return { me: a, opp: b };
  }

  const val = (p) => (p.played || p.live) ? (p.points || 0) : (p.proj || 0);

  function edges(players) {
    const out = [];
    Object.keys(SLOT_ORDER).forEach((slot) => {
      const mine = players.filter((p) => p.side === 'me' && p.starter && p.slot === slot).sort((x, y) => val(y) - val(x));
      const theirs = players.filter((p) => p.side === 'opp' && p.starter && p.slot === slot).sort((x, y) => val(y) - val(x));
      const k = Math.max(mine.length, theirs.length);
      for (let i = 0; i < k; i++) {
        const a = mine[i], b = theirs[i];
        out.push({ slot: k > 1 ? slot + (i + 1) : slot, mine: a ? a.player : '', mineVal: a ? r2(val(a)) : 0, minePlayed: !!(a && a.played), theirs: b ? b.player : '', theirsVal: b ? r2(val(b)) : 0, theirsPlayed: !!(b && b.played), edge: r2((a ? val(a) : 0) - (b ? val(b) : 0)) });
      }
    });
    return out;
  }

  function stacks(players) {
    const left = players.filter((p) => p.side === 'me' && p.starter && !p.played && p.game && p.game !== 'Bye');
    const total = left.reduce((t, p) => t + (p.proj || 0), 0);
    const g = {};
    left.forEach((p) => { const x = g[p.game] = g[p.game] || { game: p.game, kickoffET: p.kickoffET, players: [], proj: 0 }; x.players.push(p.player); x.proj += p.proj || 0; });
    return Object.values(g).filter((x) => x.players.length >= 2).map((x) => ({ game: x.game, kickoffET: x.kickoffET, count: x.players.length, players: x.players, proj: r2(x.proj), share: total ? Math.round(100 * x.proj / total) : 0 })).sort((a, b) => b.share - a.share);
  }

  function drivers(players) {
    const left = (s) => players.filter((p) => p.side === s && p.starter && !p.played);
    const me = left('me'), opp = left('opp');
    const out = [];
    const fmtT = (p) => p.implied == null ? 'no line yet' : `team total ${p.implied.toFixed(1)}`;
    const topOpp = opp.slice().sort((a, b) => b.proj - a.proj)[0];
    if (topOpp) out.push({ key: 'theirAnchor', side: 'opp', title: `${topOpp.player} is their anchor`, detail: `${topOpp.proj.toFixed(1)} projected · ${topOpp.vs} ${topOpp.kickoffET} · ${fmtT(topOpp)}.` });
    const topMe = me.slice().sort((a, b) => b.proj - a.proj)[0];
    if (topMe) out.push({ key: 'myAnchor', side: 'me', title: `${topMe.player} is your anchor`, detail: `${topMe.proj.toFixed(1)} projected · ${topMe.vs} ${topMe.kickoffET} · ${fmtT(topMe)}.` });
    const st = stacks(players)[0];
    if (st) out.push({ key: 'stack', side: 'me', title: `${st.game} carries ${st.share}% of your remaining points`, detail: `${st.count} of your starters are in that game (${st.kickoffET}). A slow game there hurts you most.` });
    const oppLow = opp.filter((p) => p.implied != null && p.pos !== 'D/ST').sort((a, b) => a.implied - b.implied)[0];
    if (oppLow) out.push({ key: 'theirLowTotal', side: 'opp', title: `Vegas is down on ${oppLow.player}'s team`, detail: `${oppLow.nfl} has the lowest implied total among their starters at ${oppLow.implied.toFixed(1)} (${oppLow.vs}).` });
    const myQ = me.filter((p) => !/^Active$/i.test(p.injury));
    if (myQ.length) out.push({ key: 'injury', side: 'me', title: `${myQ.length} of your starters carr${myQ.length === 1 ? 'ies' : 'y'} an injury tag`, detail: myQ.map((p) => `${p.player} (${p.injury})`).join(', ') + '. Check the report before kickoff.' });
    return out;
  }

  // Each remaining starter against the best healthy bench option for that slot.
  function benchCompare(players) {
    const fits = (pos, slot) => slot === pos || (slot === 'FLEX' && ['RB', 'WR', 'TE'].includes(pos));
    const bench = players.filter((p) => p.side === 'me' && p.bench && !p.played && !p.live && !p.bye && p.projectionAvailable && !/Out|IR|Suspend/i.test(p.injury));
    const starters = players.filter((p) => p.side === 'me' && p.starter && !p.played && !p.live && p.projectionAvailable).sort((a, b) => (SLOT_ORDER[a.slot] ?? 9) - (SLOT_ORDER[b.slot] ?? 9));
    return starters.map((s) => {
      const alt = bench.filter((b) => fits(b.pos, s.slot)).sort((a, b) => b.proj - a.proj)[0];
      const same = starters.filter((x) => x.slot === s.slot);
      return { slot: s.slot + (same.length > 1 ? ' ' + (same.indexOf(s) + 1) : ''), starter: s.player, starterProj: r2(s.proj), alt: alt ? alt.player : null, altProj: alt ? r2(alt.proj) : null, altInjury: alt ? alt.injury : '', change: alt ? r2(alt.proj - s.proj) : null };
    });
  }

  function weekly(seasonTeams, meName, oppName) {
    const teams = seasonTeams || [];
    const me = teams.find((t) => t.isMe) || teams.find((t) => t.team === meName), opp = teams.find((t) => t.team === oppName);
    const n = Math.max(...teams.map((t) => (t.scores || []).filter((v) => typeof v === 'number' && v > 0).length), 0);
    const out = [];
    for (let w = 0; w < n; w++) {
      const all = teams.map((t) => (t.scores || [])[w]).filter((v) => typeof v === 'number' && v > 0);
      out.push({ week: w + 1, me: me ? (me.scores || [])[w] ?? null : null, opp: opp ? (opp.scores || [])[w] ?? null : null, leagueAvg: all.length ? r1(all.reduce((x, y) => x + y, 0) / all.length) : null });
    }
    return out;
  }

  function consistency(seasonTeams, meName, oppName) {
    const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return r1(a[lo] + (a[hi] - a[lo]) * (i - lo)); };
    const pick = (sel) => { const t = (seasonTeams || []).find(sel); const a = t ? (t.scores || []).filter((v) => typeof v === 'number' && v > 0) : []; return { p10: q(a, 0.1), p50: q(a, 0.5), p90: q(a, 0.9), avg: a.length ? r1(a.reduce((x, y) => x + y, 0) / a.length) : null, last3: a.length ? r1(a.slice(-3).reduce((x, y) => x + y, 0) / Math.min(3, a.length)) : null, n: a.length }; };
    return { me: pick((t) => t.isMe || t.team === meName), opp: pick((t) => t.team === oppName) };
  }

  // ESPN game log → per-game usage rows.
  function parseGamelog(json) {
    const names = json && json.names || [];
    const idx = {}; names.forEach((k, i) => { idx[k] = i; });
    const ev = (json && json.events) || {};
    const g = (st, k) => { if (idx[k] == null) return 0; const v = Number(st[idx[k]]); return Number.isFinite(v) ? v : 0; };
    const rows = [];
    ((json && json.seasonTypes) || []).forEach((st) => (st.categories || []).forEach((c) => (c.events || []).forEach((e) => {
      const m = ev[e.eventId] || {}; const s = e.stats || [];
      rows.push({ week: m.week, opp: (m.opponent || {}).abbreviation || '', result: m.gameResult || '', targets: g(s, 'receivingTargets'), rec: g(s, 'receptions'), recYds: g(s, 'receivingYards'), recTD: g(s, 'receivingTouchdowns'), carries: g(s, 'rushingAttempts'), rushYds: g(s, 'rushingYards'), rushTD: g(s, 'rushingTouchdowns'), passAtt: g(s, 'passingAttempts'), passYds: g(s, 'passingYards'), passTD: g(s, 'passingTouchdowns'), int: g(s, 'interceptions') });
    })));
    rows.forEach((r) => { r.touches = r.targets + r.carries + r.passAtt; r.td = r.recTD + r.rushTD + r.passTD; });
    return rows.filter((r) => r.week != null).sort((a, b) => a.week - b.week);
  }
  function usage(rows) {
    const g = rows || []; if (!g.length) return null;
    const qb = g.some((r) => r.passAtt > 0);
    const yds = (r) => qb ? r.passYds : r.recYds + r.rushYds;
    const avg = (arr, f) => arr.length ? r1(arr.reduce((t, r) => t + f(r), 0) / arr.length) : 0;
    const last3 = g.slice(-3);
    return { qb, games: g.length, touchesAvg: avg(g, (r) => r.touches), touchesLast3: avg(last3, (r) => r.touches), ydsAvg: avg(g, yds), ydsLast3: avg(last3, yds), tdTotal: g.reduce((t, r) => t + r.td, 0), tdLast3: last3.reduce((t, r) => t + r.td, 0), targetsAvg: avg(g, (r) => r.targets), carriesAvg: avg(g, (r) => r.carries) };
  }

  // Postseason meetings between two managers off League History's PAIRS table.
  function rivalry(stats, a, b) {
    const pairs = (stats && stats.PAIRS) || [];
    const p = pairs.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (!p) return { games: [], aWins: 0, bWins: 0 };
    const flip = p.a !== a;
    const games = (p.games || []).map((g) => ({ year: g.yr, kind: g.kind, round: g.rd || '', aScore: flip ? g.ys : g.xs, bScore: flip ? g.xs : g.ys, aTeam: flip ? g.yt : g.xt, bTeam: flip ? g.xt : g.yt })).map((g) => Object.assign(g, { winner: g.aScore > g.bScore ? a : b })).sort((x, y) => y.year - x.year);
    return { games, aWins: games.filter((g) => g.winner === a).length, bWins: games.filter((g) => g.winner === b).length };
  }
  const roundLabel = (k, rd) => k === 'fin' ? 'Championship' : k === 'r1' ? 'Playoff round 1' : k === 'r2' ? 'Playoff semifinal' : k === 'cb' ? 'Cum Bowl bracket' : k === 'con' ? 'Consolation' : k === 'plc' ? 'Placement game' : (rd || 'Postseason');

  const model = { num, Phi, parseLine, windowOf, kickoffET, gameIndex, buildPlayers, leagueSd, outlook, edges, stacks, drivers, benchCompare, weekly, consistency, parseGamelog, usage, rivalry, roundLabel, isStarting, isBenched, posOf, displaySlot, SLOT_ORDER };

  // ───────────────────────────── render ─────────────────────────────
  const ME = '#22d37f', OPP = '#f5a524';
  const f1 = (v) => v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1);
  const fs = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + f1(Math.abs(v));
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const H = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function curvesSVG(o, W) {
    const Ht = 180, m = { t: 14, r: 10, b: 24, l: 10 };
    const rows = [o.me, o.opp];
    const lo = Math.min(...rows.map((r) => r.projFinal - 3.2 * Math.max(r.sd, 3))), hi = Math.max(...rows.map((r) => r.projFinal + 3.2 * Math.max(r.sd, 3)));
    const x0 = Math.floor(lo / 10) * 10, x1 = Math.ceil(hi / 10) * 10;
    const x = (v) => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
    const pdf = (v, mu, sd) => Math.exp(-0.5 * ((v - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
    const peak = Math.max(...rows.map((r) => pdf(r.projFinal, r.projFinal, Math.max(r.sd, 3))));
    const y = (v) => (Ht - m.b) - v / (peak * 1.1) * (Ht - m.t - m.b);
    let out = `<svg viewBox="0 0 ${W} ${Ht}" width="100%" role="img" aria-label="Likelihood curves of each team's final score">`;
    for (let t = x0; t <= x1; t += 10) out += `<line x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${Ht - m.b}" class="mhq-grid"/><text x="${x(t)}" y="${Ht - 8}" class="mhq-tick" text-anchor="middle">${t}</text>`;
    rows.forEach((r, i) => {
      const sd = Math.max(r.sd, 3); const c = i === 0 ? ME : OPP; let d = '', a = `M${x(x0)},${Ht - m.b}`;
      for (let v = x0; v <= x1; v += 1) { const px = x(v).toFixed(1), py = y(pdf(v, r.projFinal, sd)).toFixed(1); d += (d ? 'L' : 'M') + px + ',' + py; a += `L${px},${py}`; }
      a += `L${x(x1)},${Ht - m.b}Z`;
      out += `<path d="${a}" fill="${c}" fill-opacity=".18"/><path d="${d}" fill="none" stroke="${c}" stroke-width="2"/>`;
      const py = y(pdf(r.projFinal, r.projFinal, sd));
      out += `<line x1="${x(r.projFinal)}" x2="${x(r.projFinal)}" y1="${py}" y2="${Ht - m.b}" stroke="${c}" stroke-dasharray="3 3"/><text x="${x(r.projFinal) + (i === 0 ? -5 : 5)}" y="${py - 5}" class="mhq-lbl" text-anchor="${i === 0 ? 'end' : 'start'}">${f1(r.projFinal)}</text>`;
    });
    return out + '</svg>';
  }
  function lineSVG(rows, W) {
    const Ht = 190, m = { t: 12, r: 14, b: 24, l: 30 };
    const vals = rows.flatMap((r) => [r.me, r.opp, r.leagueAvg]).filter((v) => v != null);
    if (!vals.length) return '<div class="mhq-empty">No weeks scored yet.</div>';
    const y0 = Math.floor((Math.min(...vals) - 10) / 10) * 10, y1 = Math.ceil((Math.max(...vals) + 10) / 10) * 10;
    const x = (i) => rows.length > 1 ? m.l + i / (rows.length - 1) * (W - m.l - m.r) : W / 2;
    const y = (v) => (Ht - m.b) - (v - y0) / (y1 - y0) * (Ht - m.t - m.b);
    let out = `<svg viewBox="0 0 ${W} ${Ht}" width="100%" role="img" aria-label="Weekly scores for both teams with the league average">`;
    for (let t = y0; t <= y1; t += 20) out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" class="mhq-grid"/><text x="${m.l - 6}" y="${y(t) + 4}" class="mhq-tick" text-anchor="end">${t}</text>`;
    rows.forEach((r, i) => { out += `<text x="${x(i)}" y="${Ht - 6}" class="mhq-tick" text-anchor="middle">Wk ${r.week}</text>`; });
    const path = (k, c, dashed) => { const pts = rows.map((r, i) => r[k] == null ? null : `${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).filter(Boolean); if (!pts.length) return ''; let s = `<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="4 4"' : ''}/>`; if (!dashed) rows.forEach((r, i) => { if (r[k] != null) s += `<circle cx="${x(i)}" cy="${y(r[k])}" r="3.5" fill="${c}"/>`; }); return s; };
    return out + path('leagueAvg', '#5b6c92', true) + path('opp', OPP, false) + path('me', ME, false) + '</svg>';
  }
  function barsSVG(rows, valOf, label, color, W) {
    const Ht = 170, m = { t: 22, r: 8, b: 22, l: 28 };
    if (!rows.length) return '<div class="mhq-empty">No games logged.</div>';
    const mx = Math.max(...rows.map(valOf), 1) * 1.15;
    const bw = (W - m.l - m.r) / rows.length; const w = Math.min(30, bw * 0.7);
    let out = `<svg viewBox="0 0 ${W} ${Ht}" width="100%" role="img" aria-label="${H(label)}"><text x="${m.l}" y="12" class="mhq-lbl">${H(label)}</text>`;
    rows.forEach((r, i) => { const v = valOf(r); const h = v / mx * (Ht - m.t - m.b); const cx = m.l + bw * i + bw / 2; out += `<rect x="${cx - w / 2}" y="${Ht - m.b - h}" width="${w}" height="${h}" rx="4" fill="${color}"/><text x="${cx}" y="${Ht - m.b - h - 4}" class="mhq-tick" text-anchor="middle">${v}</text><text x="${cx}" y="${Ht - 6}" class="mhq-tick" text-anchor="middle">Wk ${r.week}</text>`; });
    return out + '</svg>';
  }
  function rangeRow(label, lo, mid, hi, c, span) {
    if (lo == null || hi == null) return `<div class="mhq-rr"><span>${H(label)}</span><span class="mhq-muted">not enough weeks</span></div>`;
    const x = (v) => (100 * (v - span[0]) / (span[1] - span[0])).toFixed(1);
    return `<div class="mhq-rr"><span>${H(label)}</span><div class="mhq-rt"><i class="ln" style="left:${x(lo)}%;width:${(x(hi) - x(lo)).toFixed(1)}%;background:${c}"></i><i class="dt" style="left:${x(mid)}%;background:${c}"></i><b class="lb" style="left:${x(lo)}%">${f1(lo)}</b><b class="lb" style="left:${x(hi)}%">${f1(hi)}</b><b class="lb mid" style="left:${x(mid)}%">${f1(mid)}</b></div></div>`;
  }

  function render(box, ctx) {
    // Repaints share this mount. Dispose old handlers so one refresh tap
    // cannot invoke every prior render's callback and start duplicate syncs.
    box._mhqEvents?.abort();
    box._mhqResize?.disconnect();
    const events = new AbortController(); box._mhqEvents = events;
    const L = ctx.L || {}; const games = ctx.games || [];
    const players = buildPlayers(L, games);
    const M = L.matchup || {};
    const meName = (M.me && M.me.team) || L.team || 'My team';
    const oppName = (M.opponent && M.opponent.team) || (L.opponent || {}).opponent || 'Opponent';
    const score = { me: num(M.me && M.me.score) || 0, opp: num(M.opponent && M.opponent.score) || 0 };
    const seasonTeams = ((L.season || {}).teams) || [];
    const standings = seasonTeams.slice().sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor));
    const meT = seasonTeams.find((t) => t.isMe), oppT = seasonTeams.find((t) => t.team === oppName);
    const rankOf = (t) => t ? standings.indexOf(t) + 1 : null;
    const snapshotIssue = globalThis.SportsHubFantasySync?.snapshotIssue(L) ||
      (!globalThis.SportsHubFantasySync ? 'Saved matchup validation is unavailable. Please reload the app.' : '');
    const weekLabel = snapshotIssue ? 'Saved matchup' : (ctx.weekLabel || '');
    // Keep exploration through background syncs, but never carry scenarios
    // into a different matchup. No fantasy records are written here.
    const stateKey = [ctx.season, M.week || ctx.weekLabel, meName, oppName].join('|');
    const state = box._mhqState?.key === stateKey ? box._mhqState :
      { key: stateKey, page: 'overview', over: {}, pick: null, logs: {}, hist: null, labSide: 'me' };
    box._mhqState = state;
    state.page = ctx.page || state.page;
    if (state.logStamp !== L.coreSyncedAt && L.coreSyncedAt) { state.logs = {}; state.logStamp = L.coreSyncedAt; }
    Object.keys(state.over).forEach(name => {
      const p = players.find(p => p.player === name && p.starter && !p.played && !p.bye);
      if (!p) delete state.over[name];
      else if (p.live) state.over[name] = Math.max(state.over[name], p.points || 0);
    });
    let intelRequest = 0;
    const o0 = outlook(players, score, seasonTeams);
    const weekOK = games.length > 0;
    const anyProj = players.some((p) => p.proj > 0);
    const dataIssue = snapshotIssue || (!weekOK ? 'NFL game status is loading. Your saved league is visible; win chance will return when game status is available.' : '') ||
      (['me','opp'].some(side => !players.some(p=>p.side===side && p.starter) ||
        players.some(p=>p.side===side && p.starter && !p.played && !p.bye && !p.projectionAvailable))
        ? 'Some starter projections have not loaded. Win chance is unavailable until those projections arrive.' : '');

    const recOf = (t) => t ? `${t.wins}-${t.losses}${t.ties ? '-' + t.ties : ''} · ${ord(rankOf(t))} of ${seasonTeams.length}` : '';
    const board = () => {
      const o = outlook(players, score, seasonTeams);
      const mx = Math.max(o.me.projFinal, o.opp.projFinal, 1) * 1.05;
      const started = score.me > 0 || score.opp > 0;
      const pill = o.me.winPct >= 65 ? 'You are favored' : o.me.winPct <= 35 ? 'They are favored' : 'Toss-up';
      const st = stacks(players)[0];
      const take = !anyProj ? 'ESPN has not posted this week’s projections yet, so the finals and win chance below are banked points only.'
        : `${started ? (score.me > score.opp ? 'You lead' : score.me < score.opp ? 'You trail' : 'Level') + ' so far' : 'Nobody has kicked off yet'}. ${st ? `<b>${st.share}%</b> of your remaining projection rides on ${H(st.game)}.` : `You have ${o.me.left} starters left; they have ${o.opp.left}.`}`;
      return `<div class="mhq-board">
        <div class="mhq-brow">
          <div class="mhq-team"><span class="mhq-side me">YOUR TEAM</span><span class="nm">${H(meName)}</span><span class="rec">${H(recOf(meT))}</span><span class="sc me">${f1(score.me)}</span><span class="score-label">Points scored</span><span class="pj">Projected final <b>${f1(o.me.projFinal)}</b></span></div>
          <div class="mhq-mid"><span class="mhq-pill">${pill}</span><span class="wp">${f1(o.me.winPct)}%</span><span class="lab">estimated win chance</span><span class="lab">projected margin ${fs(o.me.margin)}</span></div>
          <div class="mhq-team right"><span class="mhq-side opp">OPPONENT</span><span class="nm">${H(oppName)}</span><span class="rec">${H(recOf(oppT))}</span><span class="sc opp">${f1(score.opp)}</span><span class="score-label">Points scored</span><span class="pj">Projected final <b>${f1(o.opp.projFinal)}</b></span></div>
        </div>
        <div class="mhq-bars">
          <div class="mhq-bar"><div class="mhq-track"><i style="width:${(100 * o.me.banked / mx).toFixed(1)}%;background:${ME}"></i><i class="rem" style="width:${(100 * o.me.remaining / mx).toFixed(1)}%;background:${ME}"></i></div><span>${f1(o.me.banked)} scored · ${f1(o.me.remaining)} projected to come · ${o.me.left} left</span></div>
          <div class="mhq-bar right"><div class="mhq-track"><i style="width:${(100 * o.opp.banked / mx).toFixed(1)}%;background:${OPP}"></i><i class="rem" style="width:${(100 * o.opp.remaining / mx).toFixed(1)}%;background:${OPP}"></i></div><span>${f1(o.opp.banked)} scored · ${f1(o.opp.remaining)} projected to come · ${o.opp.left} left</span></div>
        </div>
        <p class="mhq-take">${take}</p></div>`;
    };

    const overview = () => {
      const ed = edges(players);
      const edgeRows = ed.map((r) => `<div class="mhq-edge-row"><div class="mhq-edge-player"><b>${H(r.mine) || 'Empty slot'}</b><span>${f1(r.mineVal)} <small>${r.minePlayed ? 'FINAL' : players.find(p => p.player === r.mine)?.live ? 'LIVE' : 'PROJ'}</small></span></div><div class="mhq-edge-center"><span>${H(r.slot)}</span><strong class="${r.edge > 0 ? 'good' : r.edge < 0 ? 'bad' : 'muted'}">${fs(r.edge)}</strong></div><div class="mhq-edge-player theirs"><b>${H(r.theirs) || 'Empty slot'}</b><span>${f1(r.theirsVal)} <small>${r.theirsPlayed ? 'FINAL' : players.find(p => p.player === r.theirs)?.live ? 'LIVE' : 'PROJ'}</small></span></div></div>`).join('');
      const dr = drivers(players).map((d, i) => `<li><span class="ic" style="background:${d.side === 'me' ? ME : OPP}22;color:${d.side === 'me' ? ME : OPP}">${i + 1}</span><div><div class="hd">${H(d.title)}</div><div class="mhq-muted">${H(d.detail)}</div></div></li>`).join('') || '<li class="mhq-muted">Nothing to flag: no starters left to play.</li>';
      const spot = ['me', 'opp'].flatMap((s) => players.filter((p) => p.side === s && p.starter).sort((a, b) => val(b) - val(a)).slice(0, 4));
      const spMax = Math.max(...spot.map(val), 1);
      const spotHTML = spot.map((p) => `<button type="button" class="mhq-sp" ${['D/ST','K'].includes(p.pos) ? 'disabled' : `data-inspect="${H(p.player)}"`} aria-label="${H(p.player)} player details"><span class="pos">${H(p.slot)}</span><div class="nm">${H(p.player)}<small>${p.side === 'me' ? 'You' : 'Them'} · ${H(p.nfl)} ${H(p.vs)} · ${p.played ? 'final' : p.live ? 'live' : 'projected'}</small></div><span class="pt">${f1(val(p))}</span><div class="bar"><i style="width:${(100 * val(p) / spMax).toFixed(1)}%;background:${p.side === 'me' ? ME : OPP};opacity:${p.played || p.live ? 1 : 0.45}"></i></div></button>`).join('');
      // Rooting guide: every game with a starter on either side, by window.
      const idx = gameIndex(games); const starters = players.filter((p) => p.starter);
      const wins = {};
      Object.values(idx).forEach((g) => { if (wins[g.game] !== undefined) return; const who = starters.filter((p) => p.game === g.game); if (!who.length) { wins[g.game] = null; return; } wins[g.game] = { g, who }; });
      const byWin = {};
      Object.values(wins).filter(Boolean).forEach(({ g, who }) => { const w = byWin[g.window] = byWin[g.window] || { window: g.window, order: g.windowOrder, done: g.state === 'post', games: [] }; w.games.push({ g, who }); });
      const stripHTML = Object.values(byWin).sort((a, b) => a.order - b.order).map((w) => `<section class="mhq-slot${w.games.every(({ g }) => g.state === 'post') ? ' done' : ''}"><h4 class="w">${H(w.window)} <span>ET</span></h4>${w.games.map(({ g, who }) => {
        const sides = ['me', 'opp'].map((side) => {
          const names = who.filter((p) => p.side === side).map((p) => `<span class="mhq-root-player">${H(p.player.replace(/ (Jr|Sr)\.?$/, '').replace(' D/ST', ' D'))}</span>`).join('');
          return names ? `<div class="mhq-root-side ${side}"><span class="mhq-root-label">${side === 'me' ? 'Yours' : 'Opponent'}</span><div class="mhq-root-names">${names}</div></div>` : '';
        }).join('');
        const status = g.state === 'post' ? 'Final' : g.state === 'in' ? 'Live' : '';
        const detail = g.state === 'post' ? H(g.score || 'Score unavailable') : g.state === 'in' ? H(g.statusText || 'In progress') + (g.score ? ' · ' + H(g.score) : '') : [g.lineText ? H(g.lineText) : '', g.total != null ? 'O/U ' + H(g.total) : ''].filter(Boolean).join(' · ') || 'Line unavailable';
        return `<div class="mhq-root-game"><div class="mhq-root-heading"><strong>${H(g.game)}</strong>${status ? `<span class="mhq-root-status ${g.state}">${status}</span>` : ''}</div><div class="mhq-root-detail">${detail}</div>${sides}</div>`;
      }).join('')}</section>`).join('') || '<div class="mhq-empty">Could not load this week’s NFL slate, so the rooting guide is empty. This is a failed feed, not a bye week for everyone.</div>';
      const bye = players.filter((p) => p.starter && p.bye);
      return `${board()}
        <div class="mhq-grid wide">
          <article class="mhq-card"><h3>Paths to victory</h3><p class="mhq-note">Estimated final-score ranges, based on remaining projections and the league's scoring variation.</p><div class="mhq-legend"><span><i style="background:${ME}"></i>You</span><span><i style="background:${OPP}"></i>${H(oppName)}</span></div><div class="mhq-chart" data-chart="curves"></div></article>
          <article class="mhq-card"><h3>What decides the week</h3><p class="mhq-note">From the remaining starters and the Vegas lines.</p><ul class="mhq-list">${dr}</ul>${bye.length ? `<p class="mhq-note bad">🛌 On bye in your lineup: ${bye.map((p) => H(p.player)).join(', ')}.</p>` : ''}</article>
        </div>
        <div class="mhq-grid wide">
          <article class="mhq-card"><h3>Slot by slot</h3><p class="mhq-note">Points scored for live/final players; projections for unplayed players. Edge is from your side.</p><div class="mhq-compare-labels"><span class="me">You</span><span>Edge</span><span class="opp">Opponent</span></div><div class="mhq-edges">${edgeRows}</div></article>
          <article class="mhq-card"><h3>Player spotlight</h3><p class="mhq-note">Biggest numbers on each side.</p><div class="mhq-spot">${spotHTML}</div></article>
        </div>
        <article class="mhq-card"><h3>Rooting guide</h3><p class="mhq-note">Your starters and your opponent’s, grouped by kickoff. All times Eastern.</p><div class="mhq-strip">${stripHTML}</div></article>`;
    };

    const scenarioBase = (p) => p.live ? (p.points || 0) + Math.max(0, p.proj - (p.points || 0)) * 0.5 : p.proj;
    const scenarioRange = (o) => {
      const span = [Math.min(o.me.p10, o.opp.p10) - 5, Math.max(o.me.p90, o.opp.p90) + 5];
      return rangeRow('You', o.me.p10, o.me.projFinal, o.me.p90, ME, span) + rangeRow('Opponent', o.opp.p10, o.opp.projFinal, o.opp.p90, OPP, span);
    };
    const lab = () => {
      const o = outlook(players, score, seasonTeams, state.over);
      const changed = Object.keys(state.over).length > 0;
      const rowsFor = (side) => players.filter((p) => p.side === side && p.starter && !p.played && !p.bye).sort((a, b) => b.proj - a.proj).map((p) => {
        const base = scenarioBase(p), v = state.over[p.player] ?? base;
        return `<div class="mhq-lr"><div class="nm">${H(p.player)}<small>${H(p.slot)} · ${H(p.vs)} · ${p.live ? 'Live: ' + f1(p.points) + ' scored' : 'Projection ' + f1(p.proj)}</small></div><input type="range" min="${p.live ? Math.max(0, p.points || 0) : 0}" max="${Math.max(30, Math.ceil(p.proj * 2.5), Math.ceil(base + 15), Math.ceil(v))}" step="0.1" value="${v}" data-player="${H(p.player)}" data-base="${base}" aria-label="${H(p.player)} final points"><output class="v${state.over[p.player] != null ? ' chg' : ''}">${f1(v)}</output></div>`;
      }).join('') || '<div class="mhq-empty">No remaining starters on this side.</div>';
      const bc = benchCompare(players), ups = bc.filter(r => r.change > 0);
      const bcRows = bc.map((r) => `<div class="mhq-bench-row"><span class="mhq-tag">${H(r.slot)}</span><div><b>${H(r.starter)}</b><small>${f1(r.starterProj)} projected</small></div><div>${r.alt ? `<b>${H(r.alt)}</b><small>${f1(r.altProj)} projected${r.altInjury !== 'Active' ? ' · ' + H(r.altInjury) : ''}</small>` : '<small>No eligible alternative</small>'}</div><strong class="${r.change > 0 ? 'good' : r.change < 0 ? 'muted' : ''}">${r.alt ? fs(r.change) : '–'}</strong></div>`).join('');
      return `<div class="mhq-grid wide">
        <article class="mhq-card" id="mhq-scenario"><div class="mhq-section-head"><h3>What if?</h3><button type="button" class="mhq-btn" data-act="reset">Reset</button></div><p class="mhq-note">Adjust final player scores to explore the matchup. Completed players are locked.</p>
          <div class="mhq-kpis"><div class="mhq-kpi"><span class="lab">Your final</span><span class="big me" data-k="me">${f1(o.me.projFinal)}</span><span class="sub" data-k="me-d">${changed ? fs(o.me.projFinal - o0.me.projFinal) + ' vs baseline' : 'Baseline projection'}</span></div><div class="mhq-kpi"><span class="lab">Their final</span><span class="big opp" data-k="opp">${f1(o.opp.projFinal)}</span><span class="sub" data-k="opp-d">${changed ? fs(o.opp.projFinal - o0.opp.projFinal) + ' vs baseline' : 'Baseline projection'}</span></div><div class="mhq-kpi"><span class="lab">Win estimate</span><span class="big win" data-k="win">${f1(o.me.winPct)}%</span><span class="sub" data-k="win-d">${changed ? fs(o.me.winPct - o0.me.winPct) + ' pp vs baseline' : 'HQ estimate'}</span></div></div>
          <div class="mhq-segment" role="group" aria-label="Scenario team"><button type="button" data-lab-side="me" aria-pressed="${state.labSide === 'me'}">Your players</button><button type="button" data-lab-side="opp" aria-pressed="${state.labSide === 'opp'}">Opponent</button></div>
          <div class="mhq-lab">${rowsFor(state.labSide)}</div><p class="mhq-note">Exploration only. Your ESPN lineup stays unchanged.</p></article>
        <div class="mhq-col">
          <article class="mhq-card"><h3>Floor, projection, ceiling</h3><p class="mhq-note">Estimated 10th, 50th and 90th percentile finals. Updates with your scenario.</p><div class="mhq-range" data-scenario-range>${scenarioRange(o)}</div></article>
          <article class="mhq-card"><h3>Starter vs bench</h3><p class="mhq-note">${ups.length ? `Higher projections at ${ups.map(r => H(r.slot)).join(', ')}.` : 'No projected upgrades among the eligible options.'} Each slot is evaluated separately; the same bench player may appear more than once.</p><div class="mhq-bench-labels"><span>Slot</span><span>Starter</span><span>Best bench</span><span>Δ</span></div><div>${bcRows || '<div class="mhq-empty">No unlocked starters to compare.</div>'}</div><p class="mhq-note">Live, completed, bye, reserve and out bench players are excluded. Check injury news before moving a player.</p></article>
        </div></div>`;
    };

    const intelCandidates = () => players.filter(p => !['D/ST', 'K'].includes(p.pos)).sort((a, b) => (a.side === 'me' ? 0 : 1) - (b.side === 'me' ? 0 : 1) || (b.starter - a.starter) || b.proj - a.proj);
    const intel = () => {
      const cands = intelCandidates();
      if (!cands.length) return '<article class="mhq-card"><div class="mhq-empty">No skill-position players to look up.</div></article>';
      if (!cands.some(p => p.player === state.pick)) state.pick = (cands.find(p => p.side === 'me' && p.starter && !p.played) || cands[0]).player;
      const groups = [['me', 'Your'], ['opp', 'Opponent']].map(([side, label]) =>
        [['starter','starters'], ['bench','bench'], ['reserve','reserve']].map(([kind, title]) => {
          const list = cands.filter(p => p.side === side && (kind === 'reserve' ? !p.starter && !p.bench : p[kind]));
          return list.length ? `<optgroup label="${label} ${title}">${list.map(p => `<option value="${H(p.player)}" ${p.player === state.pick ? 'selected' : ''}>${H(p.player)} · ${H(p.pos)} · ${H(p.nfl)}</option>`).join('')}</optgroup>` : '';
        }).join('')).join('');
      return `<article class="mhq-card mhq-intel"><div class="mhq-section-head"><h3>Player intel</h3><span class="mhq-note">Both rosters · ${cands.length} players</span></div><div class="mhq-player-picker"><label class="mhq-sr-only" for="mhq-player-select">Choose a player</label><select id="mhq-player-select">${groups}</select><button type="button" class="mhq-btn" data-act="prev-player" aria-label="Previous player">←</button><button type="button" class="mhq-btn" data-act="next-player" aria-label="Next player">→</button></div><div id="mhq-player-profile"></div><div id="mhq-intel-body" aria-busy="true"><div class="mhq-empty" role="status">Loading game log…</div></div></article>`;
    };
    const playerProfile = (p) => `<div class="mhq-player-profile ${p.side}"><span class="mhq-position">${H(p.pos)}</span><div><h3>${H(p.player)}</h3><p>${p.side === 'me' ? 'Your team' : 'Opponent'} · ${H(p.nfl)} · ${p.starter ? H(p.slot) + ' starter' : p.bench ? 'Bench' : 'Reserve'}<br>${H(p.vs || 'Game unavailable')}${p.kickoffET ? ' · ' + H(p.kickoffET) + ' ET' : ''}</p></div><div class="mhq-profile-score"><b>${f1(p.played || p.live ? p.points : p.projectionAvailable ? p.proj : null)}</b><small>${p.played ? 'FINAL' : p.live ? 'LIVE' : 'PROJ'}</small></div></div>`;
    const intelBody = async () => {
      const body = box.querySelector('#mhq-intel-body'); if (!body) return;
      const p = players.find((x) => x.player === state.pick); if (!p) return;
      const request = ++intelRequest;
      const profile = box.querySelector('#mhq-player-profile'); if (profile) profile.innerHTML = playerProfile(p);
      body.setAttribute('aria-busy', 'true');
      body.innerHTML = '<div class="mhq-empty" role="status">Loading game log…</div>';
      if (!p.id) { body.setAttribute('aria-busy','false'); body.innerHTML = '<div class="mhq-empty">Game-log link unavailable for this player. Their saved roster and matchup details are shown above.</div>'; return; }
      let rows = state.logs[p.id], failed = false;
      if (!rows) {
        try { const json = await ctx.fetchJSON(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${encodeURIComponent(p.id)}/gamelog?season=${encodeURIComponent(ctx.season || new Date().getFullYear())}`, 60 * 60 * 1000, 15000); rows = parseGamelog(json); }
        catch (e) { rows = null; failed = true; }
        if (events.signal.aborted || request !== intelRequest || state.pick !== p.player || !body.isConnected) return;
        if (!failed) state.logs[p.id] = rows || [];
      }
      body.setAttribute('aria-busy', 'false');
      if (!rows || !rows.length) { body.innerHTML = `<div class="mhq-empty" role="status"><b>${failed ? 'Game log unavailable' : 'No game log returned'}</b>${failed ? 'ESPN did not answer. Your player and matchup details are still here.' : 'No games were returned for this season; this is not a zero.'}<button type="button" class="mhq-btn" data-act="retry-intel">Retry game log</button></div>`; return; }
      const u = usage(rows); const c = p.side === 'me' ? ME : OPP;
      const trend = u.touchesLast3 - u.touchesAvg;
      const notes = [
        [trend > 1 ? 'Usage trending up' : trend < -1 ? 'Usage trending down' : 'Usage steady', `${u.qb ? 'Pass attempts' : 'Opportunities'} last 3 games ${f1(u.touchesLast3)} vs ${f1(u.touchesAvg)} on the season.`],
        p.played ? [`Already played: ${f1(p.points)} points`, `Final for this week (${p.vs}).`] : [`This week: ${p.vs || 'no game'}${p.kickoffET ? ', ' + p.kickoffET : ''}`, `${p.implied == null ? 'No line yet. ' : `Vegas team total ${f1(p.implied)}, spread ${p.spread > 0 ? '+' : ''}${p.spread}. `}ESPN projects ${f1(p.proj)}${p.seasonAvg != null ? ` (season average ${f1(p.seasonAvg)})` : ''}.${p.prk ? ` ESPN position matchup rank: #${p.prk}.` : ''}`],
        [`Injury status: ${p.injury}`, `ESPN's listing as of the last sync. Verify before kickoff.`],
      ].map((n, i) => `<li><span class="ic">${i + 1}</span><div><div class="hd">${H(n[0])}</div><div class="mhq-muted">${H(n[1])}</div></div></li>`).join('');
      const log = rows.slice().reverse().map((r) => `<tr><td>${r.week}</td><td>${H(r.opp)} ${H(r.result)}</td><td class="num">${r.touches}</td><td class="num">${r.recYds}</td><td class="num">${r.rushYds}</td><td class="num">${r.passYds}</td><td class="num">${r.td}</td></tr>`).join('');
      body.innerHTML = `<div class="mhq-grid wide"><div class="mhq-col">
          <div class="mhq-stat3"><div class="s"><span class="lab">${u.qb ? 'Pass attempts / game' : 'Opportunities / game'}</span><span class="big">${f1(u.touchesAvg)}</span><span class="lab">last 3: ${f1(u.touchesLast3)}</span></div><div class="s"><span class="lab">${u.qb ? 'Pass yards / game' : 'Yards / game'}</span><span class="big">${f1(u.ydsAvg)}</span><span class="lab">last 3: ${f1(u.ydsLast3)}</span></div><div class="s"><span class="lab">Touchdowns</span><span class="big">${u.tdTotal}</span><span class="lab">last 3: ${u.tdLast3}</span></div></div>
          <div class="mhq-chart" data-usage-chart></div>
          <div class="mhq-chart" data-yards-chart></div></div>
        <div class="mhq-col"><article class="mhq-card inner"><h3>Matchup notes</h3><ul class="mhq-list">${notes}</ul></article>
          <details class="mhq-fold"><summary>Full game log <span>${rows.length} games</span></summary><div class="mhq-tw"><table class="mhq-tbl"><thead><tr><th>Wk</th><th>Opp</th><th class="num">${u.qb ? 'Att' : 'Opps'}</th><th class="num">Rec yds</th><th class="num">Rush yds</th><th class="num">Pass yds</th><th class="num">TD</th></tr></thead><tbody>${log}</tbody></table></div><p class="mhq-note">Opportunities = targets + carries; quarterbacks show pass attempts. TD includes receiving, rushing and passing.</p></details></div></div>`;
      const drawUsage = () => {
        if (!body.isConnected || state.pick !== p.player || events.signal.aborted) return;
        const a = body.querySelector('[data-usage-chart]'), b = body.querySelector('[data-yards-chart]');
        if (a) a.innerHTML = barsSVG(rows, r => r.touches, u.qb ? 'Pass attempts by week' : 'Opportunities by week', c, Math.max(220, a.clientWidth));
        if (b) b.innerHTML = barsSVG(rows, r => u.qb ? r.passYds : r.recYds + r.rushYds, u.qb ? 'Passing yards by week' : 'Scrimmage yards by week', c, Math.max(220, b.clientWidth));
      };
      state.drawUsage = drawUsage; drawUsage();
    };

    const history = () => {
      const wk = weekly(seasonTeams, meName, oppName); const cs = consistency(seasonTeams, meName, oppName);
      const vals = [cs.me.p10, cs.me.p90, cs.opp.p10, cs.opp.p90].filter((v) => v != null);
      const span = vals.length ? [Math.min(...vals) - 5, Math.max(...vals) + 5] : [0, 1];
      const rankIf = (w) => meT ? standings.filter((t) => !t.isMe && (t.wins > w || (t.wins === w && t.pointsFor > meT.pointsFor))).length + 1 : null;
      const po = meT ? `<div class="mhq-stat3"><div class="s"><span class="lab">Playoff odds now</span><span class="big">${meT.playoffPct != null ? f1(meT.playoffPct) + '%' : '–'}</span><span class="lab">ESPN's own number</span></div><div class="s"><span class="lab">With a win</span><span class="big">${meT.wins + 1}-${meT.losses}</span><span class="lab">about ${ord(rankIf(meT.wins + 1))} by record</span></div><div class="s"><span class="lab">With a loss</span><span class="big">${meT.wins}-${meT.losses + 1}</span><span class="lab">about ${ord(rankIf(meT.wins))} by record</span></div></div>` : '<div class="mhq-empty">Season standings have not loaded.</div>';
      const standRows = standings.map((t, i) => `<tr class="${t.isMe ? 'hl' : t.team === oppName ? 'hl2' : ''}"><td class="num">${i + 1}</td><td>${H(t.team)}</td><td class="num">${t.wins}</td><td class="num">${t.losses}</td><td class="num">${Math.round(t.pointsFor || 0)}</td><td class="num">${t.playoffPct != null ? f1(t.playoffPct) + '%' : '–'}</td></tr>`).join('');
      return `<div class="mhq-history-summary"><div><span>Your last 3</span><b class="me">${f1(cs.me.last3)}</b><small>points / week</small></div><div><span>Their last 3</span><b class="opp">${f1(cs.opp.last3)}</b><small>points / week</small></div><div><span>Season sample</span><b>${cs.me.n}</b><small>scored weeks · you</small></div></div><div class="mhq-grid wide">
        <article class="mhq-card" id="mhq-rivalry"><h3>The rivalry</h3><p class="mhq-note">Postseason meetings from your League History archive (bracket games only; the archive holds no regular-season schedules).</p><div id="mhq-rivalry-body"><div class="mhq-empty">Loading League History…</div></div></article>
        <article class="mhq-card"><h3>Consistency</h3><p class="mhq-note">Each team's scoring range this season: 10th percentile, median, 90th percentile.</p><div class="mhq-range">${rangeRow('You', cs.me.p10, cs.me.p50, cs.me.p90, ME, span)}${rangeRow(oppName, cs.opp.p10, cs.opp.p50, cs.opp.p90, OPP, span)}</div><h3 style="margin-top:12px">Playoff outlook</h3><p class="mhq-note">Where each result would put your record against the current standings; other teams' results this week are not included.</p>${po}</article>
        </div>
        <div class="mhq-grid wide">
        <article class="mhq-card"><h3>Weekly scoring trend</h3><div class="mhq-legend"><span><i style="background:${ME}"></i>You</span><span><i style="background:${OPP}"></i>${H(oppName)}</span><span><i style="background:transparent;border-top:2px dashed #5b6c92;height:0;border-radius:0"></i>League avg</span></div><div class="mhq-chart" data-chart="trend"></div></article>
        <article class="mhq-card"><h3>Standings</h3><div class="mhq-tw"><table class="mhq-tbl mhq-standings"><thead><tr><th class="num">#</th><th>Team</th><th class="num">W</th><th class="num">L</th><th class="num">PF</th><th class="num">Playoff %</th></tr></thead><tbody>${standRows}</tbody></table></div></article></div>`;
    };
    const rivalryBody = async () => {
      const body = box.querySelector('#mhq-rivalry-body'); if (!body) return;
      try {
        if (!state.hist) state.hist = await ctx.loadHistory();
        const { stats, mgrFor, career } = state.hist;
        const me = mgrFor(meName), them = mgrFor(oppName);
        if (!me || !them) { body.innerHTML = `<div class="mhq-empty"><b>Owner not matched</b>League History knows no manager for ${H(!me ? meName : oppName)}; this team name has not been linked to a manager in the archive yet.</div>`; return; }
        const rv = rivalry(stats, me, them);
        const cm = career ? career(me) : null, co = career ? career(them) : null;
        const rows = rv.games.map((g) => `<tr class="${g.kind === 'fin' ? 'hl' : ''}"><td>${g.year}</td><td>${H(roundLabel(g.kind, g.round))}</td><td class="num ${g.winner === me ? 'good' : ''}">${f1(g.aScore)}</td><td class="num ${g.winner === them ? 'good' : ''}">${f1(g.bScore)}</td><td>${g.winner === me ? 'You' : H(them)}</td></tr>`).join('');
        const car = (c) => c ? `${c.w}-${c.l} · ${c.t1} title${c.t1 === 1 ? '' : 's'} · ${c.po} playoff trips · avg finish ${f1(c.avgPlace)}` : 'no career record';
        body.innerHTML = `<div class="mhq-h2h"><div><div class="nm">You</div><div class="sm">${H(me)}</div></div><div><div class="big">${rv.aWins} – ${rv.bWins}</div><div class="sm">postseason record</div></div><div><div class="nm">${H(oppName)}</div><div class="sm">${H(them)}</div></div></div>
          ${rows ? `<div class="mhq-tw"><table class="mhq-tbl"><thead><tr><th>Year</th><th>Round</th><th class="num">You</th><th class="num">${H(them)}</th><th>Winner</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="mhq-empty">No postseason meetings on record.</div>'}
          <p class="mhq-note">Careers (${cm ? cm.seasons : '–'} and ${co ? co.seasons : '–'} seasons): you ${H(car(cm))}; ${H(them)} ${H(car(co))}. <a href="https://mcdermottj639.github.io/League-History/" target="_blank" rel="noopener">Open League History ↗</a></p>`;
      } catch (e) { body.innerHTML = '<div class="mhq-empty"><b>Couldn’t load League History</b>The archive lives at mcdermottj639.github.io/League-History; it did not answer. Nothing is cached here by design.</div>'; }
    };

    const tabs = [['overview', 'Overview'], ['lab', 'Lineup lab'], ['intel', 'Player intel'], ['history', 'History']];
    const paint = () => {
      const page = state.page;
      box.innerHTML = `<div class="mhq">
        <div class="mhq-top"><div class="mhq-brand"><span class="logo" aria-hidden="true">HQ</span><h2>Matchup HQ${weekLabel ? ' · ' + H(weekLabel) : ''}</h2><button type="button" class="mhq-btn back" data-act="back">← Fantasy</button></div>
          <p class="mhq-sub">${H(meName)} vs ${H(oppName)} · ESPN league data${L.syncedAt ? ' saved ' + H(ctx.timeAgo ? ctx.timeAgo(L.coreSyncedAt || L.syncedAt) : '') : ''}. <button type="button" class="mhq-link" data-act="resync" data-fantasy-refresh ${ctx.syncStatus?.().busy ? 'disabled' : ''}>${ctx.syncStatus?.().busy ? '🔄 Refreshing…' : '🔄 Refresh from ESPN'}</button></p>
          <p class="mhq-note" data-fantasy-sync-status role="status" aria-live="polite" ${ctx.syncStatus?.().message ? '' : 'hidden'}>${H(ctx.syncStatus?.().message || '')}</p>
          ${L.carried?.season ? `<p class="mhq-note">Season history and standings are saved from ${H(ctx.timeAgo ? ctx.timeAgo(L.carried.season) : new Date(L.carried.season).toLocaleDateString())}; those details have not refreshed yet.</p>` : ''}
          <div class="mhq-tabs" role="tablist" aria-label="Matchup dashboard">${tabs.map(([k, l]) => `<button type="button" role="tab" id="mhq-tab-${k}" aria-controls="mhq-panel" tabindex="${k === page ? 0 : -1}" data-page="${k}" aria-selected="${k === page}">${l}</button>`).join('')}</div></div>
        <div class="mhq-page" id="mhq-panel" role="tabpanel" aria-labelledby="mhq-tab-${page}">${dataIssue ? `<div class="mhq-empty" role="status"><b>Waiting for a complete matchup</b>${H(dataIssue)}</div>` : ''}${dataIssue && ['overview','lab'].includes(page) ? '' : page === 'overview' ? overview() : page === 'lab' ? lab() : page === 'intel' ? intel() : history()}</div>
        <details class="mhq-fold mhq-method"><summary>How the estimates work</summary><p class="mhq-note">Win chance method: projected margin divided by the combined spread of both teams' remaining points, each team's spread being the league's week-to-week scoring swing scaled by the share of its projection still to play. In-progress players count their points so far plus half of what's left of their projection. This is an uncalibrated estimate built on ESPN's projections, not ESPN's number. Player correlations are not modeled.</p></details></div>`;
      drawCharts();
      if (page === 'intel') intelBody();
      if (page === 'history') rivalryBody();
    };
    const drawCharts = () => {
      const cur = box.querySelector('[data-chart="curves"]'); if (cur) cur.innerHTML = curvesSVG(o0, Math.max(220, cur.clientWidth || 360));
      const tr = box.querySelector('[data-chart="trend"]'); if (tr) tr.innerHTML = lineSVG(weekly(seasonTeams, meName, oppName), Math.max(220, tr.clientWidth || 360));
      if (state.page === 'intel') state.drawUsage?.();
    };
    const pickPlayer = (name) => {
      if (!intelCandidates().some(p => p.player === name)) return;
      state.pick = name;
      const sel = box.querySelector('#mhq-player-select'); if (sel) sel.value = name;
      intelBody();
    };
    const openPage = (page, focus = false) => { state.page = page; ctx.onPage?.(page); paint(); if (focus) box.querySelector(`[data-page="${page}"]`)?.focus({preventScroll:true}); };
    box.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-page],[data-act],[data-lab-side],[data-inspect]'); if (!t || !box.contains(t)) return;
      if (t.dataset.page) { openPage(t.dataset.page, true); return; }
      if (t.dataset.inspect) { state.pick = t.dataset.inspect; openPage('intel'); box.querySelector('#mhq-player-select')?.focus({preventScroll:true}); return; }
      if (t.dataset.labSide) { state.labSide = t.dataset.labSide; paint(); box.querySelector(`[data-lab-side="${state.labSide}"]`)?.focus({preventScroll:true}); return; }
      if (t.dataset.act === 'back' && ctx.onBack) { ctx.onBack(); return; }
      if (t.dataset.act === 'resync' && ctx.onResync) { if(t.disabled || ctx.syncStatus?.().busy) return; t.disabled=true; t.textContent = '🔄 Refreshing…'; ctx.onResync(); return; }
      if (t.dataset.act === 'reset') { state.over = {}; paint(); box.querySelector('[data-act="reset"]')?.focus({preventScroll:true}); }
      if (t.dataset.act === 'retry-intel') { const p = players.find(p => p.player === state.pick); if (p) delete state.logs[p.id]; intelBody(); }
      if (['prev-player','next-player'].includes(t.dataset.act)) { const c = intelCandidates(), i = c.findIndex(p => p.player === state.pick); pickPlayer(c[(i + (t.dataset.act === 'next-player' ? 1 : c.length - 1)) % c.length].player); }
    }, {signal:events.signal});
    box.addEventListener('change', ev => { if (ev.target.id === 'mhq-player-select') pickPlayer(ev.target.value); }, {signal:events.signal});
    box.addEventListener('keydown', ev => {
      if (!ev.target.matches('[role="tab"]') || !['ArrowLeft','ArrowRight','Home','End'].includes(ev.key)) return;
      ev.preventDefault(); const i = tabs.findIndex(([key]) => key === state.page);
      const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      openPage(tabs[next][0], true);
    }, {signal:events.signal});
    box.addEventListener('input', (ev) => {
      const inp = ev.target; if (!(inp instanceof HTMLInputElement) || inp.type !== 'range' || !inp.dataset.player) return;
      const v = Number(inp.value), base = Number(inp.dataset.base);
      if (v === base) delete state.over[inp.dataset.player]; else state.over[inp.dataset.player] = v;
      const sp = inp.nextElementSibling; if (sp) { sp.textContent = f1(v); sp.className = 'v' + (state.over[inp.dataset.player] != null ? ' chg' : ''); }
      const o = outlook(players, score, seasonTeams, state.over); const changed = Object.keys(state.over).length > 0;
      const set = (k, txt) => { const e = box.querySelector(`[data-k="${k}"]`); if (e) e.textContent = txt; };
      set('me', f1(o.me.projFinal)); set('opp', f1(o.opp.projFinal)); set('win', f1(o.me.winPct) + '%');
      const range = box.querySelector('[data-scenario-range]'); if (range) range.innerHTML = scenarioRange(o);
      set('me-d', changed ? fs(o.me.projFinal - o0.me.projFinal) + ' vs baseline' : 'Baseline projection'); set('opp-d', changed ? fs(o.opp.projFinal - o0.opp.projFinal) + ' vs baseline' : 'Baseline projection'); set('win-d', changed ? fs(o.me.winPct - o0.me.winPct) + ' pp vs baseline' : 'HQ estimate');
    }, {signal:events.signal});
    paint();
    if (typeof ResizeObserver !== 'undefined') {
      let width = box.clientWidth;
      box._mhqResize = new ResizeObserver(() => { if (box.clientWidth === width || events.signal.aborted) return; width = box.clientWidth; drawCharts(); });
      box._mhqResize.observe(box);
    }
    return { state, players, outlook: o0 };
  }

  return { model, render, version: 1 };
});

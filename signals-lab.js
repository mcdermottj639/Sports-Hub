// Signals Lab (v344): grades Action Network PRO's five spread "signals"
// (Big Money, Sharp Action, Systems, Projections, Top Experts) against the
// closing line, week by week, so the owner can see which (if any) beat the
// -110 break-even instead of trusting the app's badges.
//
//   - data/an-signals.json: the seed set the owner recorded by hand
//     (2026 app weeks 1–8, 116 games), read-only.
//   - localStorage sportshub:signals-lab:v1: games the owner logs on the
//     phone with the form at the bottom of the page. Same shape as the seed
//     rows. Seed rows can't be edited here; logged rows can be removed.
//   - ESPN scoreboard (browser-direct, same public feed app.js uses) fills in
//     final scores for logged games on request; nothing else is fetched.
//
// Grading rule, applied identically to every signal: a signal "wins" when
// the side it sits on covers the closing spread; pushes are excluded. Every
// cut shown is descriptive — the method notes on the page say why none of
// them is proof. Pure helpers live under SportsHubSignalsLab._pure and are
// tested by tests/signals-lab.test.js.
(function signalsLab(root) {
  'use strict';

  const SIG = { B: 'Big Money', S: 'Sharp Action', Y: 'Systems', P: 'Projections', E: 'Top Experts' };
  const KEYS = Object.keys(SIG);
  const STORE = 'sportshub:signals-lab:v1';
  const BREAK_EVEN = 52.38; // win % needed at -110
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  // ---- pure ---------------------------------------------------------------

  // Away ATS margin: positive = away covered, 0 = push.
  function grade(g) {
    if (!Number.isFinite(g.awayScore) || !Number.isFinite(g.homeScore) || !Number.isFinite(g.spreadAway)) return null;
    const m = g.awayScore - g.homeScore + g.spreadAway;
    const away = m > 0 ? 'W' : m < 0 ? 'L' : 'P';
    const flip = { W: 'L', L: 'W', P: 'P' };
    return { away, home: flip[away] };
  }

  // One row per side: { team, signals:Set, result, spread, isFav, week, moves, strength }
  function sides(games) {
    const out = [];
    for (const g of games) {
      const r = grade(g);
      if (!r) continue;
      const mk = (s, res, spread) => ({
        team: s.team, signals: new Set(s.signals || []), result: res, spread, isFav: spread < 0,
        week: g.week, moves: s.sharpMoves ?? null, strength: s.sharpStrength ?? null, game: g,
      });
      out.push(mk(g.away, r.away, g.spreadAway), mk(g.home, r.home, -g.spreadAway));
    }
    return out;
  }

  function record(rows) {
    let w = 0, l = 0, p = 0;
    for (const r of rows) { if (r.result === 'W') w++; else if (r.result === 'L') l++; else p++; }
    const n = w + l;
    const pct = n ? (w / n) * 100 : null;
    const z = n ? (w - n / 2) / Math.sqrt(n / 4) : null; // vs a 50% coin
    return { w, l, p, n, pct, z, text: `${w}-${l}${p ? `-${p}` : ''}` };
  }

  // Everything the page shows, from a games array.
  function summarize(games) {
    const rows = sides(games);
    const bySig = {};
    for (const k of KEYS) {
      const on = rows.filter((r) => r.signals.has(k));
      bySig[k] = {
        key: k, label: SIG[k],
        all: record(on),
        alone: record(on.filter((r) => r.signals.size === 1)),
        fav: record(on.filter((r) => r.isFav)),
        dog: record(on.filter((r) => !r.isFav)),
        fade: record(on.map((r) => ({ result: r.result === 'W' ? 'L' : r.result === 'L' ? 'W' : 'P' }))),
      };
    }
    const pairs = [];
    for (let i = 0; i < KEYS.length; i++) for (let j = i + 1; j < KEYS.length; j++) {
      const a = KEYS[i], b = KEYS[j];
      const rec = record(rows.filter((r) => r.signals.has(a) && r.signals.has(b)));
      if (rec.n) pairs.push({ a, b, label: `${SIG[a]} + ${SIG[b]}`, rec });
    }
    // Head to head: a on one side only, b on the other only; record is a's side.
    const h2h = [];
    for (const a of KEYS) for (const b of KEYS) {
      if (a === b) continue;
      const picked = [];
      for (let i = 0; i < rows.length; i += 2) {
        const x = rows[i], y = rows[i + 1];
        for (const [s, t] of [[x, y], [y, x]]) {
          if (s.signals.has(a) && t.signals.has(b) && !t.signals.has(a) && !s.signals.has(b)) picked.push(s);
        }
      }
      const rec = record(picked);
      if (rec.n) h2h.push({ a, b, label: `${SIG[a]} side when ${SIG[b]} is on the other`, rec });
    }
    const byCount = [];
    for (let n = 0; n <= 5; n++) { const rec = record(rows.filter((r) => r.signals.size === n)); if (rec.n) byCount.push({ n, rec }); }
    const moreSide = [], fewerSide = [];
    for (let i = 0; i < rows.length; i += 2) {
      const x = rows[i], y = rows[i + 1];
      if (x.signals.size === y.signals.size) continue;
      const [more, fewer] = x.signals.size > y.signals.size ? [x, y] : [y, x];
      moreSide.push(more); fewerSide.push(fewer);
    }
    // Sharp move buckets (only sides that carry a count).
    const moveBuckets = [[1, 1, '1 move'], [2, 2, '2 moves'], [3, 5, '3–5 moves'], [6, Infinity, '6+ moves']].map(([lo, hi, label]) => ({
      label, rec: record(rows.filter((r) => r.signals.has('S') && r.moves != null && r.moves >= lo && r.moves <= hi)),
    })).filter((b) => b.rec.n);
    const strength = ['Strong', 'Good'].map((s) => ({ label: `Sharp "${s}"`, rec: record(rows.filter((r) => r.signals.has('S') && r.strength === s)) })).filter((b) => b.rec.n);
    const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
    const byWeek = weeks.map((w) => ({ week: w, sig: Object.fromEntries(KEYS.map((k) => [k, record(rows.filter((r) => r.week === w && r.signals.has(k)))])) }));
    return {
      games: games.length, graded: rows.length / 2, bySig, pairs, h2h, byCount,
      moreSide: record(moreSide), fewerSide: record(fewerSide), moveBuckets, strength, byWeek, weeks,
    };
  }

  // Build a game row from the form's raw strings; returns { game } or { error }.
  function parseEntry(f) {
    const team = (s) => String(s || '').trim().toUpperCase();
    const away = team(f.away), home = team(f.home);
    if (!/^[A-Z]{2,4}$/.test(away) || !/^[A-Z]{2,4}$/.test(home) || away === home) return { error: 'Use two different team abbreviations (e.g. PHI, WAS).' };
    const week = Number(f.week);
    if (!Number.isInteger(week) || week < 1 || week > 22) return { error: 'Week must be 1–22.' };
    const sp = Number(f.spreadAway);
    if (!Number.isFinite(sp) || Math.abs(sp) > 30) return { error: 'Away spread must be a number like -3.5 or +7.' };
    const pick = (list) => KEYS.filter((k) => (list || []).includes(k));
    const num = (v) => (v === '' || v == null ? null : Number(v));
    const as = num(f.awayScore), hs = num(f.homeScore);
    if ((as != null && !Number.isInteger(as)) || (hs != null && !Number.isInteger(hs))) return { error: 'Scores must be whole numbers.' };
    const mv = num(f.sharpMoves);
    const g = { week, away: { team: away, signals: pick(f.awaySignals) }, home: { team: home, signals: pick(f.homeSignals) },
      spreadAway: sp, awayScore: as, homeScore: hs, logged: new Date().toISOString() };
    if (mv != null && Number.isInteger(mv) && mv >= 0) {
      const side = f.sharpSide === 'home' ? g.home : f.sharpSide === 'away' ? g.away : null;
      if (side && side.signals.includes('S')) { side.sharpMoves = mv; if (f.sharpStrength) side.sharpStrength = f.sharpStrength; }
    }
    return { game: g };
  }

  // Match ESPN scoreboard events to logged games missing a score.
  // events: [{ competitions:[{ competitors:[{homeAway, team:{abbreviation}, score}], status:{type:{completed}} }] }]
  const ALIAS = { JAX: 'JAC', LAR: 'LA', LV: 'LV', WSH: 'WAS', LVR: 'LV' };
  const norm = (t) => ALIAS[t] || t;
  function fillScores(games, events) {
    let filled = 0;
    const finals = new Map();
    for (const ev of events || []) {
      const c = ev.competitions?.[0];
      if (!c || !c.status?.type?.completed) continue;
      const home = c.competitors?.find((x) => x.homeAway === 'home'), away = c.competitors?.find((x) => x.homeAway === 'away');
      if (!home || !away) continue;
      finals.set(`${norm(away.team?.abbreviation)}@${norm(home.team?.abbreviation)}`, { a: Number(away.score), h: Number(home.score) });
    }
    for (const g of games) {
      if (Number.isFinite(g.awayScore) && Number.isFinite(g.homeScore)) continue;
      const hit = finals.get(`${norm(g.away.team)}@${norm(g.home.team)}`);
      if (hit && Number.isFinite(hit.a) && Number.isFinite(hit.h)) { g.awayScore = hit.a; g.homeScore = hit.h; filled++; }
    }
    return filled;
  }

  const _pure = { SIG, KEYS, BREAK_EVEN, grade, sides, record, summarize, parseEntry, fillScores, norm };
  root.SportsHubSignalsLab = { _pure };
  if (typeof document === 'undefined') return;

  // ---- UI -----------------------------------------------------------------

  let seed = { games: [], weekLabels: {}, missing: [] };
  let logged = [];
  let weekFilter = 'all';

  function load() {
    try { logged = JSON.parse(localStorage.getItem(STORE) || '[]'); if (!Array.isArray(logged)) logged = []; } catch { logged = []; }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(logged)); } catch (e) { console.warn('[signals-lab] save failed', e); } }

  const allGames = () => seed.games.concat(logged);
  const shown = () => weekFilter === 'all' ? allGames() : allGames().filter((g) => String(g.week) === weekFilter);

  const pctCls = (rec) => rec.n === 0 ? '' : rec.pct >= BREAK_EVEN ? 'up' : rec.pct < 50 ? 'down' : 'flat';
  const fmtPct = (rec) => rec.pct == null ? '—' : `${rec.pct.toFixed(0)}%`;
  const recCell = (rec) => `<td class="sl-rec">${esc(rec.text)}</td><td class="sl-pct ${pctCls(rec)}">${fmtPct(rec)}</td>`;
  const small = (rec) => rec.n && rec.n < 20 ? ' <span class="sl-n">n=' + rec.n + '</span>' : '';

  function tiles(s) {
    return `<div class="sl-tiles">${KEYS.map((k) => {
      const r = s.bySig[k].all;
      return `<div class="sl-tile ${pctCls(r)}"><div class="sl-tile-v">${fmtPct(r)}</div><div class="sl-tile-l">${esc(SIG[k])}</div><div class="sl-tile-s">${esc(r.text)}</div></div>`;
    }).join('')}</div>`;
  }

  function table(title, head, rowsHtml, note) {
    return `<section class="sl-card"><h3>${esc(title)}</h3>${note ? `<p class="sl-note">${note}</p>` : ''}<div class="sl-scroll"><table class="sl-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div></section>`;
  }

  function render() {
    const s = summarize(shown());
    const el = document.getElementById('lab');
    const weekOpts = ['all', ...s.weeks.length ? [...new Set(allGames().map((g) => g.week))].sort((a, b) => a - b) : []]
      .map((w) => `<option value="${w}" ${String(w) === weekFilter ? 'selected' : ''}>${w === 'all' ? 'All weeks' : `Week ${w}${seed.weekLabels[w] ? ` · ${seed.weekLabels[w]}` : ''}`}</option>`).join('');
    const sigRows = KEYS.map((k) => { const b = s.bySig[k]; return `<tr><td>${esc(b.label)}</td>${recCell(b.all)}${recCell(b.alone)}${recCell(b.fav)}${recCell(b.dog)}${recCell(b.fade)}</tr>`; }).join('');
    const pairRows = s.pairs.map((p) => `<tr><td>${esc(p.label)}${small(p.rec)}</td>${recCell(p.rec)}</tr>`).join('') || '<tr><td colspan="3">No games with two signals on one side.</td></tr>';
    const h2hRows = s.h2h.filter((h) => h.rec.n >= 5).map((h) => `<tr><td>${esc(h.label)}${small(h.rec)}</td>${recCell(h.rec)}</tr>`).join('') || '<tr><td colspan="3">Fewer than 5 games in every matchup.</td></tr>';
    const countRows = s.byCount.map((c) => `<tr><td>${c.n} signal${c.n === 1 ? '' : 's'} on the side</td>${recCell(c.rec)}</tr>`).join('')
      + `<tr><td>Side with MORE signals</td>${recCell(s.moreSide)}</tr><tr><td>Side with FEWER signals</td>${recCell(s.fewerSide)}</tr>`;
    const sharpRows = s.strength.concat(s.moveBuckets).map((b) => `<tr><td>${esc(b.label)}${small(b.rec)}</td>${recCell(b.rec)}</tr>`).join('') || '<tr><td colspan="3">No sharp move counts in this range (counts come from the game pages, weeks 4–8).</td></tr>';
    const weekRows = s.byWeek.map((w) => `<tr><td>Wk ${w.week}</td>${KEYS.map((k) => `<td class="sl-rec">${esc(w.sig[k].text)}</td>`).join('')}</tr>`).join('');
    const loggedRows = logged.slice().reverse().map((g, i) => {
      const r = grade(g);
      const idx = logged.length - 1 - i;
      const sig = (sd) => sd.signals.length ? sd.signals.join('') : '·';
      return `<tr><td>Wk ${g.week}</td><td>${esc(g.away.team)} ${g.spreadAway > 0 ? '+' : ''}${g.spreadAway} <span class="sl-n">${sig(g.away)}</span></td><td>${esc(g.home.team)} <span class="sl-n">${sig(g.home)}</span></td><td>${Number.isFinite(g.awayScore) ? `${g.awayScore}-${g.homeScore}` : '—'}</td><td>${r ? `${esc(g.away.team)} ${r.away}` : 'pending'}</td><td><button class="sl-x" data-del="${idx}" type="button" aria-label="Remove">✕</button></td></tr>`;
    }).join('');

    el.innerHTML = `
      <div class="sl-head">
        <label class="sl-filter">Show <select id="sl-week">${weekOpts}</select></label>
        <span class="sl-count">${s.graded} graded game${s.graded === 1 ? '' : 's'} · break-even ${BREAK_EVEN.toFixed(1)}% at -110</span>
      </div>
      ${tiles(s)}
      ${table('Each signal, side it sits on', ['Signal', 'All', '%', 'Alone', '%', 'Favorite', '%', 'Underdog', '%', 'Fade it', '%'], sigRows,
        '"Alone" = the only signal lit on that side. "Fade it" = betting the other side.')}
      ${table('Stacking', ['Cut', 'Record', '%'], countRows)}
      ${table('Two signals on the same side', ['Pair', 'Record', '%'], pairRows)}
      ${table('Signals that disagree', ['Matchup', 'Record', '%'], h2hRows, 'Only matchups with 5+ games are listed.')}
      ${table('Sharp Action detail', ['Cut', 'Record', '%'], sharpRows, 'Move counts and Strong/Good come from the game pages, so only weeks 4–8 carry them.')}
      ${table('Week by week', ['Week', ...KEYS.map((k) => SIG[k].split(' ')[0])], weekRows)}
      <details class="sl-method"><summary>How to read this (method + limits)</summary>
        <ul>
          <li>Every signal is graded the same way: did the side it was on cover the <b>closing</b> spread? Pushes are left out.</li>
          <li>Break-even at -110 is 52.4%. Below that, following the signal loses money.</li>
          <li>Closing-line grading hides any value that existed when a move first fired. That's a limit of the data, not a verdict on the pros.</li>
          <li>${s.graded} games across ${s.weeks.length} week${s.weeks.length === 1 ? '' : 's'} is small. Roughly 40 cuts are shown, so one or two will look strong by chance. Treat anything under ~300 games as a hypothesis.</li>
          <li>Seed data: ${seed.games.length} games read from screen recordings of the PRO Signals screen (spread tab). ${esc((seed.missing || []).join('; '))}.</li>
          <li>Logged games live only on this device (localStorage). Seed games can't be edited here.</li>
        </ul>
      </details>
      <section class="sl-card" id="sl-log">
        <h3>Log a game</h3>
        <form id="sl-form" class="sl-form" autocomplete="off">
          <div class="sl-row"><label>Week <input name="week" type="number" min="1" max="22" inputmode="numeric" required value="${esc(nextWeek())}"></label>
            <label>Away <input name="away" maxlength="4" placeholder="PHI" required></label>
            <label>Home <input name="home" maxlength="4" placeholder="WAS" required></label>
            <label>Away spread <input name="spreadAway" placeholder="+5.5" inputmode="decimal" required></label></div>
          <div class="sl-row sl-sig"><span>Away signals</span>${KEYS.map((k) => `<label><input type="checkbox" name="awaySignals" value="${k}"> ${esc(SIG[k])}</label>`).join('')}</div>
          <div class="sl-row sl-sig"><span>Home signals</span>${KEYS.map((k) => `<label><input type="checkbox" name="homeSignals" value="${k}"> ${esc(SIG[k])}</label>`).join('')}</div>
          <div class="sl-row"><label>Sharp moves <input name="sharpMoves" type="number" min="0" inputmode="numeric" placeholder="optional"></label>
            <label>On <select name="sharpSide"><option value="">—</option><option value="away">Away</option><option value="home">Home</option></select></label>
            <label>Strength <select name="sharpStrength"><option value="">—</option><option>Good</option><option>Strong</option></select></label></div>
          <div class="sl-row"><label>Away score <input name="awayScore" type="number" min="0" inputmode="numeric" placeholder="later"></label>
            <label>Home score <input name="homeScore" type="number" min="0" inputmode="numeric" placeholder="later"></label></div>
          <div class="sl-row sl-actions"><button class="fan-btn" type="submit">Add game</button>
            <button class="fan-btn ghost" type="button" id="sl-fill">Fill finals (ESPN)</button></div>
          <p class="sl-msg" id="sl-msg" role="status"></p>
        </form>
        <div class="sl-scroll"><table class="sl-table"><thead><tr><th>Wk</th><th>Away</th><th>Home</th><th>Final</th><th>Away ATS</th><th></th></tr></thead><tbody>${loggedRows || '<tr><td colspan="6">Nothing logged yet.</td></tr>'}</tbody></table></div>
      </section>`;

    document.getElementById('sl-week').addEventListener('change', (e) => { weekFilter = e.target.value; render(); });
    document.getElementById('sl-form').addEventListener('submit', onAdd);
    document.getElementById('sl-fill').addEventListener('click', onFill);
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { logged.splice(Number(b.dataset.del), 1); save(); render(); }));
  }

  function nextWeek() {
    const all = allGames();
    return all.length ? Math.max(...all.map((g) => g.week)) + (logged.length ? 0 : 1) : 1;
  }

  function onAdd(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const f = Object.fromEntries(fd.entries());
    f.awaySignals = fd.getAll('awaySignals'); f.homeSignals = fd.getAll('homeSignals');
    const r = parseEntry(f);
    const msg = document.getElementById('sl-msg');
    if (r.error) { msg.textContent = r.error; msg.classList.add('err'); return; }
    logged.push(r.game); save(); render();
    const m2 = document.getElementById('sl-msg'); m2.textContent = `Added ${r.game.away.team} @ ${r.game.home.team}.`; m2.classList.remove('err');
    document.getElementById('sl-log').scrollIntoView({ block: 'nearest' });
  }

  async function onFill() {
    const msg = document.getElementById('sl-msg');
    const pending = logged.filter((g) => !Number.isFinite(g.awayScore) || !Number.isFinite(g.homeScore));
    if (!pending.length) { msg.textContent = 'Every logged game already has a score.'; msg.classList.remove('err'); return; }
    msg.textContent = 'Reading ESPN finals…'; msg.classList.remove('err');
    let filled = 0;
    try {
      for (const w of [...new Set(pending.map((g) => g.week))]) {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${w}&dates=${seed.season || new Date().getFullYear()}`);
        if (!res.ok) throw new Error(`ESPN ${res.status}`);
        const j = await res.json();
        filled += fillScores(pending, j.events || []);
      }
    } catch (err) {
      msg.textContent = `Couldn't read ESPN (${err.message}). Enter the scores by hand.`; msg.classList.add('err'); return;
    }
    save(); render();
    const m2 = document.getElementById('sl-msg');
    m2.textContent = filled ? `Filled ${filled} final${filled === 1 ? '' : 's'}.` : 'No finals matched yet (games may not be over, or the week number differs from ESPN\'s).';
  }

  async function boot() {
    load();
    try {
      const res = await fetch('data/an-signals.json', { cache: 'no-store' });
      seed = await res.json();
    } catch (err) {
      console.warn('[signals-lab] seed load failed', err);
      document.getElementById('lab').innerHTML = '<p class="sl-msg err">Could not load the seed data (data/an-signals.json).</p>';
      return;
    }
    render();
  }
  document.addEventListener('DOMContentLoaded', boot);
})(typeof globalThis !== 'undefined' ? globalThis : window);

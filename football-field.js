// v330 — Football live field (NFL + CFB). One renderer for the game screen's
// Live Situation card and the compact strip on live games-ahead rows.
// Display-only: it draws what ESPN's live feed says and nothing else.
//
// 🚨 ESPN `yardLine` (situation, play start/end, drive start/end) is the
// distance from the HOME team's goal line: 0 = home goal, 100 = away goal.
// Verified on the 1 Nov 2026 feed: LV ball at LV 16 in LV @ NYJ → 84; DET ball
// at DET 35 in MIN @ DET → 35; DET drive ending in the MIN end zone → 100.
// We draw the AWAY end zone on the LEFT and HOME on the RIGHT (like ESPN), so
// the left-to-right position is x = 100 − yardLine. The pre-v330 bar used
// yardLine directly as the left %, with both ends labelled just "EZ".
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SportsHubFootballField = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hex = v => (/^#?[0-9a-f]{6}$/i.test(String(v || '')) ? '#' + String(v).replace('#', '') : null);
  const light = h => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150; };
  const xOf = yl => 100 - clamp(yl, 0, 100);
  const ORD = ['', '1st', '2nd', '3rd', '4th'];
  const RESULT = { PUNT: 'Punt', FG: 'Field goal', TD: 'Touchdown', INT: 'Interception', FUMBLE: 'Fumble', DOWNS: 'Downs', 'END OF HALF': 'End of half', 'END OF GAME': 'End of game', MISSED_FG: 'Missed FG', 'MISSED FG': 'Missed FG', SAFETY: 'Safety' };

  // situation: ESPN `situation` (scoreboard or summary play end).
  // home/away: { id, abbr, color }. drive: { startYL, endYL, description, result, teamId }.
  // winHome: ESPN live home win probability 0..1. model: { abbr, pct } (saved pregame pick).
  function build({ situation, home, away, drive, winHome, model, lastPlay } = {}) {
    const sit = situation || {};
    const yl = num(sit.yardLine);
    const down = num(sit.down), dist = num(sit.distance);
    // No `down` at all but a down text → trust the text; down −1 (kickoff, timeout) is between plays.
    const live = down != null ? down >= 1 && down <= 4 : !!sit.shortDownDistanceText;
    const pid = sit.possession == null || sit.possession === '' ? null : String(sit.possession);
    const possHome = pid != null && home?.id != null && pid === String(home.id);
    const possAway = pid != null && away?.id != null && pid === String(away.id);
    const dir = possHome ? -1 : possAway ? 1 : 0;           // + = attacking right (home) goal
    const ballX = yl == null ? null : xOf(yl);
    const goal = /goal/i.test(String(sit.downDistanceText || sit.shortDownDistanceText || ''));
    let gainX = null;
    if (live && ballX != null && dir && dist != null && dist > 0) gainX = goal ? (dir > 0 ? 100 : 0) : clamp(ballX + dir * dist, 0, 100);
    const poss = possHome ? home : possAway ? away : null;
    let d = null;
    const sY = num(drive?.startYL), eY = num(drive?.endYL);
    if (drive && sY != null) {
      const result = String(drive.result || '').trim();
      d = { fromX: xOf(sY), toX: xOf(eY != null ? eY : (yl ?? sY)),
        // "5 plays, 72 yards, 2:22" → "5 plays, 72 yds" so the tile stays one line on a phone.
        description: drive.description ? String(drive.description).replace(/,\s*\d+:\d{2}\s*$/, '').replace(/\byards?\b/, 'yds') : null,
        label: result ? `Last drive · ${RESULT[result.toUpperCase()] || result[0].toUpperCase() + result.slice(1).toLowerCase()}` : 'This drive' };
    }
    const wh = num(winHome);
    const win = wh == null || wh < 0 || wh > 1 ? null : { home: Math.round(wh * 100), away: 100 - Math.round(wh * 100) };
    const downText = live ? (sit.shortDownDistanceText || `${ORD[down]} & ${goal ? 'Goal' : dist}`) : (yl != null ? 'Between plays' : null);
    if (yl == null && !downText && !lastPlay) return null;
    return {
      home: { abbr: home?.abbr || 'HOME', color: hex(home?.color) || '#3b4a47' },
      away: { abbr: away?.abbr || 'AWAY', color: hex(away?.color) || '#5f5e5a' },
      ballX, gainX, dir, live, goal, possAbbr: poss?.abbr || null,
      ballOn: sit.possessionText || (yl === 50 ? '50' : null),
      downText, redZone: !!sit.isRedZone && !!dir && live, drive: d, win,  // ESPN also flags kickoffs as red zone
      model: model && model.abbr && num(model.pct) != null ? { abbr: model.abbr, pct: Math.round(num(model.pct)) } : null,
      lastPlay: lastPlay ? String(lastPlay) : null,
    };
  }

  const FX = 26, FW = 288;                               // playing field in px (viewBox 340 wide)
  const px = x => +(FX + FW * x / 100).toFixed(1);
  function zone(x, w, color, abbr, y, h, size) {
    const tc = light(color) ? '#1f2a28' : '#ffffff';
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="#00000022"/>`
      + (abbr ? `<text x="${x + w / 2}" y="${y + h / 2 + size / 3}" text-anchor="middle" font-size="${size}" font-weight="700" fill="${tc}">${esc(abbr)}</text>` : '');
  }
  function fieldSVG(m) {
    const y = 18, h = 48, parts = [];
    parts.push(zone(0, FX, m.away.color, m.away.abbr, y, h, 9), zone(FX + FW, FX, m.home.color, m.home.abbr, y, h, 9));
    for (let i = 0; i < 10; i++) parts.push(`<rect x="${px(i * 10)}" y="${y}" width="${(FW / 10).toFixed(1)}" height="${h}" fill="${i % 2 ? '#5f9a3a' : '#6aa843'}"/>`);
    for (let i = 1; i < 10; i++) parts.push(`<line x1="${px(i * 10)}" y1="${y}" x2="${px(i * 10)}" y2="${y + h}" stroke="#fff" stroke-opacity="${i === 5 ? 0.9 : 0.45}"/>`);
    if (m.redZone) parts.push(`<rect x="${px(m.dir > 0 ? 80 : 0)}" y="${y}" width="${(FW * 0.2).toFixed(1)}" height="${h}" fill="#d9363e" fill-opacity="0.22"/>`);
    if (m.drive) {
      const a = px(m.drive.fromX), b = px(m.drive.toX);
      parts.push(`<line x1="${a}" y1="${y + h - 9}" x2="${b}" y2="${y + h - 9}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="${a}" cy="${y + h - 9}" r="3" fill="#1f2a28" stroke="#fff"/>`);
    }
    if (m.ballX != null) parts.push(`<line x1="${px(m.ballX)}" y1="${y}" x2="${px(m.ballX)}" y2="${y + h}" stroke="#2b7de9" stroke-width="2.5"/>`);
    if (m.gainX != null) parts.push(`<line x1="${px(m.gainX)}" y1="${y}" x2="${px(m.gainX)}" y2="${y + h}" stroke="#f2b31b" stroke-width="2.5"/>`);
    if (m.ballX != null) {
      const bx = px(m.ballX), by = y + 18;
      parts.push(`<circle cx="${bx}" cy="${by}" r="11" fill="#fff" stroke="#1f2a28" stroke-width="1"/>`
        + `<text x="${bx}" y="${by + 3}" text-anchor="middle" font-size="${(m.possAbbr || '').length > 3 ? 6.5 : 8}" font-weight="700" fill="#1f2a28">${esc(m.possAbbr || '●')}</text>`);
      if (m.dir) { const ax = bx + m.dir * 15; parts.push(`<path d="M${ax - m.dir * 4} ${by - 4} L${ax} ${by} L${ax - m.dir * 4} ${by + 4}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`); }
    }
    const nums = [10, 20, 30, 40, 50, 40, 30, 20, 10].map((n, i) => `<text x="${px((i + 1) * 10)}" y="${y + h + 13}" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">${n}</text>`).join('');
    const label = [m.possAbbr ? `${m.possAbbr} ball` : null, m.ballOn ? `at ${m.ballOn}` : null, m.dir ? `going ${m.dir > 0 ? 'right' : 'left'}` : null].filter(Boolean).join(' ');
    return `<svg class="ffx-svg" viewBox="0 0 340 ${y + h + 18}" width="100%" role="img" aria-label="Field: ${esc(label || 'ball position')}">${parts.join('')}${nums}</svg>`;
  }
  function stripSVG(m) {
    const y = 2, h = 14, parts = [], x0 = 16, w = 308, sx = x => +(x0 + w * x / 100).toFixed(1);
    parts.push(zone(0, x0, m.away.color, '', y, h, 0), zone(x0 + w, x0, m.home.color, '', y, h, 0));
    parts.push(`<rect x="${x0}" y="${y}" width="${w}" height="${h}" fill="#6aa843"/><line x1="${sx(50)}" y1="${y}" x2="${sx(50)}" y2="${y + h}" stroke="#fff" stroke-opacity="0.8"/>`);
    if (m.redZone) parts.push(`<rect x="${sx(m.dir > 0 ? 80 : 0)}" y="${y}" width="${(w * 0.2).toFixed(1)}" height="${h}" fill="#d9363e" fill-opacity="0.25"/>`);
    if (m.ballX != null) parts.push(`<line x1="${sx(m.ballX)}" y1="${y}" x2="${sx(m.ballX)}" y2="${y + h}" stroke="#2b7de9" stroke-width="2.5"/>`);
    if (m.gainX != null) parts.push(`<line x1="${sx(m.gainX)}" y1="${y}" x2="${sx(m.gainX)}" y2="${y + h}" stroke="#f2b31b" stroke-width="2.5"/>`);
    if (m.ballX != null) parts.push(`<circle cx="${sx(m.ballX)}" cy="${y + h / 2}" r="4" fill="#fff" stroke="#1f2a28" stroke-width="0.8"/>`);
    return `<svg class="ffx-strip" viewBox="0 0 340 18" width="100%" aria-hidden="true">${parts.join('')}</svg>`;
  }
  function winHTML(m, compact) {
    const tag = compact ? 'span' : 'div';
    if (!m.win) return m.model ? `<${tag} class="ffx-win-model">Model pregame ${esc(m.model.abbr)} ${m.model.pct}%</${tag}>` : '';
    const lead = m.win.home >= m.win.away ? m.home : m.away, leadPct = Math.max(m.win.home, m.win.away);
    const model = m.model ? `Model pregame ${esc(m.model.abbr)} ${m.model.pct}%` : '';
    if (compact) return `<span class="ffx-meta"><span>Live win (ESPN) ${esc(lead.abbr)} ${leadPct}%</span>${model ? `<span>${model}</span>` : ''}</span>`;
    return `<div class="ffx-win"><div class="ffx-win-head"><span>Live win % (ESPN)</span>${model ? `<span>${model}</span>` : ''}</div>
      <div class="ffx-win-bar" role="img" aria-label="${esc(m.away.abbr)} ${m.win.away}%, ${esc(m.home.abbr)} ${m.win.home}%"><i style="width:${m.win.away}%;background:${m.away.color}"></i><i style="width:${m.win.home}%;background:${m.home.color}"></i></div>
      <div class="ffx-win-foot"><span${m.win.away > m.win.home ? ' class="lead"' : ''}>${esc(m.away.abbr)} ${m.win.away}%</span><span${m.win.home >= m.win.away ? ' class="lead"' : ''}>${esc(m.home.abbr)} ${m.win.home}%</span></div></div>`;
  }
  function fullHTML(m) {
    if (!m) return '';
    const tile = (v, l) => `<div class="ffx-tile"><b>${esc(v || '—')}</b><small>${esc(l)}</small></div>`;
    const tiles = `<div class="ffx-tiles">${tile(m.downText, 'Down')}${tile(m.ballOn, m.possAbbr ? `Ball on · ${m.possAbbr} ball` : 'Ball on')}${tile(m.drive?.description, m.drive?.label || 'Drive')}</div>`;
    const legend = m.ballX != null ? `<div class="ffx-legend"><span class="los">Ball</span>${m.gainX != null ? `<span class="gain">${m.goal ? 'Goal line' : 'Line to gain'}</span>` : ''}${m.drive ? '<span class="drv">Drive</span>' : ''}${m.redZone ? '<span class="rz">Red zone</span>' : ''}</div>` : '';
    return `<div class="ffx">${tiles}${m.ballX != null ? fieldSVG(m) : ''}${legend}${m.lastPlay ? `<div class="ffx-last"><small>Last play</small> ${esc(m.lastPlay)}</div>` : ''}${winHTML(m, false)}</div>`;
  }
  function stripHTML(m) {
    if (!m) return '';
    const line = [m.possAbbr ? `${m.possAbbr} ball` : null, m.live && m.ballOn ? `${m.downText} at ${m.ballOn}` : m.downText].filter(Boolean).join(' · ');
    return `<span class="ffx-compact">${line ? `<span class="ffx-line">${esc(line)}${m.redZone ? ' <em>Red zone</em>' : ''}</span>` : ''}${m.ballX != null ? stripSVG(m) : ''}${winHTML(m, true)}</span>`;
  }
  return Object.freeze({ build, fullHTML, stripHTML, xOf });
});

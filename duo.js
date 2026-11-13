// duo.js — v371 iPhone Duo layout pass. Layout only.
// Probes the safe-area insets with a hidden fixed element. Only when the
// RIGHT inset is large (>= 60px) and the LEFT is small (< 20px) — the Duo's
// shape, where the clock/Wi-Fi icons sit in a side strip — it sets
// html.pf-side-status and --duo-r so duo.css can keep only the top chrome
// clear of the icons. A notched iPhone in landscape reports both sides and is
// left alone. Re-runs on resize and orientation change.
(function () {
  'use strict';
  var root = document.documentElement;
  function probe() {
    if (!document.body) return;
    var d = document.createElement('div');
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-right:env(safe-area-inset-right,0px);padding-left:env(safe-area-inset-left,0px)';
    document.body.appendChild(d);
    var cs = getComputedStyle(d);
    var r = parseFloat(cs.paddingRight) || 0;
    var l = parseFloat(cs.paddingLeft) || 0;
    d.remove();
    if (r >= 60 && l < 20) {
      root.classList.add('pf-side-status');
      root.style.setProperty('--duo-r', Math.round(r) + 'px');
    } else if (!window.__duoForce) {
      root.classList.remove('pf-side-status');
      root.style.removeProperty('--duo-r');
    }
  }
  var t = 0;
  function later() { clearTimeout(t); t = setTimeout(function () { probe(); pose(); }, 120); }

  // ── v372 half-fold poses (layout only) ──────────────────────────────────
  // Safari 27.1 exposes the fold through the Viewport Segments API (and the
  // Device Posture API), both behind Safari feature flags for now. With two
  // segments we set html[data-duo-pose] and the fold geometry in px:
  //   seated — segments stacked (laptop pose): --fold-top / --fold-bottom
  //   book   — segments side by side:          --fold-left / --fold-right
  // The crease gets a gutter of at least FOLD_GAP px, centred on the fold, so
  // nothing tappable sits on the curve. No segments → attribute removed and
  // every pose rule in duo.css is inert. Where the Device Posture API exists
  // it must say "folded" (a flat dual-screen device is not a half fold).
  var FOLD_GAP = 24;
  function mq(q) { try { return window.matchMedia ? window.matchMedia(q) : null; } catch (e) { return null; } }
  var MQ = {
    v2: mq('(vertical-viewport-segments: 2)'),
    h2: mq('(horizontal-viewport-segments: 2)'),
    folded: mq('(device-posture: folded)'),
    cont: mq('(device-posture: continuous)')
  };
  // Measure one env() value with a hidden probe; NaN when the browser has none.
  function envPx(expr) {
    if (!document.body) return NaN;
    var d = document.createElement('div');
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:' + expr;
    document.body.appendChild(d);
    var v = parseFloat(getComputedStyle(d).paddingTop);
    d.remove();
    return v;
  }
  // Two segments, from the JS list when it exists, else from the CSS media
  // queries + env() geometry (Safari may expose one half of the API and not
  // the other while it is behind a flag).
  function segments() {
    var v = window.viewport;
    var s = v && v.segments;
    if (s && s.length === 2) return { src: 'js', n: 2, a: s[0], b: s[1] };
    var W = window.innerWidth, H = window.innerHeight;
    if (MQ.v2 && MQ.v2.matches) {
      var top = envPx('env(viewport-segment-bottom 0 0, -1px)');
      var nxt = envPx('env(viewport-segment-top 0 1, -1px)');
      if (top > 0 && nxt > 0) return { src: 'css', n: 2,
        a: { top: 0, bottom: top, left: 0, right: W }, b: { top: nxt, bottom: H, left: 0, right: W } };
    }
    if (MQ.h2 && MQ.h2.matches) {
      var right = envPx('env(viewport-segment-right 0 0, -1px)');
      var left = envPx('env(viewport-segment-left 1 0, -1px)');
      if (right > 0 && left > 0) return { src: 'css', n: 2,
        a: { top: 0, bottom: H, left: 0, right: right }, b: { top: 0, bottom: H, left: left, right: W } };
    }
    return { src: s ? 'js' : (MQ.v2 || MQ.h2 ? 'css' : 'none'), n: s ? s.length : null };
  }
  function postureNow() {
    var dp = navigator.devicePosture;
    if (dp && dp.type) return dp.type;
    if (MQ.folded && MQ.folded.matches) return 'folded';
    if (MQ.cont && MQ.cont.matches) return 'continuous';
    return '';
  }
  var lastSig = '';
  function pose() {
    var seg = segments();
    var post = postureNow();
    var name = '';
    if (seg.n === 2 && post !== 'continuous') {
      var a = seg.a, b = seg.b;
      if (b.top >= a.bottom - 1 && Math.abs(a.left - b.left) < 2) name = 'seated';
      else if (b.left >= a.right - 1 && Math.abs(a.top - b.top) < 2) name = 'book';
      if (name === 'seated') {
        var mid = (a.bottom + b.top) / 2;
        root.style.setProperty('--fold-top', Math.round(Math.min(a.bottom, mid - FOLD_GAP / 2)) + 'px');
        root.style.setProperty('--fold-bottom', Math.round(Math.max(b.top, mid + FOLD_GAP / 2)) + 'px');
        root.style.setProperty('--fold-below', Math.round(window.innerHeight - Math.min(a.bottom, mid - FOLD_GAP / 2)) + 'px');
      } else if (name === 'book') {
        var midx = (a.right + b.left) / 2;
        root.style.setProperty('--fold-left', Math.round(Math.min(a.right, midx - FOLD_GAP / 2)) + 'px');
        root.style.setProperty('--fold-right', Math.round(Math.max(b.left, midx + FOLD_GAP / 2)) + 'px');
      }
    }
    if (name) root.setAttribute('data-duo-pose', name);
    else root.removeAttribute('data-duo-pose');
    if (name !== 'seated') {
      ['--fold-top', '--fold-bottom', '--fold-below'].forEach(function (k) { root.style.removeProperty(k); });
    }
    if (name !== 'book') {
      ['--fold-left', '--fold-right'].forEach(function (k) { root.style.removeProperty(k); });
    }
    diag(seg, post, name);
    feature();
  }
  // One line under the Today version label so a screenshot says what the
  // browser reports: whether the fold APIs exist at all, the posture, the
  // segment count and the pose this page settled on.
  function diag(seg, post, name) {
    var host = document.getElementById('home-version');
    if (!host) return;
    var el = document.getElementById('duo-diag');
    if (!el) {
      el = document.createElement('span');
      el.id = 'duo-diag';
      el.className = 'duo-diag';
      host.parentNode.appendChild(el);
    }
    var apis = (window.viewport && 'segments' in window.viewport ? 'S' : '') + (navigator.devicePosture ? 'P' : '') +
      (MQ.v2 && MQ.v2.media !== 'not all' ? 'M' : '');
    var txt = apis ? ('fold: ' + (post || 'n/a') + ' · ' + (seg.n == null ? '?' : seg.n) + ' seg · ' +
      (name || 'flat') + ' · ' + apis + (seg.src === 'css' ? ' css' : '')) : 'fold sensors off';
    if (el.textContent !== ' · ' + txt) el.textContent = ' · ' + txt;
  }
  // Folding usually does NOT change the viewport size, so resize alone never
  // fires: listen to the fold's own signals, and re-check on a slow timer as a
  // backstop while the page is visible (reading segments is cheap).
  function watchFold() {
    [MQ.v2, MQ.h2, MQ.folded, MQ.cont].forEach(function (m) {
      if (!m) return;
      if (m.addEventListener) m.addEventListener('change', later);
      else if (m.addListener) m.addListener(later);
    });
    var dp = navigator.devicePosture;
    if (dp && dp.addEventListener) dp.addEventListener('change', later);
    if (window.viewport && window.viewport.addEventListener) {
      try { window.viewport.addEventListener('segmentschange', later); } catch (e) { /* not in every build */ }
    }
    if (window.visualViewport) window.visualViewport.addEventListener('resize', later);
    var apis = !!(window.viewport || navigator.devicePosture || (MQ.v2 && MQ.v2.media !== 'not all'));
    if (apis) setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      var seg = segments();
      var sig = postureNow() + '|' + seg.n + '|' + (seg.a ? Math.round(seg.a.bottom) + ',' + Math.round(seg.a.right) : '');
      if (sig !== lastSig) { lastSig = sig; pose(); }
    }, 1000);
    document.addEventListener('visibilitychange', later);
  }

  // ── Seated Today: the featured game sits above the fold ─────────────────
  // A copy of one games-ahead row (live first, then the next to start, then
  // the first row) is shown in the top half. Tapping a row in the list below
  // swaps which game is featured; tapping the featured card does what the
  // row itself does (opens the game report, bookmark, Matchup Lab), by
  // forwarding the tap to the matching element in the real row. The copy is
  // rebuilt whenever the list repaints, so live scores stay current.
  var picked = '';
  var forwarding = false;
  var pane = null;
  var watcher = null;
  // v378: the featured pane shows on every route in the seated pose.
  function seatedHome() {
    return root.getAttribute('data-duo-pose') === 'seated' && !!document.body;
  }
  // Off Today the games list may never have loaded; ask the desk for it.
  var askedAt = 0;
  function askAgenda() {
    if (Date.now() - askedAt < 60000) return;
    askedAt = Date.now();
    try { window.dispatchEvent(new CustomEvent('sportshub:duo-agenda')); } catch (_) {}
  }
  function rows() {
    var host = document.getElementById('desk-agenda');
    return host ? Array.prototype.slice.call(host.querySelectorAll('.desk-game')) : [];
  }
  function keyOf(row) {
    var b = row && row.querySelector('[data-desk-game]');
    return b ? b.getAttribute('data-desk-game') : '';
  }
  function choose(list) {
    if (picked) {
      for (var i = 0; i < list.length; i++) if (keyOf(list[i]) === picked) return list[i];
    }
    for (var j = 0; j < list.length; j++) if (list[j].querySelector('.desk-live')) return list[j];
    for (var k = 0; k < list.length; k++) if (!list[k].querySelector('.desk-match-team > strong')) return list[k];
    return list[0] || null;
  }
  function ensurePane() {
    if (pane || !document.body) return pane;
    pane = document.createElement('section');
    pane.id = 'duo-feature';
    pane.setAttribute('aria-label', 'Featured game');
    pane.hidden = true;
    pane.addEventListener('click', onPaneClick);
    document.body.appendChild(pane);
    return pane;
  }
  function pathTo(node, top) {
    var path = [];
    while (node && node !== top) {
      var p = node.parentElement;
      if (!p) return null;
      path.unshift(Array.prototype.indexOf.call(p.children, node));
      node = p;
    }
    return node === top ? path : null;
  }
  function follow(top, path) {
    var n = top;
    for (var i = 0; n && i < path.length; i++) n = n.children[path[i]];
    return n || null;
  }
  function onPaneClick(e) {
    var copy = pane && pane.querySelector('.desk-game');
    if (!copy) return;
    var hit = e.target.closest('button, a, summary, [role="button"]');
    if (!hit || !copy.contains(hit)) return;
    var real = choose(rows());
    var path = pathTo(hit, copy);
    var target = real && path && follow(real, path);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    forwarding = true;
    try { target.click(); } finally { forwarding = false; }
  }
  function onListClick(e) {
    if (forwarding || !seatedHome()) return;
    var main = e.target.closest('#desk-agenda .desk-game-main');
    if (!main) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    picked = main.getAttribute('data-desk-game') || '';
    feature();
  }
  document.addEventListener('click', onListClick, true);
  var frame = 0;
  function soon() { if (!frame) frame = requestAnimationFrame(function () { frame = 0; feature(); }); }
  function feature() {
    if (!document.body) return;
    var on = seatedHome();
    var host = document.getElementById('desk-agenda');
    if (on && host && !watcher && window.MutationObserver) {
      watcher = new MutationObserver(soon);
      watcher.observe(host, { childList: true, subtree: true, characterData: true });
    }
    if (!on) {
      if (pane) { pane.hidden = true; pane.replaceChildren(); pane.__src = ''; }
      if (watcher) { watcher.disconnect(); watcher = null; }
      document.querySelectorAll('.duo-featured').forEach(function (r) { r.classList.remove('duo-featured'); });
      return;
    }
    ensurePane();
    var list = rows();
    var row = choose(list);
    list.forEach(function (r) { r.classList.toggle('duo-featured', r === row); });
    if (!row) {
      askAgenda();
      pane.hidden = false; pane.__src = '';
      pane.innerHTML = '<p class="duo-feature-empty">Waiting for the games ahead…</p>';
      return;
    }
    // Rebuild only when the row actually changed: pose() runs on every
    // viewport event, and re-cloning each time made the pane flicker.
    var src = row.outerHTML;
    if (pane.__src === src && !pane.hidden && pane.firstChild) return;
    pane.__src = src;
    var copy = row.cloneNode(true);
    copy.classList.remove('duo-featured');
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    copy.querySelectorAll('[data-live-sport]').forEach(function (n) { n.removeAttribute('data-live-sport'); });
    pane.replaceChildren(copy);
    pane.hidden = false;
  }
  // The desk sets body[data-desk-panel] on every route change.
  function watchPanel() {
    if (!document.body || !window.MutationObserver) return;
    new MutationObserver(function () { soon(); }).observe(document.body, { attributes: true, attributeFilter: ['data-desk-panel'] });
  }
  function start() { probe(); pose(); watchPanel(); watchFold(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
})();

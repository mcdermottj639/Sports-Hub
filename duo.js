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
  function later() { clearTimeout(t); t = setTimeout(probe, 120); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', probe);
  else probe();
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
})();

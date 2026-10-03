// Keep the bottom controls attached to the visible screen on mobile Safari.
// VisualViewport coordinates are relative to the layout viewport: page scrollY
// must NOT be added, otherwise the dock travels through the results cards.
(() => {
  const root = document.documentElement;
  const bar = document.getElementById('botbar');
  if (!bar) return;
  const viewport = window.visualViewport;
  // CSS handles modern browsers; this boundary guard also covers iOS webviews
  // that still rubber-band the document. Keep the native document scroller.
  let touch = null;
  document.addEventListener('touchstart', (event) => {
    touch = event.touches.length === 1
      ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true });
  document.addEventListener('touchmove', (event) => {
    if (!touch || event.touches.length !== 1 || viewport?.scale > 1.05) return;
    const next = event.touches[0];
    const dx = next.clientX - touch.x, dy = next.clientY - touch.y;
    touch = { x: next.clientX, y: next.clientY };
    if (!dy || Math.abs(dx) >= Math.abs(dy)) return;
    const scroller = document.scrollingElement || root;
    const canScroll = (node) => dy > 0 ? node.scrollTop > 0
      : node.scrollTop + node.clientHeight < node.scrollHeight - 1;
    // Give nested dialogs, textareas and scrollable panels first refusal.
    for (let node = event.target; node && node !== scroller; node = node.parentElement) {
      if (node.nodeType !== 1) continue;
      const style = window.getComputedStyle(node);
      if (!/^(auto|scroll)$/.test(style.overflowY)) continue;
      if (canScroll(node)) return;
      if (/^(contain|none)$/.test(style.overscrollBehaviorY)) {
        if (event.cancelable) event.preventDefault();
        return;
      }
    }
    if (!canScroll(scroller) && event.cancelable) event.preventDefault();
  }, { passive: false });
  const clearTouch = () => { touch = null; };
  document.addEventListener('touchend', clearTouch, { passive: true });
  document.addEventListener('touchcancel', clearTouch, { passive: true });
  let frame = 0;
  function update() {
    frame = 0;
    const height = bar.getBoundingClientRect().height;
    root.style.setProperty('--bottom-bar-height', `${height}px`);
    if (viewport) {
      root.style.setProperty('--visible-bottom', `${viewport.offsetTop + viewport.height}px`);
      const active = document.activeElement;
      const editing = active && (active.matches('input, textarea, select') || active.isContentEditable);
      // Do not cover input fields with navigation when the keyboard is open,
      // or follow the reader around while they pinch-zoom into a result.
      root.classList.toggle('bottom-controls-hidden', viewport.scale > 1.05 ||
        (editing && viewport.height < window.innerHeight * 0.75));
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  viewport?.addEventListener('resize', schedule, { passive: true });
  viewport?.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  if (window.ResizeObserver) new ResizeObserver(schedule).observe(bar);
  update();
})();

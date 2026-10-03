'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../mobile-chrome.js'), 'utf8');

function setup({ viewport = true } = {}) {
  const props = {}, classes = {}, events = {}, frames = [];
  let barHeight = 62, resize;
  const listen = (prefix) => (name, callback) => { events[prefix + name] = callback; };
  const root = {
    nodeType: 1, scrollTop: 0, clientHeight: 800, scrollHeight: 2400,
    style: { setProperty: (key, value) => { props[key] = value; } },
    classList: { toggle: (key, value) => { classes[key] = !!value; } },
  };
  const document = { documentElement: root, activeElement: null,
    getElementById: () => ({ getBoundingClientRect: () => ({ height: barHeight }) }),
    addEventListener: listen('document:') };
  const vv = { height: 700, offsetTop: 0, scale: 1, addEventListener: listen('viewport:') };
  class ResizeObserver { constructor(callback) { resize = callback; } observe() {} }
  const window = { visualViewport: viewport ? vv : undefined, innerHeight: 800,
    getComputedStyle: node => node.css || { overflowY: 'visible' },
    scrollY: 0, ResizeObserver, addEventListener: listen('window:') };
  vm.runInNewContext(source, { window, document, ResizeObserver,
    requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; } });
  return { props, classes, events, window, document, vv, frames,
    flush: () => { while (frames.length) frames.shift()(); },
    resizeBar: (height) => { barHeight = height; resize(); } };
}

test('dock follows visible viewport resize and pan without adding document scroll', () => {
  const h = setup();
  assert.equal(h.props['--visible-bottom'], '700px');
  h.window.scrollY = 2500;
  h.events['window:scroll'](); h.flush();
  assert.equal(h.props['--visible-bottom'], '700px');
  h.vv.height = 760;
  h.events['viewport:resize'](); h.flush();
  assert.equal(h.props['--visible-bottom'], '760px');
  h.vv.offsetTop = 20;
  h.events['viewport:scroll'](); h.flush();
  assert.equal(h.props['--visible-bottom'], '780px');
});

test('wrapped content updates reserved height; repeated scroll events batch together', () => {
  const h = setup();
  h.resizeBar(110);
  h.events['window:scroll'](); h.events['viewport:resize']();
  assert.equal(h.frames.length, 1);
  h.flush();
  assert.equal(h.props['--bottom-bar-height'], '110px');
});

test('keyboard and pinch zoom hide controls and restore them afterward', () => {
  const h = setup();
  h.document.activeElement = { matches: () => true };
  h.vv.height = 350;
  h.events['document:focusin'](); h.flush();
  assert.equal(h.classes['bottom-controls-hidden'], true);
  h.document.activeElement = null;
  h.vv.height = 700;
  h.events['document:focusout'](); h.flush();
  assert.equal(h.classes['bottom-controls-hidden'], false);
  h.vv.scale = 2;
  h.events['viewport:resize'](); h.flush();
  assert.equal(h.classes['bottom-controls-hidden'], true);
  h.vv.scale = 1;
  h.events['window:pageshow'](); h.flush();
  assert.equal(h.classes['bottom-controls-hidden'], false);
});

test('browsers without VisualViewport retain CSS positioning and measured spacing', () => {
  const h = setup({ viewport: false });
  assert.equal(h.props['--visible-bottom'], undefined);
  assert.equal(h.props['--bottom-bar-height'], '62px');
  h.resizeBar(90); h.flush();
  assert.equal(h.props['--bottom-bar-height'], '90px');
});

function drag(h, { target = h.document.documentElement, x = 0, y = 30, count = 1 } = {}) {
  h.events['document:touchstart']({ touches: [{ clientX: 50, clientY: 100 }] });
  let prevented = false;
  h.events['document:touchmove']({ target, cancelable: true,
    touches: Array.from({ length: count }, () => ({ clientX: 50 + x, clientY: 100 + y })),
    preventDefault: () => { prevented = true; } });
  return prevented;
}

test('outward edge drags stop but inward and middle-of-page scrolling stay native', () => {
  const h = setup(), root = h.document.documentElement;
  assert.equal(drag(h), true);
  assert.equal(drag(h, { y: -30 }), false);
  root.scrollTop = 500;
  assert.equal(drag(h), false);
  assert.equal(drag(h, { y: -30 }), false);
  root.scrollTop = 1600;
  assert.equal(drag(h, { y: -30 }), true);
  assert.equal(drag(h), false);
});

test('nested panels can scroll; their boundaries respect chaining and containment', () => {
  const h = setup(), root = h.document.documentElement;
  const panel = { nodeType: 1, parentElement: root, scrollTop: 50,
    clientHeight: 200, scrollHeight: 600, css: { overflowY: 'auto' } };
  assert.equal(drag(h, { target: panel }), false);
  panel.scrollTop = 0;
  assert.equal(drag(h, { target: panel }), true);
  root.scrollTop = 200;
  assert.equal(drag(h, { target: panel }), false);
  panel.css.overscrollBehaviorY = 'contain';
  assert.equal(drag(h, { target: panel }), true);
});

test('horizontal gestures, multitouch and zoomed panning are never intercepted', () => {
  const h = setup();
  assert.equal(drag(h, { x: 60, y: 10 }), false);
  assert.equal(drag(h, { count: 2 }), false);
  h.vv.scale = 2;
  assert.equal(drag(h), false);
});

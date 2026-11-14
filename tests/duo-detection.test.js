'use strict';

// Run the shipped fold detector against browser-shaped signals. These tests
// verify detection and transitions, not rendered geometry or native Safari.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../duo.js'), 'utf8');

const stacked = (width = 676) => [
  { top: 0, bottom: 450, left: 0, right: width },
  { top: 450, bottom: 900, left: 0, right: width },
];
const sideBySide = () => [
  { top: 0, bottom: 676, left: 0, right: 475 },
  { top: 0, bottom: 676, left: 475, right: 951 },
];

function setup(options = {}) {
  const state = {
    width: 676, height: 900, segments: stacked(), posture: 'folded',
    js: true, postureApi: true, css: true, cssStacked: false,
    cssBook: false, env: {}, ...options,
  };
  const listeners = new Map(), timers = new Map(), intervals = [], frames = [];
  const ids = new Map(), properties = {}, attributes = {};
  let timerId = 0;
  const listen = scope => (name, callback) => {
    const key = scope + ':' + name;
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(callback);
  };
  const emit = (scope, name, event = {}) => {
    for (const callback of listeners.get(scope + ':' + name) || []) callback(event);
  };
  const classes = () => {
    const values = new Set();
    return {
      add: name => values.add(name), remove: name => values.delete(name),
      contains: name => values.has(name),
      toggle(name, on) { if (on) values.add(name); else values.delete(name); },
    };
  };
  function element() {
    return {
      style: { cssText: '' }, classList: classes(), children: [], hidden: false,
      setAttribute() {}, removeAttribute() {},
      addEventListener() {}, remove() {},
      querySelector: () => null, querySelectorAll: () => [],
      appendChild(child) { this.children.push(child); child.parentNode = this; if (child.id) ids.set(child.id, child); },
      replaceChildren(...children) { this.children = children; },
    };
  }
  const root = element();
  root.style = {
    setProperty: (name, value) => { properties[name] = value; },
    removeProperty: name => { delete properties[name]; },
  };
  root.setAttribute = (name, value) => { attributes[name] = value; };
  root.removeAttribute = name => { delete attributes[name]; };
  root.getAttribute = name => attributes[name] ?? null;
  const body = element();
  const version = element();
  version.id = 'home-version';
  body.appendChild(version);
  const document = {
    documentElement: root, body, readyState: 'loading', visibilityState: 'visible',
    createElement: element, getElementById: id => ids.get(id) || null,
    querySelectorAll: () => [], addEventListener: listen('document'),
  };
  const queries = new Map();
  const matches = query => {
    if (query === '(vertical-viewport-segments: 2)') return state.cssStacked;
    if (query === '(horizontal-viewport-segments: 2)') return state.cssBook;
    if (query === '(device-posture: folded)') return state.posture === 'folded';
    if (query === '(device-posture: continuous)') return state.posture === 'continuous';
    return false;
  };
  const window = {
    get innerWidth() { return state.width; },
    get innerHeight() { return state.height; },
    addEventListener: listen('window'), dispatchEvent: event => emit('window', event.type, event),
    visualViewport: { addEventListener: listen('visualViewport') },
  };
  if (state.css) window.matchMedia = query => {
    if (!queries.has(query)) queries.set(query, {
      media: query, get matches() { return matches(query); },
      addEventListener: listen(query),
    });
    return queries.get(query);
  };
  if (state.js) window.viewport = {
    get segments() { return state.segments; }, addEventListener: listen('viewport'),
  };
  const navigator = {};
  if (state.postureApi) navigator.devicePosture = {
    get type() { return state.posture; }, addEventListener: listen('posture'),
  };
  const getComputedStyle = node => {
    const key = node.style.cssText.match(/env\((viewport-segment-[^,]+)/)?.[1];
    return { paddingRight: '0px', paddingLeft: '0px', paddingTop: `${key ? (state.env[key] ?? 0) : 0}px` };
  };
  class MutationObserver { observe() {} disconnect() {} }
  window.MutationObserver = MutationObserver;
  vm.runInNewContext(source, {
    document, window, navigator, getComputedStyle, MutationObserver,
    CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id), setInterval: callback => intervals.push(callback),
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
  });
  function flush() {
    while (timers.size || frames.length) {
      const pending = [...timers.values()]; timers.clear();
      for (const callback of pending) callback();
      while (frames.length) frames.shift()();
    }
  }
  emit('document', 'DOMContentLoaded');
  flush();
  return {
    state, properties, root, document, queries,
    pose: () => root.getAttribute('data-duo-pose'),
    diagnostic: () => ids.get('duo-diag')?.textContent || '',
    tick() { for (const callback of intervals) callback(); flush(); },
    event(scope, name) { emit(scope, name); flush(); },
  };
}

test('stacked fold geometry is detected at phone, open-screen and desktop widths', () => {
  for (const width of [676, 960, 1280]) {
    const h = setup({ width, segments: stacked(width) });
    assert.equal(h.pose(), 'seated', `width ${width}`);
    assert.equal(h.properties['--fold-top'], '438px');
    assert.equal(h.properties['--fold-bottom'], '462px');
    assert.equal(h.properties['--fold-below'], '462px');
  }
});

test('rectangle order does not change seated or book detection', () => {
  for (const reverse of [false, true]) {
    const seated = setup({ segments: reverse ? stacked().reverse() : stacked() });
    assert.equal(seated.pose(), 'seated');
    assert.equal(seated.properties['--fold-top'], '438px');
    const book = setup({ width: 951, height: 676,
      segments: reverse ? sideBySide().reverse() : sideBySide() });
    assert.equal(book.pose(), 'book');
    assert.equal(book.properties['--fold-left'], '463px');
    assert.equal(book.properties['--fold-right'], '487px');
  }
});

test('unfolding clears pose and obsolete geometry even if segment rectangles linger', () => {
  const h = setup();
  h.state.posture = 'continuous';
  h.event('posture', 'change');
  assert.equal(h.pose(), null);
  assert.deepEqual(h.properties, {});
  h.state.posture = 'folded';
  h.state.width = 951; h.state.height = 676; h.state.segments = sideBySide();
  h.event('window', 'orientationchange');
  assert.equal(h.pose(), 'book');
  assert.equal(h.properties['--fold-top'], undefined);
  assert.equal(h.properties['--fold-bottom'], undefined);
  assert.equal(h.properties['--fold-below'], undefined);
});

test('no sensors, one segment or no segment geometry leaves the layout flat', () => {
  for (const options of [
    { js: false, postureApi: false, css: false },
    { segments: [] }, { segments: [stacked()[0]] }, { segments: null },
  ]) {
    const h = setup(options);
    assert.equal(h.pose(), null);
    assert.deepEqual(h.properties, {});
  }
});

test('invalid segment rectangles neither activate a pose nor throw', () => {
  const a = stacked()[0], b = stacked()[1];
  for (const segments of [
    [null, b], [a, {}], [a, { ...b, top: NaN }],
    [{ ...a, right: 0 }, b], [a, { ...b, bottom: 450 }],
    [a, { ...b, top: 400 }],
  ]) {
    const h = setup({ segments });
    assert.equal(h.pose(), null, JSON.stringify(segments));
    assert.deepEqual(h.properties, {});
  }
});

test('valid CSS geometry works without JS segments and repairs incomplete JS geometry', () => {
  for (const options of [{ js: false }, { segments: [{}, {}] }]) {
    const h = setup({ ...options, cssStacked: true,
      env: { 'viewport-segment-bottom 0 0': 450, 'viewport-segment-top 0 1': 450 } });
    assert.equal(h.pose(), 'seated');
    assert.equal(h.properties['--fold-top'], '438px');
    assert.equal(h.properties['--fold-bottom'], '462px');
    assert.match(h.diagnostic(), /css/);
  }
  const book = setup({ js: false, postureApi: false, posture: '', cssBook: true,
    width: 951, height: 676,
    env: { 'viewport-segment-right 0 0': 475, 'viewport-segment-left 1 0': 475 } });
  assert.equal(book.pose(), 'book');
  assert.equal(book.properties['--fold-right'], '487px');
});

test('polling detects a silent fold and changes to only the lower segment geometry', () => {
  const h = setup({ posture: 'continuous', segments: [
    { top: 0, bottom: 900, left: 0, right: 676 },
  ] });
  assert.equal(h.pose(), null);
  h.state.posture = 'folded'; h.state.segments = stacked();
  h.tick();
  assert.equal(h.pose(), 'seated');
  assert.equal(h.properties['--fold-bottom'], '462px');
  // Only the lower rectangle changes; the original upper-only poll signature
  // missed this update and left controls in the newly widened hinge gap.
  h.state.segments[1] = { ...h.state.segments[1], top: 480 };
  h.tick();
  assert.equal(h.properties['--fold-top'], '450px');
  assert.equal(h.properties['--fold-bottom'], '480px');
  h.state.posture = 'continuous'; h.tick();
  assert.equal(h.pose(), null);
  assert.deepEqual(h.properties, {});
});

test('viewport events update the fold, while hidden-page polling waits for visibility', () => {
  const h = setup();
  h.tick(); // Establish the polling signature before hiding.
  h.document.visibilityState = 'hidden';
  h.state.posture = 'continuous'; h.tick();
  assert.equal(h.pose(), 'seated');
  h.document.visibilityState = 'visible';
  h.event('document', 'visibilitychange');
  assert.equal(h.pose(), null);
  h.state.posture = 'folded';
  h.event('viewport', 'segmentschange');
  assert.equal(h.pose(), 'seated');
});

test('pageshow restores seated, book and flat states from current signals without polling', () => {
  const h = setup({ posture: 'continuous', segments: [] });
  assert.equal(h.pose(), null);
  h.state.posture = 'folded'; h.state.segments = stacked();
  h.event('window', 'pageshow');
  assert.equal(h.pose(), 'seated');
  assert.equal(h.properties['--fold-top'], '438px');
  assert.equal(h.properties['--fold-bottom'], '462px');

  h.state.width = 951; h.state.height = 676;
  h.state.segments = sideBySide().reverse();
  h.event('window', 'pageshow');
  assert.equal(h.pose(), 'book');
  assert.equal(h.properties['--fold-left'], '463px');
  assert.equal(h.properties['--fold-right'], '487px');
  assert.equal(h.properties['--fold-top'], undefined);

  h.state.posture = 'continuous';
  h.event('window', 'pageshow');
  assert.equal(h.pose(), null);
  assert.deepEqual(h.properties, {});
});

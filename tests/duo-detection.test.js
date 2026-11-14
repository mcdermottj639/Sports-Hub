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
    const attrs = {}, callbacks = new Map();
    return {
      style: { cssText: '' }, classList: classes(), children: [], hidden: false,
      scrollTop: 0,
      setAttribute(name, value) { attrs[name] = value; },
      getAttribute: name => attrs[name] ?? null,
      removeAttribute(name) { delete attrs[name]; },
      addEventListener(name, callback) { callbacks.set(name, callback); },
      click() { callbacks.get('click')?.({ target:this }); }, remove() {},
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
  const main = element(); main.id = 'main-content'; body.appendChild(main);
  const toggle = element(); toggle.id = 'duo-toggle'; body.appendChild(toggle);
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
    get scrollY() { return state.windowY || 0; },
    scrollTo(options) { state.windowY = options.top; },
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
  const storage = new Map();
  if (state.savedMode !== undefined) storage.set('sportshub:duo-mode', state.savedMode);
  const localStorage = {
    getItem(key) { if (state.storageDenied) throw new Error('storage unavailable'); return storage.get(key) ?? null; },
    setItem(key, value) { if (state.storageDenied) throw new Error('storage unavailable'); storage.set(key, value); },
  };
  vm.runInNewContext(source, {
    document, window, navigator, localStorage, getComputedStyle, MutationObserver,
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
    state, properties, root, document, queries, toggle, main, storage, window,
    pose: () => root.getAttribute('data-duo-pose'),
    diagnostic: () => ids.get('duo-diag')?.textContent || '',
    tick() { for (const callback of intervals) callback(); flush(); },
    event(scope, name) { emit(scope, name); flush(); },
    clickDuo() { toggle.click(); flush(); },
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

test('Duo works without any fold API, exposes pressed state and remembers both choices', () => {
  const h = setup({ js:false, postureApi:false, css:false, height:844 });
  assert.equal(h.pose(), null);
  assert.equal(h.toggle.getAttribute('aria-pressed'), 'false');
  h.clickDuo();
  assert.equal(h.pose(), 'seated');
  assert.equal(h.toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(h.properties['--fold-top'], '410px');
  assert.equal(h.properties['--fold-bottom'], '434px');
  assert.equal(h.storage.get('sportshub:duo-mode'), 'on');
  assert.match(h.diagnostic(), /Duo on/);
  h.clickDuo();
  assert.equal(h.pose(), null);
  assert.equal(h.toggle.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(h.properties, {});
  assert.equal(h.storage.get('sportshub:duo-mode'), 'off');
  assert.match(h.diagnostic(), /Duo off/);
});

test('saved Duo ON overrides continuous, invalid and side-by-side sensors on reload', () => {
  for (const options of [
    { js:false, postureApi:false, css:false },
    { posture:'continuous', segments:[stacked()[0]] },
    { segments:[{}, {}] },
    { width:951, height:676, segments:sideBySide() },
  ]) {
    const h = setup({ ...options, savedMode:'on' });
    assert.equal(h.pose(), 'seated');
    assert.equal(h.toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(h.properties['--fold-left'], undefined);
    h.event('window', 'pageshow');
    assert.equal(h.pose(), 'seated');
  }
  const measured = setup({ savedMode:'on', posture:'continuous', segments:[
    {top:0, bottom:360, left:0, right:676}, {top:390, bottom:900, left:0, right:676},
  ] });
  assert.equal(measured.properties['--fold-top'], '360px');
  assert.equal(measured.properties['--fold-bottom'], '390px');
});

test('Duo OFF suppresses automatic detection across sensor events, polling and reloads', () => {
  const h = setup();
  assert.equal(h.pose(), 'seated');
  h.clickDuo();
  assert.equal(h.pose(), null);
  for (const [scope, event] of [['posture','change'], ['viewport','segmentschange'],
    ['window','resize'], ['window','pageshow'], ['document','visibilitychange']]) {
    h.event(scope, event);
    h.tick();
    assert.equal(h.pose(), null);
  }
  const reloaded = setup({ savedMode:h.storage.get('sportshub:duo-mode') });
  assert.equal(reloaded.pose(), null);
  reloaded.clickDuo();
  assert.equal(reloaded.pose(), 'seated');
});

test('manual Duo follows rotation and ignores a keyboard-only visual viewport resize', () => {
  const h = setup({ js:false, postureApi:false, css:false, savedMode:'on' });
  h.window.visualViewport.height = 340;
  h.event('visualViewport', 'resize');
  assert.equal(h.properties['--fold-top'], '438px');
  h.state.height = 676; h.state.width = 960;
  h.event('window', 'orientationchange');
  assert.equal(h.properties['--fold-top'], '326px');
  assert.equal(h.properties['--fold-bottom'], '350px');
  assert.equal(h.pose(), 'seated');
});

test('Duo toggle stays usable when storage throws or contains an invalid value', () => {
  for (const options of [{ storageDenied:true }, { savedMode:'unexpected' }]) {
    const h = setup({ ...options, js:false, postureApi:false, css:false });
    assert.equal(h.pose(), null);
    h.clickDuo();
    h.event('window', 'pageshow');
    assert.equal(h.pose(), 'seated');
    h.clickDuo();
    assert.equal(h.pose(), null);
  }
});

test('Duo transfers current scroll position between document and lower pane', () => {
  const h = setup({ js:false, postureApi:false, css:false, windowY:680 });
  h.clickDuo();
  assert.equal(h.window.scrollY, 0);
  assert.equal(h.main.scrollTop, 680);
  // The user has navigated/scrolled in the lower pane since entering Duo.
  h.main.scrollTop = 245;
  h.clickDuo();
  assert.equal(h.main.scrollTop, 0);
  assert.equal(h.window.scrollY, 245);
  h.clickDuo();
  assert.equal(h.window.scrollY, 0);
  assert.equal(h.main.scrollTop, 245);
});

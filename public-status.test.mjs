import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicStatus, validateSummary, MAX_AGE_MS, POLL_MS } from './public-status.mjs';

const NOW = Date.parse('2026-10-23T16:00:00Z');
const summary = overrides => ({
  updated_at: new Date(NOW).toISOString(), cpu_percent: 24.4,
  memory_percent: 60, storage_percent: 35, uptime_seconds: 172800,
  guests_running: 3, guests_total: 5, ...overrides,
});
const response = data => ({ ok: true, json: async () => data });
const settle = () => new Promise(resolve => setImmediate(resolve));

function emitter(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name); },
    dispatch(name) { listeners.get(name)?.(); },
  };
}

function fixture(fetch, { open = true, visible = true } = {}) {
  const elements = Object.fromEntries(['feedDot', 'feedState', 'cpu', 'cpuBar', 'memory',
    'memoryBar', 'storage', 'storageBar', 'uptime', 'guests', 'updated'].map(id => [id, {
    textContent: '', className: '', style: {},
  }]));
  elements.labDetails = emitter({ open });
  const doc = emitter({ visibilityState: visible ? 'visible' : 'hidden', getElementById: id => elements[id] });
  const timers = new Map();
  let nextTimer = 0;
  const calls = [];
  const api = createPublicStatus({
    document: doc, now: () => NOW,
    fetch: (...args) => { calls.push(args); return fetch(...args); },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return { api, doc, elements, timers, calls, toggle(open) {
    elements.labDetails.open = open;
    elements.labDetails.dispatch('toggle');
  }, visibility(visible) {
    doc.visibilityState = visible ? 'visible' : 'hidden';
    doc.dispatch('visibilitychange');
  } };
}

function assertCleared(elements) {
  for (const id of ['cpu', 'memory', 'storage']) {
    assert.equal(elements[id].textContent, '—');
    assert.equal(elements[id + 'Bar'].style.width, '0%');
  }
  assert.equal(elements.uptime.textContent, '—');
  assert.equal(elements.guests.textContent, 'Running guests: —');
  assert.equal(elements.updated.textContent, 'Updated: —');
  assert.notEqual(elements.feedDot.className, 'dot connected');
}

test('accepts a complete valid summary and rejects non-finite or incorrectly typed values', () => {
  assert.equal(validateSummary(summary(), NOW).state, 'connected');
  for (const invalid of [null, [], {}, summary({ cpu_percent: '24' }),
    summary({ memory_percent: Infinity }), summary({ storage_percent: NaN }),
    summary({ cpu_percent: -1 }), summary({ storage_percent: 101 }),
    summary({ uptime_seconds: '10' }), summary({ uptime_seconds: Infinity }),
    summary({ uptime_seconds: -1 }), summary({ guests_running: 1.5 }),
    summary({ guests_total: 501 }), summary({ guests_running: 6 }),
    summary({ updated_at: NOW }), summary({ updated_at: 'invalid' }),
    summary({ updated_at: new Date(NOW + 120000).toISOString() })]) {
    assert.equal(validateSummary(invalid, NOW).state, 'invalid');
  }
  assert.equal(validateSummary(summary({ updated_at: new Date(NOW - MAX_AGE_MS - 1).toISOString() }), NOW).state, 'stale');
});

test('renders approved data and requests only the same-origin summary without credentials', async () => {
  const f = fixture(async () => response(summary()));
  await settle();
  assert.equal(f.elements.cpu.textContent, '24%');
  assert.equal(f.elements.memoryBar.style.width, '60%');
  assert.equal(f.elements.uptime.textContent, '2.0 d');
  assert.equal(f.elements.guests.textContent, 'Running guests: 3 / 5');
  assert.match(f.elements.updated.textContent, /^Updated: (?!—)/);
  assert.equal(f.elements.feedDot.className, 'dot connected');
  assert.equal(f.calls[0][0], 'proxmox-public.json');
  assert.equal(f.calls[0][1].mode, 'same-origin');
  assert.equal(f.calls[0][1].credentials, 'omit');
  assert.equal(f.calls[0][1].redirect, 'error');
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [POLL_MS]);
  f.api.destroy();
});

for (const [name, failure, state] of [
  ['network failure', () => Promise.reject(new Error('offline')), 'Public telemetry not connected'],
  ['HTTP failure', async () => ({ ok: false }), 'Public telemetry not connected'],
  ['stale data', async () => response(summary({ updated_at: new Date(NOW - MAX_AGE_MS - 1).toISOString() })), 'Public telemetry is out of date'],
  ['invalid data', async () => response(summary({ cpu_percent: '25' })), 'Public telemetry data unavailable'],
  ['invalid JSON', async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } }), 'Public telemetry not connected'],
]) {
  test(`success → ${name} clears all readings and timestamp → recovery`, async () => {
    let next = async () => response(summary());
    const f = fixture((...args) => next(...args));
    await settle();
    assert.equal(f.elements.cpu.textContent, '24%');
    next = failure;
    await f.api.refresh();
    assertCleared(f.elements);
    assert.equal(f.elements.feedState.textContent, state);
    next = async () => response(summary({ cpu_percent: 45 }));
    await f.api.refresh();
    assert.equal(f.elements.cpu.textContent, '45%');
    assert.equal(f.elements.cpuBar.style.width, '45%');
    assert.equal(f.elements.feedDot.className, 'dot connected');
    f.api.destroy();
  });
}

test('does not request or poll while collapsed or hidden; opening and returning refresh immediately', async () => {
  const f = fixture(async () => response(summary()), { open: false });
  assert.equal(f.calls.length, 0);
  assert.equal(f.timers.size, 0);
  f.visibility(false);
  f.toggle(true);
  assert.equal(f.calls.length, 0);
  f.visibility(true);
  assert.equal(f.calls.length, 1);
  await settle();
  const timer = [...f.timers.values()][0];
  assert.equal(timer.delay, POLL_MS);
  timer.fn();
  await settle();
  assert.equal(f.calls.length, 2);
  f.toggle(false);
  assert.equal(f.timers.size, 0);
  f.toggle(true);
  assert.equal(f.calls.length, 3);
  await settle();
  f.visibility(false);
  assert.equal(f.timers.size, 0);
  await f.api.refresh();
  assert.equal(f.calls.length, 3);
  f.api.destroy();
});

test('aborts hidden requests and ignores an older response after reopening', async () => {
  let resolveOld;
  let count = 0;
  const f = fixture(async () => ++count === 1 ? new Promise(resolve => { resolveOld = resolve; }) : response(summary({ cpu_percent: 80 })));
  assert.equal(f.calls.length, 1);
  f.visibility(false);
  assert.equal(f.calls[0][1].signal.aborted, true);
  assert.equal(f.timers.size, 0);
  f.visibility(true);
  await settle();
  assert.equal(f.elements.cpu.textContent, '80%');
  resolveOld(response(summary({ cpu_percent: 1 })));
  await settle();
  assert.equal(f.elements.cpu.textContent, '80%');
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [POLL_MS]);
  f.api.destroy();
  assert.equal(f.timers.size, 0);
});

test('a timed-out request clears previous readings and continues later polling', async () => {
  let hang = false;
  const f = fixture(async (_url, options) => {
    if (!hang) return response(summary());
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))));
  });
  await settle();
  hang = true;
  const refreshing = f.api.refresh();
  const timeout = [...f.timers.values()].find(timer => timer.delay === 10000);
  assert.ok(timeout);
  timeout.fn();
  await refreshing;
  assertCleared(f.elements);
  assert.deepEqual([...f.timers.values()].map(timer => timer.delay), [POLL_MS]);
  f.api.destroy();
});

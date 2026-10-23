import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKPOINT_KEY, INBOX_ORIGIN, checkpointSubmission, clearCheckpoint, createPendingMessage, createPendingSubmission, isCapability, isThreadId, makeReturnLink, parseReturnLink, readConversation, requestJSON, restoreCheckpoint, sendMessage, startVisiblePolling, submitBrief } from './inbox-client.mjs';

const brief = { category: 'Website or workflow automation', goal: 'Build a booking website for my shop.', location: 'Remote', timing: 'Flexible' };
const response = (body) => ({ ok: true, status: 200, json: async () => body });
const threadFor = (pending) => ({ id: pending.id, brief: pending.brief, created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z', expires_at: '2027-01-21T00:00:00Z', message_count: 1 });
function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values };
}

test('new submissions get independent random credentials and immutable brief snapshots', () => {
  const source = { ...brief };
  const a = createPendingSubmission(source);
  const b = createPendingSubmission(source);
  assert.ok(isThreadId(a.id)); assert.ok(isThreadId(a.request_id)); assert.ok(isCapability(a.token));
  assert.equal(Buffer.from(a.token, 'base64url').length, 32);
  assert.notEqual(a.id, b.id); assert.notEqual(a.token, b.token); assert.notEqual(a.request_id, b.request_id);
  source.goal = 'Changed';
  assert.equal(a.brief.goal, brief.goal);
  assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.brief));
});

test('return credentials stay in the fragment and malformed or query credentials are rejected', () => {
  const pending = createPendingSubmission(brief);
  const link = new URL(makeReturnLink(pending.id, pending.token));
  assert.equal(link.origin, 'https://rajindustries.fixingfortmyers.com');
  assert.equal(link.pathname, '/conversation.html');
  assert.equal(link.search, '');
  assert.deepEqual(parseReturnLink(link.href), { id: pending.id, token: pending.token });
  assert.throws(() => parseReturnLink(`${link.origin}/conversation.html?key=${pending.token}${link.hash}`));
  assert.throws(() => parseReturnLink(`${link.origin}/conversation.html#id=${pending.id}&key=short`));
  assert.throws(() => parseReturnLink(`${link.href}&id=${pending.id}`));
});

test('submission sends credentials only as a header, and requires a matching durable receipt', async () => {
  const pending = createPendingSubmission(brief);
  await submitBrief(pending, { fetchImpl: async (url, options) => {
    assert.equal(url.origin, INBOX_ORIGIN); assert.equal(url.pathname, '/api/threads');
    assert.equal(url.search, ''); assert.equal(url.hash, '');
    assert.equal(options.headers.Authorization, `Bearer ${pending.token}`);
    assert.equal(options.headers['X-Raj-Inbox'], '1');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.deepEqual(JSON.parse(options.body), { id: pending.id, request_id: pending.request_id, brief: pending.brief });
    assert.ok(!options.body.includes(pending.token));
    return response({ ok: true, received: true, thread: threadFor(pending), duplicate: false });
  } });
  await assert.rejects(submitBrief(pending, { fetchImpl: async () => response({ ok: true, received: false, thread: threadFor(pending) }) }));
  await assert.rejects(submitBrief(pending, { fetchImpl: async () => response({ ok: true, received: true, thread: { ...threadFor(pending), id: crypto.randomUUID() } }) }));
});

test('a lost acknowledgement followed by page reload retries the exact checkpoint once', async () => {
  const storage = memoryStorage();
  assert.equal(restoreCheckpoint(storage), null);
  const original = createPendingSubmission(brief);
  assert.equal(checkpointSubmission(storage, original), true);
  const durable = new Map();
  let requests = 0;
  const fetchImpl = async (_url, options) => {
    requests += 1;
    const body = JSON.parse(options.body);
    const prior = durable.get(body.id);
    if (prior) assert.deepEqual(prior, { body: options.body, auth: options.headers.Authorization });
    else durable.set(body.id, { body: options.body, auth: options.headers.Authorization });
    if (requests === 1) throw new TypeError('Connection lost after commit');
    return response({ ok: true, received: true, thread: threadFor(original), duplicate: Boolean(prior) });
  };
  await assert.rejects(submitBrief(original, { fetchImpl }));
  const reloaded = restoreCheckpoint(storage);
  assert.deepEqual(reloaded.pending, original);
  assert.equal(reloaded.saved, false);
  const receipt = await submitBrief(reloaded.pending, { fetchImpl });
  assert.equal(receipt.duplicate, true);
  assert.equal(durable.size, 1);
  assert.equal(checkpointSubmission(storage, reloaded.pending, { saved: true, expires_at: receipt.thread.expires_at }), true);
  assert.equal(restoreCheckpoint(storage).saved, true);
  clearCheckpoint(storage);
  assert.equal(restoreCheckpoint(storage), null);
});

test('disabled storage and corrupt recovery records do not destroy in-memory credentials', () => {
  const pending = createPendingSubmission(brief);
  const throwing = { setItem() { throw new Error('Disabled'); }, getItem() { throw new Error('Disabled'); } };
  assert.equal(checkpointSubmission(throwing, pending), false);
  assert.equal(restoreCheckpoint(throwing), null);
  assert.ok(isCapability(pending.token));
  const storage = memoryStorage();
  storage.setItem(CHECKPOINT_KEY, '{broken'); assert.equal(restoreCheckpoint(storage), null);
  storage.setItem(CHECKPOINT_KEY, JSON.stringify({ pending: { ...pending, token: 'short' }, saved: true }));
  assert.equal(restoreCheckpoint(storage), null);
});

test('message retries retain request IDs and require a matching message receipt', async () => {
  const credentials = createPendingSubmission(brief);
  const pending = createPendingMessage('  Please include a mobile layout.  ');
  assert.equal(pending.body, 'Please include a mobile layout.');
  const bodies = [];
  const fetchImpl = async (_url, options) => {
    bodies.push(options.body);
    return response({ ok: true, received: true, thread_id: credentials.id, message: { id: 2, role: 'visitor', body: pending.body, created_at: '2026-10-23T00:00:00Z' } });
  };
  await sendMessage(credentials, pending, { fetchImpl });
  await sendMessage(credentials, pending, { fetchImpl });
  assert.equal(bodies[0], bodies[1]);
  await assert.rejects(sendMessage(credentials, pending, { fetchImpl: async () => response({ ok: true, received: true, thread_id: credentials.id, message: { id: 2, role: 'owner', body: pending.body } }) }));
  assert.throws(() => createPendingMessage(' '));
  assert.throws(() => createPendingMessage('x'.repeat(2001)));
  assert.equal(createPendingMessage('x'.repeat(2000)).body.length, 2000);
});

test('read requests send cursor without exposing capability in URL and validate messages', async () => {
  const credentials = createPendingSubmission(brief);
  const detail = await readConversation(credentials, 3, { fetchImpl: async (url, options) => {
    assert.equal(url.search, '?after=3'); assert.ok(!url.href.includes(credentials.token));
    assert.equal(options.headers.Authorization, `Bearer ${credentials.token}`);
    return response({ thread: threadFor(credentials), messages: [{ id: 4, role: 'owner', body: '<img src=x onerror=alert(1)>', created_at: '2026-10-23T00:00:00Z' }], next_cursor: 4, has_more: false });
  } });
  assert.equal(detail.messages[0].body, '<img src=x onerror=alert(1)>');
  await assert.rejects(readConversation(credentials, 0, { fetchImpl: async () => response({ thread: threadFor(credentials), messages: [{ id: 1, role: 'admin', body: 'Invalid' }], next_cursor: 1, has_more: false }) }));
});

test('HTTP failures and timeouts cannot be interpreted as successful saves', async () => {
  await assert.rejects(requestJSON('/api/threads', { fetchImpl: async () => ({ ok: false, status: 503 }) }), (error) => error.status === 503);
  await assert.rejects(requestJSON('/api/threads', { timeout: 5, fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }) }), (error) => error.name === 'AbortError');
});

test('visible polling aborts active reads while hidden and stops timers on disposal', async () => {
  const doc = new EventTarget(); doc.hidden = false;
  const timers = new Map(); let next = 1; const signals = [];
  const stop = startVisiblePolling(async (signal) => { signals.push(signal); }, {
    doc, interval: 15000, setTimer: (callback, ms) => { assert.equal(ms, 15000); const id = next++; timers.set(id, callback); return id; }, clearTimer: (id) => timers.delete(id),
  });
  await new Promise(setImmediate);
  assert.equal(signals.length, 1); assert.equal(timers.size, 1);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(timers.size, 0);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  await new Promise(setImmediate);
  assert.equal(signals.length, 2);
  stop(); assert.equal(timers.size, 0);
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(signals.length, 2);
});

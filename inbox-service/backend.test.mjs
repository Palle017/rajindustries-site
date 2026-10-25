import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleRequest } from './worker/api.mjs';

const HOST = 'https://inbox.example';
const PUBLIC = 'https://rajindustries.fixingfortmyers.com';
const OWNER_EMAIL = 'synthetic-owner@example.invalid';
const OWNER_HEADERS = {
  'oai-authenticated-user-id': 'synthetic-owner-id',
  'oai-authenticated-user-email': OWNER_EMAIL.toUpperCase(),
  'oai-authenticated-user-full-name': 'Synthetic%20Owner',
  'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
};
const schema = readFileSync(new URL('./migrations/0001_inbox.sql', import.meta.url), 'utf8');
const token = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const brief = overrides => ({ category: 'Website or workflow automation', goal: 'Build a practical synthetic project website.', location: 'Remote', timing: 'Flexible', ...overrides });
const project = overrides => ({ id: crypto.randomUUID(), request_id: crypto.randomUUID(), brief: brief(), ...overrides });

// Each D1 batch is one synchronous SQLite transaction before the Promise resolves.
// This models atomic D1 batches under concurrently interleaved HTTP handlers.
function database(file = ':memory:') {
  const native = new DatabaseSync(file);
  native.exec('PRAGMA foreign_keys=ON');
  if (!native.prepare("SELECT name FROM sqlite_schema WHERE name='threads'").get()) native.exec(schema);
  const state = { failNext: null, queries: [] };
  const wrap = (sql, values = []) => ({
    bind(...params) { return wrap(sql, params); },
    execute() {
      state.queries.push({ sql, values });
      if (state.failNext?.test(sql)) { state.failNext = null; throw new Error('Synthetic storage failure containing a private internal detail'); }
      const result = native.prepare(sql).run(...values);
      return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    },
    async run() { return this.execute(); },
    async first() {
      state.queries.push({ sql, values });
      if (state.failNext?.test(sql)) { state.failNext = null; throw new Error('Synthetic storage failure'); }
      return native.prepare(sql).get(...values) || null;
    },
    async all() {
      state.queries.push({ sql, values });
      return { success: true, results: native.prepare(sql).all(...values) };
    },
  });
  return {
    prepare: wrap, native, state,
    async batch(queries) {
      native.exec('BEGIN IMMEDIATE');
      try { const results = queries.map(query => query.execute()); native.exec('COMMIT'); return results; }
      catch (error) { native.exec('ROLLBACK'); throw error; }
    },
    close() { native.close(); },
  };
}

function setup(file) {
  return {
    DB: database(file), RATE_SECRET: 'synthetic-local-rate-secret-at-least-32-bytes',
    PUBLIC_ORIGIN: PUBLIC, ALLOWED_EMAILS: ' ' + OWNER_EMAIL + ' ', RELEASE_SHA: 'abcdef0123456789',
  };
}

function makeRequest(path, { method = 'GET', secret, data, headers = {}, origin = method === 'GET' ? undefined : PUBLIC, host = HOST } = {}) {
  const allHeaders = { 'CF-Connecting-IP': '192.0.2.10', ...headers };
  if (origin !== undefined) allHeaders.Origin = origin;
  if (secret) allHeaders.Authorization = 'Bearer ' + secret;
  if (data !== undefined) { allHeaders['Content-Type'] ??= 'application/json'; allHeaders['X-Raj-Inbox'] ??= '1'; }
  return new Request(host + path, { method, headers: allHeaders, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
}

async function call(env, path, options, assets) {
  const response = await handleRequest(makeRequest(path, options), env, undefined, assets);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { response, body, text };
}

async function create(env, { payload = project(), secret = token(), ip = '192.0.2.10' } = {}) {
  const result = await call(env, '/api/threads', { method: 'POST', secret, data: payload, headers: { 'CF-Connecting-IP': ip } });
  return { ...result, payload, secret, id: payload.id };
}

async function reply(env, thread, body = 'Synthetic visitor reply.', requestId = crypto.randomUUID(), owner = false, extras = {}) {
  return call(env, (owner ? '/api/owner/threads/' : '/api/threads/') + thread.id + '/messages', {
    method: 'POST', secret: owner ? undefined : thread.secret,
    data: { request_id: requestId, body }, origin: owner ? HOST : PUBLIC,
    headers: owner ? OWNER_HEADERS : {}, ...extras,
  });
}

test('create commits the project and initial message; ACK contains only safe receipt fields', async () => {
  const env = setup();
  try {
    const result = await create(env);
    assert.equal(result.response.status, 201, result.text);
    assert.equal(result.body.received, true);
    assert.equal(result.body.duplicate, false);
    assert.equal(result.body.thread.id, result.id);
    assert.equal(result.body.thread.message_count, 1);
    assert.deepEqual(result.body.thread.brief, result.payload.brief);
    assert.equal(Date.parse(result.body.thread.expires_at) - Date.parse(result.body.thread.created_at), 90 * 86400000);
    const stored = env.DB.native.prepare('SELECT * FROM threads').get();
    assert.equal(stored.token_hash.length, 64);
    assert.notEqual(stored.token_hash, result.secret);
    const serialized = JSON.stringify({ thread: stored, buckets: env.DB.native.prepare('SELECT * FROM rate_buckets').all() });
    assert.ok(!serialized.includes(result.secret));
    assert.ok(!serialized.includes('192.0.2.10'));
    assert.doesNotMatch(result.text, /token_hash|content_hash|request_id|synthetic-owner|192\.0\.2/);
    const detail = await call(env, '/api/threads/' + result.id, { secret: result.secret, origin: PUBLIC });
    assert.equal(detail.response.status, 200);
    assert.equal(detail.body.messages.length, 1);
    assert.equal(detail.body.messages[0].role, 'visitor');
    assert.match(detail.body.messages[0].body, /Project brief/);
    assert.equal(detail.body.next_cursor, detail.body.messages[0].id);
    assert.equal(detail.response.headers.get('Access-Control-Allow-Origin'), PUBLIC);
    assert.equal(detail.response.headers.get('Cache-Control'), 'no-store');
  } finally { env.DB.close(); }
});

test('uncertain create retry survives reopening storage and returns the same receipt once', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'raj-inbox-'));
  const file = join(directory, 'durable.sqlite');
  let env = setup(file);
  try {
    const first = await create(env);
    env.DB.close();
    env = setup(file);
    const again = await create(env, { payload: first.payload, secret: first.secret });
    assert.equal(again.response.status, 200);
    assert.equal(again.body.duplicate, true);
    assert.deepEqual(again.body.thread, first.body.thread);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM threads').get().n, 1);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM messages').get().n, 1);
    assert.equal(env.DB.native.prepare('SELECT used FROM rate_buckets WHERE bucket_key LIKE ?').get('create-hour:%').used, 1);
  } finally { env.DB.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('changed create content or request ID conflicts; another token cannot claim an existing thread', async () => {
  const env = setup();
  try {
    const first = await create(env);
    const changed = structuredClone(first.payload); changed.brief.goal = 'Different synthetic project work.';
    assert.equal((await create(env, { payload: changed, secret: first.secret })).response.status, 409);
    assert.equal((await create(env, { payload: { ...first.payload, request_id: crypto.randomUUID() }, secret: first.secret })).response.status, 409);
    assert.equal((await create(env, { payload: first.payload, secret: token() })).response.status, 404);
    assert.equal((await create(env, { secret: first.secret })).response.status, 409);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM messages').get().n, 1);
  } finally { env.DB.close(); }
});

test('simultaneous identical creation is one thread and one initial message', async () => {
  const env = setup();
  try {
    const payload = project(), secret = token();
    const results = await Promise.all([create(env, { payload, secret }), create(env, { payload, secret })]);
    assert.deepEqual(results.map(result => result.response.status).sort(), [200, 201]);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM threads').get().n, 1);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM messages').get().n, 1);
    assert.equal(env.DB.native.prepare('SELECT message_count FROM threads').get().message_count, 1);
  } finally { env.DB.close(); }
});

test('atomic create rollback never acknowledges an initial message that failed to store', async () => {
  const env = setup();
  try {
    env.DB.state.failNext = /INSERT INTO messages/;
    const failed = await create(env);
    assert.equal(failed.response.status, 503);
    assert.equal(failed.body.ok, false);
    assert.doesNotMatch(failed.text, /private internal|Synthetic storage/);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM threads').get().n, 0);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM messages').get().n, 0);
    const recovered = await create(env, { payload: failed.payload, secret: failed.secret });
    assert.equal(recovered.response.status, 201);
  } finally { env.DB.close(); }
});

test('visitor tokens isolate threads; no token, malformed token and expired records return generic 404', async () => {
  const env = setup();
  try {
    const one = await create(env), two = await create(env);
    const unknown = crypto.randomUUID();
    const results = await Promise.all([
      call(env, '/api/threads/' + one.id),
      call(env, '/api/threads/' + one.id, { secret: two.secret }),
      call(env, '/api/threads/' + unknown, { secret: one.secret }),
      call(env, '/api/threads/' + one.id, { secret: 'A'.repeat(42) }),
      call(env, '/api/threads/' + one.id, { secret: 'A'.repeat(42) + 'B' }),
    ]);
    for (const result of results) { assert.equal(result.response.status, 404); assert.equal(result.body.code, 'NOT_FOUND'); }
    assert.equal(new Set(results.map(result => result.text)).size, 1);
    assert.equal((await reply(env, { id: one.id, secret: two.secret })).response.status, 404);
  } finally { env.DB.close(); }
});

test('owner identity and exact normalized allowlist protect every owner route', async () => {
  const env = setup();
  try {
    const item = await create(env);
    for (const path of ['/api/owner/session', '/api/owner/threads', '/api/owner/threads/' + item.id, '/api/owner/threads/' + item.id + '/messages']) {
      for (const headers of [{}, { 'oai-authenticated-user-email': OWNER_EMAIL }, { ...OWNER_HEADERS, 'oai-authenticated-user-email': 'wrong@example.invalid' }]) {
        const post = path.endsWith('/messages');
        const result = await call(env, path, { method: post ? 'POST' : 'GET', headers, origin: post ? HOST : undefined, ...(post ? { data: { request_id: crypto.randomUUID(), body: 'Unauthorized synthetic reply.' } } : {}) });
        assert.equal(result.response.status, headers['oai-authenticated-user-id'] ? 403 : 401, path);
        assert.ok(!result.text.includes(item.payload.brief.goal));
      }
    }
    const session = await call(env, '/api/owner/session', { headers: OWNER_HEADERS });
    assert.deepEqual(session.body, { ok: true, name: 'Synthetic Owner' });
    assert.ok(!session.text.includes(OWNER_EMAIL));
    const list = await call(env, '/api/owner/threads', { headers: OWNER_HEADERS });
    assert.equal(list.body.threads.length, 1);
    assert.equal(list.body.threads[0].id, item.id);
    assert.equal((await call(env, '/api/owner/threads/' + item.id, { headers: OWNER_HEADERS })).response.status, 200);
  } finally { env.DB.close(); }
});

test('owner page redirects anonymous visitors and its direct HTML asset cannot bypass auth', async () => {
  const env = setup();
  const assets = { '/owner.html': { body: '<h1>Owner inbox</h1>', type: 'text/html' }, '/owner.js': { body: '/* synthetic owner client */', type: 'text/javascript' }, '/inbox.css': { body: 'body{}', type: 'text/css' } };
  try {
    const anonymous = await call(env, '/owner', undefined, assets);
    assert.equal(anonymous.response.status, 303);
    assert.equal(anonymous.response.headers.get('Location'), HOST + '/signin-with-chatgpt?return_to=%2Fowner');
    const owner = await call(env, '/owner', { headers: OWNER_HEADERS }, assets);
    assert.equal(owner.response.status, 200);
    assert.equal(owner.body, '<h1>Owner inbox</h1>');
    assert.equal((await call(env, '/owner.html', undefined, assets)).response.status, 404);
    for (const path of ['/owner.js', '/inbox.css']) assert.equal((await call(env, path, undefined, assets)).response.status, 200);
    assert.match(owner.response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.doesNotMatch(owner.response.headers.get('Content-Security-Policy'), /unsafe-inline/);
    assert.equal(owner.response.headers.get('Referrer-Policy'), 'no-referrer');
  } finally { env.DB.close(); }
});

test('visitor and owner replies persist in order with idempotent retries and unchanged expiry', async () => {
  const env = setup();
  try {
    const item = await create(env), requestId = crypto.randomUUID();
    const visitor = await reply(env, item, 'Synthetic visitor clarification.', requestId);
    assert.equal(visitor.response.status, 201, visitor.text);
    assert.equal(visitor.body.message.role, 'visitor');
    const repeat = await reply(env, item, 'Synthetic visitor clarification.', requestId);
    assert.equal(repeat.response.status, 200);
    assert.equal(repeat.body.duplicate, true);
    assert.deepEqual(repeat.body.message, visitor.body.message);
    assert.equal((await reply(env, item, 'Changed message content.', requestId)).response.status, 409);
    assert.equal((await reply(env, item, 'Synthetic visitor clarification.', requestId, true)).response.status, 409);
    const owner = await reply(env, item, 'Synthetic owner response.', crypto.randomUUID(), true);
    assert.equal(owner.response.status, 201, owner.text);
    const detail = await call(env, '/api/threads/' + item.id + '?after=' + visitor.body.message.id, { secret: item.secret });
    assert.equal(detail.body.messages.length, 1);
    assert.equal(detail.body.messages[0].role, 'owner');
    assert.equal(detail.body.messages[0].body, 'Synthetic owner response.');
    assert.equal(detail.body.thread.message_count, 3);
    assert.equal(detail.body.thread.expires_at, item.body.thread.expires_at);
    assert.equal(detail.body.has_more, false);
  } finally { env.DB.close(); }
});

test('concurrent duplicate reply produces one stored message and a duplicate receipt', async () => {
  const env = setup();
  try {
    const item = await create(env), requestId = crypto.randomUUID();
    const results = await Promise.all([reply(env, item, 'Same synthetic reply.', requestId), reply(env, item, 'Same synthetic reply.', requestId)]);
    assert.deepEqual(results.map(result => result.response.status).sort(), [200, 201]);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM messages').get().n, 2);
    assert.equal(env.DB.native.prepare('SELECT message_count FROM threads').get().message_count, 2);
  } finally { env.DB.close(); }
});

test('message and count changes roll back together on storage failure; retry can recover', async () => {
  const env = setup();
  try {
    const item = await create(env), requestId = crypto.randomUUID();
    env.DB.state.failNext = /UPDATE threads SET message_count/;
    const failed = await reply(env, item, 'Synthetic recoverable reply.', requestId);
    assert.equal(failed.response.status, 503);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM messages').get().n, 1);
    assert.equal(env.DB.native.prepare('SELECT message_count FROM threads').get().message_count, 1);
    assert.equal((await reply(env, item, 'Synthetic recoverable reply.', requestId)).response.status, 201);
  } finally { env.DB.close(); }
});

test('concurrent writes cannot exceed 100 total messages and existing retries still work at the cap', async () => {
  const env = setup();
  try {
    const item = await create(env);
    const insert = env.DB.native.prepare("INSERT INTO messages(thread_id,request_id,role,body,content_hash,created_at) VALUES(?,?,'owner','Synthetic historical message.','historical',?)");
    for (let index = 0; index < 98; index += 1) insert.run(item.id, crypto.randomUUID(), item.body.thread.created_at);
    env.DB.native.prepare('UPDATE threads SET message_count=99 WHERE id=?').run(item.id);
    const requestIds = Array.from({ length: 8 }, () => crypto.randomUUID());
    const results = await Promise.all(requestIds.map(requestId => reply(env, item, 'Synthetic last-slot reply.', requestId, true)));
    assert.equal(results.filter(result => result.response.status === 201).length, 1, JSON.stringify(results.map(result => result.body)));
    assert.equal(results.filter(result => result.response.status === 409).length, 7);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM messages WHERE thread_id=?').get(item.id).n, 100);
    assert.equal(env.DB.native.prepare('SELECT message_count FROM threads WHERE id=?').get(item.id).message_count, 100);
    const winner = results.findIndex(result => result.response.status === 201);
    const repeat = await reply(env, item, 'Synthetic last-slot reply.', requestIds[winner], true);
    assert.equal(repeat.response.status, 200);
    assert.equal(repeat.body.duplicate, true);
  } finally { env.DB.close(); }
});

test('exact origin, JSON and custom-header checks reject cross-site writes before storing data', async () => {
  const env = setup();
  try {
    for (const origin of [undefined, 'null', 'https://evil.example', PUBLIC + '.evil.example']) {
      const data = project(), secret = token();
      const request = new Request(HOST + '/api/threads', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Raj-Inbox': '1', Authorization: 'Bearer ' + secret, ...(origin === undefined ? {} : { Origin: origin }) }, body: JSON.stringify(data) });
      assert.equal((await handleRequest(request, env)).status, 403);
    }
    const noHeader = await create(env);
    const item = noHeader;
    assert.equal(item.response.status, 201);
    assert.equal((await reply(env, item, 'Synthetic invalid origin.', crypto.randomUUID(), true, { origin: PUBLIC })).response.status, 403);
    assert.equal((await call(env, '/api/threads/' + item.id, { secret: item.secret, origin: 'https://evil.example' })).response.status, 403);
    const invalidHeader = await call(env, '/api/threads', { method: 'POST', secret: token(), data: project(), headers: { 'X-Raj-Inbox': '0' } });
    assert.equal(invalidHeader.response.status, 403);
    const invalidType = await call(env, '/api/threads', { method: 'POST', secret: token(), data: project(), headers: { 'Content-Type': 'text/plain' } });
    assert.equal(invalidType.response.status, 415);
    const local = await call(env, '/api/threads', { method: 'POST', secret: token(), data: project(), host: 'http://127.0.0.1:8792', origin: 'http://127.0.0.1:8792' });
    assert.equal(local.response.status, 201);
  } finally { env.DB.close(); }
});

test('CORS preflight exposes only allowed methods and headers and never credentials', async () => {
  const env = setup();
  try {
    const response = await handleRequest(new Request(HOST + '/api/threads', { method: 'OPTIONS', headers: { Origin: PUBLIC, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-raj-inbox' } }), env);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), PUBLIC);
    assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
    assert.match(response.headers.get('Access-Control-Allow-Headers'), /Authorization/);
    const denied = await handleRequest(new Request(HOST + '/api/threads', { method: 'OPTIONS', headers: { Origin: PUBLIC, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-evil' } }), env);
    assert.equal(denied.status, 403);
  } finally { env.DB.close(); }
});

test('bounded streaming rejects oversized bodies and malformed input without a write', async () => {
  const env = setup();
  try {
    const secret = token();
    const request = new Request(HOST + '/api/threads', { method: 'POST', headers: { Origin: PUBLIC, 'Content-Type': 'application/json', 'X-Raj-Inbox': '1', Authorization: 'Bearer ' + secret }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(17000)); controller.close(); } }), duplex: 'half' });
    assert.equal((await handleRequest(request, env)).status, 413);
    for (const payload of [project({ id: 'invalid' }), project({ request_id: 'invalid' }), project({ brief: brief({ goal: 'short' }) }), project({ brief: brief({ category: 'x'.repeat(101) }) }), project({ brief: brief({ location: 'x'.repeat(201) }) }), project({ brief: brief({ timing: '' }) }), project({ brief: null })]) {
      const result = await create(env, { payload });
      assert.equal(result.response.status, 400, result.text);
    }
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM threads').get().n, 0);
    const item = await create(env);
    for (const body of ['', ' ', 'x'.repeat(2001), null]) assert.equal((await reply(env, item, body)).response.status, 400);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM messages').get().n, 1);
  } finally { env.DB.close(); }
});

test('creation limits are durable, hashed and retry-safe with a Retry-After response', async () => {
  const env = setup();
  try {
    const first = await create(env);
    for (let count = 1; count < 5; count += 1) assert.equal((await create(env)).response.status, 201);
    const limited = await create(env);
    assert.equal(limited.response.status, 429);
    assert.equal(limited.body.code, 'RATE_LIMITED');
    assert.ok(Number(limited.response.headers.get('Retry-After')) > 0);
    assert.equal((await create(env, { payload: first.payload, secret: first.secret })).response.status, 200);
    env.DB.native.prepare('UPDATE rate_buckets SET used=50 WHERE bucket_key LIKE ?').run('create-day:%');
    env.DB.native.prepare('DELETE FROM rate_buckets WHERE bucket_key LIKE ?').run('create-hour:%');
    assert.equal((await create(env)).response.status, 429);
    for (const row of env.DB.native.prepare('SELECT bucket_key FROM rate_buckets').all()) assert.match(row.bucket_key, /^(?:create-hour|create-day):\d+:[0-9a-f]{64}$/);
  } finally { env.DB.close(); }
});

test('visitor and owner reply limits use separate durable rate buckets', async () => {
  const env = setup();
  try {
    const item = await create(env);
    for (let count = 0; count < 30; count += 1) assert.equal((await reply(env, item)).response.status, 201);
    assert.equal((await reply(env, item)).response.status, 429);
    for (let count = 0; count < 60; count += 1) assert.equal((await reply(env, item, 'Synthetic owner reply.', crypto.randomUUID(), true)).response.status, 201);
    assert.equal((await reply(env, item, 'Synthetic owner reply.', crypto.randomUUID(), true)).response.status, 429);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM messages').get().n, 91);
  } finally { env.DB.close(); }
});

test('owner pagination remains stable when multiple threads share an updated timestamp', async () => {
  const env = setup();
  try {
    for (let index = 0; index < 27; index += 1) assert.equal((await create(env, { ip: '192.0.2.' + (index + 1) })).response.status, 201);
    env.DB.native.prepare('UPDATE threads SET updated_at=?').run('2026-10-23T00:00:00.000Z');
    const first = await call(env, '/api/owner/threads', { headers: OWNER_HEADERS });
    assert.equal(first.body.threads.length, 25);
    assert.ok(first.body.next_cursor);
    const second = await call(env, '/api/owner/threads?before=' + encodeURIComponent(first.body.next_cursor), { headers: OWNER_HEADERS });
    assert.equal(second.body.threads.length, 2);
    assert.equal(second.body.next_cursor, null);
    assert.equal(new Set([...first.body.threads, ...second.body.threads].map(thread => thread.id)).size, 27);
    assert.equal((await call(env, '/api/owner/threads?before=bad', { headers: OWNER_HEADERS })).response.status, 400);
    const id = first.body.threads[0].id;
    assert.equal((await call(env, '/api/owner/threads/' + id + '?after=-1', { headers: OWNER_HEADERS })).response.status, 400);
  } finally { env.DB.close(); }
});

test('a new visitor reply moves an older thread onto the first owner page and marks it needing a reply', async () => {
  const env = setup();
  try {
    const oldest = await create(env);
    for (let index = 0; index < 26; index += 1) assert.equal((await create(env, { ip: '198.51.100.' + (index + 1) })).response.status, 201);
    env.DB.native.prepare('UPDATE threads SET created_at=?,updated_at=? WHERE id=?').run('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', oldest.id);
    env.DB.native.prepare('UPDATE threads SET updated_at=? WHERE id<>?').run('2026-01-02T00:00:00.000Z', oldest.id);
    const before = await call(env, '/api/owner/threads', { headers: OWNER_HEADERS });
    assert.ok(!before.body.threads.some(thread => thread.id === oldest.id));
    assert.equal((await reply(env, oldest, 'Synthetic new visitor update.')).response.status, 201);
    const after = await call(env, '/api/owner/threads', { headers: OWNER_HEADERS });
    assert.equal(after.body.threads[0].id, oldest.id);
    assert.equal(after.body.threads[0].last_message_role, 'visitor');
    assert.equal(after.body.threads[0].needs_reply, true);
    assert.equal((await reply(env, oldest, 'Synthetic owner follow-up.', crypto.randomUUID(), true)).response.status, 201);
    const detail = await call(env, '/api/owner/threads/' + oldest.id, { headers: OWNER_HEADERS });
    assert.equal(detail.body.thread.last_message_role, 'owner');
    assert.equal(detail.body.thread.needs_reply, false);
  } finally { env.DB.close(); }
});

test('HTTP public origins require local-preview opt-in and an exact loopback hostname', async () => {
  const env = setup();
  try {
    for (const origin of ['http://127.0.0.1:8792', 'http://localhost:8792']) {
      assert.equal((await call({ ...env, PUBLIC_ORIGIN: origin }, '/api/health')).response.status, 503);
      assert.equal((await call({ ...env, PUBLIC_ORIGIN: origin, LOCAL_PREVIEW: '1' }, '/api/health')).response.status, 200);
    }
    for (const origin of ['http://evil.example', 'http://127.0.0.1.evil.example', 'http://localhost.evil.example']) {
      assert.equal((await call({ ...env, PUBLIC_ORIGIN: origin, LOCAL_PREVIEW: '1' }, '/api/health')).response.status, 503);
    }
  } finally { env.DB.close(); }
});

test('expired threads deny both roles and bounded cleanup cascades their messages only', async () => {
  const env = setup();
  try {
    const expired = await create(env), live = await create(env);
    env.DB.native.prepare('UPDATE threads SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', expired.id);
    assert.equal((await call(env, '/api/threads/' + expired.id, { secret: expired.secret })).response.status, 404);
    assert.equal((await call(env, '/api/owner/threads/' + expired.id, { headers: OWNER_HEADERS })).response.status, 404);
    assert.equal((await reply(env, expired)).response.status, 404);
    const list = await call(env, '/api/owner/threads', { headers: OWNER_HEADERS });
    assert.equal(list.body.threads.length, 1);
    assert.equal(list.body.threads[0].id, live.id);
    assert.equal((await reply(env, live)).response.status, 201);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM threads WHERE id=?').get(expired.id).n, 0);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM messages WHERE thread_id=?').get(expired.id).n, 0);
    assert.equal(env.DB.native.prepare('SELECT COUNT(*) n FROM messages WHERE thread_id=?').get(live.id).n, 2);
  } finally { env.DB.close(); }
});

test('health fails closed without bindings or schema and exposes readiness booleans plus revision only', async () => {
  const env = setup();
  try {
    const good = await call(env, '/api/health');
    assert.equal(good.response.status, 200);
    assert.deepEqual(good.body, { ok: true, ready: { DB: true, RATE_SECRET: true, ALLOWED_EMAILS: true, PUBLIC_ORIGIN: true }, release_sha: 'abcdef0123456789' });
    for (const key of ['DB', 'RATE_SECRET', 'ALLOWED_EMAILS', 'PUBLIC_ORIGIN']) {
      const broken = { ...env, [key]: undefined };
      const bad = await call(broken, '/api/health');
      assert.equal(bad.response.status, 503);
      assert.equal(bad.body.ready[key], false);
    }
    env.DB.native.exec('DROP TABLE rate_buckets');
    const incomplete = await call(env, '/api/health');
    assert.equal(incomplete.response.status, 503);
    assert.equal(incomplete.body.ready.DB, false);
    assert.doesNotMatch(good.text, /synthetic-local-rate-secret|synthetic-owner@example/);
    assert.equal((await create({ ...env, RATE_SECRET: undefined })).response.status, 503);
    const source = readFileSync(new URL('./worker/api.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /console\.|CREATE TABLE|ALTER TABLE|DROP TABLE|\bfetch\s*\(/);
  } finally { env.DB.close(); }
});

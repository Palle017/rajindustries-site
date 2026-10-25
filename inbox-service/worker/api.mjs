// Hosted behind Sites Dispatch: owner identity headers are trusted only within
// that platform boundary. Never expose this handler as an unprotected Worker.
const DAY_MS = 86400000;
const RETENTION_MS = 90 * DAY_MS;
const BODY_LIMIT = 16 * 1024;
const MESSAGE_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const THREAD_SELECT = `SELECT threads.*,
  (SELECT role FROM messages WHERE thread_id=threads.id ORDER BY id DESC LIMIT 1) AS last_message_role FROM threads`;
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";
const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': CSP,
};

class RequestError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

const fail = (status, code, message, headers) => { throw new RequestError(status, code, message, headers); };
const missing = () => fail(404, 'NOT_FOUND', 'This conversation is unavailable.');
const conflict = () => fail(409, 'CONFLICT', 'This request conflicts with a previous request. Keep your original return link and retry details.');
const unavailable = () => fail(503, 'UNAVAILABLE', 'The inbox is temporarily unavailable. Your message has not been confirmed. Please retry.');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const isoNow = () => new Date().toISOString();

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

function publicOrigin(env) {
  try {
    const parsed = new URL(env.PUBLIC_ORIGIN);
    if (parsed.origin !== env.PUBLIC_ORIGIN) return null;
    if (parsed.protocol === 'https:') return parsed.origin;
    if (env.LOCAL_PREVIEW === '1' && parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)) return parsed.origin;
  } catch {}
  return null;
}

function corsOrigin(request, env, write = false, owner = false) {
  const origin = request.headers.get('Origin');
  const self = new URL(request.url).origin;
  if (!origin && !write) return null;
  if (origin === self || (!owner && origin === publicOrigin(env))) return origin;
  fail(403, 'ORIGIN_DENIED', 'This request origin is not allowed.');
}

function withCors(response, request, env, owner = false) {
  const origin = request.headers.get('Origin');
  const self = new URL(request.url).origin;
  response.headers.set('Vary', 'Origin');
  if (origin && (origin === self || (!owner && origin === publicOrigin(env)))) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Expose-Headers', 'Retry-After');
  }
  return response;
}

function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'INVALID_INPUT', 'Use a valid request identifier.');
  return value.toLowerCase();
}

function text(value, min, max, label) {
  if (typeof value !== 'string') fail(400, 'INVALID_INPUT', `Check ${label}.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max || normalized.includes('\0')) {
    fail(400, 'INVALID_INPUT', `Check ${label}.`);
  }
  return normalized;
}

function briefInput(value) {
  if (!object(value)) fail(400, 'INVALID_INPUT', 'Check the project brief.');
  return {
    category: text(value.category, 1, 100, 'the service'),
    goal: text(value.goal, 8, 1000, 'the project goal'),
    location: text(value.location, 1, 200, 'the location or work mode'),
    timing: text(value.timing, 1, 200, 'the preferred timing'),
  };
}

function briefMessage(brief) {
  return `Project brief\n\nService: ${brief.category}\n\nGoal or problem:\n${brief.goal}\n\nLocation / work mode: ${brief.location}\nPreferred timing: ${brief.timing}`;
}

async function readJson(request) {
  if (request.headers.get('X-Raj-Inbox') !== '1') fail(403, 'INVALID_REQUEST', 'Use the website to submit this request.');
  if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    fail(415, 'JSON_REQUIRED', 'Submit this request as JSON.');
  }
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > BODY_LIMIT)) fail(413, 'TOO_LARGE', 'This request is too large.');
  if (!request.body) fail(400, 'INVALID_JSON', 'Check the request.');
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > BODY_LIMIT) {
        await reader.cancel().catch(() => {});
        fail(413, 'TOO_LARGE', 'This request is too large.');
      }
      chunks.push(part.value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
    if (!object(data)) fail(400, 'INVALID_JSON', 'Check the request.');
    return data;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    fail(400, 'INVALID_JSON', 'Check the request.');
  } finally {
    reader.releaseLock();
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function tokenHash(request) {
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) missing();
  const token = authorization.slice(7);
  try {
    const binary = atob(token.replace(/-/g, '+').replace(/_/g, '/') + '=');
    const canonical = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (binary.length !== 32 || canonical !== token) missing();
  } catch { missing(); }
  return sha256(token);
}

function equalHash(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function configured(env) {
  return Boolean(env.DB?.prepare && env.DB?.batch && typeof env.RATE_SECRET === 'string' &&
    env.RATE_SECRET.length >= 32 && publicOrigin(env));
}

function requireStorage(env) { if (!configured(env)) unavailable(); }

async function consumeRate(env, scope, identity, limit, windowSeconds) {
  if (typeof env.RATE_SECRET !== 'string' || env.RATE_SECRET.length < 32) unavailable();
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const start = Math.floor(now / windowMs) * windowMs;
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.RATE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(scope + '\n' + identity));
  const digest = [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const bucket = scope + ':' + start + ':' + digest;
  const row = await env.DB.prepare(`INSERT INTO rate_buckets(bucket_key,used,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket_key) DO UPDATE SET used=used+1 WHERE used<? RETURNING used`)
    .bind(bucket, start + windowMs, limit).first();
  if (!row) fail(429, 'RATE_LIMITED', 'Please wait before trying again.', { 'Retry-After': String(Math.max(1, Math.ceil((start + windowMs - now) / 1000))) });
}

function ownerIdentity(request, env) {
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  if (!userId || !email) fail(401, 'SIGN_IN_REQUIRED', 'Sign in to the owner inbox.');
  const allowed = typeof env.ALLOWED_EMAILS === 'string'
    ? env.ALLOWED_EMAILS.split(',').map(value => value.trim().toLowerCase()).filter(Boolean) : [];
  if (!allowed.length) unavailable();
  if (!allowed.includes(email.trim().toLowerCase())) fail(403, 'OWNER_REQUIRED', 'This account does not have owner access.');
  let name = request.headers.get('oai-authenticated-user-full-name') || '';
  if (request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name = decodeURIComponent(name); } catch { name = ''; }
  }
  return { userId, name: name.trim().slice(0, 100) || 'Raj' };
}

function threadView(row) {
  return {
    id: row.id,
    brief: { category: row.category, goal: row.goal, location: row.location, timing: row.timing },
    created_at: row.created_at, updated_at: row.updated_at, expires_at: row.expires_at,
    message_count: Number(row.message_count),
    last_message_role: row.last_message_role || null,
    needs_reply: row.last_message_role === 'visitor',
  };
}

function messageView(row) { return { id: Number(row.id), role: row.role, body: row.body, created_at: row.created_at }; }

async function existingThread(env, id, hash = null) {
  const sql = THREAD_SELECT + ' WHERE id=? AND expires_at>?' + (hash ? ' AND token_hash=?' : '');
  const params = hash ? [id, isoNow(), hash] : [id, isoNow()];
  const row = await env.DB.prepare(sql).bind(...params).first();
  if (!row) missing();
  return row;
}

function afterCursor(url) {
  const value = url.searchParams.get('after');
  if (value === null) return 0;
  if (!/^(0|[1-9]\d{0,15})$/.test(value) || !Number.isSafeInteger(Number(value))) fail(400, 'INVALID_CURSOR', 'Refresh the conversation and try again.');
  return Number(value);
}

async function detail(env, row, url) {
  const after = afterCursor(url);
  const result = await env.DB.prepare('SELECT id,role,body,created_at FROM messages WHERE thread_id=? AND id>? ORDER BY id ASC LIMIT 101').bind(row.id, after).all();
  const messages = result.results.slice(0, 100).map(messageView);
  return json({ thread: threadView(row), messages, next_cursor: messages.at(-1)?.id ?? after, has_more: result.results.length > 100 });
}

function createReceipt(row, duplicate) { return json({ ok: true, received: true, thread: threadView(row), duplicate }, duplicate ? 200 : 201); }

function checkCreate(row, hash, requestId, contentHash) {
  if (row.expires_at <= isoNow() || !equalHash(row.token_hash, hash)) missing();
  if (row.create_request_id !== requestId || !equalHash(row.content_hash, contentHash)) conflict();
  return createReceipt(row, true);
}

async function createThread(request, env) {
  corsOrigin(request, env, true);
  requireStorage(env);
  const hash = await tokenHash(request);
  const payload = await readJson(request);
  const id = uuid(payload.id), requestId = uuid(payload.request_id), brief = briefInput(payload.brief);
  const contentHash = await sha256(JSON.stringify(brief));
  const previous = await env.DB.prepare(THREAD_SELECT + ' WHERE id=?').bind(id).first();
  if (previous) return checkCreate(previous, hash, requestId, contentHash);
  if (await env.DB.prepare('SELECT id FROM threads WHERE token_hash=?').bind(hash).first()) conflict();
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || ip.length > 64) unavailable();
  await consumeRate(env, 'create-hour', ip, 5, 3600);
  await consumeRate(env, 'create-day', ip, 50, 86400);
  const now = isoNow(), expires = new Date(Date.parse(now) + RETENTION_MS).toISOString();
  const body = briefMessage(brief), messageHash = await sha256(body);
  let inserted;
  try {
    inserted = await env.DB.batch([
      env.DB.prepare(`INSERT INTO threads(id,token_hash,create_request_id,content_hash,category,goal,location,timing,created_at,updated_at,expires_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
        .bind(id, hash, requestId, contentHash, brief.category, brief.goal, brief.location, brief.timing, now, now, expires),
      env.DB.prepare(`INSERT INTO messages(thread_id,request_id,role,body,content_hash,created_at)
        SELECT ?,?,'visitor',?,?,? WHERE EXISTS(SELECT 1 FROM threads WHERE id=? AND token_hash=? AND create_request_id=? AND content_hash=?)
        ON CONFLICT(thread_id,request_id) DO NOTHING`)
        .bind(id, requestId, body, messageHash, now, id, hash, requestId, contentHash),
      env.DB.prepare(`UPDATE threads SET message_count=(SELECT COUNT(*) FROM messages WHERE thread_id=threads.id),
        updated_at=(SELECT MAX(created_at) FROM messages WHERE thread_id=threads.id)
        WHERE id=? AND token_hash=? AND create_request_id=? AND content_hash=?`)
        .bind(id, hash, requestId, contentHash),
    ]);
  } catch {
    const raced = await env.DB.prepare(THREAD_SELECT + ' WHERE id=?').bind(id).first();
    if (raced) return checkCreate(raced, hash, requestId, contentHash);
    if (await env.DB.prepare('SELECT id FROM threads WHERE token_hash=?').bind(hash).first()) conflict();
    unavailable();
  }
  const row = await env.DB.prepare(THREAD_SELECT + ' WHERE id=?').bind(id).first();
  if (!row) unavailable();
  if (!inserted[0]?.meta?.changes) return checkCreate(row, hash, requestId, contentHash);
  if (Number(row.message_count) < 1) unavailable();
  return createReceipt(row, false);
}

async function addMessage(request, env, row, role, identity) {
  const data = await readJson(request);
  const requestId = uuid(data.request_id), body = text(data.body, 1, 2000, 'the message');
  const hash = await sha256(body);
  const receipt = (message, duplicate) => json({ ok: true, received: true, thread_id: row.id, message: messageView(message), duplicate }, duplicate ? 200 : 201);
  const existing = await env.DB.prepare('SELECT * FROM messages WHERE thread_id=? AND request_id=?').bind(row.id, requestId).first();
  if (existing) {
    if (existing.role !== role || !equalHash(existing.content_hash, hash)) conflict();
    return receipt(existing, true);
  }
  if (Number(row.message_count) >= MESSAGE_LIMIT) fail(409, 'THREAD_FULL', 'This conversation has reached its message limit.');
  await consumeRate(env, role === 'owner' ? 'owner-hour' : 'reply-hour', identity, role === 'owner' ? 60 : 30, 3600);
  const now = isoNow();
  let inserted;
  try {
    inserted = await env.DB.batch([
      env.DB.prepare(`INSERT INTO messages(thread_id,request_id,role,body,content_hash,created_at)
        SELECT ?,?,?,?,?,? FROM threads WHERE id=? AND expires_at>? AND message_count<100
        ON CONFLICT(thread_id,request_id) DO NOTHING`)
        .bind(row.id, requestId, role, body, hash, now, row.id, now),
      env.DB.prepare(`UPDATE threads SET message_count=(SELECT COUNT(*) FROM messages WHERE thread_id=threads.id),
        updated_at=(SELECT MAX(created_at) FROM messages WHERE thread_id=threads.id)
        WHERE id=? AND EXISTS(SELECT 1 FROM messages WHERE thread_id=? AND request_id=? AND role=? AND content_hash=?)`)
        .bind(row.id, row.id, requestId, role, hash),
    ]);
  } catch {
    const current = await existingThread(env, row.id);
    if (Number(current.message_count) >= MESSAGE_LIMIT) fail(409, 'THREAD_FULL', 'This conversation has reached its message limit.');
    unavailable();
  }
  const saved = await env.DB.prepare('SELECT * FROM messages WHERE thread_id=? AND request_id=?').bind(row.id, requestId).first();
  if (!saved) {
    const current = await existingThread(env, row.id);
    if (Number(current.message_count) >= MESSAGE_LIMIT) fail(409, 'THREAD_FULL', 'This conversation has reached its message limit.');
    unavailable();
  }
  if (saved.role !== role || !equalHash(saved.content_hash, hash)) conflict();
  return receipt(saved, !inserted[0]?.meta?.changes);
}

async function ownerList(env, url) {
  const before = url.searchParams.get('before');
  const params = [isoNow()];
  let condition = '';
  if (before) {
    const parts = before.split('/');
    if (parts.length !== 2 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parts[0]) || !Number.isFinite(Date.parse(parts[0])) || !UUID.test(parts[1])) {
      fail(400, 'INVALID_CURSOR', 'Refresh the inbox and try again.');
    }
    condition = ' AND (updated_at<? OR (updated_at=? AND id<?))';
    params.push(parts[0], parts[0], parts[1].toLowerCase());
  }
  const result = await env.DB.prepare(THREAD_SELECT + ' WHERE expires_at>?' + condition + ' ORDER BY updated_at DESC,id DESC LIMIT 26').bind(...params).all();
  const threads = result.results.slice(0, 25).map(threadView);
  const last = threads.at(-1);
  return json({ threads, next_cursor: result.results.length > 25 ? last.updated_at + '/' + last.id : null });
}

function assetResponse(asset, path) {
  if (asset === undefined || asset === null) unavailable();
  const value = typeof asset === 'object' && 'body' in asset ? asset : { body: asset };
  const type = value.type || (path.endsWith('.js') ? 'text/javascript; charset=utf-8' : path.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8');
  return new Response(value.body, { headers: { ...SECURITY_HEADERS, 'Content-Type': type } });
}

async function cleanup(env) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM threads WHERE id IN (SELECT id FROM threads WHERE expires_at<=? ORDER BY expires_at,id LIMIT 20)').bind(isoNow()),
    env.DB.prepare('DELETE FROM rate_buckets WHERE bucket_key IN (SELECT bucket_key FROM rate_buckets WHERE expires_at<=? ORDER BY expires_at,bucket_key LIMIT 100)').bind(Date.now()),
  ]);
}

async function health(env) {
  const ready = {
    DB: Boolean(env.DB?.prepare && env.DB?.batch),
    RATE_SECRET: typeof env.RATE_SECRET === 'string' && env.RATE_SECRET.length >= 32,
    ALLOWED_EMAILS: typeof env.ALLOWED_EMAILS === 'string' && env.ALLOWED_EMAILS.split(',').some(value => value.trim()),
    PUBLIC_ORIGIN: Boolean(publicOrigin(env)),
  };
  if (ready.DB) {
    try {
      await env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM threads WHERE 0) + (SELECT COUNT(*) FROM messages WHERE 0) +
        (SELECT COUNT(*) FROM rate_buckets WHERE 0) AS ready`).first();
    }
    catch { ready.DB = false; }
  }
  const ok = Object.values(ready).every(Boolean);
  const release = typeof env.RELEASE_SHA === 'string' && /^[0-9a-f]{7,64}$/i.test(env.RELEASE_SHA) ? env.RELEASE_SHA : null;
  return json({ ok, ready, release_sha: release }, ok ? 200 : 503);
}

async function route(request, env, assets) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (path === '/api/health' && method === 'GET') return health(env);
  if (method === 'OPTIONS' && path.startsWith('/api/')) {
    const owner = path.startsWith('/api/owner/');
    corsOrigin(request, env, true, owner);
    const desired = request.headers.get('Access-Control-Request-Method');
    const headers = (request.headers.get('Access-Control-Request-Headers') || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!['GET', 'POST'].includes(desired) || headers.some(value => !['authorization', 'content-type', 'x-raj-inbox'].includes(value))) fail(403, 'ORIGIN_DENIED', 'This request is not allowed.');
    return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Raj-Inbox', 'Access-Control-Max-Age': '300' } });
  }
  if (path === '/owner' && method === 'GET') {
    try { ownerIdentity(request, env); }
    catch (error) {
      if (error instanceof RequestError && error.status === 401) {
        return new Response(null, { status: 303, headers: { ...SECURITY_HEADERS, Location: url.origin + '/signin-with-chatgpt?return_to=%2Fowner' } });
      }
      throw error;
    }
    return assetResponse(assets['/owner.html'], '/owner.html');
  }
  if (path.startsWith('/api/owner/')) {
    const owner = ownerIdentity(request, env);
    corsOrigin(request, env, method !== 'GET', true);
    requireStorage(env);
    if (path === '/api/owner/session' && method === 'GET') return json({ ok: true, name: owner.name });
    if (path === '/api/owner/threads' && method === 'GET') return ownerList(env, url);
    const match = path.match(/^\/api\/owner\/threads\/([0-9a-f-]+)(\/messages)?$/i);
    if (match && UUID.test(match[1])) {
      const row = await existingThread(env, match[1].toLowerCase());
      if (!match[2] && method === 'GET') return detail(env, row, url);
      if (match[2] && method === 'POST') return addMessage(request, env, row, 'owner', owner.userId);
    }
    missing();
  }
  if (path === '/api/threads' && method === 'POST') return createThread(request, env);
  const match = path.match(/^\/api\/threads\/([0-9a-f-]+)(\/messages)?$/i);
  if (match && UUID.test(match[1])) {
    corsOrigin(request, env, method !== 'GET');
    requireStorage(env);
    const hash = await tokenHash(request);
    const row = await existingThread(env, match[1].toLowerCase(), hash);
    if (!match[2] && method === 'GET') return detail(env, row, url);
    if (match[2] && method === 'POST') return addMessage(request, env, row, 'visitor', hash);
  }
  if (method === 'GET' && path !== '/owner.html' && Object.hasOwn(assets, path)) return assetResponse(assets[path], path);
  missing();
}

export async function handleRequest(request, env, ctx, assets = {}) {
  const owner = new URL(request.url).pathname.startsWith('/api/owner/');
  let response;
  try {
    response = await route(request, env, assets);
  } catch (error) {
    response = error instanceof RequestError
      ? json({ ok: false, error: error.message, code: error.code }, error.status, error.headers)
      : json({ ok: false, error: 'The inbox is temporarily unavailable. Your message has not been confirmed. Please retry.', code: 'UNAVAILABLE' }, 503);
  }
  // Cleanup is bounded, affects only expired records in this service's own DB,
  // and never changes a confirmed response when maintenance itself fails.
  if (response.status < 400 && request.method === 'POST' && configured(env)) {
    const maintenance = cleanup(env).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(maintenance);
    else await maintenance;
  }
  return withCors(response, request, env, owner);
}

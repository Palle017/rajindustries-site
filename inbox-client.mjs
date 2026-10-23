const LOCAL_PREVIEW = typeof location !== 'undefined' && ['127.0.0.1', 'localhost'].includes(location.hostname);
export const INBOX_ORIGIN = LOCAL_PREVIEW ? 'http://127.0.0.1:8793' : 'https://raj-industries-inbox.prudhvi-pallempati.chatgpt.site';
export const PUBLIC_ORIGIN = LOCAL_PREVIEW ? location.origin : 'https://rajindustries.fixingfortmyers.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const CHECKPOINT_KEY = 'raj_inbox_pending_v1';

export function isThreadId(value) { return typeof value === 'string' && UUID.test(value); }
export function isCapability(value) { return typeof value === 'string' && TOKEN.test(value); }

export function createPendingSubmission(brief, cryptography = globalThis.crypto) {
  const bytes = cryptography.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return Object.freeze({
    id: cryptography.randomUUID(), token, request_id: cryptography.randomUUID(),
    brief: Object.freeze({ category: brief.category, goal: brief.goal, location: brief.location, timing: brief.timing }),
  });
}

export function createPendingMessage(body, cryptography = globalThis.crypto) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text || text.length > 2000) throw new Error('Write a message between 1 and 2,000 characters.');
  return Object.freeze({ request_id: cryptography.randomUUID(), body: text });
}

function validPending(value) {
  return value && isThreadId(value.id) && isThreadId(value.request_id) && isCapability(value.token)
    && value.brief && typeof value.brief.category === 'string' && value.brief.category.length <= 100
    && typeof value.brief.goal === 'string' && value.brief.goal.length >= 8 && value.brief.goal.length <= 1000
    && typeof value.brief.location === 'string' && value.brief.location.length <= 200
    && typeof value.brief.timing === 'string' && value.brief.timing.length <= 200;
}

export function checkpointSubmission(storage, pending, { saved = false, expires_at = null } = {}) {
  if (!validPending(pending)) return false;
  try {
    if (!storage) return false;
    storage.setItem(CHECKPOINT_KEY, JSON.stringify({ pending, saved: saved === true, expires_at }));
    return true;
  } catch { return false; }
}

export function restoreCheckpoint(storage) {
  try {
    const raw = storage?.getItem(CHECKPOINT_KEY);
    if (!raw || raw.length > 5000) return null;
    const value = JSON.parse(raw);
    if (!validPending(value.pending) || typeof value.saved !== 'boolean') return null;
    return value;
  } catch { return null; }
}

export function clearCheckpoint(storage) {
  try { storage?.removeItem(CHECKPOINT_KEY); } catch { /* In-memory recovery remains available. */ }
}

export function makeReturnLink(id, token, origin = PUBLIC_ORIGIN) {
  if (!isThreadId(id) || !isCapability(token)) throw new Error('Invalid conversation credentials.');
  const url = new URL('/conversation.html', origin);
  url.hash = new URLSearchParams({ id, key: token }).toString();
  return url.href;
}

export function parseReturnLink(location) {
  const url = new URL(typeof location === 'string' ? location : location.href);
  if (url.searchParams.has('key') || url.searchParams.has('token')) throw new Error('For privacy, conversation credentials must be in the part of your link after #.');
  const values = new URLSearchParams(url.hash.replace(/^#/, ''));
  const id = values.get('id');
  const token = values.get('key');
  if (values.getAll('id').length !== 1 || values.getAll('key').length !== 1 || !isThreadId(id) || !isCapability(token)) {
    throw new Error('Open the complete private return link you saved after sending your brief.');
  }
  return { id, token };
}

export function inboxError(error) {
  if (error?.code === 'THREAD_FULL') return 'This conversation has reached its message limit. Keep your draft and start a new project brief from the main site if you need another conversation.';
  if (error?.name === 'AbortError') return 'The request did not finish. Your draft is still here; retry to check or save it once.';
  if (error?.status === 404) return 'This conversation is unavailable. Check the full private link; it may have expired or been removed.';
  if (error?.status === 429) return 'Too many requests right now. Wait a little, then retry. Your draft is still here.';
  if (error?.status === 409) return 'The earlier request could not be matched. Keep your draft and return link, then reload the conversation before trying again.';
  if (error?.status === 400 || error?.status === 413) return 'The message was not accepted. Check its length and try again. Your draft is still here.';
  return 'Could not confirm the request. Your draft is still here. Check your connection and retry; the same request will be reused.';
}

export async function requestJSON(path, { method = 'GET', token, body, signal, fetchImpl = globalThis.fetch, timeout = 12000 } = {}) {
  if (!path.startsWith('/api/')) throw new Error('Invalid inbox endpoint.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeout);
  try {
    const headers = { 'X-Raj-Inbox': '1', Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(new URL(path, INBOX_ORIGIN), {
      method, headers, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error('Inbox request failed.');
      error.status = response.status;
      try { const detail = await response.json(); if (detail?.code === 'THREAD_FULL') error.code = detail.code; } catch { /* Do not expose server error text. */ }
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function submitBrief(pending, options = {}) {
  const receipt = await requestJSON('/api/threads', {
    ...options, method: 'POST', token: pending.token,
    body: { id: pending.id, request_id: pending.request_id, brief: pending.brief },
  });
  if (receipt?.ok !== true || receipt.received !== true || receipt.thread?.id !== pending.id || !receipt.thread.expires_at) {
    throw new Error('No valid saved receipt was returned.');
  }
  return receipt;
}

export function validateDetail(detail, id) {
  if (detail?.thread?.id !== id || !detail.thread.brief || !Array.isArray(detail.messages)
    || !Number.isSafeInteger(detail.next_cursor) || detail.next_cursor < 0 || typeof detail.has_more !== 'boolean') {
    throw new Error('Invalid conversation response.');
  }
  for (const item of detail.messages) {
    if (!Number.isSafeInteger(item.id) || item.id < 1 || !['visitor', 'owner'].includes(item.role)
      || typeof item.body !== 'string' || !Number.isFinite(Date.parse(item.created_at))) throw new Error('Invalid message response.');
  }
  return detail;
}

export async function readConversation(credentials, after = 0, options = {}) {
  if (!isThreadId(credentials.id) || !isCapability(credentials.token) || !Number.isSafeInteger(after) || after < 0) throw new Error('Invalid conversation credentials.');
  const detail = await requestJSON(`/api/threads/${credentials.id}?after=${after}`, { ...options, token: credentials.token });
  return validateDetail(detail, credentials.id);
}

export async function sendMessage(credentials, pending, options = {}) {
  const receipt = await requestJSON(`/api/threads/${credentials.id}/messages`, {
    ...options, method: 'POST', token: credentials.token, body: pending,
  });
  if (receipt?.ok !== true || receipt.received !== true || receipt.thread_id !== credentials.id
    || !Number.isSafeInteger(receipt.message?.id) || receipt.message.role !== 'visitor'
    || receipt.message.body !== pending.body) throw new Error('No valid message receipt was returned.');
  return receipt;
}

export function startVisiblePolling(refresh, { doc = document, interval = 15000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null;
  let controller = null;
  let generation = 0;
  let stopped = false;
  async function tick() {
    if (stopped || doc.hidden) return;
    const current = generation;
    const active = new AbortController();
    controller = active;
    try { await refresh(active.signal); } catch (error) { if (error?.name !== 'AbortError') console.warn('Inbox refresh unavailable.'); }
    if (stopped || doc.hidden || current !== generation) return;
    controller = null;
    timer = setTimer(tick, interval);
  }
  function change() {
    generation += 1;
    if (timer !== null) clearTimer(timer);
    timer = null;
    controller?.abort();
    controller = null;
    if (!doc.hidden) void tick();
  }
  doc.addEventListener('visibilitychange', change);
  void tick();
  return () => {
    stopped = true;
    generation += 1;
    if (timer !== null) clearTimer(timer);
    controller?.abort();
    doc.removeEventListener('visibilitychange', change);
  };
}

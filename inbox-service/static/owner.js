const $ = (id) => document.getElementById(id);
let selected = null;
let cursor = 0;
let listCursor = null;
let listSignature = '';
let sending = false;
let refreshing = false;
let timer = null;
let active = null;
let generation = 0;
let authorized = false;
const known = new Set();
const drafts = new Map();

async function api(path, { method = 'GET', body, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 12000);
  try {
    const response = await fetch(path, {
      method, credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'X-Raj-Inbox': '1', Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error('Inbox request failed.');
      error.status = response.status;
      try { const detail = await response.json(); if (detail?.code === 'THREAD_FULL') error.code = detail.code; } catch { /* Keep server error text private. */ }
      throw error;
    }
    return await response.json();
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

function errorText(error) {
  if (error.code === 'THREAD_FULL') return 'This conversation has reached its 100-message limit. The visitor must start a new conversation for additional messages.';
  if (error.status === 401) return 'Your owner session is unavailable. Copy any unsent draft before signing in again.';
  if (error.status === 403) return 'This account is not authorized to access the owner inbox.';
  if (error.status === 404) return 'This conversation is unavailable or expired.';
  if (error.status === 429) return 'Too many requests. Wait a little, then retry; your draft stays here.';
  if (error.status === 409) return 'The earlier request could not be matched. Keep your draft and refresh this conversation before retrying.';
  if (error.status === 400 || error.status === 413) return 'The reply was not accepted. Check its length and retry.';
  return 'Could not confirm the request. Your draft stays here; retry uses the same request ID.';
}

function accessError(error) {
  if (error.status === 401 || error.status === 403) {
    $('accessStatus').textContent = errorText(error);
    $('signIn').hidden = false;
    authorized = false;
    $('threadList').inert = true;
    $('ownerSend').disabled = true;
    stopPolling();
    return true;
  }
  return false;
}

function addMessage(item) {
  if (!Number.isSafeInteger(item.id) || !['visitor', 'owner'].includes(item.role) || typeof item.body !== 'string') throw new Error('Invalid message.');
  if (known.has(item.id)) return;
  known.add(item.id);
  const row = document.createElement('article');
  row.className = 'message';
  row.dataset.role = item.role;
  const who = document.createElement('strong');
  who.textContent = item.role === 'owner' ? 'You (Raj)' : 'Visitor';
  const body = document.createElement('p');
  body.textContent = item.body;
  const time = document.createElement('time');
  time.dateTime = item.created_at;
  time.textContent = new Date(item.created_at).toLocaleString();
  row.append(who, body, time);
  $('ownerMessages').append(row);
}

async function loadList({ append = false, signal } = {}) {
  const data = await api(`/api/owner/threads${append && listCursor ? `?before=${encodeURIComponent(listCursor)}` : ''}`, { signal });
  if (signal?.aborted) return;
  if (!Array.isArray(data.threads)) throw new Error('Invalid inbox list.');
  const signature = JSON.stringify(data.threads);
  let rebuilt = false;
  if (append || signature !== listSignature) {
    if (!append) { $('threadList').replaceChildren(); rebuilt = true; }
    for (const thread of data.threads) {
      if (append && [...$('threadList').children].some((item) => item.dataset.threadId === thread.id)) continue;
      const button = document.createElement('button');
      button.className = 'thread';
      button.type = 'button';
      button.dataset.threadId = thread.id;
      button.setAttribute('aria-current', String(thread.id === selected));
      const title = document.createElement('strong');
      title.textContent = thread.brief.category;
      const goal = document.createElement('small');
      goal.textContent = thread.brief.goal.slice(0, 140);
      const meta = document.createElement('small');
      meta.textContent = `${thread.needs_reply === true ? 'Needs reply' : 'Replied'} · ${thread.message_count} messages · ${new Date(thread.updated_at).toLocaleString()}`;
      button.append(title, goal, meta);
      button.addEventListener('click', () => void selectThread(thread.id));
      $('threadList').append(button);
    }
    if (!append) listSignature = signature;
  }
  if (append || rebuilt) listCursor = data.next_cursor || null;
  $('moreThreads').hidden = !listCursor;
  $('listStatus').textContent = $('threadList').childElementCount ? '' : 'No saved project briefs yet.';
}

async function loadThread(signal) {
  if (!selected) return;
  const id = selected;
  let pages = 0;
  let more;
  do {
    const data = await api(`/api/owner/threads/${encodeURIComponent(id)}?after=${cursor}`, { signal });
    if (signal?.aborted || selected !== id) return;
    if (data.thread?.id !== id || !Array.isArray(data.messages) || !Number.isSafeInteger(data.next_cursor)
      || data.next_cursor < cursor || (data.has_more && data.next_cursor <= cursor)) throw new Error('Invalid conversation.');
    if (!$('threadBrief').childElementCount) {
      $('threadTitle').textContent = data.thread.brief.category;
      for (const [key, label] of [['goal', 'Goal or problem'], ['location', 'Location / work mode'], ['timing', 'Preferred timing']]) {
        const term = document.createElement('dt'); term.textContent = label;
        const value = document.createElement('dd'); value.textContent = data.thread.brief[key];
        $('threadBrief').append(term, value);
      }
    }
    $('threadMeta').textContent = `Created ${new Date(data.thread.created_at).toLocaleString()} · Expires ${new Date(data.thread.expires_at).toLocaleDateString()}`;
    for (const item of data.messages) addMessage(item);
    cursor = data.next_cursor;
    more = data.has_more;
    pages += 1;
  } while (more && pages < 5);
  $('moreMessages').hidden = !more;
  $('ownerReplyForm').hidden = false;
  $('threadStatus').textContent = 'Replies are saved here. The visitor returns using their private link; no external notification is sent.';
}

async function selectThread(id) {
  if (sending || id === selected) return;
  if (selected) {
    const old = drafts.get(selected) || {};
    drafts.set(selected, { ...old, text: $('ownerReply').value });
  }
  generation += 1;
  active?.abort();
  selected = id;
  cursor = 0;
  known.clear();
  $('threadBrief').replaceChildren();
  $('ownerMessages').replaceChildren();
  $('ownerReplyForm').hidden = true;
  $('ownerReply').value = drafts.get(id)?.text || '';
  $('ownerReplyStatus').textContent = '';
  $('threadStatus').textContent = 'Opening conversation…';
  document.querySelectorAll('[data-thread-id]').forEach((button) => button.setAttribute('aria-current', String(button.dataset.threadId === id)));
  await refresh();
}

async function refresh() {
  if (document.hidden || refreshing || !authorized) return;
  refreshing = true;
  const current = generation;
  const controller = new AbortController();
  active = controller;
  try {
    await loadList({ signal: controller.signal });
    await loadThread(controller.signal);
  } catch (error) {
    if (!controller.signal.aborted && !accessError(error)) $('threadStatus').textContent = errorText(error);
  } finally {
    refreshing = false;
    if (current !== generation && !document.hidden) void refresh();
  }
}

function stopPolling() { clearTimeout(timer); active?.abort(); generation += 1; }
function schedule() {
  stopPolling();
  if (document.hidden || !authorized) return;
  async function tick() {
    await refresh();
    if (!document.hidden && authorized) timer = setTimeout(tick, 30000);
  }
  void tick();
}

$('refreshInbox').addEventListener('click', () => void refresh());
$('moreThreads').addEventListener('click', async () => {
  try { await loadList({ append: true }); } catch (error) { if (!accessError(error)) $('listStatus').textContent = errorText(error); }
});
$('moreMessages').addEventListener('click', () => void refresh());
$('ownerReplyForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending || !selected) return;
  const id = selected;
  const text = $('ownerReply').value.trim();
  if (!text || text.length > 2000) { $('ownerReplyStatus').textContent = 'Write a reply between 1 and 2,000 characters.'; return; }
  let pending = drafts.get(id)?.pending;
  if (!pending || pending.body !== text) pending = { request_id: crypto.randomUUID(), body: text };
  drafts.set(id, { text: $('ownerReply').value, pending });
  sending = true;
  $('ownerReply').disabled = true;
  $('ownerSend').disabled = true;
  $('threadList').inert = true;
  $('ownerReplyStatus').textContent = 'Saving your reply…';
  try {
    const receipt = await api(`/api/owner/threads/${encodeURIComponent(id)}/messages`, { method: 'POST', body: pending });
    if (receipt?.ok !== true || receipt.received !== true || receipt.thread_id !== id || receipt.message?.role !== 'owner' || receipt.message.body !== pending.body) throw new Error('No saved receipt.');
    drafts.delete(id);
    $('ownerReplyForm').reset();
    $('ownerReplyStatus').textContent = 'Reply saved. The visitor can read it using their private link.';
    await refresh();
  } catch (error) { if (!accessError(error)) $('ownerReplyStatus').textContent = errorText(error); }
  finally { sending = false; $('ownerReply').disabled = false; $('ownerSend').disabled = !authorized; $('threadList').inert = !authorized; }
});
document.addEventListener('visibilitychange', schedule);
addEventListener('pagehide', stopPolling);
addEventListener('pageshow', (event) => { if (event.persisted && authorized) schedule(); });

try {
  const session = await api('/api/owner/session');
  if (session.ok !== true || typeof session.name !== 'string') throw new Error('No authorized session.');
  $('identity').textContent = session.name;
  $('accessStatus').textContent = 'Owner access verified.';
  authorized = true;
  $('workspace').hidden = false;
  schedule();
} catch (error) {
  if (!accessError(error)) $('accessStatus').textContent = 'Could not verify owner access. Reload to try again.';
}

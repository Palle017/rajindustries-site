import { createPendingMessage, inboxError, makeReturnLink, parseReturnLink, readConversation, sendMessage, startVisiblePolling } from './inbox-client.mjs';

const byId = (id) => document.getElementById(id);
let credentials;
let cursor = 0;
let pending = null;
let sending = false;
let reading = false;
let stopPolling = () => {};
const knownMessages = new Set();

function addMessage(item) {
  if (knownMessages.has(item.id)) return;
  knownMessages.add(item.id);
  const article = document.createElement('article');
  article.className = 'message';
  article.dataset.role = item.role;
  const who = document.createElement('strong');
  who.textContent = item.role === 'owner' ? 'Raj' : 'You';
  const body = document.createElement('p');
  body.textContent = item.body;
  const time = document.createElement('time');
  time.dateTime = item.created_at;
  time.textContent = new Date(item.created_at).toLocaleString();
  article.append(who, body, time);
  byId('messages').append(article);
}

function showBrief(thread) {
  if (!byId('brief').childElementCount) {
    for (const [key, label] of [['category', 'Service'], ['goal', 'Goal or problem'], ['location', 'Location / work mode'], ['timing', 'Preferred timing']]) {
      const term = document.createElement('dt');
      term.textContent = label;
      const value = document.createElement('dd');
      value.textContent = thread.brief[key];
      byId('brief').append(term, value);
    }
  }
  byId('expiry').textContent = `Conversation expiry: ${new Date(thread.expires_at).toLocaleDateString()}. Conversations expire 90 days after creation.`;
  byId('briefSection').hidden = false;
}

async function refresh(signal) {
  if (reading) return;
  reading = true;
  try {
    // Bound each refresh to five pages. Larger histories can be loaded explicitly.
    let pages = 0;
    let more;
    do {
      const detail = await readConversation(credentials, cursor, { signal });
      if (signal?.aborted) return;
      showBrief(detail.thread);
      for (const item of detail.messages) addMessage(item);
      if (detail.next_cursor < cursor || (detail.has_more && detail.next_cursor <= cursor)) throw new Error('Invalid message cursor.');
      cursor = detail.next_cursor;
      more = detail.has_more;
      pages += 1;
    } while (more && pages < 5);
    byId('loadOlder').hidden = !more;
    byId('replyForm').hidden = false;
    byId('conversationStatus').textContent = 'Connected. This page checks for replies while it is open and visible. No appointment is confirmed by a message.';
  } catch (error) {
    if (signal?.aborted) return;
    byId('conversationStatus').textContent = inboxError(error);
    if (error.status === 404) {
      byId('replyForm').hidden = true;
      stopPolling();
    }
  } finally { reading = false; }
}

byId('copyReturn').addEventListener('click', async () => {
  if (!credentials) return;
  try {
    await navigator.clipboard.writeText(makeReturnLink(credentials.id, credentials.token));
    byId('copyStatus').textContent = 'Private return link copied. Keep it somewhere only you can access.';
  } catch { byId('copyStatus').textContent = 'Copy is unavailable. Bookmark this page or copy the complete link from your address bar.'; }
});
byId('loadOlder').addEventListener('click', () => void refresh());
byId('replyForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending) return;
  try {
    const body = byId('reply').value.trim();
    if (!pending || pending.body !== body) pending = createPendingMessage(body);
    sending = true;
    byId('reply').disabled = true;
    byId('sendReply').disabled = true;
    byId('replyStatus').textContent = 'Saving your message…';
    const receipt = await sendMessage(credentials, pending);
    // Refresh in cursor order rather than advancing past messages received concurrently.
    pending = null;
    byId('reply').value = '';
    byId('replyStatus').textContent = 'Your message is saved in this conversation. Raj can read it in the website inbox.';
    await refresh();
  } catch (error) { byId('replyStatus').textContent = inboxError(error); }
  finally {
    sending = false;
    byId('reply').disabled = false;
    byId('sendReply').disabled = false;
  }
});

try {
  credentials = parseReturnLink(location.href);
  stopPolling = startVisiblePolling((signal) => refresh(signal), { interval: 15000 });
} catch (error) {
  byId('conversationStatus').textContent = error.message;
  byId('copyReturn').hidden = true;
}
addEventListener('pagehide', () => stopPolling());
addEventListener('pageshow', (event) => {
  if (event.persisted && credentials) {
    stopPolling();
    stopPolling = startVisiblePolling((signal) => refresh(signal), { interval: 15000 });
  }
});

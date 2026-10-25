// The public page reads only an approved, same-origin summary. It never calls
// Proxmox or Home Assistant directly. No summary feed is activated by this file.
export const MAX_AGE_MS = 15 * 60 * 1000;
export const POLL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

const isPercent = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const isCount = value => Number.isInteger(value) && value >= 0 && value <= 500;

export function validateSummary(data, now = Date.now()) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      typeof data.updated_at !== 'string') return { state: 'invalid' };

  const updated = Date.parse(data.updated_at);
  if (!Number.isFinite(updated) || updated > now + MAX_CLOCK_SKEW_MS ||
      !isPercent(data.cpu_percent) || !isPercent(data.memory_percent) ||
      !isPercent(data.storage_percent) || typeof data.uptime_seconds !== 'number' ||
      !Number.isFinite(data.uptime_seconds) || data.uptime_seconds < 0 ||
      !isCount(data.guests_running) || !isCount(data.guests_total) ||
      data.guests_running > data.guests_total) return { state: 'invalid' };

  if (now - updated > MAX_AGE_MS) return { state: 'stale' };
  return { state: 'connected', updated, data };
}

export function createPublicStatus({
  document: doc,
  fetch: fetchSummary = globalThis.fetch,
  now = Date.now,
  setTimeout: setTimer = globalThis.setTimeout,
  clearTimeout: clearTimer = globalThis.clearTimeout,
} = {}) {
  const details = doc?.getElementById('labDetails');
  const ids = ['feedDot', 'feedState', 'cpu', 'cpuBar', 'memory', 'memoryBar',
    'storage', 'storageBar', 'uptime', 'guests', 'updated'];
  const elements = Object.fromEntries(ids.map(id => [id, doc?.getElementById(id)]));
  if (!details || details.hidden || ids.some(id => !elements[id])) return null;

  let destroyed = false;
  let generation = 0;
  let pollTimer = null;
  let request = null;
  const active = () => !destroyed && details.open && doc.visibilityState === 'visible';

  function showState(message, kind = '') {
    elements.feedState.textContent = message;
    elements.feedDot.className = 'dot' + (kind ? ' ' + kind : '');
  }

  function clearMetrics() {
    for (const id of ['cpu', 'memory', 'storage']) {
      elements[id].textContent = '—';
      elements[id + 'Bar'].style.width = '0%';
    }
    elements.uptime.textContent = '—';
    elements.guests.textContent = 'Running guests: —';
    elements.updated.textContent = 'Updated: —';
  }

  function unavailable(state) {
    clearMetrics();
    if (state === 'stale') showState('Public telemetry is out of date', 'stale');
    else if (state === 'invalid') showState('Public telemetry data unavailable', 'stale');
    else showState('Public telemetry not connected');
  }

  function stop() {
    generation += 1;
    if (pollTimer !== null) clearTimer(pollTimer);
    pollTimer = null;
    if (request) {
      clearTimer(request.timeout);
      request.controller.abort();
      request = null;
    }
  }

  async function refresh() {
    if (!active()) return;
    stop();
    const ticket = generation;
    const controller = new AbortController();
    const timeout = setTimer(() => controller.abort(), REQUEST_TIMEOUT_MS);
    request = { controller, timeout };
    const current = () => ticket === generation && active();
    try {
      const response = await fetchSummary('proxmox-public.json', {
        cache: 'no-store', mode: 'same-origin', credentials: 'omit',
        redirect: 'error', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Summary unavailable');
      const result = validateSummary(await response.json(), now());
      if (!current()) return;
      if (result.state !== 'connected') {
        unavailable(result.state);
        return;
      }
      for (const [field, id] of [['cpu_percent', 'cpu'], ['memory_percent', 'memory'], ['storage_percent', 'storage']]) {
        const value = Math.round(result.data[field]);
        elements[id].textContent = value + '%';
        elements[id + 'Bar'].style.width = value + '%';
      }
      elements.uptime.textContent = (result.data.uptime_seconds / 86400).toFixed(1) + ' d';
      elements.guests.textContent = 'Running guests: ' + result.data.guests_running + ' / ' + result.data.guests_total;
      elements.updated.textContent = 'Updated: ' + new Date(result.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      showState('Read-only public telemetry', 'connected');
    } catch {
      if (current()) unavailable('offline');
    } finally {
      clearTimer(timeout);
      if (ticket === generation) {
        request = null;
        if (active()) pollTimer = setTimer(refresh, POLL_MS);
      }
    }
  }

  function sync() {
    if (active()) void refresh();
    else stop();
  }

  unavailable('offline');
  details.addEventListener('toggle', sync);
  doc.addEventListener('visibilitychange', sync);
  sync();
  return {
    refresh,
    destroy() {
      destroyed = true;
      stop();
      details.removeEventListener('toggle', sync);
      doc.removeEventListener('visibilitychange', sync);
    },
  };
}

if (typeof document !== 'undefined') createPublicStatus({ document });

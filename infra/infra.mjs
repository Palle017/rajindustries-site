// Raj Industries Ops Deck. Static: everything comes from data.json. All text goes in via
// textContent / DOM nodes, never raw HTML, so data.json edits cannot inject markup.
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
}
const slug = s => String(s || '').toLowerCase().replace(/[^a-z]+/g, '');
const tone = s => ({ active: 'active', paused: 'paused', stalled: 'stalled', idle: 'idle', unused: 'unused', down: 'down', up: 'up', open: 'open', merged: 'merged', resolved: 'resolved', closed: 'neutral', security: 'security', stopped: 'stopped', waitingonraj: 'waiting', unknown: 'unknown' }[slug(s)] || 'neutral');
const badge = s => h('span', { class: 'badge ' + tone(s) }, s);
const fmtDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const data = await (await fetch('data.json', { cache: 'no-cache' })).json();

// ---------- header/footer
$('#hq').textContent = [data.meta.address, data.meta.location].filter(Boolean).join(' · ');
$('#updated').textContent = 'Audit ' + data.meta.updated_label;
$('#source').textContent = data.meta.source;
$('#note').textContent = data.meta.note;

// ---------- tabs (hash routed: #mission, #infra, #house, #bots, #issues, #home)
const tabs = [...document.querySelectorAll('[role=tab]')];
let houseStarted = false;
function show(id) {
  if (!document.getElementById(id)) id = 'mission';
  for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === id));
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  if (id === 'house' && !houseStarted) { houseStarted = true; import('./house.mjs').then(m => m.mountHouse(data.house, $('#house3d'), $('#floorButtons'), $('#houseInfo'), $('#houseSub'))).catch(err => { $('#houseLoading').textContent = '3D view failed to load: ' + err.message; }); }
}
tabs.forEach(t => t.addEventListener('click', () => { history.replaceState(null, '', '#' + t.dataset.tab); show(t.dataset.tab); }));
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

// ---------- 01 Mission control
const kpiEl = k => h('div', { class: 'kpi ' + (k.tone || '') }, h('div', { class: 'l' }, k.label), h('div', { class: 'v' }, k.value, k.of ? h('small', {}, ' / ' + k.of) : null), h('div', { class: 'd' }, k.detail || ''));
$('#kpis').append(...data.kpis.map(kpiEl));
const down = data.status_board.filter(s => s.state === 'down').length;
$('#statusCount').textContent = `${down} down · ${data.status_board.length - down} up`;
$('#statusBoard').append(...data.status_board.map(s => h('li', {}, h('span', { class: 'dot ' + s.state }), h('div', { class: 'n' }, h('b', {}, s.name), h('span', {}, (s.since ? 'since ' + s.since + ' · ' : '') + s.detail)), badge(s.state))));
const types = [...new Set(data.issues.map(i => i.type))];
const counts = Object.fromEntries(types.map(t => [t, data.issues.filter(i => i.type === t).length]));
const max = Math.max(...Object.values(counts));
$('#issueTotal').textContent = `${data.issues.length} total · ${data.issues.filter(i => i.status === 'Open').length} open`;
$('#typeChart').append(...types.sort((a, b) => counts[b] - counts[a]).map(t => h('div', { class: 'row' }, h('span', {}, t), h('div', { class: 'track' }, h('div', { class: 'fill' + (t === 'Security' ? ' sec' : ''), style: `width:${(counts[t] / max) * 100}%` })), h('b', {}, counts[t]))));
$('#topFixes').append(...data.top_fixes.map(f => h('li', {}, h('span', { class: 'r' }, f.rank), h('div', {}, h('div', { class: 'o' }, f.owner), f.text), h('span', { class: 'badge ' + (/needs raj/i.test(f.status) ? 'warn' : 'ok') }, f.status))));
$('#waiting').append(...data.waiting_on_raj.map(w => h('li', { class: w.done ? 'done' : '' }, w.text, h('small', {}, w.bot))));

// ---------- 02 Infrastructure map (SVG)
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
const svg = $('#map'); const nodes = Object.fromEntries(data.infra.nodes.map(n => [n.id, n]));
const defs = s('defs'); const f = s('filter', { id: 'glow', x: '-30%', y: '-30%', width: '160%', height: '160%' });
f.append(s('feGaussianBlur', { stdDeviation: '4', result: 'b' })); const m = s('feMerge'); m.append(s('feMergeNode', { in: 'b' }), s('feMergeNode', { in: 'SourceGraphic' })); f.append(m); defs.append(f); svg.append(defs);
const W = 170, H = 46;
for (const [a, b, label, at = 0.5] of data.infra.edges) {
  const A = nodes[a], B = nodes[b]; if (!A || !B) continue;
  svg.append(s('path', { class: 'edge' + (/\?|unverified|duplicate|timing out/i.test(label) ? ' dash' : ''), d: `M${A.x},${A.y} L${B.x},${B.y}` }));
  svg.append(s('text', { class: 'elabel', x: A.x + (B.x - A.x) * at, y: A.y + (B.y - A.y) * at - 5, "text-anchor": "middle" }, label));
}
const nodeEls = {};
for (const n of data.infra.nodes) {
  const g = s('g', { class: 'node ' + n.state, tabindex: '0', role: 'button', 'aria-label': `${n.label}, ${n.state}` });
  if (n.state === 'down') g.append(s('rect', { class: 'ring', x: n.x - W / 2, y: n.y - H / 2, width: W, height: H, rx: 4 }));
  g.append(s('rect', { x: n.x - W / 2, y: n.y - H / 2, width: W, height: H, rx: 4 }));
  g.append(s('circle', { cx: n.x - W / 2 + 12, cy: n.y - 6, r: 4, fill: n.state === 'up' ? '#39f29b' : n.state === 'down' ? '#ff4d5e' : '#ffb648' }));
  g.append(s('text', { x: n.x - W / 2 + 22, y: n.y - 2 }, n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label));
  g.append(s('text', { class: 'k', x: n.x - W / 2 + 22, y: n.y + 14 }, n.kind));
  const pick = () => selectNode(n.id); g.addEventListener('click', pick); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  svg.append(g); nodeEls[n.id] = g;
}
function selectNode(id) {
  const n = nodes[id]; Object.values(nodeEls).forEach(e => e.classList.remove('sel')); nodeEls[id].classList.add('sel');
  const links = data.infra.edges.filter(e => e[0] === id || e[1] === id).map(e => `${e[2]} → ${nodes[e[0] === id ? e[1] : e[0]].label}`);
  $('#nodeDetail').replaceChildren(h('h2', {}, 'Node detail'), h('div', { class: 'detail-title' }, n.label), h('div', { class: 'detail-kind' }, n.kind + (n.hw ? ' · ' + n.hw : '')),
    h('dl', { class: 'kv' }, h('dt', {}, 'State'), h('dd', {}, badge(n.state)), h('dt', {}, 'Address'), h('dd', {}, n.address), h('dt', {}, 'Owner bot'), h('dd', {}, n.owner), h('dt', {}, 'Notes'), h('dd', {}, n.detail), h('dt', {}, 'Links'), h('dd', {}, links.length ? h('ul', { style: 'margin:0;padding-left:16px' }, links.map(l => h('li', {}, l))) : '—')));
}
selectNode('pve');

// ---------- sortable helper
function sortable(table, rows, render) {
  let key = null, dir = 1;
  table.querySelectorAll('th[data-k]').forEach(th => th.addEventListener('click', () => {
    dir = key === th.dataset.k ? -dir : 1; key = th.dataset.k;
    table.querySelectorAll('th').forEach(x => x.classList.remove('asc', 'desc')); th.classList.add(dir > 0 ? 'asc' : 'desc'); render();
  }));
  return list => key ? [...list].sort((a, b) => String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true }) * dir) : list;
}

// ---------- 04 Bot fleet
const botStates = ['All', ...new Set(data.bots.map(b => b.state))]; let botState = 'All';
const botSort = sortable($('#botTable'), data.bots, renderBots);
$('#botStates').append(...botStates.map(st => h('button', { type: 'button', 'aria-pressed': String(st === 'All'), onclick: e => { botState = st; $('#botStates').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); renderBots(); } }, st, h('i', {}, st === 'All' ? data.bots.length : data.bots.filter(b => b.state === st).length))));
$('#botSearch').addEventListener('input', renderBots);
function renderBots() {
  const q = $('#botSearch').value.toLowerCase();
  const list = botSort(data.bots.filter(b => (botState === 'All' || b.state === botState) && (!q || Object.values(b).join(' ').toLowerCase().includes(q))));
  $('#botCount').textContent = `${list.length} of ${data.bots.length}`;
  $('#botTable tbody').replaceChildren(...list.map(b => h('tr', {}, h('td', {}, h('b', {}, b.name)), h('td', {}, b.area), h('td', {}, b.owner), h('td', { class: 'mono' }, fmtDate(b.last)), h('td', {}, badge(b.state)), h('td', {}, b.note))));
}
renderBots();

// ---------- 05 Projects & issues
$('#projCount').textContent = `${data.projects.length} tracked`;
$('#projTable tbody').append(...data.projects.map(p => h('tr', {}, h('td', {}, h('b', {}, p.name)), h('td', { class: 'mono' }, p.repo), h('td', {}, p.owner), h('td', {}, badge(p.state)), h('td', {}, p.blocker), h('td', {}, p.next))));
let issueType = 'All';
const owners = [...new Set(data.issues.map(i => i.owner))].sort();
$('#ownerSel').append(...owners.map(o => h('option', {}, o)));
$('#typeChips').append(...['All', ...types].map(t => h('button', { type: 'button', 'aria-pressed': String(t === 'All'), onclick: e => { issueType = t; $('#typeChips').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); renderIssues(); } }, t, h('i', {}, t === 'All' ? data.issues.length : counts[t]))));
const issueSort = sortable($('#issueTable'), data.issues, renderIssues);
$('#ownerSel').addEventListener('change', renderIssues); $('#statusSel').addEventListener('change', renderIssues);
function renderIssues() {
  const o = $('#ownerSel').value, st = $('#statusSel').value;
  const list = issueSort(data.issues.filter(i => (issueType === 'All' || i.type === issueType) && (!o || i.owner === o) && (!st || i.status === st)));
  $('#issueShown').textContent = `${list.length} shown`;
  $('#issueTable tbody').replaceChildren(...list.map(i => h('tr', {}, h('td', {}, i.issue), h('td', {}, i.type === 'Security' ? badge('Security') : h('span', { class: 'badge ' + (i.type === 'Stall' || i.type === 'Not moving' ? 'warn' : 'neutral') }, i.type)), h('td', {}, i.owner), h('td', {}, i.impact), h('td', { class: 'mono' }, fmtDate(i.last)), h('td', {}, badge(i.status)))));
}
renderIssues();
$('#prChecked').textContent = 'checked ' + new Date(data.prs_checked).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
$('#prTable tbody').append(...data.prs.map(p => h('tr', {}, h('td', { class: 'mono' }, p.repo), h('td', { class: 'mono' }, h('a', { href: `https://github.com/${p.repo}/pull/${p.num}`, rel: 'noopener' }, '#' + p.num)), h('td', {}, p.title), h('td', {}, p.owner), h('td', {}, badge(p.state[0] + p.state.slice(1).toLowerCase())))));

// ---------- 06 Home Assistant
const ha = data.home;
$('#haStats').append(...ha.stats.map(st => kpiEl({ value: st.value, label: st.label, tone: /dead|copies/.test(st.label) ? 'bad' : '' })));
$('#haSource').textContent = 'Source: ' + ha.source;
$('#haFindings').append(...ha.findings.map(x => h('div', { class: 'finding ' + (x.tone === 'warn' ? 'warn' : '') }, h('b', {}, x.title), h('p', {}, x.text))));
$('#haFixes').append(...ha.fixes.map(x => h('li', {}, x)));
$('#haLayout').append(...ha.layout.map(x => h('span', {}, x)));
$('#haPrs').append(ha.pr_status, ' ', h('a', { href: `https://github.com/${ha.pr_repo}/pulls`, rel: 'noopener' }, 'Open PRs ↗'));

show(location.hash.slice(1) || 'mission');
document.documentElement.dataset.ready = '1';

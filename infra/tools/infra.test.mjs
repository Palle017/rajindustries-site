// node --test infra/tools/infra.test.mjs   (run from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const raw = readFileSync(new URL('data.json', root), 'utf8');
const data = JSON.parse(raw);

test('data.json has every screen section', () => {
  for (const k of ['meta', 'kpis', 'status_board', 'top_fixes', 'waiting_on_raj', 'infra', 'bots', 'projects', 'issues', 'prs', 'home', 'house']) assert.ok(k in data, k);
  assert.equal(data.bots.length, 21);
  assert.ok(Array.isArray(data.house.floors) && data.house.floors.length >= 1);
  const ids = new Set(data.infra.nodes.map(n => n.id));
  for (const [a, b] of data.infra.edges) assert.ok(ids.has(a) && ids.has(b), `${a}->${b}`);
});

test('public-safety: no secrets, credentials, session ids or customer contact details', () => {
  const banned = [
    /gh[pousr]_[A-Za-z0-9]{20,}/, /sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN/, /ssh-(rsa|ed25519) /,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/,          // any email address
    /\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/,                  // US phone numbers
    /root@pam!/, /PVEAPIToken/i, /\bbc-[0-9a-f]{8}-/,          // Proxmox token ids, agent session ids
    /password\s*[:=]/i, /secret\s*[:=]/i, /api[_-]?key\s*[:=]/i,
    /13037 Second St/i, /gutter-guy\./i,                       // third-party address / live-location URL
  ];
  for (const re of banned) assert.doesNotMatch(raw, re, String(re));
});

test('every referenced local file exists', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) if (!ref.startsWith('../')) assert.ok(existsSync(new URL(ref, root)), ref);
  for (const f of data.house.floors) if (f.model) assert.ok(existsSync(new URL(f.model, root)), f.model);
  for (const f of ['vendor/three.module.min.js', 'vendor/jsm/controls/OrbitControls.js', 'vendor/jsm/loaders/GLTFLoader.js']) assert.ok(existsSync(new URL(f, root)), f);
});

test('scripts never use innerHTML (data is rendered as text)', () => {
  for (const f of ['infra.mjs', 'house.mjs']) assert.doesNotMatch(readFileSync(new URL(f, root), 'utf8'), /innerHTML|insertAdjacentHTML|document\.write/, f);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("indexing, site sections, and public content boundaries", () => {
  assert.match(html, /content="index,follow"/);
  assert.equal((html.match(/class="service"/g) || []).length, 6);
  for (const label of ["Web Design &amp; Development", "Home Automation &amp; Security", "Network &amp; IT Support", "Private AI &amp; Datacenters", "Automotive", "Firearms"]) {
    assert.ok(html.includes(label), label + " missing");
  }
  assert.ok(html.includes('id="projects"'));
  assert.ok(html.includes('id="infrastructure"'));
  assert.ok(!html.includes("13037 Second St"));
  assert.ok(!html.includes("DESIGN PREVIEW ONLY"));
});

test("preserves gated chat and protected archive launchers", () => {
  for (const id of ["chatLauncher","chatPanel","chatBackdrop","chatGate","gateForm","chatLog","chatForm","manasaGlobeLauncher","appOverlay","appFrame","appClose"]) {
    assert.ok(html.includes('id="' + id + '"'), id + " missing");
  }
  assert.ok(html.includes("maanster-chat.prudhvi-tools.workers.dev/api/gate"));
  assert.ok(html.includes("both-hands.prudhvi-tools.workers.dev"));
});

test("public Proxmox panel has no direct private API access or synthetic figures", () => {
  assert.ok(html.includes("fetch('proxmox-public.json'"));
  assert.ok(html.includes("Public telemetry not connected"));
  assert.ok(!html.includes("api2/json"));
  assert.ok(!html.includes("8123/api/"));
  assert.ok(!html.includes('127.0.0.1:8006'));
});

test("inline scripts compile", () => {
  const re = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g;
  let n = 0;
  for (const m of html.matchAll(re)) {
    if (!m[1].trim()) continue;
    assert.doesNotThrow(() => new Script(m[1]));
    n++;
  }
  assert.equal(n, 2);
});

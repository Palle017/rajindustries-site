import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("approved release stays indexable, with work before capabilities and optional lab", () => {
  assert.match(html, /content="index,follow"/);
  assert.ok(html.indexOf('id="projects"') < html.indexOf('id="services"'));
  assert.ok(html.indexOf('id="services"') < html.indexOf('id="infrastructure"'));
  assert.match(html, /<details[^>]+id="labDetails"[^>]*\bhidden\b/);
  assert.doesNotMatch(html, /<details[^>]+id="labDetails"[^>]*\bopen\b/);
  assert.ok(!html.includes("13037 Second St"));
  assert.ok(!html.includes("Scope by inquiry"));
});

test("project conversation is accessible without email or a private-chat passphrase", () => {
  assert.match(html, /<dialog[^>]+id="projectAssistant"[^>]+aria-labelledby="assistantTitle"/);
  assert.equal((html.match(/data-project-assistant/g) || []).length, 3);
  assert.match(html, /Drafts stay here until you send/);
  assert.match(html, /id="assistantSubmit"/);
  assert.doesNotMatch(html, /mailto:|type="email"/);
});

test("all local script, stylesheet and image resources exist", () => {
  const references = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map(match => match[1]).filter(value => !/^(?:https?:|data:)/.test(value));
  for (const reference of references) {
    assert.doesNotThrow(() => readFileSync(new URL(reference, import.meta.url)), reference);
  }
});

test("preserves gated chat and protected archive launchers", () => {
  for (const id of ["chatLauncher","chatPanel","chatBackdrop","chatGate","gateForm","chatLog","chatForm","manasaGlobeLauncher","appOverlay","appFrame","appClose"]) {
    assert.ok(html.includes('id="' + id + '"'), id + " missing");
  }
  assert.ok(html.includes("maanster-chat.prudhvi-tools.workers.dev/api/gate"));
  assert.ok(html.includes("both-hands.prudhvi-tools.workers.dev"));
});

test("public Proxmox panel has no direct private API access or synthetic figures", () => {
  const status = readFileSync(new URL("./public-status.mjs", import.meta.url), "utf8");
  assert.ok(status.includes("fetchSummary('proxmox-public.json'"));
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
  assert.equal(n, 1);
});

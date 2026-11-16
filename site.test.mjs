import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
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
    const url = new URL(reference, import.meta.url);
    if (reference.endsWith("/")) {
      assert.ok(statSync(url).isDirectory(), reference);
    } else {
      assert.doesNotThrow(() => readFileSync(url), reference);
    }
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

test("OpenClaw is a flagship section with a local diagram and a Built by Raj timeline", () => {
  assert.match(html, /id="openclaw"/);
  assert.match(html, /id="openclaw-title"/);
  assert.ok(html.indexOf('id="openclaw"') < html.indexOf('id="projects"'));
  assert.ok(html.indexOf('id="projects"') < html.indexOf('id="services"'));
  assert.match(html, /Provider-agnostic AI infrastructure/);
  assert.match(html, /<h3>Built by Raj<\/h3>/);
  assert.match(html, /<time datetime="2026-01">Jan 2026<\/time> First OpenClaw gateway./);
  assert.doesNotMatch(html, /2026-10-18|Oct 18, 2026/);
  assert.match(html, /src="assets\/openclaw-infra.svg"/);
  assert.match(html, /id="infrastructure"[\s\S]*OpenClaw/);
  assert.match(html, /href="#openclaw"/);
});

test("OpenClaw copy has no private network details, vendor names, or numeric claims", () => {
  const section = html.match(/<section id="openclaw"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.doesNotMatch(section, /\b\d{1,3}(?:\.\d{1,3}){3}\b/);
  assert.doesNotMatch(section, /ts\.net|:18789|:8006|:8123/i);
  assert.doesNotMatch(section, /OpenAI|Anthropic|Claude|GPT-|Llama|Ollama|Gemini|Mistral|xAI|Grok|Codex/i);
  assert.doesNotMatch(section, /GPU|benchmark|token/i);
  assert.doesNotMatch(section, /openclaw-gw|serv2/i);
});

test("Home Assistant is a featured Work project with a local visual and source link", () => {
  const projects = html.match(/<section id="projects"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.match(projects, /project-featured/);
  assert.match(projects, /<h3>Home Assistant<\/h3>/);
  assert.match(projects, /Local cameras, sensors, and automations/);
  assert.match(projects, /src="assets\/projects\/home-assistant-dashboard.svg"/);
  assert.match(projects, /href="https:\/\/github.com\/Palle017\/Homeassistant"/);
  assert.doesNotMatch(projects, /personal-work|personal-project/);
  assert.ok(!html.includes("13037 Second St"));
  assert.doesNotMatch(html, /North Fort Myers/i);
});

test("Lab shows a visible stack and OpenClaw uses a two-part board layout", () => {
  const lab = html.match(/<section id="infrastructure"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.match(lab, /class="lab-stack"/);
  assert.match(lab, /<li>OpenClaw<\/li>/);
  assert.match(lab, /<li>Proxmox<\/li>/);
  assert.match(lab, /<li>Home Assistant<\/li>/);
  assert.match(lab, /<li>Linux<\/li>/);
  assert.match(html, /class="openclaw-board"/);
  assert.match(html, /id="labDetails"/);
  assert.equal((html.match(/data-project-assistant/g) || []).length, 3);
});

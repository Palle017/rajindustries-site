import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceConversation, buildProjectBrief, createConversation, getConversationView, INPUT_LIMIT, READY_MESSAGE } from './project-assistant.mjs';

function answer(state, input) {
  const result = advanceConversation(state, input);
  assert.equal(result.accepted, true, result.error);
  return result.state;
}

function completeBrief(goal = 'Build a useful repair request website.') {
  let state = createConversation();
  for (const input of ['Website or workflow automation', goal, 'Remote', 'Flexible']) state = answer(state, input);
  return state;
}

test('agentic and specialty inquiries can complete a brief without being rejected or misclassified', () => {
  for (const [input, expected] of [
    ['agentic AI', 'AI agents and automation'],
    ['AI agent for a workflow', 'AI agents and automation'],
    ['document search', 'AI agents and automation'],
    ['GPU server', 'Private AI or self-hosted systems'],
    ['firearms', 'Firearms technical inquiry'],
  ]) {
    let state = answer(createConversation(), input);
    assert.equal(state.answers.category, expected);
    for (const value of ['Discuss a custom technical project.', 'Remote', 'Flexible']) state = answer(state, value);
    assert.equal(state.step, 'review');
    assert.ok(buildProjectBrief(state).includes('Service: ' + expected));
    assert.ok(buildProjectBrief(state).includes('has not been sent'));
  }
});

test('four answers produce a useful unsent brief without collecting contact details', () => {
  const state = completeBrief();
  assert.equal(state.step, 'review');
  assert.deepEqual(Object.keys(state.answers), ['category', 'goal', 'location', 'timing']);
  assert.equal(getConversationView(state).ready, true);
  const brief = buildProjectBrief(state);
  assert.match(brief, /Service: Website or workflow automation/);
  assert.match(brief, /Build a useful repair request website\./);
  assert.match(brief, /Location \/ work mode: Remote/);
  assert.match(brief, /Preferred timing: Flexible/);
  assert.match(brief, /has not been sent/);
  assert.match(brief, /No quote, availability, or appointment has been confirmed/);
  assert.ok(state.messages.some((item) => item.text === READY_MESSAGE));
  assert.doesNotMatch(brief, /email|contact:/i);
});

test('invalid and too-short goals preserve the original state and answer', () => {
  const state = answer(createConversation(), 'Network');
  const snapshot = structuredClone(state);
  for (const input of ['', '   ', 'Help', '!!!!!!!!!!!!', 'x'.repeat(INPUT_LIMIT + 1), null]) {
    const result = advanceConversation(state, input);
    assert.equal(result.accepted, false);
    assert.equal(result.state, state);
    assert.ok(result.error);
  }
  assert.deepEqual(state, snapshot);
  assert.equal(state.step, 'goal');
});

test('input limits apply to goals, location and timing without silent truncation', () => {
  let state = answer(createConversation(), 'Not sure yet');
  state = answer(state, 'x'.repeat(INPUT_LIMIT));
  assert.equal(state.answers.goal.length, INPUT_LIMIT);
  assert.equal(getConversationView(state).maxLength, 200);
  assert.equal(advanceConversation(state, 'x'.repeat(201)).accepted, false);
  state = answer(state, 'x'.repeat(200));
  assert.equal(advanceConversation(state, 'x'.repeat(201)).accepted, false);
  state = answer(state, 'x'.repeat(200));
  assert.equal(state.answers.location.length, 200);
  assert.equal(state.answers.timing.length, 200);
});

test('FAQ detours answer pricing, appointments, privacy and services without advancing the brief', () => {
  let state = answer(createConversation(), 'Home automation');
  for (const [question, expected] of [
    ['What services are offered?', /websites and workflow automation/],
    ['What does it cost?', /cannot issue a quote or take a payment/],
    ['Can I book an appointment?', /cannot book appointments/],
    ['Is this private?', /until Send project brief/],
    ['Does it use AI tokens?', /no AI model/],
  ]) {
    const result = advanceConversation(state, question);
    assert.equal(result.accepted, true);
    assert.equal(result.faq, true);
    assert.equal(result.state.step, 'goal');
    assert.deepEqual(result.state.answers, state.answers);
    assert.match(result.state.messages.at(-1).text, expected);
    state = result.state;
  }
});

test('a realistic project goal mentioning cost or booking is retained as the goal', () => {
  for (const goal of ['I need a booking website for my shop.', 'Reduce the cost of running my home server.']) {
    const state = answer(answer(createConversation(), 'Website'), goal);
    assert.equal(state.step, 'location');
    assert.equal(state.answers.goal, goal);
  }
});

test('project requests phrased as questions are retained instead of swallowed by FAQ keywords', () => {
  for (const goal of [
    'Can you build a booking website for my shop?',
    'How can I use AI to automate invoices?',
    'Can you help with data backups?',
    'Can you add email notifications to my website?',
    'Can you integrate private AI into my customer portal?',
    'Can you build a privacy policy page for my website?',
  ]) {
    const result = advanceConversation(answer(createConversation(), 'Website'), goal);
    assert.equal(result.accepted, true, goal);
    assert.equal(result.faq, false, goal);
    assert.equal(result.state.step, 'location', goal);
    assert.equal(result.state.answers.goal, goal);
  }
});

test('natural privacy, appointment and price FAQs still work at every step', () => {
  let state = createConversation();
  const questions = [
    ['What can you help with?', /websites and workflow automation/],
    ['Can I book an appointment?', /cannot book appointments/],
    ['Can you help me book an appointment?', /cannot book appointments/],
    ['How do I schedule a visit?', /cannot book appointments/],
    ['What is your availability?', /cannot book appointments/],
    ['How much does a website cost?', /cannot issue a quote/],
    ['Do you store my data?', /until Send project brief/],
    ['Where are my answers stored?', /until Send project brief/],
    ['Is this sent to Raj?', /until Send project brief/],
    ['Does this use AI tokens?', /no AI model/],
    ['Is this AI?', /no AI model/],
    ['Do I need to give an email?', /No email is required/],
  ];
  for (const input of ['Not sure yet', 'Help organize a small office network.', 'Location undecided', 'Flexible', null]) {
    for (const [question, expected] of questions) {
      const result = advanceConversation(state, question);
      assert.equal(result.accepted, true, `${state.step}: ${question}`);
      assert.equal(result.faq, true, `${state.step}: ${question}`);
      assert.equal(result.state.step, state.step);
      assert.deepEqual(result.state.answers, state.answers);
      assert.match(result.state.messages.at(-1).text, expected);
    }
    if (input !== null) state = answer(state, input);
  }
});

test('all suggested FAQ buttons produce answers at every step, including review', () => {
  let state = createConversation();
  for (const input of ['Not sure yet', 'Help organize a small office network.', 'Location undecided', 'Flexible', null]) {
    for (const question of getConversationView(state).faqs) {
      const result = advanceConversation(state, question);
      assert.equal(result.accepted, true, `${state.step}: ${question}`);
      assert.equal(result.faq, true);
    }
    if (input !== null) state = answer(state, input);
  }
});

test('unknown category offers a useful recovery instead of guessing', () => {
  const state = createConversation();
  const result = advanceConversation(state, 'Banana');
  assert.equal(result.accepted, false);
  assert.equal(result.state.step, 'category');
  assert.match(result.error, /Not sure yet/);
  assert.equal(buildProjectBrief(state), '');
});

test('restart creates a clean session without sharing answers or message arrays', () => {
  const original = completeBrief('Repair Wi-Fi throughout a small office.');
  const restart = createConversation();
  assert.equal(restart.step, 'category');
  assert.deepEqual(restart.answers, {});
  assert.equal(buildProjectBrief(restart), '');
  assert.doesNotMatch(JSON.stringify(restart), /small office/);
  assert.notEqual(restart.messages, original.messages);
  assert.equal(original.step, 'review');
});

test('markup is retained literally in the brief and renderer uses text nodes', async () => {
  const injection = '<img src=x onerror="globalThis.pwned=true">';
  const state = completeBrief(injection);
  assert.equal(state.answers.goal, injection);
  assert.ok(buildProjectBrief(state).includes(injection));
  const source = await readFile(new URL('./project-assistant.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(/);
  assert.match(source, /body\.textContent = item\.text/);
  assert.match(source, /row\.textContent = item\.text/);
});

test('assistant delegates transport and has no direct network, persistent cross-session storage, email or model calls', async () => {
  const source = await readFile(new URL('./project-assistant.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|indexedDB|mailto:|https?:\/\//);
  assert.match(source, /sessionStorage/);
  assert.doesNotMatch(source, /apiKey|openai|anthropic|generativelanguage/i);
});

test('review does not accept a fifth answer as a submission or silently change the brief', () => {
  const state = completeBrief();
  const brief = buildProjectBrief(state);
  const result = advanceConversation(state, 'Can you send this now?');
  assert.equal(result.accepted, true);
  assert.equal(result.faq, true);
  assert.match(result.state.messages.at(-1).text, /until Send project brief/);
  assert.equal(buildProjectBrief(result.state), brief);
  const edit = advanceConversation(state, 'Actually make it urgent');
  assert.equal(edit.accepted, false);
  assert.equal(buildProjectBrief(edit.state), brief);
});

test('repeated FAQ use has bounded in-memory transcript without losing the brief', () => {
  let state = completeBrief();
  const brief = buildProjectBrief(state);
  for (let index = 0; index < 100; index += 1) state = answer(state, 'Is this private?');
  assert.ok(state.messages.length <= 32);
  assert.equal(buildProjectBrief(state), brief);
  assert.ok(state.messages.some((item) => item.role === 'brief' && item.text === brief));
  assert.equal(state.step, 'review');
});

test('local backups reflect a confirmed saved receipt without falsely saying unsent', () => {
  const state = completeBrief();
  assert.match(buildProjectBrief(state), /has not been sent/);
  const saved = buildProjectBrief(state, { saved: true });
  assert.match(saved, /Saved to the Raj Industries website inbox/);
  assert.doesNotMatch(saved, /has not been sent/);
  const pending = buildProjectBrief(state, { pending: true });
  assert.match(pending, /Receipt is not confirmed/);
  assert.doesNotMatch(pending, /has not been sent/);
});


test('service entry skips category without replacing an existing or completed draft', async () => {
  const { preselectService } = await import('./project-assistant.mjs');
  const fresh = createConversation();
  const selected = preselectService(fresh, 'AI agents and automation');
  assert.equal(selected.step, 'goal');
  assert.equal(selected.answers.category, 'AI agents and automation');
  assert.equal(fresh.step, 'category');
  assert.equal(preselectService(fresh, null), fresh);
  assert.equal(preselectService(fresh, 'Unknown category'), fresh);
  assert.equal(preselectService(selected, 'Networks or IT support'), selected);
  const finished = completeBrief();
  assert.equal(preselectService(finished, 'AI agents and automation'), finished);
});

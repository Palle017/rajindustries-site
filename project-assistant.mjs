import { checkpointSubmission, clearCheckpoint, createPendingSubmission, inboxError, makeReturnLink, restoreCheckpoint, submitBrief } from './inbox-client.mjs';

export const INPUT_LIMIT = 1000;
const SHORT_LIMIT = 200;
const HISTORY_LIMIT = 32;
export const READY_MESSAGE = 'Your brief is ready. It has not been sent. Choose Send project brief when you are ready.';

const CATEGORIES = [
  'AI agents and automation',
  'Website or workflow automation',
  'Home automation',
  'Networks or IT support',
  'Private AI or self-hosted systems',
  'Automotive',
  'Firearms technical inquiry',
  'Not sure yet',
];
const STEPS = ['category', 'goal', 'location', 'timing', 'review'];
const PROMPTS = {
  category: 'What kind of project do you have?',
  goal: 'What would you like to solve or build? A sentence or two is enough.',
  location: 'Would this be remote, on site, or undecided? For an on-site project, include only your city or general area.',
  timing: 'When would you like to start? A rough timeframe is enough. This does not book a visit.',
  review: 'You can ask about services, pricing, appointments, or privacy, or start over to change your brief.',
};
const FAQ_CHOICES = ['What services are offered?', 'What does it cost?', 'Is this private?'];

function message(role, text) {
  return { role, text };
}

function withMessages(state, additions) {
  const history = [...state.messages, ...additions];
  const brief = history.find((item) => item.role === 'brief');
  let messages = history.slice(-HISTORY_LIMIT);
  if (brief && !messages.includes(brief)) messages = [brief, ...history.slice(-(HISTORY_LIMIT - 1))];
  return { ...state, messages };
}

export function createConversation() {
  return {
    step: 'category',
    answers: {},
    messages: [
      message('guide', 'Choose a service and we’ll shape a short project brief. Your draft stays on this page until you choose Send project brief. Leave out passwords and private details.'),
      message('guide', PROMPTS.category),
    ],
  };
}

// Service links skip only the unanswered category step; existing drafts stay intact.
export function preselectService(state, category) {
  if (state.step !== 'category' || !CATEGORIES.includes(category)) return state;
  return advanceConversation(state, category).state;
}

function faqAnswer(input, step) {
  const text = input.toLowerCase().replace(/[’]/g, "'");
  // A question can describe the project itself. Keep those answers in the brief.
  if (step === 'goal' && /\b(?:build|create|develop|design|redesign|add|integrate|automate|connect|repair|fix|install|configure|set up|troubleshoot|migrate|upgrade|implement|improve|replace)\b|\bhelp(?: me)? with\s+\w/.test(text)) return null;
  if (/^(?:what services|which services|what can you|services[?!.]*$)/.test(text)) {
    return 'Raj Industries builds AI agents, custom software, websites and workflow automation, networks, and private AI infrastructure. Other specialties include home automation, automotive, and firearms technical work. Repair service inquiries go to Perfect Timing at fixingfortmyers.com. Specific services, scope, and availability are confirmed individually.';
  }
  if (/^(?:how much[?!.]*$|how much\b.*\b(?:cost|charge|price|pricing|rate|quote)|what (?:does|will|would|is|are|price|pricing|cost)\b.*\b(?:cost|price|pricing|rate|quote)|(?:prices?|pricing|costs?|rates?)[?!.]*$|can (?:you|i)\b.*\bquote)/.test(text)) {
    return 'There are no published packages or fixed prices here. Cost depends on the problem, scope, equipment, and work involved. This guide can prepare your brief; it cannot issue a quote or take a payment.';
  }
  const appointmentQuestion = /^(?:(?:can|how|where|do|could|may|will)\b.*\b(?:book|schedule|request|confirm|make)\b.{0,30}\b(?:appointment|visit|consultation|meeting)|(?:what|when)\b.*\b(?:your|raj's) availability|are you available\b|(?:how|what)\b.*\b(?:booking|appointments?)\b.*\b(?:work|confirmed)|(?:appointments?|booking|availability)[?!.]*$)/.test(text);
  if (appointmentQuestion) {
    return 'This guide cannot book appointments or confirm availability. A timeframe in your brief is only a preference. Automotive repair requests go through Perfect Timing at fixingfortmyers.com and require the shop to confirm.';
  }
  const question = /^(?:is|are|what|where|how|does|do|can|will|could)\b/.test(text);
  const privacyQuestion = /^privacy[?!.]*$/.test(text) || (question && (
    /\b(?:this|it|my (?:brief|data|answers|information)|the (?:guide|assistant|chatbot))\b.{0,30}\b(?:private|secure|safe|sent|stored|saved|shared)\b/.test(text)
    || /\b(?:my|these|the) (?:data|answers|brief|details|information|messages)\b.{0,30}\b(?:stored|saved|sent|shared|kept|used|collected|retained|transmitted)\b/.test(text)
    || /\b(?:store|save|send|share|keep|collect|retain|transmit)\b.{0,30}\b(?:it|this|that|my|these)\b/.test(text)
    || /^what happens to my (?:data|brief|answers|information)\b/.test(text)
    || /^what (?:data|information|details)\b.*\bcollect\b/.test(text)
    || /^(?:does|do|is|are|will|can|how does|how do)\s+(?:this(?: (?:guide|assistant|chatbot))?|the (?:guide|assistant|chatbot)|it|you|your (?:guide|assistant|chatbot))\b.*\b(?:use|uses|using|spend|consume)\b.*\b(?:ai|tokens?|model)\b/.test(text)
    || /^(?:does|do|is|are|will|can|how does|how do)\s+(?:this(?: (?:guide|assistant|chatbot))?|the (?:guide|assistant|chatbot)|it|you)\s+(?:ai|an ai|a model)\b/.test(text)
    || /\b(?:need|require|required|give)\b.{0,20}\b(?:email|contact details)\b/.test(text)
  ));
  if (privacyQuestion) {
    return 'This guide uses fixed responses and no AI model. Drafts stay on this page until Send project brief. After Send, a recovery copy stays in this tab so interrupted requests can be retried after a reload. Sent briefs and replies stay in the website inbox for 90 days from creation. Save your private return link; anyone with it can read and reply, and a lost link cannot be recovered. No email is required. Copy and Save brief create local backups.';
  }
  return null;
}

function categoryFor(input) {
  const exact = CATEGORIES.find((category) => category.toLowerCase() === input.toLowerCase());
  if (exact) return exact;
  const patterns = [
    /\b(?:agentic|ai agents?|agents? and automation|tool.use|document search|rag)\b/i,
    /\b(?:website|web\s?site|software|workflow|business automation|portal|api)\b/i,
    /\b(?:home automation|smart home|home assistant|sensor|camera)\b/i,
    /\b(?:network|networks|wi-?fi|computer|it support|firewall|vpn|backup)\b/i,
    /\b(?:private ai|local ai|llm|proxmox|self.hosted|server|gpu|nas)\b/i,
    /\b(?:automotive|car|vehicle|engine|transmission|auto repair)\b/i,
    /\b(?:firearms?|gunsmith|guns?)\b/i,
    /^(?:other|not sure|unsure|something else|not sure yet)[?!.]*$/i,
  ];
  const index = patterns.findIndex((pattern) => pattern.test(input));
  return index < 0 ? null : CATEGORIES[index];
}

export function getConversationView(state) {
  const choices = state.step === 'category' ? CATEGORIES
    : state.step === 'location' ? ['Remote', 'On site in Fort Myers', 'Location undecided']
      : state.step === 'timing' ? ['Flexible', 'This month', 'Timeframe undecided'] : [];
  return {
    prompt: PROMPTS[state.step],
    choices,
    faqs: FAQ_CHOICES,
    ready: state.step === 'review',
    maxLength: state.step === 'location' || state.step === 'timing' ? SHORT_LIMIT : INPUT_LIMIT,
    hint: state.step === 'review'
      ? 'Review your brief, then choose Send project brief to save it to the website inbox. Copy or Save brief only makes a local backup.'
      : `Step ${STEPS.indexOf(state.step) + 1} of 4. Your answers stay on this page. Do not include sensitive information.`,
  };
}

export function buildProjectBrief(state, { saved = false, pending = false } = {}) {
  if (state.step !== 'review') return '';
  return [
    'RAJ INDUSTRIES — PROJECT BRIEF',
    '',
    `Service: ${state.answers.category}`,
    '',
    'Goal or problem:',
    state.answers.goal,
    '',
    `Location / work mode: ${state.answers.location}`,
    `Preferred timing: ${state.answers.timing}`,
    '',
    saved ? 'Saved to the Raj Industries website inbox.' : pending ? 'Submitted for saving. Receipt is not confirmed; retry the same request to check.' : 'Prepared on this page. This brief has not been sent.',
    'No quote, availability, or appointment has been confirmed.',
  ].join('\n');
}

export function advanceConversation(state, rawInput) {
  const input = typeof rawInput === 'string' ? rawInput.trim() : '';
  const limit = getConversationView(state).maxLength;
  const reject = (error) => ({ state, accepted: false, error });
  if (!input) return reject('Enter an answer or choose one of the suggestions.');
  if (input.length > limit) return reject(`Please keep this answer to ${limit} characters or fewer.`);
  const answer = faqAnswer(input, state.step);
  if (answer) {
    return {
      state: withMessages(state, [message('user', input), message('guide', answer)]),
      accepted: true,
      faq: true,
    };
  }
  if (state.step === 'review') return reject('Your brief is ready. Use Start over to change it, or ask about services, pricing, appointments, or privacy.');
  let value = input;
  if (state.step === 'category') {
    value = categoryFor(input);
    if (!value) return reject('Choose the closest service below, or choose Not sure yet.');
  }
  if (state.step === 'goal' && (input.length < 8 || !/[\p{L}\p{N}]/u.test(input))) {
    return reject('Please add a little more detail about the problem or result you want (at least 8 characters).');
  }
  const nextStep = STEPS[STEPS.indexOf(state.step) + 1];
  let next = { ...state, step: nextStep, answers: { ...state.answers, [state.step]: value } };
  const additions = [message('user', input)];
  if (nextStep === 'review') {
    additions.push(message('guide', READY_MESSAGE), message('brief', buildProjectBrief(next)));
  } else {
    additions.push(message('guide', PROMPTS[nextStep]));
  }
  next = withMessages(next, additions);
  return { state: next, accepted: true, faq: false };
}

export function mountProjectAssistant(doc) {
  const ids = ['projectAssistant', 'assistantClose', 'assistantLog', 'assistantChoices', 'assistantForm', 'assistantInput', 'assistantInputLabel', 'assistantHint', 'assistantRestart', 'assistantCopy', 'assistantDownload', 'assistantNotice'];
  const nodes = Object.fromEntries(ids.map((id) => [id, doc.getElementById(id)]));
  if (Object.values(nodes).some((node) => !node)) return null;
  const dialog = nodes.projectAssistant;
  let conversation = createConversation();
  let opener = null;
  let renderedMessages = [];
  let renderedStep = null;
  let pendingSubmission = null;
  let savedReceipt = null;
  let submitting = false;
  const submitButton = doc.getElementById('assistantSubmit');
  const returnLink = doc.getElementById('assistantReturn');
  const returnCopy = doc.getElementById('assistantReturnCopy');
  let checkpointStore = null;
  try { checkpointStore = doc.defaultView.sessionStorage; } catch { /* Storage may be disabled. */ }
  const restored = restoreCheckpoint(checkpointStore);
  if (restored) {
    pendingSubmission = restored.pending;
    conversation = { step: 'review', answers: { ...pendingSubmission.brief }, messages: [message('brief', '')] };
    conversation.messages[0].text = buildProjectBrief(conversation, { saved: restored.saved, pending: !restored.saved });
    if (restored.saved) savedReceipt = { thread: { id: pendingSubmission.id, expires_at: restored.expires_at } };
    if (returnLink) {
      returnLink.href = makeReturnLink(pendingSubmission.id, pendingSubmission.token);
      returnLink.textContent = restored.saved ? 'Open saved conversation' : 'Open conversation - receipt not confirmed';
      returnLink.hidden = false;
    }
    if (returnCopy) returnCopy.hidden = false;
    nodes.assistantRestart.disabled = !restored.saved;
    nodes.assistantNotice.textContent = restored.saved ? 'Your saved conversation is restored. Save its private return link before starting over.' : 'An interrupted submission was restored. Receipt is not confirmed. Use Send project brief to retry the same request.';
  }

  function render() {
    const view = getConversationView(conversation);
    const hasPrefix = renderedMessages.every((item, index) => item === conversation.messages[index]);
    if (!hasPrefix) {
      nodes.assistantLog.replaceChildren();
      renderedMessages = [];
    }
    for (const item of conversation.messages.slice(renderedMessages.length)) {
      const row = doc.createElement(item.role === 'brief' ? 'pre' : 'p');
      row.className = item.role === 'brief' ? 'assistant-brief' : `assistant-message assistant-message--${item.role}`;
      row.dataset.role = item.role === 'guide' ? 'assistant' : item.role;
      if (item.role === 'brief') {
        row.textContent = item.text;
        row.tabIndex = 0;
        row.setAttribute('aria-label', 'Your project brief');
      } else {
        const who = doc.createElement('strong');
        who.className = 'assistant-message__who';
        who.textContent = item.role === 'user' ? 'You: ' : 'Guide: ';
        const body = doc.createElement('span');
        body.textContent = item.text;
        row.append(who, body);
      }
      nodes.assistantLog.append(row);
    }
    renderedMessages = [...conversation.messages];
    if (renderedStep !== conversation.step) {
      nodes.assistantChoices.replaceChildren();
      for (const [items, isFaq] of [[view.choices, false], [view.faqs, true]]) {
        for (const choice of items) {
          const button = doc.createElement('button');
          button.type = 'button';
          button.className = 'assistant-choice';
          button.textContent = choice;
          button.addEventListener('click', () => apply(choice, isFaq));
          nodes.assistantChoices.append(button);
        }
      }
      renderedStep = conversation.step;
    }
    nodes.assistantInputLabel.textContent = view.prompt;
    nodes.assistantInput.maxLength = view.maxLength;
    nodes.assistantHint.textContent = view.hint;
    nodes.assistantCopy.hidden = !view.ready;
    nodes.assistantDownload.hidden = !view.ready;
    if (submitButton) {
      submitButton.hidden = !view.ready;
      submitButton.disabled = submitting || Boolean(savedReceipt);
      submitButton.textContent = submitting ? 'Saving your brief…' : savedReceipt ? 'Brief saved' : 'Send project brief';
    }
    nodes.assistantLog.scrollTop = nodes.assistantLog.scrollHeight;
  }

  function apply(input, preserveDraft = false) {
    const result = advanceConversation(conversation, input);
    if (!result.accepted) {
      nodes.assistantNotice.textContent = result.error;
      nodes.assistantInput.setAttribute('aria-invalid', 'true');
      nodes.assistantInput.focus();
      return;
    }
    conversation = result.state;
    nodes.assistantNotice.textContent = '';
    nodes.assistantInput.removeAttribute('aria-invalid');
    if (!preserveDraft) nodes.assistantInput.value = '';
    render();
    if (!preserveDraft) nodes.assistantInput.focus();
  }

  function focusOpeningStep() {
    const firstService = conversation.step === 'category' ? nodes.assistantChoices.querySelector('button') : null;
    (firstService || nodes.assistantInput).focus({ preventScroll: true });
    dialog.scrollTop = 0;
  }

  const launchers = doc.querySelectorAll('[data-project-assistant], [data-inquiry-category]');
  launchers.forEach((button) => button.addEventListener('click', () => {
    if (dialog.open) return;
    opener = button;
    conversation = preselectService(conversation, button.getAttribute('data-inquiry-category'));
    render();
    dialog.showModal();
    focusOpeningStep();
  }));
  nodes.assistantClose.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (opener && opener.isConnected) opener.focus();
  });
  nodes.assistantForm.addEventListener('submit', (event) => {
    event.preventDefault();
    apply(nodes.assistantInput.value);
  });
  nodes.assistantRestart.addEventListener('click', () => {
    if (submitting || (pendingSubmission && !savedReceipt)) return;
    conversation = createConversation();
    pendingSubmission = null;
    savedReceipt = null;
    clearCheckpoint(checkpointStore);
    if (returnLink) { returnLink.hidden = true; returnLink.removeAttribute('href'); }
    if (returnCopy) returnCopy.hidden = true;
    nodes.assistantInput.value = '';
    nodes.assistantInput.removeAttribute('aria-invalid');
    nodes.assistantNotice.textContent = 'Started over. The previous brief has been cleared from this guide.';
    renderedStep = null;
    render();
    focusOpeningStep();
  });
  nodes.assistantCopy.addEventListener('click', async () => {
    if (conversation.step !== 'review') return;
    try {
      const clipboard = doc.defaultView.navigator.clipboard;
      if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
      await clipboard.writeText(buildProjectBrief(conversation, { saved: Boolean(savedReceipt), pending: Boolean(pendingSubmission) }));
      nodes.assistantNotice.textContent = savedReceipt ? 'Saved brief copied to your clipboard.' : pendingSubmission ? 'Brief copied. Receipt is not confirmed; retry the same request before leaving.' : 'Brief copied to your clipboard. It has not been sent.';
    } catch {
      nodes.assistantNotice.textContent = 'Copy is unavailable here. Select the brief above or choose Save brief.';
    }
  });
  nodes.assistantDownload.addEventListener('click', () => {
    if (conversation.step !== 'review') return;
    const browser = doc.defaultView;
    const file = new browser.Blob([buildProjectBrief(conversation, { saved: Boolean(savedReceipt), pending: Boolean(pendingSubmission) })], { type: 'text/plain;charset=utf-8' });
    const url = browser.URL.createObjectURL(file);
    const link = doc.createElement('a');
    link.href = url;
    link.download = 'raj-industries-project-brief.txt';
    doc.body.append(link);
    link.click();
    link.remove();
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 1000);
    nodes.assistantNotice.textContent = 'A text download was requested. Check your device for the file. Downloading does not send the brief.';
  });
  submitButton?.addEventListener('click', async () => {
    if (submitting || savedReceipt || conversation.step !== 'review') return;
    pendingSubmission ||= createPendingSubmission(conversation.answers);
    const checkpointed = checkpointSubmission(checkpointStore, pendingSubmission);
    if (returnLink) {
      returnLink.href = makeReturnLink(pendingSubmission.id, pendingSubmission.token);
      returnLink.textContent = 'Open conversation - receipt not confirmed';
      returnLink.hidden = false;
    }
    if (returnCopy) returnCopy.hidden = false;
    submitting = true;
    nodes.assistantRestart.disabled = true;
    nodes.assistantNotice.textContent = checkpointed ? 'Saving your brief to the website inbox...' : 'Saving your brief... Tab recovery is unavailable. Keep this page open and copy the private return link before leaving.';
    render();
    try {
      savedReceipt = await submitBrief(pendingSubmission);
      const savedCheckpoint = checkpointSubmission(checkpointStore, pendingSubmission, { saved: true, expires_at: savedReceipt.thread.expires_at });
      const link = makeReturnLink(pendingSubmission.id, pendingSubmission.token);
      if (returnLink) { returnLink.href = link; returnLink.textContent = 'Open saved conversation'; returnLink.hidden = false; }
      if (returnCopy) returnCopy.hidden = false;
      conversation = withMessages(conversation, [message('guide', 'Your project brief is saved in the website inbox. Save your private return link before leaving to check for Raj’s reply. Anyone with the link can read and reply. If you lose it, this anonymous conversation cannot be recovered.')]);
      conversation = { ...conversation, messages: conversation.messages.map((item) => item.role === 'brief' ? message('brief', buildProjectBrief(conversation, { saved: true })) : item) };
      nodes.assistantNotice.textContent = savedCheckpoint ? 'Brief saved. Save your private return link before leaving or starting over.' : 'Brief saved. Tab recovery is unavailable: copy your private return link before leaving or starting over.';
      nodes.assistantRestart.disabled = false;
    } catch (error) {
      nodes.assistantNotice.textContent = `${inboxError(error)} Receipt is not confirmed. Keep this page open and use Send project brief again; your request and private key will be reused.${checkpointed ? '' : ' Tab recovery is unavailable, so copy the private return link before leaving.'}`;
    } finally { submitting = false; render(); }
  });
  returnCopy?.addEventListener('click', async () => {
    if (!returnLink?.href) return;
    try {
      await doc.defaultView.navigator.clipboard.writeText(returnLink.href);
      nodes.assistantNotice.textContent = 'Private return link copied. Keep it privately; anyone with it can read and reply.';
    } catch { nodes.assistantNotice.textContent = 'Copy is unavailable. Open the saved conversation and bookmark it, or copy its complete address.'; }
  });
  render();
  return { getState: () => conversation };
}

if (typeof document !== 'undefined') mountProjectAssistant(document);

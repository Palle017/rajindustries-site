export const INPUT_LIMIT = 1000;
const SHORT_LIMIT = 200;
const HISTORY_LIMIT = 32;
export const READY_MESSAGE = 'Your brief is ready. It has not been sent. Copy or save it for now.';

const CATEGORIES = [
  'Website or workflow automation',
  'Home automation',
  'Networks or IT support',
  'Private AI or self-hosted systems',
  'Automotive',
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
      message('guide', 'Choose a service and we’ll shape a short project brief. Your answers stay in this page; nothing is sent to Raj. Leave out passwords and private details.'),
      message('guide', PROMPTS.category),
    ],
  };
}

function faqAnswer(input, step) {
  const text = input.toLowerCase().replace(/[’]/g, "'");
  // A question can describe the project itself. Keep those answers in the brief.
  if (step === 'goal' && /\b(?:build|create|develop|design|redesign|add|integrate|automate|connect|repair|fix|install|configure|set up|troubleshoot|migrate|upgrade|implement|improve|replace)\b|\bhelp(?: me)? with\s+\w/.test(text)) return null;
  if (/^(?:what services|which services|what can you|services[?!.]*$)/.test(text)) {
    return 'Raj Industries lists websites and workflow automation, home automation, networks and IT support, private AI and self-hosted systems, and automotive technical work. Repair service inquiries belong with Perfect Timing at fixingfortmyers.com. Suitability and scope need individual review; this guide cannot confirm availability.';
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
    return 'This guide runs in your browser with fixed responses and uses no AI model. Your answers stay in this page\'s memory; the guide does not transmit them or keep them after a page reload. Copy writes only when you choose Copy. Save downloads a text file to your device. No email or contact details are required. Nothing is sent to Raj.';
  }
  return null;
}

function categoryFor(input) {
  const exact = CATEGORIES.find((category) => category.toLowerCase() === input.toLowerCase());
  if (exact) return exact;
  const patterns = [
    /\b(?:website|web\s?site|software|workflow|business automation|portal|api)\b/i,
    /\b(?:home automation|smart home|home assistant|sensor|camera)\b/i,
    /\b(?:network|networks|wi-?fi|computer|it support|firewall|vpn|backup)\b/i,
    /\b(?:private ai|local ai|llm|proxmox|self.hosted|server|gpu|nas)\b/i,
    /\b(?:automotive|car|vehicle|engine|transmission|auto repair)\b/i,
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
      ? 'The brief is only on this page. Copy or save it before reloading. Nothing is sent to Raj.'
      : `Step ${STEPS.indexOf(state.step) + 1} of 4. Your answers stay on this page. Do not include sensitive information.`,
  };
}

export function buildProjectBrief(state) {
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
    'Prepared on this page. This brief has not been sent.',
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

  const launchers = doc.querySelectorAll('[data-project-assistant]');
  launchers.forEach((button) => button.addEventListener('click', () => {
    if (dialog.open) return;
    opener = button;
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
    conversation = createConversation();
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
      await clipboard.writeText(buildProjectBrief(conversation));
      nodes.assistantNotice.textContent = 'Brief copied to your clipboard. It has not been sent.';
    } catch {
      nodes.assistantNotice.textContent = 'Copy is unavailable here. Select the brief above or choose Save brief. Nothing has been sent.';
    }
  });
  nodes.assistantDownload.addEventListener('click', () => {
    if (conversation.step !== 'review') return;
    const browser = doc.defaultView;
    const file = new browser.Blob([buildProjectBrief(conversation)], { type: 'text/plain;charset=utf-8' });
    const url = browser.URL.createObjectURL(file);
    const link = doc.createElement('a');
    link.href = url;
    link.download = 'raj-industries-project-brief.txt';
    doc.body.append(link);
    link.click();
    link.remove();
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 1000);
    nodes.assistantNotice.textContent = 'A text download was requested. Check your device for the file. Nothing has been sent.';
  });
  render();
  return { getState: () => conversation };
}

if (typeof document !== 'undefined') mountProjectAssistant(document);

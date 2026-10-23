# On-site project assistant: proposed rollout

Status: design preview only. This document does not authorize deployment or
activation of an inquiry service. Raj requested no email route and a
self-contained website chatbot.

## Recommended first release

Keep common service answers and the four-step brief deterministic: zero AI
model tokens. The preview implements this browser experience, including local
copy/download and honest unsent status.

Before accepting inquiries, connect an explicit Send brief action to a small
same-origin intake endpoint backed by durable private storage. Return a receipt
only after the write succeeds. Preserve the draft on failure and use a request
ID to prevent duplicate submissions.

For follow-up without email, attach the conversation to an anonymous private
visitor session and an authenticated owner inbox on the website. Give the
visitor a recoverable conversation link/code and explain how to return for
Raj's reply. Do not promise live chat or response times. Store owner replies
and incoming messages independently of any AI provider.

Inspect and reuse an existing suitable backend pattern where possible. Do not
repurpose the private tardbot gate or expose its authenticated endpoint to
anonymous visitors. Include anti-abuse limits, session expiration, owner
authentication, a privacy notice, retention, and failure/recovery checks in
that release. No hosting purchase is needed to review the design.

## Add AI only if observed questions justify it

Use the fixed FAQ and structured flow first. Call a model only for a free-form
question those paths cannot handle. Send a short approved service summary,
the structured brief, and a small recent context window; do not resend the
whole page or full transcript. Bound input/output length, turns, and total
cost per session. Cache stable public FAQ answers where appropriate.

The model may clarify and categorize a request. It must not invent quotes,
promise availability, confirm bookings, claim unsaved leads were received,
or access the private workspace. Keep deterministic intake usable when the
model fails or reaches its budget.

Choose a provider and current price only when that optional stage is approved.
This preview has no provider key, model dependency, token expenditure, or
connected AI runtime.

## Acceptance before production

1. Raj approves the page and actual inbox/follow-up workflow.
2. A synthetic brief is saved once, appears in the authenticated owner inbox,
   survives restart, and reopens using the visitor's private session.
3. A synthetic reply is visible only to the matching visitor. Failed or repeated
   requests retain drafts without false success or duplicates.
4. Recheck mobile, keyboard, no-email flow, anti-abuse controls, and existing
   gated workspace/archive boundaries.
5. Remove preview labels and noindex in the separately approved release commit,
   merge through review, and verify the live result.

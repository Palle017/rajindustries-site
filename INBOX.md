# Website inbox and private visitor return links

Raj authorized implementation and deployment through PRs on October 23, 2026,
superseding the prior design-only deployment hold. Keep development changes in
PR #1 and release tested revisions through the required review workflow.

## Product flow

The on-page guide and fixed FAQ use no AI model. Drafts remain local until the
visitor explicitly sends the brief. The browser creates a conversation ID,
request ID, and high-entropy capability before the request. The same values
are retained on retry so a lost response cannot create a duplicate inquiry.

After Send, temporary tab-session recovery state lets an interrupted request
be retried after reload. An unconfirmed return link is not a storage receipt.
Only the API's durable acknowledgement changes the UI to saved status.

Visitors save a private return link. The credential is after the URL fragment
marker and travels to the API only in an authorization header, never a query
parameter. Anyone with that link can read and reply; there is no anonymous
account recovery if it is lost. Links expire 90 days after creation. Expired
conversations cannot be retrieved and are purged in bounded maintenance batches
when the service processes successful writes; no background purge guarantee is
made while the service is idle.

The visitor conversation page has no analytics, external fonts, email form,
private-workspace code, attachments, or executable user content. All messages
are plain text. Polling runs only while the page is visible.

## Owner inbox

Owner entry: https://raj-industries-inbox.prudhvi-pallempati.chatgpt.site/owner

The inbox requires normal Sites sign-in and a server-side owner allowlist.
Every owner API route checks the trusted platform identity. Private owner
settings and secrets are configured in hosting, never in GitHub or browser
JavaScript. The public Site audience does not grant owner access.

The owner reads saved briefs and replies inside the website inbox. Replies
appear when the visitor returns or when their open conversation refreshes.
No customer email, SMS, or external notification is sent. It is asynchronous
messaging; the interface does not promise that Raj is online.

## Hosting and storage

The marketing website stays in Palle017/rajindustries-site on GitHub Pages.
The separate inbox service uses new Sites project
appgprj_6adbd7a7ac7081919f194b4f5ff016ba and its own D1 binding DB.
It does not reuse Perfect Timing's data or infrastructure identity.

The reviewed backend source is mirrored under inbox-service/ in this repo.
Publishing uses the supported Sites source/build/archive workflow; record the
GitHub revision, Sites source revision, saved version, and deployment receipt.
Copy source changes into the mirror before pushing the PR; do not copy Git
metadata, secrets, local SQLite data, or generated build output.

Runtime keys: ALLOWED_EMAILS (secret), RATE_SECRET (secret), PUBLIC_ORIGIN,
and RELEASE_SHA. LOCAL_PREVIEW is used only by the loopback development server,
which injects a synthetic identity and must never be deployed.

Owner writes require the backend's own origin, JSON, and X-Raj-Inbox: 1.
Visitor CORS is restricted to the exact marketing-site origin; capabilities
remain required for every visitor read/reply. D1 transactions enforce request
idempotency, message limits, and write receipts. Bodies and credentials are
excluded from application logs. There is no model key or model dependency.

## Verification before release

- Create, retry, read, and reply using synthetic conversations only.
- Prove missing credentials, another visitor's token, spoofed owner headers,
  foreign origins, excessive inputs, and rate-limit excess cannot expose or
  mutate a conversation.
- Prove a saved return link works in a clean browser and after a redeployment.
- Read the owner's synthetic reply through the matching visitor link.
- Verify direct backend owner endpoints deny anonymous callers.
- Verify the deployed website, private owner UI, and server release revision.

Use the release receipt in Codex/Artifacts/rajindustries-preview-20261023 for
current deployment status; source preparation alone is not acceptance.

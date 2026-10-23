# Raj Industries inbox service

Independent Sites Worker + D1 for website conversations. It uses no AI model,
email, SMS, paid integration, or repair-shop records. Source is mirrored in
Palle017/rajindustries-site under inbox-service/ through the reviewed PR.

Project ID: appgprj_6adbd7a7ac7081919f194b4f5ff016ba
Service: https://raj-industries-inbox.prudhvi-pallempati.chatgpt.site
Owner UI: /owner, protected by Sites sign-in and server ALLOWED_EMAILS.

Run node --test backend.test.mjs.
Run node scripts/build.mjs then node scripts/validate-artifact.mjs.
Local development: node scripts/local-server.mjs (127.0.0.1:8793 only,
synthetic owner identity, .local/inbox.sqlite; never production auth).

The source manifest declares new DB binding DB and no R2. Sites provisions
the database and applies schema-only drizzle migrations before deploying.
The build mirrors migrations/0001_inbox.sql into the initial Drizzle migration
and journal for packaging. Applied artifacts must remain immutable; add
future migrations instead of rewriting a deployed migration.

Public visitor routes use UUIDs, random 32-byte capabilities (hash only in DB),
strict origin/JSON checks, bounded bodies/messages, durable rate buckets and
atomic idempotent writes. Return links use fragments; secrets must never enter
request URLs or logs. Links expire 90 days after creation. Expired data is
unavailable and lazily removed after successful writes; no timed deletion
guarantee is made while idle.

Owner routes rely on trusted Sites Dispatch identity. Do not deploy as a
plain Worker accepting client-supplied identity headers. Every owner route
enforces the server allowlist. Configure ALLOWED_EMAILS and RATE_SECRET as
secrets, PUBLIC_ORIGIN and RELEASE_SHA as runtime configuration. Never commit
runtime values or local customer data.

Deploy through the supported Sites source/archive workflow and record the PR
revision, private source revision, saved version and deployment receipt.
Public visitor endpoints do not grant owner access.

# Raj Industries

Websites, automation, connected homes, networks, private AI and selected work.
The public website is static GitHub Pages at rajindustries.fixingfortmyers.com.

Raj authorized website-inbox implementation and deployment through PRs on
October 23, 2026, superseding the prior design-only hold. Keep PR #1 current
during development; release tested revisions through the required review
workflow. GitHub Pages publishes main at the repository root.

## Public project conversation

Discuss your project opens the fixed on-page guide. Four steps collect the
category, goal, general location/work mode and timing. No email is required;
the guide uses zero AI model tokens. Only explicit Send project brief writes
to the website inbox, with saved status only after a durable receipt.
Post-Send tab-session recovery preserves retry identity after reload.
Visitors save a private return link to read and reply later.

The conversation page has no analytics or private-workspace code. Credentials
stay in the URL fragment and API authorization header. Anyone with the private
link can read and reply; losing it prevents anonymous recovery. Links expire
90 days after creation.

Owner inbox:
https://raj-industries-inbox.prudhvi-pallempati.chatgpt.site/owner

It requires owner sign-in and server authorization. No customer email, SMS,
or third-party notification is sent. See INBOX.md for architecture and release
evidence. Backend source is in inbox-service/.

## Development and checks

Run node serve.mjs 8792 for the loopback website.
Follow inbox-service/README.md for the loopback backend on port8793.
Local API mapping applies only on localhost/127.0.0.1.

Run node --test site.test.mjs public-status.test.mjs project-assistant.test.mjs
inbox-client.test.mjs inbox-service/backend.test.mjs as one command.

GitHub verification runs tests plus backend build/artifact validation.
Existing gated tardbot and protected archive markup/controller remain
separate; no private content is published.

## Portfolio and lab

Perfect Timing uses a real public screenshot and request-flow copy.
SPOTTED is labeled as a marketplace prototype. Home Assistant is personal;
Manasa Globe remains protected. Automotive requests route to Perfect Timing.

The optional lab remains disconnected without an approved sanitized public
summary. It polls only while expanded and visible, clears stale/failed values,
and never contacts private infrastructure directly.

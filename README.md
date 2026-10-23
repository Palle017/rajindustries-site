# Raj Industries — design preview

**Deployment hold: this branch is for Raj's design review. Do not merge,
enable auto-merge, or deploy without his next explicit release instruction.**
GitHub Pages serves main at the repository root; merging would publish it.

The proposed page leads with websites, automation, and connected systems, then
selected work, four focused capability cards, an optional lab panel, and an
on-page project assistant. It remains static HTML/CSS/JavaScript with no build,
external font dependency, new runtime dependency, or paid service.

## Local review

Run node serve.mjs 8792 and open http://127.0.0.1:8792.
The development server binds only to loopback. The page has noindex,nofollow
and a discreet design-preview label. Remove those preview-only markers in a
separately approved release commit, not during this design review.

Run node --test site.test.mjs public-status.test.mjs project-assistant.test.mjs.
GitHub's Verify preview workflow runs these checks on the design branch and
pull requests, with read-only permissions and no deployment job.

## Project assistant: zero model tokens

The public Discuss your project buttons open a native dialog. Fixed answers
cover services, pricing, appointments, and privacy. Four steps collect project
category, desired outcome, general location/work mode, and timing.

This preview has **no submission backend**. Answers stay in page memory. Copy
and Save brief are explicit local actions. Closing/reopening keeps the draft
for the same page session; reloading clears it. No email or contact details are
required. It does not send inquiries, confirm bookings, quote prices, call an
AI model, or create persistent browser records. Review explicitly states that
the brief has not been sent.

The existing gated tardbot workspace remains separate in the footer. Its gate,
authentication, remote endpoints, and controller are preserved; it is not the
new public intake route. No gate was bypassed or backend activated.
See [ROLLOUT.md](ROLLOUT.md) for the proposed production path without email.

## Selected work and evidence

- **Perfect Timing:** public repair website and customer request flow at
  https://fixingfortmyers.com/, source Palle017/fixingfortmyers-site.
  The new assets/projects/perfect-timing-current.jpg was captured from the
  public site on October 23, 2026, with no form filled or submitted. Copy
  describes repair/appointment requests, not confirmed bookings or measured
  business uplift.
- **SPOTTED:** marketplace prototype, public source Palle017/spottedin-c.
  Its existing image is retained and labeled as a project interface. The
  website link is retained; current commerce, customer numbers, and
  transaction handling are not claimed.
- **Home Assistant:** personal home-automation implementation. The former
  source link was unavailable to public inspection, so it is not presented
  as an inspectable public case study or open-source repository.
- **Manasa Globe:** protected interactive archive. Its existing on-demand
  launcher, authentication boundary, iframe target, and controller remain.
  No private photographs or archive contents were opened or copied.

Automotive requests route to Perfect Timing. The unresolved firearms service
placeholder is omitted from the proposed public service lineup.

## Optional public status panel

The collapsed lab disclosure requests only proxmox-public.json from the same
origin, without credentials or redirects. It refreshes on opening and every
60 seconds while open and visible. Closing or hiding the page stops polling
and cancels in-flight work. A ten-second timeout bounds failed requests.

No public summary file exists in this branch. **Public telemetry not connected**
and blank metrics are intentional. Stale, invalid, or failed reads clear old
numbers, bars, guest counts, and timestamp. No example metrics are displayed
as live data.

The allowlisted schema is updated_at, cpu_percent, memory_percent,
storage_percent, uptime_seconds, guests_running, and guests_total.
Published values must be real, validated, sanitized, and no older than fifteen
minutes. Private API addresses, tokens, hostnames, VM names, and camera feeds
stay out of the page. Publishing a feed or connecting a private collector
requires a separate authorized change.

## Release boundary

No main-branch edits, merges, DNS changes, public exposure, account changes,
customer messages, or production backend changes are part of this preview.
Canonical source: Palle017/rajindustries-site.
Production domain: rajindustries.fixingfortmyers.com.

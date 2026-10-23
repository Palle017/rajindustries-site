# rajindustries-site

Services and project portfolio for Raj Industries, served by GitHub Pages at
`rajindustries.fixingfortmyers.com`.

A minimal, responsive dark layout with six direct service sections, a read-only server status panel, and the existing project links.
The site favors short technical descriptions instead of sales copy.

## Services

- Website design and development, business apps, SEO, APIs, portals, and automation.
- Home Assistant, smart home automation, cameras, sensing, and security-system integrations.
- Networking, Wi-Fi, managed IT, Microsoft 365, firewalls, VPNs, backups, virtualization, and cloud migrations.
- Private AI infrastructure, local LLMs, GPU servers, Proxmox, storage, and small compute clusters.
- Automotive diagnostics, mechanical and electrical repair, and module programming (see Perfect Timing for auto repair).
- Firearms technical specialty; no specific regulated services claimed pending verified scope/licensing.

## Public server stats

The Proxmox panel is display-only. It requests `proxmox-public.json` from the site origin every 60 seconds.
Until an approved data feed exists, it accurately shows **Public telemetry not connected** and blank metrics.

Any published JSON must have **only** these allowlisted fields:

```json
{
  "updated_at": "2026-10-23T12:00:00Z",
  "cpu_percent": 12,
  "memory_percent": 35,
  "storage_percent": 48,
  "uptime_seconds": 123456,
  "guests_running": 4,
  "guests_total": 5
}
```

The numbers above illustrate the schema only; they are not live measurements. Do **not** publish this sample as the real feed.
Values older than 15 minutes are shown as stale.
Never expose a Proxmox or Home Assistant token, private IP address, device identifier, host/VM names, security-camera feed, private system details, or a management endpoint.
A static GitHub Pages site cannot poll the private network on its own; connect this later through an authorized read-only server-side collector with sanitized output and explicit approval for public telemetry.

## Projects

- **Perfect Timing** — auto repair, online booking, and shop operations at `fixingfortmyers.com`.
- **Home Assistant** — smart home controls, cameras, energy, and automations; links to `Palle017/Homeassistant` on GitHub. Repository access follows its existing permissions.
- **SPOTTED** — a marketplace for pre-owned Indian clothing at `www.spottedin.co`.
- **Manasa Globe** — a private photo archive; its existing protected launcher opens on demand.

The gated tardbot chat remains available from the footer and opens only on request. The Manasa Globe protected archive launcher is preserved.
Project screenshots remain in `assets/projects/` for reuse but are not loaded on the page.

## UI verification

Preview: `node serve.mjs 8791`, then open `http://localhost:8791`.

- Project discovery: `#projects` still contains four entries; `#services` contains six service cards and `#infrastructure` contains the status panel. Current changes require a fresh desktop/mobile visual check.
- Archive: `#manasaGlobeLauncher` opens `#appOverlay` and loads the protected archive on demand; Escape closes it and restores launcher focus. Launch and Escape checked.
- Chat: footer `#chatLauncher` opens `#chatPanel`; Escape closes it. The gate is retained and chat never opens automatically. Opening and closing checked; authenticated chat and private archive contents were not exercised.
- Home Assistant links to the existing GitHub project; repository visibility and access are unchanged.

## Deploy

Static, no build step. Commit and push; Pages serves `main` at `/`.

- Source: `main`, folder `/` (root)
- Custom domain: `rajindustries.fixingfortmyers.com` (already in `CNAME`)
- Enforce HTTPS: on

DNS, at whoever hosts `fixingfortmyers.com`:

```
CNAME   rajindustries   palle017.github.io.
```

Hostnames are case-insensitive — this answers to `rajindustries` no matter how
it is typed. If the brand is styled *RajIndustries*, that has to live in the
page title and headings, not the URL.

This repo can be public. It holds no private content, and a company site needs
to be indexable once it is real.

## Content boundary

The site lists owner-confirmed areas of specialization, not a legal entity type or warranty.
Actual regulated physical wiring, alarm installations, and firearms services must be scoped against applicable licensing before accepting those jobs.

## Related

- `fixingfortmyers-site` — the auto repair site, same domain, separate repo.
- `maanster_archive` — private source for the encrypted Manasa Globe archive.

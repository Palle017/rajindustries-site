# rajindustries-site

Public portfolio for Raj Industries, served by GitHub Pages at
`rajindustries.fixingfortmyers.com`.

A minimal, responsive grid with one short description and one destination per project.
The dark palette retains the orange and cyan accents from `fixingfortmyers.com`.

## Projects

- **Perfect Timing** — auto repair, online booking, and shop operations at `fixingfortmyers.com`.
- **Home Assistant** — smart home controls, cameras, energy, and automations; links to `Palle017/Homeassistant` on GitHub. Repository access follows its existing permissions.
- **SPOTTED** — a marketplace for pre-owned Indian clothing at `www.spottedin.co`.
- **Manasa Globe** — a private photo archive; its existing protected launcher opens on demand.

The gated tardbot chat remains available from the footer and opens only on request.
Project screenshots remain in `assets/projects/` for reuse but are not loaded on the page.

## UI verification

Preview: `node serve.mjs 8791`, then open `http://localhost:8791`.

- Project discovery: `#projects` contains four cards, each with a short description and one destination. Checked in-browser at desktop and a 390px frame; no horizontal overflow.
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

The portfolio does not state what Raj Industries is legally, what it sells, or
how it relates to Perfect Timing Auto Repair. Add those claims only after they
are confirmed by the owner.

## Related

- `fixingfortmyers-site` — the auto repair site, same domain, separate repo.
- `maanster_archive` — private source for the encrypted Manasa Globe archive.

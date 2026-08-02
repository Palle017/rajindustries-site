# rajindustries-site

Public portfolio for Raj Industries, served by GitHub Pages at
`rajindustries.fixingfortmyers.com`.

The page carries the brand colours from `fixingfortmyers.com` — dark ground,
fire `#ff6a1a`, cyan `#3ABEFF`, and Bebas Neue display — so the two sites read
as related. It presents only public, verifiable work and makes no claim about
the company's legal structure or service offering.

## Featured work

- **SPOTTED (Maanster Market)** — one marketplace project, shown once on the
  portfolio under SPOTTED. Live at `www.spottedin.co`; canonical source:
  `Palle017/spottedin-c`.
- **Perfect Timing Auto Repair** — live at `fixingfortmyers.com`; canonical
  source: `Palle017/fixingfortmyers-site`.
- **Manasa Globe** — a private, passphrase-protected interactive photo archive.
  Its gated launcher is rolled into the portfolio card; the repository and
  photographs remain private.

The project images in `assets/projects/` are captured at 1280 × 800 for this
portfolio. Public projects use live-site screenshots. `manasa-globe.png` uses
the globe app's safe sample data and contains no private photographs.
`maanster-market.png` is retained as a legacy screenshot of the same marketplace
project, not a separate entry.

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

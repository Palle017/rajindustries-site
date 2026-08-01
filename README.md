# rajindustries-site

Public portfolio for Raj Industries, served by GitHub Pages at
`rajindustries.fixingfortmyers.com`.

The page carries the brand colours from `fixingfortmyers.com` — dark ground,
fire `#ff6a1a`, cyan `#3ABEFF`, and Bebas Neue display — so the two sites read
as related. It presents only public, verifiable work and makes no claim about
the company's legal structure or service offering.

## Featured work

- **SPOTTED** — live at `www.spottedin.co`; canonical source:
  `Palle017/spottedin-c`.
- **Maanster Market** — live at `palle017.github.io/maanster-market/`;
  canonical source: `Palle017/maanster-market`.
- **Perfect Timing Auto Repair** — live at `fixingfortmyers.com`; canonical
  source: `Palle017/fixingfortmyers-site`.

The project images in `assets/projects/` are screenshots of those public live
sites, captured at 1280 × 800 for this portfolio.

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
- `maanster_archive` — private, on the `manasa.` subdomain. Unrelated to this
  site beyond sharing a parent domain.

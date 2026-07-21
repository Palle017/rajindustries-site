# rajindustries-site

Company site for Raj Industries, served by GitHub Pages at
`rajindustries.fixingfortmyers.com`.

Currently a holding page. It carries the brand colours from
`fixingfortmyers.com` — dark ground, fire `#ff6a1a`, cyan `#3ABEFF`, Bebas Neue
display — so the two sites read as related, and states nothing about the
business that has not been confirmed.

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

## Before this replaces the holding page

The page deliberately makes no claims about the business, because these are not
yet decided:

- What Raj Industries is, and its relationship to Perfect Timing Auto Repair —
  parent company, separate venture, or holding brand.
- What it sells or offers, and to whom.
- Contact details, and whether they should differ from the shop's.
- Whether it needs more than one page.

Remove the `noindex` meta from `index.html` once there is real content. Leaving
it in place keeps a stub out of search results in the meantime.

## Related

- `fixingfortmyers-site` — the auto repair site, same domain, separate repo.
- `maanster_archive` — private, on the `manasa.` subdomain. Unrelated to this
  site beyond sharing a parent domain.

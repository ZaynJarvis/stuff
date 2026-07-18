# Stuff

A small public shelf for useful plans, artifacts, and experiments at
[`stuff.zaynjarvis.com`](https://stuff.zaynjarvis.com).

## Current items

1. **HuaSheng Sales Development Plan** — `/sd-plan/`

The unlinked public index at `/z/` is generated from `artifacts.json`. Pinned
items stay first; other items are ordered by publication date. The root route
is a standalone `stuff.` wordmark with no visible path to the index.

## Publish an artifact

Use the installed `/to-stuff` skill with a finished, standalone HTML file. It
checks public-safety issues, writes `site/<slug>/index.html`, updates the
manifest, validates the build, pushes `main`, and verifies the Cloudflare URL.

## Local preview

```bash
npm run dev
```

Open <http://localhost:4173> for the wordmark or <http://localhost:4173/z/> for
the artifact index.

## Build and check

```bash
npm run build
npm run check
```

The static output is written to `dist/`.

## Cloudflare Pages

- Project name: `zaynjarvis-stuff`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Custom domain: `stuff.zaynjarvis.com`

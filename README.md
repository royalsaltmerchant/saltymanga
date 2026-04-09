# SaltyManga

SaltyManga is a one-page Astro site that turns a simple CSV of manga titles into a browsable shelf with AniList metadata and manual Bookshop buy links.

## What It Does

- reads a minimal CSV of manga titles
- enriches each title with AniList metadata
- uses manual Bookshop links from the CSV when you have them
- renders a static single-page shelf for Netlify

## Project Layout

- `data/titles.csv`
  Minimal title input file. This is now the canonical source.
- `data/catalog.json`
  The built shelf catalog consumed by the frontend.
- `scripts/build-catalog.mjs`
  Reads `titles.csv`, matches titles to AniList, and writes the catalog.
- `src/pages/index.astro`
  Single-page frontend.

## Quick Start

```bash
cp .env.example .env
npm install
npm run dev
```

## Environment

Optional:

- `SITE_URL`

## Refresh Flow

```bash
npm run build:catalog
```

Or in one go:

```bash
npm run refresh:all
```

To refresh the catalog locally and then build the site:

```bash
npm run build:deploy
```

Netlify deploys the committed `data/catalog.json` and runs:

```bash
npm run build
```

## CSV Input Notes

This project is CSV-first. If you want to preserve an original post or shop reference, add a `source_url` column to `data/titles.csv`.

The only required input for the builder is a `title` column:

```csv
title
Delicious in Dungeon
Yotsuba&!
```

Optional columns supported by the builder:

```csv
title,source_url,caption,notes,bookshop_url,cover_image
Delicious in Dungeon,https://example.com/post,Still one of the easiest fantasy recs to hand someone.,,https://bookshop.org/a/123/9780123456789,https://example.com/cover.jpg
```

Replace the CSV rows with your real titles, run the refresh flow, and the site will rebuild from that list.

## Bookshop Links

Bookshop links are manual. Add the exact product URL you want in `bookshop_url`. If a row has no `bookshop_url`, the card simply renders without a buy button.

## Netlify

This repo is configured for Netlify in `netlify.toml`.

- Build command: `npm run build`
- Publish directory: `dist`
- Node version: `22`

Set these environment variables in Netlify before the first production deploy:

- `SITE_URL`

The default production URL is `https://saltymanga.com`. Override `SITE_URL` only when you need a different canonical site URL.

Production relies on the committed `data/catalog.json`. When you change `data/titles.csv`, run `npm run build:deploy` locally before shipping so Netlify can deploy the refreshed catalog without making network metadata calls during the build.

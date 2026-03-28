# SaltyManga

SaltyManga is a one-page Astro site that turns a simple CSV of manga titles into a browsable shelf with AniList metadata and Bookshop affiliate buy links.

## What It Does

- reads a minimal CSV of manga titles
- enriches each title with AniList metadata
- resolves ISBN-13 where possible
- renders a static single-page shelf for Netlify

## Project Layout

- `data/titles.csv`
  Minimal title input file. This is now the canonical source.
- `data/overrides.json`
  Manual fixes for ambiguous title matches.
- `data/catalog.json`
  The built shelf catalog consumed by the frontend.
- `scripts/build-catalog.mjs`
  Reads `titles.csv`, matches titles to AniList, resolves ISBN-13, and writes the catalog.
- `src/pages/index.astro`
  Single-page frontend.

## Quick Start

```bash
cp .env.example .env
npm install
npm run dev
```

## Environment

Required:

- `PUBLIC_BOOKSHOP_AFFILIATE_ID`

Optional:

- `GOOGLE_BOOKS_API_KEY`
- `SITE_URL`

## Refresh Flow

```bash
npm run build:catalog
```

Or in one go:

```bash
npm run refresh:all
```

## CSV Input Notes

This project no longer depends on the Instagram API.
If you still want to preserve your original post references, add an `instagram_url` column to `data/titles.csv`.

The only required input for the builder is a `title` column:

```csv
title,instagram_url,caption,notes
Delicious in Dungeon,https://www.instagram.com/salty.manga/,Still one of the easiest fantasy recs to hand someone.,
Yotsuba&!,https://www.instagram.com/salty.manga/,Weekend comfort reread. Small chaos, big payoff.,
```

This repo ships with demo data in `data/catalog.json` and a sample `data/titles.csv`.
Replace the CSV rows with your real titles, run the refresh flow, and the site will rebuild from that list.

## Bookshop Links

Bookshop links are generated from the affiliate id plus ISBN-13 using:

```text
https://bookshop.org/a/{affiliate_id}/{isbn13}
```

That means the site only needs a valid ISBN-13 per manga entry rather than a hand-collected Bookshop product URL for every card.

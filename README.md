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

This project is CSV-first. If you want to preserve an original post or shop reference, add a `source_url` column to `data/titles.csv`.

The only required input for the builder is a `title` column:

```csv
title
Delicious in Dungeon
Yotsuba&!
```

Optional columns supported by the builder:

```csv
title,source_url,caption,notes,isbn13,cover_image
Delicious in Dungeon,https://example.com/post,Still one of the easiest fantasy recs to hand someone.,,,https://example.com/cover.jpg
```

Replace the CSV rows with your real titles, run the refresh flow, and the site will rebuild from that list.

## Bookshop Links

Bookshop links are generated from the affiliate id plus ISBN-13 using:

```text
https://bookshop.org/a/{affiliate_id}/{isbn13}
```

That means the site only needs a valid ISBN-13 per manga entry rather than a hand-collected Bookshop product URL for every card.

import fs from 'node:fs';
import path from 'node:path';

export interface CatalogItem {
  id: string;
  lookupTitle: string | null;
  title: string;
  description: string;
  source: {
    caption: string | null;
    url: string | null;
    imageUrl: string | null;
    tags: string[];
  };
  anilist: {
    id: number;
    url: string | null;
    score: number | null;
    status: string | null;
    format: string | null;
    volumes: number | null;
    chapters: number | null;
    coverImage: string | null;
  } | null;
  genres: string[];
  isbn13: string | null;
  matchConfidence: 'high' | 'medium' | 'low' | string;
}

export interface CatalogPayload {
  generatedAt: string | null;
  source: {
    mode: string;
    note: string | null;
  };
  items: CatalogItem[];
}

let cache: CatalogPayload | null = null;
let cacheMtimeMs: number | null = null;

function getCatalogPath() {
  return path.resolve(process.cwd(), 'data', 'catalog.json');
}

export function getCatalog() {
  const filePath = getCatalogPath();
  if (!fs.existsSync(filePath)) {
    return {
      generatedAt: null,
      source: {
        mode: 'missing',
        note: 'Run `npm run build:catalog` once data/titles.csv has been filled in.'
      },
      items: []
    } satisfies CatalogPayload;
  }

  const stats = fs.statSync(filePath);
  if (cache && cacheMtimeMs === stats.mtimeMs) {
    return cache;
  }

  cache = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CatalogPayload;
  cacheMtimeMs = stats.mtimeMs;
  return cache;
}

export function getCatalogGenres(items: CatalogItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const genre of item.genres ?? []) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([genre, count]) => ({ genre, count }));
}

import type { CatalogItem } from './catalog';

export function getMangaSlug(item: Pick<CatalogItem, 'id'>) {
  return item.id.replace(/\s+/g, '-');
}

export function getMangaPath(item: Pick<CatalogItem, 'id'>) {
  return `/manga/${getMangaSlug(item)}/`;
}

export function findItemBySlug(items: CatalogItem[], slug: string) {
  return items.find((item) => getMangaSlug(item) === slug) ?? null;
}

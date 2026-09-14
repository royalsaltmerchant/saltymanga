import { getCatalog } from '../data/catalog';
import { siteConfig } from '../data/site';
import { getMangaPath } from '../data/urls';

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function GET() {
  const catalog = getCatalog();
  const baseUrl = siteConfig.siteUrl.replace(/\/$/, '');
  const lastmod = catalog.generatedAt ? new Date(catalog.generatedAt).toISOString().slice(0, 10) : null;
  const paths = ['/', ...catalog.items.map((item) => getMangaPath(item))];

  const urls = paths
    .map((path) => {
      const loc = `${baseUrl}${path}`;
      return [
        '  <url>',
        `    <loc>${xmlEscape(loc)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
        '  </url>'
      ].filter(Boolean).join('\n');
    })
    .join('\n');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: {
      'content-type': 'application/xml'
    }
  });
}

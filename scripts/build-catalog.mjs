import fs from 'node:fs';
import {
  cleanText,
  initEnv,
  normalizeTitle,
  parseHashtags,
  sleep,
  stripHtml,
  writeJson
} from './_shared.mjs';

initEnv();

const anilistEndpoint = 'https://graphql.anilist.co';
const googleBooksApiKey = cleanText(process.env.GOOGLE_BOOKS_API_KEY);

function buildBookSearchQueries(title) {
  const searchTerms = [
    `"${title}" "volume 1" manga`,
    `"${title}" "vol 1" manga`,
    `"${title}" 1 manga`,
    `"${title}" manga`
  ];

  return searchTerms.map((searchTerm) => {
    const query = new URL('https://www.googleapis.com/books/v1/volumes');
    query.searchParams.set('q', searchTerm);
    query.searchParams.set('printType', 'books');
    query.searchParams.set('orderBy', 'relevance');
    query.searchParams.set('maxResults', '8');
    if (googleBooksApiKey) {
      query.searchParams.set('key', googleBooksApiKey);
    }
    return query;
  });
}

async function fetchJson(url, options = {}, attempt = 0) {
  const response = await fetch(url, options);
  if (response.status === 429 && attempt < 4) {
    const retryAfterSeconds = Number.parseFloat(response.headers.get('retry-after') ?? '0');
    const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.ceil(retryAfterSeconds * 1000)
      : 1500 * (attempt + 1);
    await sleep(waitMs);
    return fetchJson(url, options, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function uniqueTitles(values) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function scoreCandidate(searchTerm, media) {
  const search = normalizeTitle(searchTerm);
  if (!search) {
    return -1;
  }

  const titles = uniqueTitles([media.title?.english, media.title?.romaji, media.title?.native]);
  const normalizedTitles = titles.map((title) => normalizeTitle(title));

  if (normalizedTitles.includes(search)) {
    return 10;
  }

  let score = 0;
  for (const normalized of normalizedTitles) {
    if (!normalized) {
      continue;
    }

    if (normalized.includes(search) || search.includes(normalized)) {
      score = Math.max(score, 8);
    }

    const searchTokens = new Set(search.split(' ').filter(Boolean));
    const candidateTokens = new Set(normalized.split(' ').filter(Boolean));
    const overlap = [...searchTokens].filter((token) => candidateTokens.has(token)).length;
    const tokenScore = overlap / Math.max(searchTokens.size, candidateTokens.size, 1);
    score = Math.max(score, tokenScore * 6);
  }

  return score;
}

async function searchAniListManga(searchTerm) {
  const payload = await fetchJson(anilistEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      query: `
        query ($search: String) {
          Page(page: 1, perPage: 8) {
            media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
              id
              siteUrl
              status
              averageScore
              format
              volumes
              chapters
              description(asHtml: false)
              genres
              title {
                english
                romaji
                native
              }
              coverImage {
                extraLarge
                large
              }
            }
          }
        }
      `,
      variables: {
        search: searchTerm
      }
    })
  });

  return payload.data?.Page?.media ?? [];
}

async function resolveAniListMatch(searchTerm) {
  const results = await searchAniListManga(searchTerm);
  const ranked = results
    .map((media) => ({
      media,
      score: scoreCandidate(searchTerm, media)
    }))
    .sort((left, right) => right.score - left.score);

  if (!ranked[0] || ranked[0].score < 2.5) {
    return null;
  }

  return ranked[0].media;
}

function extractIsbn13(volumeInfo) {
  const identifiers = volumeInfo?.industryIdentifiers ?? [];
  const isbn13 = identifiers.find((entry) => entry?.type === 'ISBN_13')?.identifier ?? null;
  const digits = String(isbn13 ?? '').replace(/\D/g, '');
  return digits.length === 13 ? digits : null;
}

function extractBookshopIsbn13(value) {
  const source = cleanText(value);
  const match = source.match(/\/a\/[^/?#]+\/(\d{13})(?:[/?#]|$)/i) ?? source.match(/\b(\d{13})\b/);
  return match?.[1] ?? null;
}

function normalizeSeriesTitle(value) {
  return normalizeTitle(value)
    .replace(/\b(volume|vol|book|part|manga)\b/g, ' ')
    .replace(/\b(omnibus|deluxe|collector|edition|complete|box|set)\b/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractVolumeNumber(value) {
  const source = String(value ?? '');
  const patterns = [
    /\b(?:vol(?:ume)?|book|part)\.?\s*(\d{1,3})\b/i,
    /\b(\d{1,3})\b(?=\s*(?:$|[:\-]))/
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function scoreGoogleBook(searchTerm, item) {
  const volumeInfo = item?.volumeInfo ?? {};
  const rawTitle = cleanText(volumeInfo.title);
  const rawSubtitle = cleanText(volumeInfo.subtitle);
  const combinedTitle = `${rawTitle} ${rawSubtitle}`.trim();
  const seriesTitle = normalizeSeriesTitle(combinedTitle || rawTitle);
  const search = normalizeSeriesTitle(searchTerm);
  if (!seriesTitle || !search) {
    return -1;
  }

  let score = 0;

  if (seriesTitle === search) {
    score += 10;
  } else if (seriesTitle.includes(search) || search.includes(seriesTitle)) {
    score += 7;
  } else {
    const searchTokens = new Set(search.split(' ').filter(Boolean));
    const titleTokens = new Set(seriesTitle.split(' ').filter(Boolean));
    const overlap = [...searchTokens].filter((token) => titleTokens.has(token)).length;
    score += overlap / Math.max(searchTokens.size, titleTokens.size, 1);
  }

  const volumeNumber = extractVolumeNumber(combinedTitle || rawTitle);
  if (volumeNumber === 1) {
    score += 6;
  } else if (volumeNumber != null) {
    score -= Math.min(volumeNumber, 5);
  }

  const categories = Array.isArray(volumeInfo.categories) ? volumeInfo.categories.join(' ').toLowerCase() : '';
  if (categories.includes('manga') || categories.includes('comics') || categories.includes('graphic novels')) {
    score += 1.5;
  }

  const editionText = `${rawTitle} ${rawSubtitle}`.toLowerCase();
  if (/\b(omnibus|collector|deluxe|complete|box set)\b/.test(editionText)) {
    score -= 3;
  }

  if (extractIsbn13(volumeInfo)) {
    score += 1;
  }

  return score;
}

async function resolveIsbn13(searchTerm) {
  const items = [];

  for (const query of buildBookSearchQueries(searchTerm)) {
    try {
      const payload = await fetchJson(query);
      items.push(...(payload.items ?? []));
    } catch (error) {
      console.warn(`ISBN lookup skipped for "${searchTerm}": ${error instanceof Error ? error.message : error}`);
    }
  }

  const deduped = [...new Map(
    items.map((item) => {
      const volumeInfo = item?.volumeInfo ?? {};
      const key = extractIsbn13(volumeInfo) || `${cleanText(volumeInfo.title)}::${cleanText(volumeInfo.subtitle)}`;
      return [key, item];
    })
  ).values()];

  const matches = deduped
    .map((item) => ({
      item,
      score: scoreGoogleBook(searchTerm, item),
      isbn13: extractIsbn13(item.volumeInfo)
    }))
    .filter((entry) => entry.isbn13 && entry.score >= 7)
    .sort((left, right) => right.score - left.score);

  return matches[0]?.isbn13 ?? null;
}

function pickDisplayTitle(media, fallback) {
  return cleanText(media?.title?.english) || cleanText(media?.title?.romaji) || cleanText(fallback);
}

function normalizeStatus(status) {
  return cleanText(status).replace(/_/g, ' ').toUpperCase() || null;
}

function readExistingCatalog() {
  const catalogPath = new URL('../data/catalog.json', import.meta.url);
  if (!fs.existsSync(catalogPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch (error) {
    console.warn(`Existing catalog cache skipped: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

function indexCatalogItems(items) {
  const index = new Map();

  for (const item of items) {
    for (const candidate of [item?.lookupTitle, item?.title, item?.id]) {
      const normalized = normalizeTitle(candidate);
      if (normalized && !index.has(normalized)) {
        index.set(normalized, item);
      }
    }
  }

  return index;
}

function toCatalogAnilist(media) {
  if (!media) {
    return null;
  }

  return {
    id: media.id,
    url: cleanText(media.siteUrl) || null,
    score: Number.isFinite(media.averageScore) ? media.averageScore : null,
    status: normalizeStatus(media.status),
    format: cleanText(media.format) || null,
    volumes: Number.isFinite(media.volumes) ? media.volumes : null,
    chapters: Number.isFinite(media.chapters) ? media.chapters : null,
    coverImage: cleanText(media.coverImage?.extraLarge) || cleanText(media.coverImage?.large) || null
  };
}

function parseCsv(source) {
  const lines = String(source ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const parseLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      const next = line[index + 1];

      if (character === '"' && inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }

      if (character === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (character === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }

      current += character;
    }

    values.push(current);
    return values.map((value) => cleanText(value));
  };

  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

async function main() {
  const csvPath = new URL('../data/titles.csv', import.meta.url);
  const rowsSource = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf8') : '';
  const rows = parseCsv(rowsSource);
  const existingCatalogIndex = indexCatalogItems(readExistingCatalog());

  const items = [];
  for (const row of rows) {
    const title = cleanText(row.title);
    if (!title) {
      continue;
    }

    const fallbackItem = existingCatalogIndex.get(normalizeTitle(title)) ?? null;
    let anilist = null;
    if (title) {
      try {
        anilist = await resolveAniListMatch(title);
      } catch (error) {
        console.warn(`AniList lookup skipped for "${title}": ${error instanceof Error ? error.message : error}`);
      }
      await sleep(350);
    }

    const manualIsbn13 = cleanText(row.isbn13) || extractBookshopIsbn13(row.bookshop_url);
    const isbn13 = manualIsbn13 || (title ? await resolveIsbn13(title) : null) || fallbackItem?.isbn13 || null;

    const displayTitle = pickDisplayTitle(anilist, cleanText(fallbackItem?.title) || title);
    const catalogAnilist = toCatalogAnilist(anilist) || fallbackItem?.anilist || null;

    items.push({
      id: normalizeTitle(displayTitle),
      lookupTitle: title,
      title: displayTitle,
      description:
        cleanText(stripHtml(anilist?.description)) ||
        cleanText(row.notes) ||
        cleanText(row.caption) ||
        cleanText(fallbackItem?.description) ||
        `${displayTitle} matched from the source CSV.`,
      source: {
        caption: cleanText(row.caption) || cleanText(fallbackItem?.source?.caption) || null,
        url: cleanText(row.source_url) || cleanText(fallbackItem?.source?.url) || null,
        imageUrl:
          cleanText(row.cover_image) ||
          cleanText(anilist?.coverImage?.extraLarge) ||
          cleanText(anilist?.coverImage?.large) ||
          cleanText(fallbackItem?.source?.imageUrl) ||
          cleanText(fallbackItem?.anilist?.coverImage) ||
          null,
        tags: parseHashtags(row.caption).length > 0
          ? parseHashtags(row.caption)
          : Array.isArray(fallbackItem?.source?.tags)
            ? fallbackItem.source.tags
            : []
      },
      anilist: catalogAnilist,
      genres: Array.isArray(anilist?.genres)
        ? anilist.genres.filter(Boolean).slice(0, 4)
        : Array.isArray(fallbackItem?.genres)
          ? fallbackItem.genres
          : [],
      isbn13,
      matchConfidence: anilist ? 'high' : cleanText(fallbackItem?.matchConfidence) || 'low'
    });

    await sleep(200);
  }

  writeJson('data/catalog.json', {
    generatedAt: new Date().toISOString(),
    source: {
      mode: 'csv',
      note: 'Built from data/titles.csv with AniList/ISBN resolution and fallback to the existing catalog when lookups fail.'
    },
    items
  });

  console.log(`Wrote ${items.length} catalog entries to data/catalog.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

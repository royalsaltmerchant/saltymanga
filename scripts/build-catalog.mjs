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

function buildBookSearchQuery(title) {
  const query = new URL('https://www.googleapis.com/books/v1/volumes');
  query.searchParams.set('q', `intitle:${title}`);
  query.searchParams.set('printType', 'books');
  query.searchParams.set('maxResults', '5');
  if (googleBooksApiKey) {
    query.searchParams.set('key', googleBooksApiKey);
  }
  return query;
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

function scoreGoogleBook(searchTerm, item) {
  const title = normalizeTitle(item?.volumeInfo?.title);
  const search = normalizeTitle(searchTerm);
  if (!title || !search) {
    return -1;
  }

  if (title === search) {
    return 10;
  }

  if (title.includes(search) || search.includes(title)) {
    return 8;
  }

  const searchTokens = new Set(search.split(' ').filter(Boolean));
  const titleTokens = new Set(title.split(' ').filter(Boolean));
  const overlap = [...searchTokens].filter((token) => titleTokens.has(token)).length;
  return overlap / Math.max(searchTokens.size, titleTokens.size, 1);
}

async function resolveIsbn13(searchTerm) {
  try {
    const payload = await fetchJson(buildBookSearchQuery(searchTerm));
    const matches = (payload.items ?? [])
      .map((item) => ({
        item,
        score: scoreGoogleBook(searchTerm, item),
        isbn13: extractIsbn13(item.volumeInfo)
      }))
      .filter((entry) => entry.isbn13)
      .sort((left, right) => right.score - left.score);

    return matches[0]?.isbn13 ?? null;
  } catch (error) {
    console.warn(`ISBN lookup skipped for "${searchTerm}": ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

function pickDisplayTitle(media, fallback) {
  return cleanText(media?.title?.english) || cleanText(media?.title?.romaji) || cleanText(fallback);
}

function normalizeStatus(status) {
  return cleanText(status).replace(/_/g, ' ').toUpperCase() || null;
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

  const items = [];
  for (const row of rows) {
    const title = cleanText(row.title);
    if (!title) {
      continue;
    }

    let anilist = null;
    if (title) {
      anilist = await resolveAniListMatch(title);
      await sleep(350);
    }

    const isbn13 = cleanText(row.isbn13) || (title ? await resolveIsbn13(title) : null);

    const displayTitle = pickDisplayTitle(anilist, title);

    items.push({
      id: normalizeTitle(displayTitle),
      lookupTitle: title,
      title: displayTitle,
      description:
        cleanText(stripHtml(anilist?.description)) ||
        cleanText(row.notes) ||
        cleanText(row.caption) ||
        `${displayTitle} matched from the source CSV.`,
      source: {
        caption: cleanText(row.caption) || null,
        url: cleanText(row.source_url) || null,
        imageUrl: cleanText(row.cover_image) || cleanText(anilist?.coverImage?.extraLarge) || cleanText(anilist?.coverImage?.large) || null,
        tags: parseHashtags(row.caption)
      },
      anilist: anilist
        ? {
            id: anilist.id,
            url: cleanText(anilist.siteUrl) || null,
            score: Number.isFinite(anilist.averageScore) ? anilist.averageScore : null,
            status: normalizeStatus(anilist.status),
            format: cleanText(anilist.format) || null,
            volumes: Number.isFinite(anilist.volumes) ? anilist.volumes : null,
            chapters: Number.isFinite(anilist.chapters) ? anilist.chapters : null,
            coverImage: cleanText(anilist.coverImage?.extraLarge) || cleanText(anilist.coverImage?.large) || null
          }
        : null,
      genres: Array.isArray(anilist?.genres) ? anilist.genres.filter(Boolean).slice(0, 4) : [],
      isbn13: isbn13 || null,
      matchConfidence: anilist ? 'high' : 'low'
    });

    await sleep(200);
  }

  writeJson('data/catalog.json', {
    generatedAt: new Date().toISOString(),
    source: {
      mode: 'csv',
      note: 'Built from data/titles.csv, AniList metadata, and ISBN resolution.'
    },
    items
  });

  console.log(`Wrote ${items.length} catalog entries to data/catalog.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

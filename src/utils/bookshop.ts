export function normalizeBookshopAffiliateId(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  const decoded = decodeURIComponent(trimmed).trim();
  const readAffiliateIdFromPath = (path: string) => {
    const segments = path
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const anchorIndex = segments.findIndex((segment) => segment.toLowerCase() === 'a');
    return anchorIndex >= 0 ? segments[anchorIndex + 1] ?? null : null;
  };

  try {
    const candidateUrl = decoded.startsWith('http://') || decoded.startsWith('https://')
      ? new URL(decoded)
      : new URL(`https://${decoded}`);
    const fromUrl = readAffiliateIdFromPath(candidateUrl.pathname);
    if (fromUrl) {
      return fromUrl;
    }
  } catch {
    // Fall through to plain-string parsing for raw ids and partial paths.
  }

  const fromPath = readAffiliateIdFromPath(decoded);
  if (fromPath) {
    return fromPath;
  }

  return decoded.split('/')[0]?.trim() || null;
}

export function normalizeIsbn13(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 13 ? digits : null;
}

export function buildBookshopAffiliateBookUrl(affiliateId: string | null | undefined, isbn13: string | null | undefined) {
  const normalizedAffiliateId = normalizeBookshopAffiliateId(affiliateId);
  const normalizedIsbn13 = normalizeIsbn13(isbn13);

  if (!normalizedAffiliateId || !normalizedIsbn13) {
    return null;
  }

  return `https://bookshop.org/a/${encodeURIComponent(normalizedAffiliateId)}/${normalizedIsbn13}`;
}

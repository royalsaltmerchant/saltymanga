const OPTIMIZABLE_IMAGE_HOSTS = new Set(['s4.anilist.co']);

export function canOptimizeImage(imageUrl: string) {
  try {
    return OPTIMIZABLE_IMAGE_HOSTS.has(new URL(imageUrl).hostname);
  } catch {
    return false;
  }
}

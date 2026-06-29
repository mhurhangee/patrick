/** Trim + default to https:// (keeping mailto:/tel:/ftp:). */
export function normalizeUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('ftp://')) {
    return trimmed;
  }
  if (!trimmed.match(/^https?:\/\//)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

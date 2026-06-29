/** URL normalization + validation for the hyperlink popover. */

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

/** Whether `url` normalizes to a parseable web/mail/tel/ftp link. */
export function isValidUrl(url: string): boolean {
  if (!url.trim()) return false;
  try {
    const parsed = new URL(normalizeUrl(url));
    return ['http:', 'https:', 'mailto:', 'tel:', 'ftp:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

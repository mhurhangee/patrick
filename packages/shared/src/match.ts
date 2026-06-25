// Citation matcher primitives, shared so server-side verification and client-side navigation
// resolve a citation identically — a snippet that verifies on write must locate on click.

const PREFIX_LEN = 90;

/** Lowercase, strip the markdown/patent markers that differ between stored text and the
 *  rendered DOM (`*`, `#`, backtick), and collapse whitespace. */
export function normalizeForMatch(s: string): string {
	return s.toLowerCase().replace(/[*#`]/g, " ").replace(/\s+/g, " ").trim();
}

/** Does the snippet occur in the text (whitespace/markup-insensitive)? Falls back to a prefix
 *  for a long snippet that won't match an extraction exactly (hyphenation / spacing drift). */
export function snippetInText(text: string, snippet: string): boolean {
	const hay = normalizeForMatch(text);
	const t = normalizeForMatch(snippet);
	if (!t) return false;
	if (hay.includes(t)) return true;
	return t.length > PREFIX_LEN && hay.includes(t.slice(0, PREFIX_LEN));
}

/** The file-page from a "leaf N" label (our PDF convention) → 1-based page, else null. */
export function parseLeaf(label: string): number | null {
	const m = /leaf\s*(\d+)/i.exec(label);
	return m ? Number(m[1]) : null;
}

/** A paragraph marker ("[0021]") pulled from a label, normalized for matching the doc text. */
export function paragraphToken(label: string): string | null {
	const m = /\[\s*\d{1,5}\s*\]/.exec(label);
	return m ? m[0].replace(/\s+/g, "") : null;
}

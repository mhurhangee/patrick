// Citation matcher primitives, shared so server-side verification and client-side navigation
// resolve a citation identically — a snippet that verifies on write must locate on click.

/** The length below which a snippet is matched whole; above it, a prefix is also tried (a long
 *  snippet rarely matches a lossy extraction / the rendered DOM exactly). The single source for
 *  the server verifier, the client page-finder, and the DOM highlighter — they must agree. */
export const PREFIX_LEN = 90;

/** Lowercase, strip the markdown/patent markers that differ between stored text and the
 *  rendered DOM (`*`, `#`, backtick), and collapse whitespace. */
export function normalizeForMatch(s: string): string {
	return s.toLowerCase().replace(/[*#`]/g, " ").replace(/\s+/g, " ").trim();
}

/** Is `needle` in an ALREADY-normalized haystack (with the long-snippet prefix fallback)? Use
 *  this when checking many needles against one text — normalize the text once, then call. */
export function normalizedIncludes(normText: string, needle: string): boolean {
	const t = normalizeForMatch(needle);
	if (!t) return false;
	if (normText.includes(t)) return true;
	return t.length > PREFIX_LEN && normText.includes(t.slice(0, PREFIX_LEN));
}

/** Does the snippet occur in the text (whitespace/markup-insensitive, prefix fallback)? */
export function snippetInText(text: string, snippet: string): boolean {
	return normalizedIncludes(normalizeForMatch(text), snippet);
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

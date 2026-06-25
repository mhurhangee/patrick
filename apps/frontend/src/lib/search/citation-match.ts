import { normalizeForMatch, paragraphToken } from "@patrick/shared";

// Resolving a citation to a place in the document — the client side of the matcher. The
// shared primitives (normalize, leaf/paragraph parsing) live in @patrick/shared; page
// derivation here lets a PDF jump to the right page even before its text layer renders (the
// page divs exist with reserved height, so jumpToPage works on an unrendered page).

const PREFIX_LEN = 90;

/** The string to highlight: the snippet locator if present, else the paragraph marker the
 *  label names (so a user-typed "[0021]" still highlights that marker), else nothing. */
export function highlightText(
	snippet: string | undefined,
	label: string,
): string {
	const s = snippet?.trim();
	if (s) return s;
	return paragraphToken(label) ?? "";
}

/** Which page (1-based) a snippet falls on, by matching it against per-page extracted text —
 *  so we can jump there without the page being rendered. Falls back to a prefix for a long
 *  snippet that won't match the page text exactly. Null if not found. */
export function findPage(
	snippet: string,
	pages: { text: string }[],
): number | null {
	const t = normalizeForMatch(snippet);
	if (!t) return null;
	const probes = t.length > PREFIX_LEN ? [t, t.slice(0, PREFIX_LEN)] : [t];
	for (const probe of probes) {
		for (let i = 0; i < pages.length; i++) {
			if (normalizeForMatch(pages[i]?.text ?? "").includes(probe)) return i + 1;
		}
	}
	return null;
}

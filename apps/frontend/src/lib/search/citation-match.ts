import {
	normalizedIncludes,
	normalizeForMatch,
	paragraphToken,
} from "@patrick/shared";

// Resolving a citation to a place in the document — the client side of the matcher. The
// shared primitives (normalize, leaf/paragraph parsing) live in @patrick/shared; page
// derivation here lets a PDF jump to the right page even before its text layer renders (the
// page divs exist with reserved height, so jumpToPage works on an unrendered page).

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

/** Which page (1-based) a locator (a snippet, or a "[0021]" marker) falls on, by matching it
 *  against per-page extracted text — so a PDF can jump there without the page being rendered.
 *  Uses the shared prefix-fallback match. Null if not found. */
export function findPage(
	needle: string,
	pages: { text: string }[],
): number | null {
	if (!needle.trim()) return null;
	for (let i = 0; i < pages.length; i++) {
		if (normalizedIncludes(normalizeForMatch(pages[i]?.text ?? ""), needle))
			return i + 1;
	}
	return null;
}

/** Normalize a string for whitespace/markup-insensitive matching: lowercase, strip the
 *  markdown/patent markers that differ between stored text and the rendered DOM (`*`, `#`,
 *  backtick), and collapse runs of whitespace. Shared by the in-document highlighter and the
 *  citation matcher so a snippet that locates one way locates the other. */
export function normalizeForMatch(s: string): string {
	return s.toLowerCase().replace(/[*#`]/g, " ").replace(/\s+/g, " ").trim();
}

// Literal occurrence search over the raw document text — the "Exact" mode (true
// Ctrl+F): every occurrence of the query, in document order, no model.

export type Occurrence = { id: string; page: number; snippet: string };

const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 80;

/**
 * Find literal occurrences of `query` across the document's pages, in order, up to
 * `limit` (single-character queries on a long doc can match thousands — the cap keeps
 * building + rendering bounded). `truncated` signals there were more.
 */
export function findOccurrences(
	pages: { text: string }[],
	query: string,
	limit = 200,
): { items: Occurrence[]; truncated: boolean } {
	const q = query.trim().toLowerCase();
	if (!q) return { items: [], truncated: false };
	const out: Occurrence[] = [];
	for (let pi = 0; pi < pages.length; pi++) {
		const text = pages[pi]?.text ?? "";
		const lower = text.toLowerCase();
		let from = 0;
		for (;;) {
			if (out.length >= limit) return { items: out, truncated: true };
			const i = lower.indexOf(q, from);
			if (i < 0) break;
			const start = Math.max(0, i - SNIPPET_BEFORE);
			const end = Math.min(text.length, i + q.length + SNIPPET_AFTER);
			const snippet =
				(start > 0 ? "…" : "") +
				text.slice(start, end).replace(/\s+/g, " ").trim() +
				(end < text.length ? "…" : "");
			out.push({ id: `${pi}:${i}`, page: pi + 1, snippet });
			from = i + q.length;
		}
	}
	return { items: out, truncated: false };
}

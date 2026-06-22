// Split document text into retrieval chunks. Patents hand us natural boundaries —
// numbered paragraphs ([0001]) and blank lines — so we chunk on those rather than
// blind fixed windows; over-long paragraphs fall back to sentence-window splits.

export type Chunk = { text: string; page: number; index: number };

const PARA_MARKER = /(\[\d{3,4}\])/g;
const MAX_CHARS = 1500;
const MIN_CHARS = 16;
// Grow each chunk to at least this many chars by merging consecutive paragraphs.
// Fewer chunks ⇒ fewer forward passes (faster indexing) and it folds bare headings
// into the text that follows them (no more heading-only results).
const TARGET_CHARS = 400;

function splitParagraphs(text: string): string[] {
	return (
		text
			// Treat each [0001]-style marker as the start of a fresh paragraph.
			.replace(PARA_MARKER, "\n\n$1")
			.split(/\n\s*\n+/)
			.map((p) => p.replace(/\s+/g, " ").trim())
			.filter((p) => p.length >= MIN_CHARS)
	);
}

function capLength(para: string): string[] {
	if (para.length <= MAX_CHARS) return [para];
	const sentences = para.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [para];
	const out: string[] = [];
	let cur = "";
	for (const s of sentences) {
		if (cur.length + s.length > MAX_CHARS && cur) {
			out.push(cur.trim());
			cur = "";
		}
		cur += s;
	}
	if (cur.trim()) out.push(cur.trim());
	return out;
}

/** Chunk a document's pages into ordered, page-tagged passages. */
export function chunkPages(pages: { text: string }[]): Chunk[] {
	const chunks: Chunk[] = [];
	let buf = "";
	let bufPage = 1;

	const flush = () => {
		const text = buf.trim();
		buf = "";
		if (text.length < MIN_CHARS) return;
		for (const piece of capLength(text)) {
			chunks.push({ text: piece, page: bufPage, index: chunks.length });
		}
	};

	pages.forEach((pg, pi) => {
		for (const para of splitParagraphs(pg.text)) {
			if (!buf) bufPage = pi + 1;
			buf = buf ? `${buf}\n${para}` : para;
			if (buf.length >= TARGET_CHARS) flush();
		}
	});
	flush();
	return chunks;
}

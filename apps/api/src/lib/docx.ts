import JSZip from "jszip";

const W14_NS = "http://schemas.microsoft.com/office/word/2010/wordml";

// 8 hex digits, uppercase — the shape Word uses for w14:paraId / w14:textId.
function newParaId(): string {
	return Math.floor(Math.random() * 0xffffffff)
		.toString(16)
		.toUpperCase()
		.padStart(8, "0");
}

/**
 * Give every paragraph in a .docx a stable Word paragraph id (`w14:paraId`).
 *
 * The editor only generates ids for paragraphs you *create* while editing — it
 * never backfills paragraphs loaded from a .docx that already lacks them. The
 * agent's anchor-by-id tools (`add_comment` / `suggest_change`) then have no
 * stable handle: `read_document` falls back to ordinal `[0],[1]…` indices and
 * the edits fail. Many real-world filings have no `w14:paraId`, so we backfill
 * when minting an editable copy. Idempotent — existing ids are left untouched.
 */
export async function ensureParaIds(bytes: Uint8Array): Promise<Uint8Array> {
	const zip = await JSZip.loadAsync(bytes);
	const entry = zip.file("word/document.xml");
	if (!entry) return bytes; // not a shape we understand — leave it be
	let xml = await entry.async("string");

	if (!/xmlns:w14=/.test(xml)) {
		xml = xml.replace(/<w:document\b/, `<w:document xmlns:w14="${W14_NS}"`);
	}

	// Match only the paragraph element itself: `<w:p` followed by a space, `>` or
	// `/` — the lookahead keeps us off `<w:pPr>`, `<w:pStyle>`, etc.
	let added = 0;
	xml = xml.replace(
		/<w:p(?=[ />])([^>]*?)(\/?)>/g,
		(full, attrs: string, selfClose: string) => {
			if (/\bw14:paraId=/.test(attrs)) return full;
			added++;
			const id = newParaId();
			return `<w:p${attrs} w14:paraId="${id}" w14:textId="${id}"${selfClose}>`;
		},
	);
	if (added === 0) return bytes; // already fully id'd

	zip.file("word/document.xml", xml);
	// DEFLATE to match how Word writes .docx — STORE would bloat the file ~5x.
	return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

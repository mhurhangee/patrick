// A small in-memory BM25 over the chunks. Keyword search is first-class for patents:
// exact technical terms, component names, and reference numerals are where a tiny
// embedder smears and lexical search nails it (e.g. "telephone").

import type { Chunk } from "./chunk";

const K1 = 1.5;
const B = 0.75;

export type Bm25Index = {
	docs: number[][]; // token ids per chunk
	df: Map<number, number>; // doc frequency per token id
	idf: Map<number, number>;
	lengths: number[];
	avgLen: number;
	vocab: Map<string, number>;
	n: number;
};

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 1);
}

export function buildBm25(chunks: Chunk[]): Bm25Index {
	const vocab = new Map<string, number>();
	const docs: number[][] = [];
	const df = new Map<number, number>();
	const lengths: number[] = [];

	for (const c of chunks) {
		const ids: number[] = [];
		const seen = new Set<number>();
		for (const tok of tokenize(c.text)) {
			let id = vocab.get(tok);
			if (id === undefined) {
				id = vocab.size;
				vocab.set(tok, id);
			}
			ids.push(id);
			if (!seen.has(id)) {
				seen.add(id);
				df.set(id, (df.get(id) ?? 0) + 1);
			}
		}
		docs.push(ids);
		lengths.push(ids.length);
	}

	const n = chunks.length;
	const avgLen = lengths.reduce((a, b) => a + b, 0) / (n || 1);
	const idf = new Map<number, number>();
	for (const [id, freq] of df) {
		// BM25 idf with the +1 to keep it non-negative.
		idf.set(id, Math.log(1 + (n - freq + 0.5) / (freq + 0.5)));
	}

	return { docs, df, idf, lengths, avgLen, vocab, n };
}

/** BM25 score per chunk (index-aligned with the chunks the index was built from). */
export function scoreBm25(index: Bm25Index, query: string): number[] {
	const qIds: number[] = [];
	for (const tok of tokenize(query)) {
		const id = index.vocab.get(tok);
		if (id !== undefined) qIds.push(id);
	}
	const scores = new Array<number>(index.n).fill(0);
	if (qIds.length === 0) return scores;

	for (let d = 0; d < index.n; d++) {
		const ids = index.docs[d] ?? [];
		const len = index.lengths[d] ?? 0;
		const tf = new Map<number, number>();
		for (const id of ids) tf.set(id, (tf.get(id) ?? 0) + 1);
		let s = 0;
		for (const qid of qIds) {
			const f = tf.get(qid);
			if (!f) continue;
			const idf = index.idf.get(qid) ?? 0;
			const denom = f + K1 * (1 - B + (B * len) / (index.avgLen || 1));
			s += idf * ((f * (K1 + 1)) / denom);
		}
		scores[d] = s;
	}
	return scores;
}

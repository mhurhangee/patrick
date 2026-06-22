import type { Bm25Index } from "./bm25";
import { scoreBm25 } from "./bm25";
import type { Chunk } from "./chunk";

/** Cosine similarity. Vectors from embed() are normalized, so this is a dot product. */
function cosine(a: Float32Array, b: Float32Array): number {
	let s = 0;
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
	return s;
}

export type SearchHit = Chunk & { score: number };

// Reciprocal-rank-fusion constant. Weighted interpolation edges it out (per the
// paper) but RRF needs no per-corpus tuning — a fine default for v1.
const RRF_K = 60;

/** Rank by index position (best first) → a rank map keyed by chunk index. */
function rankMap(scored: { i: number; s: number }[]): Map<number, number> {
	const ranks = new Map<number, number>();
	scored
		.filter((x) => x.s > 0)
		.sort((a, b) => b.s - a.s)
		.forEach((x, rank) => {
			ranks.set(x.i, rank);
		});
	return ranks;
}

/**
 * Hybrid search: fuse dense (semantic) and BM25 (lexical) rankings with RRF. Dense
 * catches paraphrase ("the vehicle" for "a car"); BM25 catches exact terms a tiny
 * embedder smears ("telephone"). Score is normalized to the top hit for display.
 */
export function hybridRank(
	queryVec: Float32Array,
	query: string,
	chunks: Chunk[],
	vectors: Float32Array[],
	bm25: Bm25Index,
	topK: number,
): SearchHit[] {
	const empty = new Float32Array();
	const denseRanks = rankMap(
		chunks.map((_, i) => ({ i, s: cosine(queryVec, vectors[i] ?? empty) })),
	);
	const lexScores = scoreBm25(bm25, query);
	const lexRanks = rankMap(chunks.map((_, i) => ({ i, s: lexScores[i] ?? 0 })));

	const fused = chunks.map((c, i) => {
		const dr = denseRanks.get(i);
		const lr = lexRanks.get(i);
		let s = 0;
		if (dr !== undefined) s += 1 / (RRF_K + dr);
		if (lr !== undefined) s += 1 / (RRF_K + lr);
		return { ...c, score: s };
	});

	const top = fused
		.filter((c) => c.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, topK);
	const max = top[0]?.score ?? 1;
	return top.map((c) => ({ ...c, score: c.score / max }));
}

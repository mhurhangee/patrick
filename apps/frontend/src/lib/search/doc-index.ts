import type { SearchIndex } from "@patrick/shared";
import { tasksApi } from "@/api/tasks";
import { type Bm25Index, buildBm25 } from "./bm25";
import { type Chunk, chunkPages } from "./chunk";
import { embedPassages, embedQuery } from "./embed";
import { EMBED_MODEL } from "./model";
import { expandNeighbors, hybridRank, type Passage } from "./search";

// The built, queryable index for one document. BM25 is rebuilt from chunks (cheap)
// rather than persisted.
export type DocIndex = {
	chunks: Chunk[];
	vectors: Float32Array[];
	bm25: Bm25Index;
};

// Session cache, keyed by task/filename, so reopening a doc never re-embeds.
// `inflight` dedupes concurrent builds (e.g. StrictMode's double-mount).
const cache = new Map<string, DocIndex>();
const inflight = new Map<string, Promise<DocIndex | null>>();

export const indexKey = (taskId: string, filename: string) =>
	`${taskId}/${filename}`;

// Indexing progress is broadcast per key, so every live subscriber (and the
// genuinely-visible mount after StrictMode's throwaway one) gets updates — the
// build can't tie progress to a single, possibly-cancelled, caller.
const progressListeners = new Map<
	string,
	Set<(done: number, total: number) => void>
>();

/** Subscribe to a doc's cold-build indexing progress. Returns an unsubscribe. */
export function onIndexProgress(
	key: string,
	cb: (done: number, total: number) => void,
): () => void {
	let set = progressListeners.get(key);
	if (!set) {
		set = new Set();
		progressListeners.set(key, set);
	}
	set.add(cb);
	return () => set.delete(cb);
}

function emitProgress(key: string, done: number, total: number): void {
	for (const cb of progressListeners.get(key) ?? []) cb(done, total);
}

function bytesToBase64(bytes: Uint8Array): string {
	let bin = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

function serialize(idx: DocIndex): SearchIndex {
	const dim = idx.vectors[0]?.length ?? 0;
	const flat = new Float32Array(idx.vectors.length * dim);
	idx.vectors.forEach((v, i) => {
		flat.set(v, i * dim);
	});
	return {
		model: EMBED_MODEL,
		dim,
		chunks: idx.chunks.map((c) => ({ text: c.text, page: c.page })),
		vectors: bytesToBase64(new Uint8Array(flat.buffer)),
	};
}

function deserialize(persisted: SearchIndex): DocIndex {
	const chunks: Chunk[] = persisted.chunks.map((c, index) => ({
		text: c.text,
		page: c.page,
		index,
	}));
	const flat = new Float32Array(base64ToBytes(persisted.vectors).buffer);
	const vectors: Float32Array[] = [];
	for (let i = 0; i < flat.length; i += persisted.dim) {
		vectors.push(flat.slice(i, i + persisted.dim));
	}
	return { chunks, vectors, bm25: buildBm25(chunks) };
}

/**
 * Get a document's search index: from the session cache, else the persisted sidecar
 * on disk, else built fresh (chunk + embed) and persisted. Cache and disk hits are
 * instant; a cold build reports progress via onIndexProgress(key).
 */
export function getDocIndex(
	taskId: string,
	filename: string,
	loadPages: () => Promise<{ text: string }[] | null>,
): Promise<DocIndex | null> {
	const key = indexKey(taskId, filename);
	const cached = cache.get(key);
	if (cached) return Promise.resolve(cached);
	const existing = inflight.get(key);
	if (existing) return existing;

	const build = (async (): Promise<DocIndex | null> => {
		const t0 = performance.now();
		// Persisted on disk (built in an earlier session)?
		try {
			const persisted = await tasksApi.searchIndex(taskId, filename);
			if (persisted.model === EMBED_MODEL && persisted.dim > 0) {
				const idx = deserialize(persisted);
				cache.set(key, idx);
				console.log(
					`[search] ${filename}: loaded ${idx.chunks.length} chunks from disk in ${Math.round(performance.now() - t0)}ms`,
				);
				return idx;
			}
		} catch {
			// No usable sidecar — build it below.
		}

		const pages = await loadPages();
		if (!pages || pages.every((p) => !p.text.trim())) return null;
		const chunks = chunkPages(pages);
		if (chunks.length === 0) return null;
		console.log(
			`[search] ${filename}: building index — ${chunks.length} chunks`,
		);
		const vectors = await embedPassages(
			chunks.map((c) => c.text),
			(d, t) => emitProgress(key, d, t),
		);
		const idx: DocIndex = { chunks, vectors, bm25: buildBm25(chunks) };
		cache.set(key, idx);
		console.log(
			`[search] ${filename}: index built in ${Math.round(performance.now() - t0)}ms`,
		);
		// Persist for next time — best-effort, never blocks the result.
		tasksApi.saveSearchIndex(taskId, filename, serialize(idx)).catch(() => {});
		return idx;
	})().finally(() => inflight.delete(key));

	inflight.set(key, build);
	return build;
}

/** Load a document's text for indexing, by type: a PDF's extracted text (null if it
 *  hasn't been extracted yet), or a retrieved .md/.txt's raw content. */
async function loadDocPages(
	taskId: string,
	filename: string,
): Promise<{ text: string }[] | null> {
	const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
	if (ext === ".pdf") {
		try {
			const doc = await tasksApi.extractedText(taskId, filename);
			return doc.pages.map((p) => ({ text: p.text }));
		} catch {
			return null; // not extracted/OCR'd yet
		}
	}
	if (ext === ".md" || ext === ".txt") {
		try {
			const res = await fetch(tasksApi.fileUrl(taskId, filename));
			if (!res.ok) return null;
			return [{ text: await res.text() }];
		} catch {
			return null;
		}
	}
	return null; // docx drafts etc. aren't searchable sources
}

export type SearchOutcome =
	| { ok: true; filename: string; passages: Passage[] }
	| { ok: false; filename: string; reason: "no-text" | "no-results" };

/**
 * Search one document for the agent: indexes it on demand if needed (cache → disk →
 * build), runs hybrid search, and returns the top passages expanded to their
 * neighbours for context. The headline for the search_document tool.
 */
export async function searchDocument(
	taskId: string,
	filename: string,
	query: string,
	topK = 8,
): Promise<SearchOutcome> {
	const idx = await getDocIndex(taskId, filename, () =>
		loadDocPages(taskId, filename),
	);
	if (!idx) return { ok: false, filename, reason: "no-text" };
	const qv = await embedQuery(query);
	const hits = hybridRank(qv, query, idx.chunks, idx.vectors, idx.bm25, topK);
	if (hits.length === 0) return { ok: false, filename, reason: "no-results" };
	return { ok: true, filename, passages: expandNeighbors(hits, idx.chunks) };
}

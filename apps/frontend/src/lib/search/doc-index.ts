import type { SearchIndex } from "@patrick/shared";
import { tasksApi } from "@/api/tasks";
import { type Bm25Index, buildBm25 } from "./bm25";
import { type Chunk, chunkPages } from "./chunk";
import { embedPassages } from "./embed";
import { EMBED_MODEL } from "./model";

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
		// Persisted on disk (built in an earlier session)?
		try {
			const persisted = await tasksApi.searchIndex(taskId, filename);
			if (persisted.model === EMBED_MODEL && persisted.dim > 0) {
				const idx = deserialize(persisted);
				cache.set(key, idx);
				return idx;
			}
		} catch {
			// No usable sidecar — build it below.
		}

		const pages = await loadPages();
		if (!pages || pages.every((p) => !p.text.trim())) return null;
		const chunks = chunkPages(pages);
		if (chunks.length === 0) return null;
		const vectors = await embedPassages(
			chunks.map((c) => c.text),
			(d, t) => emitProgress(key, d, t),
		);
		const idx: DocIndex = { chunks, vectors, bm25: buildBm25(chunks) };
		cache.set(key, idx);
		// Persist for next time — best-effort, never blocks the result.
		tasksApi.saveSearchIndex(taskId, filename, serialize(idx)).catch(() => {});
		return idx;
	})().finally(() => inflight.delete(key));

	inflight.set(key, build);
	return build;
}

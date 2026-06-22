// Main-thread client for the embedding worker. The worker holds the model and does
// the heavy WASM compute; here we just marshal requests and surface progress.

type Pending = {
	resolve: (v: Float32Array[]) => void;
	reject: (e: Error) => void;
	onProgress?: (done: number, total: number) => void;
};

type WorkerMsg =
	| { id: number; type: "progress"; done: number; total: number }
	| { id: number; type: "done"; vectors: number[][] }
	| { id: number; type: "error"; message: string };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
	if (worker) return worker;
	const w = new Worker(new URL("./embed.worker.ts", import.meta.url), {
		type: "module",
	});
	w.onmessage = (e: MessageEvent<WorkerMsg>) => {
		const msg = e.data;
		const p = pending.get(msg.id);
		if (!p) return;
		if (msg.type === "progress") {
			p.onProgress?.(msg.done, msg.total);
		} else if (msg.type === "done") {
			pending.delete(msg.id);
			p.resolve(msg.vectors.map((r) => Float32Array.from(r)));
		} else {
			pending.delete(msg.id);
			p.reject(new Error(msg.message));
		}
	};
	// A fatal worker crash (e.g. a WASM/module load failure) surfaces here, not as a
	// posted message — reject everything in flight and drop the worker so the next
	// call rebuilds it, rather than leaving searches hung forever.
	w.onerror = (e) => {
		const err = new Error(e.message || "embedding worker crashed");
		for (const [id, p] of pending) {
			pending.delete(id);
			p.reject(err);
		}
		worker = null;
	};
	worker = w;
	return w;
}

function run(
	texts: string[],
	isQuery: boolean,
	onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
	const w = getWorker();
	const id = ++seq;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject, onProgress });
		w.postMessage({ id, texts, isQuery });
	});
}

/** Embed document passages (no query prefix). */
export function embedPassages(
	texts: string[],
	onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
	return run(texts, false, onProgress);
}

/** Embed a search query (with the bge instruction prefix). */
export async function embedQuery(text: string): Promise<Float32Array> {
	const [v] = await run([text], true);
	if (!v) throw new Error("query embedding failed");
	return v;
}

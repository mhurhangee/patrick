import {
	env,
	type FeatureExtractionPipeline,
	pipeline,
} from "@huggingface/transformers";

// Embeddings run here, off the main thread, so indexing a long spec never freezes
// the UI (the bug the first spike hit). Mirrors how tesseract OCR runs in a worker.
//
// Prefer the bundled model under /models (populated by scripts/fetch-search-model.mjs)
// so there's no first-use download; fall back to the HF hub if it isn't there, so dev
// never hard-depends on the fetch having run.
env.allowLocalModels = true;
env.allowRemoteModels = true;
env.localModelPath = `${self.location.origin}/models/`;

const MODEL = "Xenova/bge-small-en-v1.5";
// bge is asymmetric: a search query gets an instruction prefix; passages don't.
const QUERY_PREFIX =
	"Represent this sentence for searching relevant passages: ";
const BATCH = 32;

let pipePromise: Promise<FeatureExtractionPipeline> | null = null;
function getPipe(): Promise<FeatureExtractionPipeline> {
	pipePromise ??= pipeline("feature-extraction", MODEL, { dtype: "q8" });
	return pipePromise;
}

type Req = { id: number; texts: string[]; isQuery: boolean };
type Res =
	| { id: number; type: "progress"; done: number; total: number }
	| { id: number; type: "done"; vectors: number[][] }
	| { id: number; type: "error"; message: string };

const post = (msg: Res) => (self as unknown as Worker).postMessage(msg);

self.onmessage = async (e: MessageEvent<Req>) => {
	const { id, texts, isQuery } = e.data;
	try {
		const extractor = await getPipe();
		const input = isQuery ? texts.map((t) => QUERY_PREFIX + t) : texts;
		const vectors: number[][] = [];
		for (let i = 0; i < input.length; i += BATCH) {
			const batch = input.slice(i, i + BATCH);
			const tensor = await extractor(batch, {
				pooling: "mean",
				normalize: true,
			});
			for (const row of tensor.tolist() as number[][]) vectors.push(row);
			post({
				id,
				type: "progress",
				done: Math.min(i + BATCH, input.length),
				total: input.length,
			});
		}
		post({ id, type: "done", vectors });
	} catch (err) {
		post({
			id,
			type: "error",
			message: err instanceof Error ? err.message : "embed failed",
		});
	}
};

// Bundle the search embedding model so there's no first-use download in the app.
// Runs at predev/prebuild: fetches the model files into public/models (gitignored,
// served locally, and bundled into the installer at build). Idempotent, and
// non-fatal — if it can't reach the hub, the app falls back to the CDN at runtime.

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Keep in sync with src/lib/search/model.ts (EMBED_MODEL + RERANK_MODEL).
const MODELS = ["Xenova/bge-small-en-v1.5", "Xenova/ms-marco-MiniLM-L-6-v2"];
const FILES = [
	"config.json",
	"tokenizer.json",
	"tokenizer_config.json",
	"onnx/model_quantized.onnx",
];

const here = dirname(fileURLToPath(import.meta.url));

async function exists(p) {
	try {
		await stat(p);
		return true;
	} catch {
		return false;
	}
}

async function fetchFile(model, rel) {
	const dest = join(here, "..", "public", "models", model, rel);
	if (await exists(dest)) {
		console.log(`[search-model] have ${model}/${rel}`);
		return;
	}
	console.log(`[search-model] fetching ${model}/${rel}…`);
	const res = await fetch(
		`https://huggingface.co/${model}/resolve/main/${rel}`,
	);
	if (!res.ok) throw new Error(`${model}/${rel}: ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	await mkdir(dirname(dest), { recursive: true });
	await writeFile(dest, buf);
	console.log(
		`[search-model] saved ${model}/${rel} (${(buf.length / 1e6).toFixed(1)} MB)`,
	);
}

try {
	for (const model of MODELS) {
		for (const f of FILES) await fetchFile(model, f);
	}
	console.log(`[search-model] ready: ${MODELS.join(", ")}`);
} catch (err) {
	console.warn(
		`[search-model] skipped bundling (${err.message}) — the app will fall back to the CDN at runtime.`,
	);
}

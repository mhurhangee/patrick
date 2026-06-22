// Bundle the search embedding model so there's no first-use download in the app.
// Runs at predev/prebuild: fetches the model files into public/models (gitignored,
// served locally, and bundled into the installer at build). Idempotent, and
// non-fatal — if it can't reach the hub, the app falls back to the CDN at runtime.

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = "Xenova/bge-small-en-v1.5";
const FILES = [
	"config.json",
	"tokenizer.json",
	"tokenizer_config.json",
	"onnx/model_quantized.onnx",
];

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = join(here, "..", "public", "models", MODEL);
const base = `https://huggingface.co/${MODEL}/resolve/main`;

async function exists(p) {
	try {
		await stat(p);
		return true;
	} catch {
		return false;
	}
}

async function fetchFile(rel) {
	const dest = join(outRoot, rel);
	if (await exists(dest)) {
		console.log(`[search-model] have ${rel}`);
		return;
	}
	console.log(`[search-model] fetching ${rel}…`);
	const res = await fetch(`${base}/${rel}`);
	if (!res.ok) throw new Error(`${rel}: ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	await mkdir(dirname(dest), { recursive: true });
	await writeFile(dest, buf);
	console.log(
		`[search-model] saved ${rel} (${(buf.length / 1e6).toFixed(1)} MB)`,
	);
}

try {
	for (const f of FILES) await fetchFile(f);
	console.log(`[search-model] ready: ${MODEL}`);
} catch (err) {
	console.warn(
		`[search-model] skipped bundling (${err.message}) — the app will fall back to the CDN at runtime.`,
	);
}

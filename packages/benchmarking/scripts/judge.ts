// Dev tool: judge the proposals of a single generate run (data/runs/<ts>) and
// print the accept/reject decisions, for inspecting the generator + judge on a
// run without touching the committed dataset. The production path is `build`,
// which generates + judges + saves to data/items.jsonl in one resumable pass.
//
//   pnpm --filter @patrick/benchmarking judge                 # latest run
//   pnpm --filter @patrick/benchmarking judge --run <ts> --judge <id>

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decide, emitItems, judgeOne } from "../src/harness";
import { modelFor, modelId } from "../src/models";
import type { Item, ProposalRecord, SourceSet } from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HYDRATED = join(ROOT, "data", "hydrated");
const RUNS = join(ROOT, "data", "runs");

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};

const setCache = new Map<string, Promise<SourceSet>>();
function loadSet(id: string): Promise<SourceSet> {
	let p = setCache.get(id);
	if (!p) {
		p = readFile(join(HYDRATED, `${id}.json`), "utf8").then(
			(t) => JSON.parse(t) as SourceSet,
		);
		setCache.set(id, p);
	}
	return p;
}

async function latestRun(): Promise<string> {
	const dirs = (await readdir(RUNS, { withFileTypes: true }))
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();
	const last = dirs.at(-1);
	if (!last) throw new Error("no runs in data/runs — generate first");
	return last;
}

async function main(): Promise<void> {
	const run = opt("run") ?? (await latestRun());
	const runDir = join(RUNS, run);
	const records = (await readFile(join(runDir, "proposed.jsonl"), "utf8"))
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as ProposalRecord)
		.filter((r) => r.pair.status === "proposed");

	const model = modelFor("judge", opt("judge"));
	console.log(
		`judge: ${modelId("judge", opt("judge"))} · run ${run} · ${records.length} pairs\n`,
	);

	const items: Item[] = [];
	let accepted = 0;
	let review = 0;
	const tally: Record<string, number> = {};
	let tokens = 0;

	for (const { source_set_id, pair } of records) {
		const set = await loadSet(source_set_id);
		const judged = await judgeOne(model, set, pair);
		tokens += judged.tokens;
		const {
			accept,
			review: toReview,
			reasons,
		} = decide(set, pair, judged.jr, judged.trueSlot);
		if (accept) {
			accepted++;
			items.push(
				...emitItems(set, pair, judged.jr, judged.trueSlot, judged.falseSlot),
			);
			console.log(
				`✓ ${source_set_id} [${pair.framing}/${pair.distortion_used}]`,
			);
		} else {
			if (toReview) review++;
			for (const r of reasons) {
				const k = r.replace(/[^a-z ].*$/i, "").trim() || r;
				tally[k] = (tally[k] ?? 0) + 1;
			}
			console.log(
				`${toReview ? "?" : "✗"} ${source_set_id} [${pair.framing}/${pair.distortion_used}] — ${reasons.join("; ")}`,
			);
		}
	}

	await writeFile(
		join(runDir, "items.jsonl"),
		`${items.map((i) => JSON.stringify(i)).join("\n")}\n`,
	);
	console.log(
		`\n${accepted} accepted (${items.length} items) · ${review} to review · ${records.length - accepted - review} rejected · ~${tokens} tokens`,
	);
	console.log("reject reasons:", tally);
}

main();

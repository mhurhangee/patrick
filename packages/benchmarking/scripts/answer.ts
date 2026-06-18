// Evaluate a system model over the committed dataset (data/items.jsonl): answer
// each item TRUE/FALSE and write its answers to data/evals/<model>/contracts.<arm>.jsonl
// for the scorer. One arm per invocation, so cost is explicit — answer both arms,
// then `score`. The dataset is built once (`build`); cheap system models re-answer
// the same frozen items, so swap the model freely with --model.
//
//   pnpm --filter @patrick/benchmarking answer --arm patrick
//   pnpm --filter @patrick/benchmarking answer --arm web    # general web search
//   pnpm --filter @patrick/benchmarking answer --arm none --model google/gemini-3.1-flash-lite
//   pnpm --filter @patrick/benchmarking answer --arm patrick --repeat 5
//
// Arms: none (memory, the floor) · web (general web search, the realistic
// "without Patrick" baseline) · patrick (verbatim EPO grounding). --repeat N runs
// each item N times so the scorer can report answer reliability (STRATEGY §7).
//
// Flags: --arm none|web|patrick (default patrick) · --repeat N (default 1) ·
//        --limit N · --model <gateway-id>

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { usageLine } from "../src/pricing";
import { localRunner } from "../src/runner";
import type { ContractRecord, Item } from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ITEMS = join(ROOT, "data", "items.jsonl");
const EVALS = join(ROOT, "data", "evals");

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};

const slug = (s: string): string => s.replace(/[^\w.-]+/g, "_");

async function main(): Promise<void> {
	const arm = (opt("arm") ?? "patrick") as "none" | "web" | "patrick";
	const limit = Number(opt("limit") ?? "0") || Number.POSITIVE_INFINITY;
	const repeat = Math.max(1, Number(opt("repeat") ?? "1") || 1);

	const items = (await readFile(ITEMS, "utf8").catch(() => ""))
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as Item)
		.slice(0, limit);
	if (items.length === 0)
		throw new Error("no items in data/items.jsonl — run `build` first");

	const runner = localRunner({ tools: arm, modelOverride: opt("model") });
	const outDir = join(EVALS, slug(runner.modelId));
	await mkdir(outDir, { recursive: true });
	console.log(
		`${runner.id} · ${items.length} items${repeat > 1 ? ` ×${repeat}` : ""}\n`,
	);

	const label = new Map(items.map((i) => [i.id, i.label]));
	const records: ContractRecord[] = [];
	let errors = 0;
	for (const item of items) {
		const answers: string[] = [];
		for (let k = 0; k < repeat; k++) {
			try {
				const contract = await runner.run(item);
				records.push({ item_id: item.id, contract });
				answers.push(contract.answer);
			} catch (err) {
				errors++;
				console.warn(
					`! ${item.id} error: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
		const ok = answers.filter((a) => a === item.label).length;
		const flips = new Set(answers).size > 1;
		console.log(
			`${ok === answers.length ? "✓" : ok === 0 ? "✗" : "~"} ${item.id} → ${answers.join("/")}${flips ? " (flips!)" : ""}`,
		);
	}

	await writeFile(
		join(outDir, `contracts.${arm}.jsonl`),
		`${records.map((r) => JSON.stringify(r)).join("\n")}\n`,
	);
	const correct = records.filter(
		(r) => r.contract.answer === label.get(r.item_id),
	).length;
	const expected = items.length * repeat;
	// Per-run tally (not the modal accuracy `score` reports); flag dropped runs so
	// a partial run can't quietly shrink the scoring denominator.
	console.log(
		`\n${correct}/${records.length} runs correct · tokens: ${usageLine(runner.modelId, runner.usage.input, runner.usage.output)}`,
	);
	if (records.length < expected)
		console.warn(
			`⚠ ${errors} runs errored — ${records.length}/${expected} contracts written; missing items won't be scored.`,
		);
	console.log(`→ data/evals/${slug(runner.modelId)}/contracts.${arm}.jsonl`);
}

main();

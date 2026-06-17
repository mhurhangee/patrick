// Run the system under test over a run's accepted items and write its answers to
// contracts.<arm>.jsonl, for the scorer. One arm per invocation, so cost is
// explicit — run both, then `score` for the grounding-lift delta.
//
//   pnpm --filter @patrick/benchmarking run --arm patrick      # grounded
//   pnpm --filter @patrick/benchmarking run --arm none         # baseline
//   pnpm --filter @patrick/benchmarking run --arm patrick --run <ts> --limit 10
//
// Flags: --arm none|patrick (default patrick) · --run <ts> · --limit N · --model <id>

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localRunner } from "../src/runner";
import type { ContractRecord, Item } from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNS = join(ROOT, "data", "runs");

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};

async function latestRun(): Promise<string> {
	const dirs = (await readdir(RUNS, { withFileTypes: true }))
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();
	const last = dirs.at(-1);
	if (!last) throw new Error("no runs in data/runs");
	return last;
}

async function main(): Promise<void> {
	const arm = (opt("arm") ?? "patrick") as "none" | "patrick";
	const run = opt("run") ?? (await latestRun());
	const runDir = join(RUNS, run);
	const limit = Number(opt("limit") ?? "0") || Number.POSITIVE_INFINITY;

	const items = (await readFile(join(runDir, "items.jsonl"), "utf8"))
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as Item)
		.slice(0, limit);
	if (items.length === 0)
		throw new Error(`no items in ${run} — judge it first`);

	const runner = localRunner({ tools: arm, modelOverride: opt("model") });
	console.log(`${runner.id} · run ${run} · ${items.length} items\n`);

	const records: ContractRecord[] = [];
	let correct = 0;
	for (const item of items) {
		try {
			const contract = await runner.run(item);
			records.push({ item_id: item.id, contract });
			const ok = contract.answer === item.label;
			if (ok) correct++;
			console.log(
				`${ok ? "✓" : "✗"} ${item.id} → ${contract.answer} · cite[${contract.cited_provisions.length}] retr[${contract.retrieved_provisions.length}]`,
			);
		} catch (err) {
			console.warn(
				`! ${item.id} error: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	await writeFile(
		join(runDir, `contracts.${arm}.jsonl`),
		`${records.map((r) => JSON.stringify(r)).join("\n")}\n`,
	);
	console.log(
		`\n${correct}/${records.length} correct · → data/runs/${run}/contracts.${arm}.jsonl`,
	);
}

main();

// Score a run and write the readable report (STRATEGY §7–8). Reads the run's
// accepted items.jsonl and the per-arm contracts.<arm>.jsonl the runner produced,
// scores each item, and renders a markdown report per arm. When both arms are
// present it also writes the headline: the grounding lift (tools vs no tools).
//
//   pnpm --filter @patrick/benchmarking score              # latest run, both arms
//   pnpm --filter @patrick/benchmarking score --run <ts>

import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	buildReport,
	compareReports,
	renderReport,
	type Scored,
	scoreItem,
} from "../src/score";
import type { Contract, ContractRecord, Item } from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNS = join(ROOT, "data", "runs");

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};

const ARMS = { none: "baseline", patrick: "patrick" } as const;
type Arm = keyof typeof ARMS;

const exists = (p: string): Promise<boolean> =>
	access(p).then(
		() => true,
		() => false,
	);

const readJsonl = async <T>(path: string): Promise<T[]> =>
	(await readFile(path, "utf8"))
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as T);

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
	const run = opt("run") ?? (await latestRun());
	const runDir = join(RUNS, run);

	const items = new Map(
		(await readJsonl<Item>(join(runDir, "items.jsonl"))).map((i) => [i.id, i]),
	);
	if (items.size === 0) throw new Error(`no items in ${run} — judge it first`);

	const reports: Partial<Record<Arm, ReturnType<typeof buildReport>>> = {};
	for (const arm of Object.keys(ARMS) as Arm[]) {
		const file = join(runDir, `contracts.${arm}.jsonl`);
		if (!(await exists(file))) continue;
		// Group all runs of each item (the answer script appends one record per run).
		const byItem = new Map<string, Contract[]>();
		for (const rec of await readJsonl<ContractRecord>(file)) {
			const arr = byItem.get(rec.item_id) ?? [];
			arr.push(rec.contract);
			byItem.set(rec.item_id, arr);
		}
		const rows: Scored[] = [];
		for (const [id, item] of items) {
			const contracts = byItem.get(id);
			if (contracts?.length)
				rows.push({ item, contracts, score: scoreItem(item, contracts) });
		}
		const report = buildReport(ARMS[arm], rows);
		reports[arm] = report;
		const md = renderReport(report, rows);
		await writeFile(join(runDir, `report.${arm}.md`), `${md}\n`);
		console.log(`\n${md}\n`);
	}

	if (reports.none && reports.patrick) {
		const md = compareReports(reports.none, reports.patrick);
		await writeFile(join(runDir, "comparison.md"), `${md}\n`);
		console.log(`\n${md}\n`);
	}
	console.log(`→ data/runs/${run}/report.*.md`);
}

main();

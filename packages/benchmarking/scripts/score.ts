// Score a model's evaluation and write the readable report (STRATEGY §7–8). Reads
// the committed dataset (data/items.jsonl) and a model's per-arm contracts under
// data/evals/<model>/, scores each item, and renders a markdown report per arm.
// With both arms present it writes the headline: the grounding lift.
//
//   pnpm --filter @patrick/benchmarking score                       # the only/sole eval
//   pnpm --filter @patrick/benchmarking score --model google/gemini-3.1-flash-lite

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
const ITEMS = join(ROOT, "data", "items.jsonl");
const EVALS = join(ROOT, "data", "evals");

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};
const slug = (s: string): string => s.replace(/[^\w.-]+/g, "_");

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

/** The eval dir: --model's slug, or the sole dir under data/evals. */
async function evalDir(): Promise<string> {
	const model = opt("model");
	if (model) return slug(model);
	const dirs = (await readdir(EVALS, { withFileTypes: true }))
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
	if (dirs.length === 1 && dirs[0]) return dirs[0];
	throw new Error(
		`pass --model — evals present: ${dirs.join(", ") || "(none; run answer first)"}`,
	);
}

async function main(): Promise<void> {
	const dir = join(EVALS, await evalDir());
	const items = new Map((await readJsonl<Item>(ITEMS)).map((i) => [i.id, i]));

	const reports: Partial<Record<Arm, ReturnType<typeof buildReport>>> = {};
	const coveredByArm: Partial<Record<Arm, Set<string>>> = {};
	for (const arm of Object.keys(ARMS) as Arm[]) {
		const file = join(dir, `contracts.${arm}.jsonl`);
		if (!(await exists(file))) continue;
		// Group all runs of each item (answer appends one record per run).
		const byItem = new Map<string, Contract[]>();
		for (const rec of await readJsonl<ContractRecord>(file)) {
			const arr = byItem.get(rec.item_id) ?? [];
			arr.push(rec.contract);
			byItem.set(rec.item_id, arr);
		}
		// Loud signals that the eval is stale/partial, rather than silently scoring
		// a subset: contracts whose item isn't in the dataset (rebuilt ids), and
		// dataset items with no contracts (a partial answer run).
		const orphans = [...byItem.keys()].filter((id) => !items.has(id));
		if (orphans.length)
			console.warn(
				`⚠ ${ARMS[arm]}: ${orphans.length} contracts for items not in the dataset (stale eval? rebuild changed ids) — ignored.`,
			);
		const rows: Scored[] = [];
		for (const [id, item] of items) {
			const contracts = byItem.get(id);
			if (contracts?.length)
				rows.push({ item, contracts, score: scoreItem(item, contracts) });
		}
		if (rows.length < items.size)
			console.warn(
				`⚠ ${ARMS[arm]}: scored ${rows.length}/${items.size} dataset items (the rest have no contracts).`,
			);
		coveredByArm[arm] = new Set(rows.map((r) => r.item.id));
		const report = buildReport(ARMS[arm], rows);
		reports[arm] = report;
		const md = renderReport(report, rows);
		await writeFile(join(dir, `report.${arm}.md`), `${md}\n`);
		console.log(`\n${md}\n`);
	}

	if (reports.none && reports.patrick) {
		const a = coveredByArm.none ?? new Set();
		const b = coveredByArm.patrick ?? new Set();
		const sameItems = a.size === b.size && [...a].every((id) => b.has(id));
		if (!sameItems)
			console.warn(
				"⚠ the two arms scored DIFFERENT item sets — the lift delta isn't a clean paired comparison.",
			);
		const md = compareReports(reports.none, reports.patrick);
		await writeFile(join(dir, "comparison.md"), `${md}\n`);
		console.log(`\n${md}\n`);
	}
	console.log(`→ ${dir}/report.*.md`);
}

main();

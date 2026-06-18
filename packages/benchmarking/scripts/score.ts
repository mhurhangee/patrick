// Score a model's evaluation and write the readable report (STRATEGY §7–8). Reads
// the committed dataset (data/items.jsonl) and a model's per-arm contracts under
// data/evals/<model>/, scores each item, and renders a markdown report per arm.
// With both arms present it writes the headline: the grounding lift.
//
//   pnpm --filter @patrick/benchmarking score                       # the only/sole eval
//   pnpm --filter @patrick/benchmarking score --model google/gemini-3.1-flash-lite
//   pnpm --filter @patrick/benchmarking score --set 2026-f          # a dev-loop slice
//
// --set <prefix> scores only items whose source_set_id starts with it (match the
// same slice answer ran); the published report is the whole dataset.

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

const ARMS = { none: "baseline", web: "web", patrick: "patrick" } as const;
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
	const set = opt("set");
	// Slice reports get a tagged filename so a dev-loop run doesn't clobber the
	// full-dataset report.<arm>.md.
	const tag = set ? `${set}.` : "";
	const allItems = await readJsonl<Item>(ITEMS);
	// Orphan detection (below) tests against every id; scoring runs on the slice.
	const allIds = new Set(allItems.map((i) => i.id));
	const items = new Map(
		allItems
			.filter((i) => !set || i.source_set_id.startsWith(set))
			.map((i) => [i.id, i]),
	);

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
		const orphans = [...byItem.keys()].filter((id) => !allIds.has(id));
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
		await writeFile(join(dir, `report.${tag}${arm}.md`), `${md}\n`);
		console.log(`\n${md}\n`);
	}

	// Patrick vs each baseline arm present (vs memory, and the headline: vs web).
	const patrick = reports.patrick;
	if (patrick) {
		for (const base of ["none", "web"] as const) {
			const baseReport = reports[base];
			if (!baseReport) continue;
			const a = coveredByArm[base] ?? new Set();
			const b = coveredByArm.patrick ?? new Set();
			const sameItems = a.size === b.size && [...a].every((id) => b.has(id));
			if (!sameItems)
				console.warn(
					`⚠ patrick and ${ARMS[base]} scored DIFFERENT item sets — the lift delta isn't a clean paired comparison.`,
				);
			const md = compareReports(baseReport, patrick);
			await writeFile(join(dir, `comparison.${tag}${base}.md`), `${md}\n`);
			console.log(`\n${md}\n`);
		}
	}
	console.log(`→ ${dir}/report.${tag}*.md`);
}

main();

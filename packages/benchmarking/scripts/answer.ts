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
// Resumable: appends per run and tops up each item to --repeat total, so a later
// run after adding items (e.g. 2026-f) only answers the new ones, --repeat 3 after
// a --repeat 1 run does 2 more (not 3), and an errored run is retried next time.
//
// Flags: --arm none|web|patrick (default patrick) · --repeat N (default 1) ·
//        --limit N · --model <gateway-id> · --web-searches N (web arm, Anthropic;
//        default 2 — caps searches/item, the web cost lever ~$0.01 each)

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

	const runner = localRunner({
		tools: arm,
		modelOverride: opt("model"),
		webMaxUses: Number(opt("web-searches") ?? "2") || 2,
	});
	const outDir = join(EVALS, slug(runner.modelId));
	await mkdir(outDir, { recursive: true });
	const contractsFile = join(outDir, `contracts.${arm}.jsonl`);

	// Resume: count runs already recorded per item, so we only top up to `repeat`.
	const existing = new Map<string, number>();
	for (const l of (await readFile(contractsFile, "utf8").catch(() => ""))
		.split("\n")
		.filter(Boolean)) {
		const id = (JSON.parse(l) as ContractRecord).item_id;
		existing.set(id, (existing.get(id) ?? 0) + 1);
	}
	console.log(
		`${runner.id} · ${items.length} items → ${repeat} run(s) each${existing.size ? " (resuming)" : ""}\n`,
	);

	let done = 0;
	let correct = 0;
	let errors = 0;
	let skipped = 0;
	for (const item of items) {
		const need = repeat - (existing.get(item.id) ?? 0);
		if (need <= 0) {
			skipped++;
			continue;
		}
		const answers: string[] = [];
		for (let k = 0; k < need; k++) {
			try {
				const contract = await runner.run(item);
				// Append per run so a crash keeps finished work and resume sees it.
				await appendFile(
					contractsFile,
					`${JSON.stringify({ item_id: item.id, contract } satisfies ContractRecord)}\n`,
				);
				answers.push(contract.answer);
				done++;
				if (contract.answer === item.label) correct++;
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
			`${ok === answers.length ? "✓" : ok === 0 ? "✗" : "~"} ${item.id} → ${answers.join("/") || "—"}${flips ? " (flips!)" : ""}`,
		);
	}

	// Raw tokens are a usage signal (e.g. find_law TOC size); $ cost is monitored on
	// the Gateway dashboard, not estimated here.
	const tok = (n: number): string => n.toLocaleString("en-US");
	console.log(
		`\n${done} new runs (${correct} correct) · ${skipped} items already at ${repeat} · tokens: ${tok(runner.usage.input)} in · ${tok(runner.usage.output)} out`,
	);
	const ts = runner.toolStats;
	if (Object.keys(ts.calls).length) {
		const calls = Object.entries(ts.calls)
			.map(([k, v]) => `${k}×${v}`)
			.join(" · ");
		const scopes = Object.entries(ts.findLawScopes)
			.map(([k, v]) => `${k}×${v}`)
			.join(", ");
		console.log(
			`tools: ${calls}${scopes ? ` · find_law scopes: ${scopes}` : ""}`,
		);
	}
	if (errors)
		console.warn(
			`⚠ ${errors} runs errored — they'll be retried (topped up) on the next answer.`,
		);
	console.log(`→ data/evals/${slug(runner.modelId)}/contracts.${arm}.jsonl`);
}

main();

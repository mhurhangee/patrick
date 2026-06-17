// Build the committed, reproducible dataset: generate → judge → save, in one
// resumable pass. For each (source set × framing × distortion) not already in the
// dataset, propose a pair and judge it blind; on accept, append the two items; on
// failure, retry up to --retries times, then log it. Generation + judging use the
// good (expensive) models and happen ONCE — the cheap system-models then answer
// the same frozen items. Re-runnable: already-built pairs and known failures are
// skipped unless --force.
//
//   pnpm --filter @patrick/benchmarking build                       # all sets, auto
//   pnpm --filter @patrick/benchmarking build --framing both --distortion auto
//   pnpm --filter @patrick/benchmarking build --paper 2026-f --retries 3
//
// Flags: --framing atomic|scenario|both · --distortion auto|all|<key> ·
//        --retries N (default 3) · --paper <prefix> · --id <id> · --limit N ·
//        --force (rebuild pairs already done) · --generator <id> · --judge <id>

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	decide,
	emitItems,
	judgeOne,
	pairId,
	proposeOne,
} from "../src/harness";
import { modelFor, modelId } from "../src/models";
import { DISTORTION_KEYS } from "../src/taxonomy";
import type { Framing, Item, SourceSet } from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HYDRATED = join(ROOT, "data", "hydrated");
const ITEMS = join(ROOT, "data", "items.jsonl");
const FAILURES = join(ROOT, "data", "failures.jsonl");

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string): string | undefined => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : fallback;
};
const has = (name: string): boolean => args.includes(`--${name}`);

interface FailureRecord {
	pair_id: string;
	source_set_id: string;
	framing: Framing;
	distortion: string;
	attempts: number;
	reasons: string[];
}

const readJsonl = async <T>(path: string): Promise<T[]> =>
	readFile(path, "utf8").then(
		(t) =>
			t
				.split("\n")
				.filter(Boolean)
				.map((l) => JSON.parse(l) as T),
		() => [],
	);

async function loadSets(): Promise<SourceSet[]> {
	const idFilter = opt("id");
	const paperFilter = opt("paper");
	const limit = Number(opt("limit", "0")) || Number.POSITIVE_INFINITY;
	const files = (await readdir(HYDRATED))
		.filter((f) => f.endsWith(".json"))
		.sort();
	const sets = await Promise.all(
		files.map(
			async (f) =>
				JSON.parse(await readFile(join(HYDRATED, f), "utf8")) as SourceSet,
		),
	);
	const selected = idFilter
		? sets.filter((s) => s.id === idFilter)
		: paperFilter
			? sets.filter((s) => s.id.startsWith(paperFilter))
			: sets;
	return selected.slice(0, limit);
}

async function main(): Promise<void> {
	const framingArg = opt("framing", "atomic") as string;
	const framings: Framing[] =
		framingArg === "both" ? ["atomic", "scenario"] : [framingArg as Framing];
	const distortionArg = opt("distortion", "auto") as string;
	const retries = Math.max(1, Number(opt("retries", "3")) || 3);
	const force = has("force");

	const genModel = modelFor("generator", opt("generator"));
	const judgeModel = modelFor("judge", opt("judge"));
	const sets = await loadSets();

	// Resume: skip pairs already accepted or already logged as failures.
	const items = await readJsonl<Item>(ITEMS);
	const failures = await readJsonl<FailureRecord>(FAILURES);
	const done = new Set<string>([
		...items.map((i) => i.pair_id),
		...(force ? [] : failures.map((f) => f.pair_id)),
	]);

	console.log(
		`build · gen ${modelId("generator", opt("generator"))} · judge ${modelId("judge", opt("judge"))} · ${sets.length} sets · framings [${framings.join(", ")}]\n`,
	);

	const newItems: Item[] = [];
	const newFailures: FailureRecord[] = [];
	let built = 0;
	let failed = 0;
	let skipped = 0;
	let tokens = 0;

	for (const set of sets) {
		for (const framing of framings) {
			const distortions =
				distortionArg === "all" ? [...DISTORTION_KEYS] : [distortionArg];
			for (const distortion of distortions) {
				// Probe the pair id with the requested distortion; for "auto" we can't
				// know it until generation, so we attempt and dedup on the result.
				const probeId =
					distortion === "auto" ? null : `${set.id}-${framing}-${distortion}`;
				if (probeId && done.has(probeId)) {
					skipped++;
					continue;
				}

				const reasons: string[] = [];
				let accepted = false;
				for (let attempt = 1; attempt <= retries && !accepted; attempt++) {
					try {
						const { pair, tokens: gt } = await proposeOne(
							genModel,
							set,
							framing,
							distortion,
						);
						tokens += gt;
						if (pair.status !== "proposed") {
							reasons.push(`gen rejected: ${pair.rejection_reason ?? ""}`);
							continue;
						}
						const id = pairId(set.id, pair);
						if (done.has(id) || newItems.some((i) => i.pair_id === id)) {
							skipped++;
							accepted = true; // already have this exact pair
							break;
						}
						const judged = await judgeOne(judgeModel, set, pair);
						tokens += judged.tokens;
						const decision = decide(set, pair, judged.jr, judged.trueSlot);
						if (decision.accept) {
							newItems.push(
								...emitItems(
									set,
									pair,
									judged.jr,
									judged.trueSlot,
									judged.falseSlot,
								),
							);
							done.add(id);
							built++;
							accepted = true;
							console.log(`✓ ${id}`);
						} else {
							reasons.push(...decision.reasons);
						}
					} catch (err) {
						reasons.push(err instanceof Error ? err.message : String(err));
					}
				}
				if (!accepted) {
					failed++;
					newFailures.push({
						pair_id: probeId ?? `${set.id}-${framing}-auto`,
						source_set_id: set.id,
						framing,
						distortion,
						attempts: retries,
						reasons,
					});
					console.log(
						`✗ ${set.id} [${framing}/${distortion}] — ${reasons.slice(-2).join("; ")}`,
					);
				}
			}
		}
	}

	if (newItems.length)
		await writeFile(
			ITEMS,
			[...items, ...newItems].map((i) => JSON.stringify(i)).join("\n") + "\n",
		);
	if (newFailures.length)
		await writeFile(
			FAILURES,
			[...failures, ...newFailures].map((f) => JSON.stringify(f)).join("\n") +
				"\n",
		);

	console.log(
		`\n${built} pairs built (${newItems.length} items) · ${failed} failed · ${skipped} skipped · ~${tokens} tokens`,
	);
	console.log(
		`dataset: ${items.length + newItems.length} items in data/items.jsonl`,
	);
}

main();

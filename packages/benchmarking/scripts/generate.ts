// Generate true/false proposals from the hydrated source sets (STRATEGY §4) — one
// per (source set × distortion) — and write them to data/runs/<ts>/proposed.jsonl
// for the judge stage. Start small and eyeball the output; scale once the
// generator → judge → harness loop is clean.
//
//   pnpm --filter @patrick/benchmarking generate                    # 5 sets, auto distortion
//   pnpm --filter @patrick/benchmarking generate --paper 2026-f --limit 3
//   pnpm --filter @patrick/benchmarking generate --id 2026-f-q7-1 --distortion all
//
// Flags: --limit N · --framing atomic|scenario · --distortion auto|all|<key>
//        --id <id> · --paper <id-prefix> · --model <gateway-id>

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject } from "ai";
import { modelFor, modelId } from "../src/models";
import {
	GENERATOR_SYSTEM,
	generatorInput,
	proposedPairSchema,
} from "../src/prompts/generator";
import { DISTORTION_KEYS } from "../src/taxonomy";
import type {
	Framing,
	ProposalRecord,
	ProposedPair,
	SourceSet,
} from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HYDRATED = join(ROOT, "data", "hydrated");
const RUNS = join(ROOT, "data", "runs");

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string): string | undefined => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : fallback;
};

const limit = Number(opt("limit", "5"));
const framing = opt("framing", "atomic") as Framing;
const distortion = opt("distortion", "auto") as string;
const idFilter = opt("id");
const paperFilter = opt("paper");
const modelOverride = opt("model");

async function loadSets(): Promise<SourceSet[]> {
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
	const sets = await loadSets();
	const distortions =
		distortion === "all" ? [...DISTORTION_KEYS] : [distortion];
	const model = modelFor("generator", modelOverride);
	console.log(
		`generator: ${modelId("generator", modelOverride)} · ${sets.length} sets × ${distortions.length} distortion(s) · framing=${framing}\n`,
	);

	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const outDir = join(RUNS, ts);
	await mkdir(outDir, { recursive: true });

	const lines: string[] = [];
	let proposed = 0;
	let rejected = 0;
	let tokens = 0;
	for (const set of sets) {
		for (const d of distortions) {
			try {
				const { object, usage } = await generateObject({
					model,
					schema: proposedPairSchema,
					system: GENERATOR_SYSTEM,
					prompt: generatorInput(set, framing, d),
				});
				tokens += usage?.totalTokens ?? 0;
				const pair: ProposedPair = {
					...object,
					jurisdiction: set.jurisdiction,
					topic: set.topic,
					framing,
				};
				const record: ProposalRecord = {
					source_set_id: set.id,
					requested_distortion: d,
					pair,
				};
				lines.push(JSON.stringify(record));
				if (object.status === "proposed") {
					proposed++;
					console.log(
						`✓ ${set.id} [${object.distortion_used}]  T: ${object.true_statement.slice(0, 88)}`,
					);
				} else {
					rejected++;
					console.log(
						`✗ ${set.id} [${d}] rejected: ${(object.rejection_reason ?? "").slice(0, 80)}`,
					);
				}
			} catch (err) {
				console.warn(
					`! ${set.id} [${d}] error: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	await writeFile(join(outDir, "proposed.jsonl"), `${lines.join("\n")}\n`);
	console.log(
		`\n${proposed} proposed · ${rejected} rejected · ~${tokens} tokens → data/runs/${ts}/proposed.jsonl`,
	);
}

main();

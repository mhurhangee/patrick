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

import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	decide,
	emitItems,
	type Judged,
	judgeOne,
	pairId,
	proposeOne,
} from "../src/harness";
import { modelFor, modelId } from "../src/models";
import { DISTORTION_KEYS } from "../src/taxonomy";
import type { Framing, Item, ProposedPair, SourceSet } from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HYDRATED = join(ROOT, "data", "hydrated");
const ITEMS = join(ROOT, "data", "items.jsonl");
const FAILURES = join(ROOT, "data", "failures.jsonl");
const RUNS = join(ROOT, "data", "runs");

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

// A missing file is empty (first run); a parse error on an EXISTING file throws
// loudly BEFORE any paid call, so a truncated/corrupt dataset can't be silently
// read as empty and trigger a full (re-paid) rebuild.
async function readJsonl<T>(path: string): Promise<T[]> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw e;
	}
	return text
		.split("\n")
		.filter(Boolean)
		.map((l, i) => {
			try {
				return JSON.parse(l) as T;
			} catch {
				throw new Error(
					`${path}: invalid JSON on line ${i + 1} — refusing to rebuild`,
				);
			}
		});
}

const appendJsonl = (path: string, rows: object[]): Promise<void> =>
	appendFile(path, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);

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
	// "auto" picks its distortion at generation time, so it can't be deduped by
	// pair id before the call — skip a set+framing that already produced anything,
	// so re-running build to extend doesn't re-pay generation for done sets.
	const doneSetFraming = new Set<string>([
		...items.map((i) => `${i.source_set_id}|${i.framing}`),
		...(force ? [] : failures.map((f) => `${f.source_set_id}|${f.framing}`)),
	]);

	// Full reasoning trail for the deep dive: every proposal + blind-judge verdict +
	// decision, accepted or not. data/runs/ is gitignored (a dev artifact).
	const auditDir = join(RUNS, new Date().toISOString().replace(/[:.]/g, "-"));
	await mkdir(auditDir, { recursive: true });
	const AUDIT = join(auditDir, "build-audit.jsonl");

	console.log(
		`build · gen ${modelId("generator", opt("generator"))} · judge ${modelId("judge", opt("judge"))} · ${sets.length} sets · framings [${framings.join(", ")}]\n`,
	);

	let built = 0;
	let failed = 0;
	let transient = 0;
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
				if (
					distortion === "auto" &&
					doneSetFraming.has(`${set.id}|${framing}`)
				) {
					skipped++;
					continue;
				}

				const reasons: string[] = [];
				let accepted = false;
				let sawDecision = false; // a real content verdict, vs only transient errors
				let lastPair: ProposedPair | undefined;
				let lastJudged: Judged | undefined;
				for (let attempt = 1; attempt <= retries && !accepted; attempt++) {
					try {
						const { pair, tokens: gt } = await proposeOne(
							genModel,
							set,
							framing,
							distortion,
						);
						tokens += gt;
						lastPair = pair;
						if (pair.status !== "proposed") {
							sawDecision = true;
							reasons.push(`gen rejected: ${pair.rejection_reason ?? ""}`);
							continue;
						}
						const id = pairId(set.id, pair);
						if (done.has(id)) {
							// Paid for generation, but we already have this exact pair.
							skipped++;
							accepted = true;
							console.log(`· ${id} already built — skipping judge`);
							break;
						}
						const judged = await judgeOne(judgeModel, set, pair);
						tokens += judged.tokens;
						lastJudged = judged;
						const decision = decide(set, pair, judged.jr, judged.trueSlot);
						sawDecision = true;
						if (decision.accept) {
							// Persist immediately so a crash can't lose paid work.
							await appendJsonl(
								ITEMS,
								emitItems(
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
				if (!accepted && sawDecision) {
					// A genuine content rejection — persist so it's skipped next run.
					failed++;
					await appendJsonl(FAILURES, [
						{
							pair_id: probeId ?? `${set.id}-${framing}-auto`,
							source_set_id: set.id,
							framing,
							distortion,
							attempts: retries,
							reasons,
						} satisfies FailureRecord,
					]);
					console.log(
						`✗ ${set.id} [${framing}/${distortion}] — ${reasons.slice(-2).join("; ")}`,
					);
				} else if (!accepted) {
					// Only transient errors (network/gateway) — DON'T persist as a failure,
					// so it's retried next run instead of skipped forever.
					transient++;
					console.warn(
						`~ ${set.id} [${framing}/${distortion}] transient, not persisted — ${reasons.at(-1) ?? ""}`,
					);
				}
				// Audit: the proposal + blind verdict + decision for this target.
				const outcome = accepted
					? lastJudged
						? "accepted"
						: "skipped"
					: sawDecision
						? "rejected"
						: "transient";
				await appendJsonl(AUDIT, [
					{
						source_set_id: set.id,
						framing,
						distortion,
						outcome,
						reasons,
						proposal: lastPair ?? null,
						judge: lastJudged
							? { ...lastJudged.jr, trueSlot: lastJudged.trueSlot }
							: null,
					},
				]);
			}
		}
	}

	console.log(
		`\n${built} pairs built (${built * 2} items) · ${failed} failed · ${transient} transient · ${skipped} skipped · ~${tokens} tokens`,
	);
	console.log(`dataset: ${items.length + built * 2} items in data/items.jsonl`);
}

main();

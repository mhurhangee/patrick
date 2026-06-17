// Judge a run's proposals (STRATEGY §5) and accept/reject them (§6). For each
// proposed pair: shuffle the two statements into A/B, ask a DIFFERENT model to
// verdict them blind, then apply the accept/reject rules in plain code (never a
// model). Accepted pairs emit one scorable item per statement.
//
//   pnpm --filter @patrick/benchmarking judge                 # latest run
//   pnpm --filter @patrick/benchmarking judge --run <ts> --model openai/gpt-5.5
//
// Rules (all must hold to accept): verdicts are exactly {TRUE, FALSE}; the single
// distortion the judge sees matches the one the generator applied; the judge's
// cited basis is within the gold and the source set; and the statement the judge
// called TRUE is the generator's true one. A judge/generator disagreement on which
// is true, or a needs_date_check item (no date calculator yet), routes to review.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCitation } from "@patrick/law";
import { generateObject } from "ai";
import type { z } from "zod";
import { modelFor, modelId } from "../src/models";
import {
	JUDGE_SYSTEM,
	judgeInput,
	judgeResultSchema,
} from "../src/prompts/judge";
import type { Item, ProposalRecord, SourceSet } from "../src/types";

type JudgeOutput = z.infer<typeof judgeResultSchema>;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HYDRATED = join(ROOT, "data", "hydrated");
const RUNS = join(ROOT, "data", "runs");

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};

/** Canonical citation keys (so "R. 40(1)" and "Rule 40(3)" both fold to R40). */
function keys(citations: string[]): Set<string> {
	const out = new Set<string>();
	for (const c of citations) {
		const key = resolveCitation(c)?.entry.citationKey;
		if (key) out.add(key);
	}
	return out;
}

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

	const model = modelFor("judge", opt("model"));
	console.log(
		`judge: ${modelId("judge", opt("model"))} · run ${run} · ${records.length} pairs\n`,
	);

	const judged: string[] = [];
	const items: Item[] = [];
	let accepted = 0;
	let review = 0;
	const rejectReasons: string[] = [];
	let tokens = 0;

	for (const { source_set_id, pair } of records) {
		const set = await loadSet(source_set_id);
		// Shuffle: put the generator's TRUE statement in a random slot, unlabelled.
		const trueIsA = Math.random() < 0.5;
		const aText = trueIsA ? pair.true_statement : pair.false_statement;
		const bText = trueIsA ? pair.false_statement : pair.true_statement;
		const trueSlot = trueIsA ? "A" : "B";
		const falseSlot = trueIsA ? "B" : "A";

		let jr: JudgeOutput;
		try {
			const res = await generateObject({
				model,
				schema: judgeResultSchema,
				system: JUDGE_SYSTEM,
				prompt: judgeInput(set, pair.scenario, aText, bText),
			});
			jr = res.object;
			tokens += res.usage?.totalTokens ?? 0;
		} catch (err) {
			console.warn(
				`! ${source_set_id} judge error: ${err instanceof Error ? err.message : String(err)}`,
			);
			continue;
		}

		// Deterministic accept/reject — never a model.
		const verdicts = [jr.A.verdict, jr.B.verdict];
		const oneEach =
			verdicts.includes("TRUE") &&
			verdicts.includes("FALSE") &&
			!verdicts.includes("UNVERIFIABLE");
		const judgeKeys = keys(jr.citation_relied_on);
		const goldKeys = keys(pair.gold.citations);
		const setKeys = keys(set.provisions.map((p) => p.citation));
		const citationOk =
			judgeKeys.size > 0 &&
			[...judgeKeys].every((k) => goldKeys.has(k) && setKeys.has(k));

		const reasons: string[] = [];
		let toReview = false;
		if (!oneEach) reasons.push(`verdicts ${verdicts.join("/")}`);
		else if (jr[trueSlot].verdict !== "TRUE") {
			reasons.push("judge disagrees which is true");
			toReview = true;
		}
		if (jr.distortion === "multiple" || jr.distortion === "none")
			reasons.push(`distortion=${jr.distortion}`);
		else if (jr.distortion !== pair.distortion_used)
			reasons.push(`distortion ${jr.distortion}≠${pair.distortion_used}`);
		if (!citationOk) reasons.push("citation basis off");
		if (pair.needs_date_check) {
			reasons.push("needs date check");
			toReview = true;
		}
		const accept = reasons.length === 0;

		judged.push(
			JSON.stringify({
				source_set_id,
				distortion: pair.distortion_used,
				order: { A: aText, B: bText, trueSlot },
				judge: jr,
				decision: { accept, review: toReview, reasons },
			}),
		);

		if (accept) {
			accepted++;
			const pairId = `${source_set_id}-${pair.distortion_used}`;
			const common = {
				pair_id: pairId,
				source_set_id,
				jurisdiction: set.jurisdiction,
				topic: set.topic,
				law_date: set.law_date,
				framing: pair.framing,
				scenario: pair.scenario,
				gold_citations: pair.gold.citations,
				distortion: pair.distortion_used,
				provenance: "synthetic-v1",
			} satisfies Partial<Item>;
			items.push({
				...common,
				id: `${pairId}-T`,
				statement: pair.true_statement,
				label: "TRUE",
				judge_deciding_span: jr[trueSlot].deciding_span,
			});
			items.push({
				...common,
				id: `${pairId}-F`,
				statement: pair.false_statement,
				label: "FALSE",
				judge_deciding_span: jr[falseSlot].deciding_span,
			});
			console.log(`✓ ${source_set_id} [${pair.distortion_used}]`);
		} else {
			if (toReview) review++;
			rejectReasons.push(...reasons);
			console.log(
				`${toReview ? "?" : "✗"} ${source_set_id} [${pair.distortion_used}] — ${reasons.join("; ")}`,
			);
		}
	}

	await writeFile(join(runDir, "judged.jsonl"), `${judged.join("\n")}\n`);
	await writeFile(
		join(runDir, "items.jsonl"),
		`${items.map((i) => JSON.stringify(i)).join("\n")}\n`,
	);
	const tally = rejectReasons.reduce<Record<string, number>>((m, r) => {
		const k = r.replace(/[^a-z ].*$/i, "").trim() || r;
		m[k] = (m[k] ?? 0) + 1;
		return m;
	}, {});
	console.log(
		`\n${accepted} accepted (${items.length} items) · ${review} to review · ${records.length - accepted - review} rejected · ~${tokens} tokens`,
	);
	console.log(`reject reasons:`, tally);
	console.log(`→ data/runs/${run}/items.jsonl · judged.jsonl`);
}

main();

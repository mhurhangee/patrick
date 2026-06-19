// The shared generate→judge→decide→emit steps, used by both the dataset builder
// (build.ts) and the dev inspect tools (generate.ts / judge.ts). The accept/reject
// is plain code — never a model (STRATEGY §6).

import { generateObject, type LanguageModel } from "ai";
import type { z } from "zod";
import { citationKeys } from "./citations";
import {
	GENERATOR_SYSTEM,
	generatorInput,
	proposedPairSchema,
} from "./prompts/generator";
import { JUDGE_SYSTEM, judgeInput, judgeResultSchema } from "./prompts/judge";
import type { DistortionKey } from "./taxonomy";
import type { Framing, Item, ProposedPair, SourceSet } from "./types";

export type JudgeOutput = z.infer<typeof judgeResultSchema>;

/** Propose one T/F pair from a source set (generator model). */
export async function proposeOne(
	model: LanguageModel,
	set: SourceSet,
	framing: Framing,
	distortion: string,
): Promise<{ pair: ProposedPair; tokens: number }> {
	const { object, usage } = await generateObject({
		model,
		schema: proposedPairSchema,
		system: GENERATOR_SYSTEM,
		prompt: generatorInput(set, framing, distortion),
	});
	return {
		pair: {
			...object,
			jurisdiction: set.jurisdiction,
			topic: set.topic,
			framing,
		},
		tokens: usage?.totalTokens ?? 0,
	};
}

export interface Judged {
	jr: JudgeOutput;
	trueSlot: "A" | "B";
	falseSlot: "A" | "B";
	aText: string;
	bText: string;
	tokens: number;
}

/** Judge a pair blind: shuffle into A/B, ask the judge model to verdict (it never
 *  learns which is meant to be true), return the verdicts + which slot held truth. */
export async function judgeOne(
	model: LanguageModel,
	set: SourceSet,
	pair: ProposedPair,
): Promise<Judged> {
	const trueIsA = Math.random() < 0.5;
	const aText = trueIsA ? pair.true_statement : pair.false_statement;
	const bText = trueIsA ? pair.false_statement : pair.true_statement;
	const { object, usage } = await generateObject({
		model,
		schema: judgeResultSchema,
		system: JUDGE_SYSTEM,
		prompt: judgeInput(set, pair.scenario, aText, bText),
	});
	return {
		jr: object,
		trueSlot: trueIsA ? "A" : "B",
		falseSlot: trueIsA ? "B" : "A",
		aText,
		bText,
		tokens: usage?.totalTokens ?? 0,
	};
}

export interface Decision {
	accept: boolean;
	review: boolean;
	reasons: string[];
}

/** The §6 accept/reject rules, applied in plain code. */
export function decide(
	set: SourceSet,
	pair: ProposedPair,
	jr: JudgeOutput,
	trueSlot: "A" | "B",
): Decision {
	const verdicts = [jr.A.verdict, jr.B.verdict];
	const oneEach =
		verdicts.includes("TRUE") &&
		verdicts.includes("FALSE") &&
		!verdicts.includes("UNVERIFIABLE");
	// The judge must ground its verdict in the PROVIDED law (anti-hallucination),
	// but may cite any provision in the source set — including a sibling that
	// elaborates the gold (e.g. the Guidelines for a gold Article). It needn't hit
	// the exact gold; gold is the scoring target, separate from the judge's basis.
	const judgeKeys = citationKeys(jr.citation_relied_on);
	const setKeys = citationKeys(set.provisions.map((p) => p.citation));
	const citationOk =
		judgeKeys.size > 0 && [...judgeKeys].every((k) => setKeys.has(k));

	const reasons: string[] = [];
	let review = false;
	if (!oneEach) reasons.push(`verdicts ${verdicts.join("/")}`);
	else if (jr[trueSlot].verdict !== "TRUE") {
		reasons.push("judge disagrees which is true");
		review = true;
	}
	// Accept any SINGLE clean distortion. The judge's blind label may differ from
	// the generator's requested one (both often defensible — e.g. modal vs scope);
	// we keep the judge's as the item's distortion rather than gate on agreement.
	if (jr.distortion === "multiple" || jr.distortion === "none")
		reasons.push(`distortion=${jr.distortion}`);
	if (!citationOk) reasons.push("citation basis off");
	if (pair.needs_date_check) {
		reasons.push("needs date check");
		review = true;
	}
	return { accept: reasons.length === 0, review, reasons };
}

/** The stable pair id for a (source set, framing, distortion) — also the dedup key. */
export function pairId(setId: string, pair: ProposedPair): string {
	return `${setId}-${pair.framing}-${pair.distortion_used}`;
}

/** On accept, emit one scorable item per statement. */
export function emitItems(
	set: SourceSet,
	pair: ProposedPair,
	jr: JudgeOutput,
	trueSlot: "A" | "B",
	falseSlot: "A" | "B",
): Item[] {
	// The id keeps the generator's requested distortion (a stable handle, computed
	// pre-judge for dedup); the analysed `distortion` is the judge's blind label
	// (post-accept it's a single key, never multiple/none).
	const id = pairId(set.id, pair);
	const common = {
		pair_id: id,
		source_set_id: set.id,
		jurisdiction: set.jurisdiction,
		topic: set.topic,
		law_date: set.law_date,
		framing: pair.framing,
		scenario: pair.scenario,
		gold_citations: pair.gold.citations,
		distortion: jr.distortion as DistortionKey,
		provenance: "synthetic-v1",
	} satisfies Partial<Item>;
	return [
		{
			...common,
			id: `${id}-T`,
			statement: pair.true_statement,
			label: "TRUE",
			judge_deciding_span: jr[trueSlot].deciding_span,
		},
		{
			...common,
			id: `${id}-F`,
			statement: pair.false_statement,
			label: "FALSE",
			judge_deciding_span: jr[falseSlot].deciding_span,
		},
	];
}

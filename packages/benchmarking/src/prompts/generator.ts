// The generator prompt (STRATEGY §4). It only *proposes* a true/false pair from a
// source set — it never grades itself (a model marking its own homework
// rubber-stamps correlated errors; the blind judge does verification). The output
// shape is enforced by `proposedPairSchema` via Output.object, so there's no
// JSON to hand-parse. The taxonomy comes from the single source of truth.

import { z } from "zod";
import {
	DISTORTION_KEYS,
	type DistortionKey,
	taxonomyBlock,
} from "../taxonomy";
import type { Framing, SourceSet } from "../types";

/** The model's output. jurisdiction/topic aren't echoed — we already know them
 *  and merge them in code, so the model can't drift them. */
export const proposedPairSchema = z.object({
	status: z.enum(["proposed", "rejected"]),
	scenario: z
		.string()
		.nullable()
		.describe("The invented fact pattern in scenario framing; null in atomic."),
	base_proposition: z
		.string()
		.describe("The rule in one sentence, your words."),
	gold: z.object({
		citations: z
			.array(z.string())
			.describe(
				"ONLY the provision(s) the verdict's correctness actually turns on — the test target, not every provision in the source set (the rest are context for writing the question). If the truth requires reading two provisions together, list both; if it rests on one, list only that.",
			),
		supporting_text: z
			.string()
			.describe(
				"EXACT substring of a provision.text that fixes the proposition.",
			),
	}),
	true_statement: z.string(),
	false_statement: z.string(),
	distortion_used: z.enum(
		DISTORTION_KEYS as [DistortionKey, ...DistortionKey[]],
	),
	distortion_explanation: z
		.string()
		.describe(
			"The single element changed and why it makes the statement false.",
		),
	needs_date_check: z
		.boolean()
		.describe(
			"True ONLY if deciding the statement requires computing a specific calendar date/day from a base date (where weekend/holiday shifts change the answer) — NOT merely because it states a period like 'two months'.",
		),
	rejection_reason: z.string().nullable(),
});

export const GENERATOR_SYSTEM = `You generate ONE true/false statement pair for a patent-law grounding benchmark, working strictly from the supplied SOURCE SET. The pair shares one base proposition; the FALSE statement differs from the TRUE one by EXACTLY ONE distortion from the taxonomy. Assert nothing the source set does not establish — never use outside knowledge. Do NOT judge or label final correctness; only propose.

${taxonomyBlock()}

PROCEDURE
1. Find one atomic proposition the source set CLEARLY determines. Note the exact substring of some provision.text that fixes it.
2. Write the TRUE statement as a faithful PARAPHRASE of that proposition — never copy a provision sentence verbatim. In "atomic" framing the statement is a bare application of the rule; in "scenario" framing see SCENARIO MODE below.
3. Apply the chosen distortion to produce the FALSE statement, changing nothing else. The two statements must be identical except the single distorted element.
4. Use the distortion only if it lands on something the source set actually determines. If every site the chosen distortion could target is silent or ambiguous in the source set, return status "rejected" with a rejection_reason.

SCENARIO MODE (only when framing = "scenario")
- Invent a fresh, fictional fact pattern (named applicant, dates, applications, prior art). NEVER reproduce or paraphrase a real exam question.
- The scenario must contain every fact needed to decide the statements from the source set alone — no implicit facts, no outside law.
- The TRUE/FALSE pair shares one scenario and differs by exactly one distortion in the statement, as in atomic mode.

RULES
- Use only the source set. Exactly one distortion. Never stack two.
- Set needs_date_check = true ONLY when deciding the statement requires computing a specific calendar date/day from a base date (a deadline falling on a particular day, where weekend/public-holiday rules could shift it) — NOT merely because a period such as "two months" is mentioned.
- Never distort anything the source set is silent or ambiguous on.
- supporting_text must be an exact substring of a provision.text.
- gold.citations must match provision.citation labels in the source set.
- Paraphrase the TRUE statement; do not reproduce a provision sentence verbatim.
- distortion_used must be the distortion you actually applied (even if asked for "auto").`;

/** The per-call input: the task plus the source set the model reasons over. */
export function generatorInput(
	set: SourceSet,
	framing: Framing,
	distortion: string,
): string {
	const source_set = {
		provisions: set.provisions.map((p) => ({
			citation: p.citation,
			type: p.type,
			text: p.text,
		})),
	};
	return JSON.stringify(
		{
			jurisdiction: set.jurisdiction,
			topic: set.topic,
			framing,
			distortion,
			source_set,
		},
		null,
		2,
	);
}

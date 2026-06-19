// The blind judge (STRATEGY §5). A DIFFERENT model from the generator, it sees the
// two statements unlabelled and in randomised order (the harness shuffles), never
// told which is meant to be true. It derives each verdict from the source-set text
// and quotes the deciding span, so the call is auditable. The accept/reject
// decision is NOT made here — that's deterministic code in scripts/judge.ts.

import { z } from "zod";
import { DISTORTION_KEYS, taxonomyBlock } from "../taxonomy";
import type { SourceSet } from "../types";

const verdict = z.enum(["TRUE", "FALSE", "UNVERIFIABLE"]);
const statement = z.object({
	verdict,
	deciding_span: z
		.string()
		.describe(
			"EXACT substring of a provision.text that settles the verdict; empty if UNVERIFIABLE.",
		),
	why: z.string().describe("One sentence."),
});

export const judgeResultSchema = z.object({
	A: statement,
	B: statement,
	changed_element: z.object({ in_A: z.string(), in_B: z.string() }),
	// Taxonomy keys (from the single source of truth) plus the two judge-only
	// outcomes. Cast through unknown — z.enum wants a tuple, the spread yields a list.
	distortion: z.enum([...DISTORTION_KEYS, "multiple", "none"] as unknown as [
		string,
		...string[],
	]),
	citation_relied_on: z
		.array(z.string())
		.describe("The provision.citation(s) the correct verdict rests on."),
});

export const JUDGE_SYSTEM = `You are an independent verifier for a patent-law benchmark. You are given a SOURCE SET and two statements, A and B, in unknown order. You do NOT know which is intended to be true or false. Judge each statement ONLY against the source set text (and the scenario facts, if a scenario is given); use no outside knowledge. Derive each verdict from the text — quote the deciding language, do not guess.

${taxonomyBlock()}

FOR EACH STATEMENT decide:
- verdict:
    TRUE         if the source set entails it;
    FALSE        if the source set contradicts it;
    UNVERIFIABLE if the source set does not determine it.
- A statement with correct substance but the WRONG cited basis is FALSE (the asserted basis is wrong).
- deciding_span: the EXACT substring of a provision.text that settles the verdict (empty string if UNVERIFIABLE).

THEN compare A and B:
- changed_element: quote the differing part of each statement.
- distortion: classify that single difference as one taxonomy key, or "multiple" if more than one element changed, or "none" if equivalent in meaning.
- citation_relied_on: the provision.citation(s) the correct verdict rests on.

Output only what these fields call for; do not add prose.`;

/** The per-call input: the source set, the (optional) scenario, and the two
 *  statements in the order the harness chose. */
export function judgeInput(
	set: SourceSet,
	scenario: string | null,
	statementA: string,
	statementB: string,
): string {
	const source_set = {
		provisions: set.provisions.map((p) => ({
			citation: p.citation,
			type: p.type,
			text: p.text,
		})),
	};
	return JSON.stringify(
		{ source_set, scenario, statement_A: statementA, statement_B: statementB },
		null,
		2,
	);
}

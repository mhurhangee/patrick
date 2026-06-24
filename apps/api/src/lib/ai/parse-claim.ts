import { type ClaimLimitation, docKind, type Provider } from "@patrick/shared";
import { generateObject } from "ai";
import { z } from "zod";
import { pinnedSourcesMessage } from "./chat";
import { createModel } from "./model";

// Parse the requested claim(s) into limitations and construe each in light of the
// description (Art 69 EPC + Protocol), in one pass. See CLAIM-CHARTING.md.
//
// DRAFT PROMPT — the splitting granularity and the construction approach are legally
// load-bearing and meant for the attorney to tune.
const SYSTEM = `You parse patent claims into their limitations for a claim chart, for a European patent attorney, and construe each limitation.

SPLIT each requested claim into its constituent limitations:
- Split at the natural clause boundaries a practitioner would use (the preamble, then each element/step). Feature-analysis granularity: not so coarse that one limitation bundles several distinct features, not so fine that a single feature is fragmented.
- Label by claim: claim 1 → 1a, 1b, 1c …; claim 2 → 2a, 2b …. Keep them in claim order.
- The limitation text MUST be VERBATIM from the claim — transcribe exactly, never paraphrase, summarise or correct. Use "[…]" only to elide a long enumerated list.

CONSTRUE each limitation. Produce a SELF-CONTAINED construction: a standalone statement of what the limitation means, usable by a downstream system that will NOT have the description (it compares the construction against prior art for novelty). So do NOT refer to the description in the construction text itself (no "as described in [0021]") — bake the result in.
- Construe through the eyes of the person skilled in the art, reading the limitation in light of the description (Art 69 EPC + Protocol), then write a standalone statement.
- Start from the ORDINARY meaning of the key term(s). Override it ONLY where the description requires: (a) lexicography — the patentee defined the term, so bake the definition in; (b) disclaimer/disavowal — scope was narrowed or surrendered, so bake the limit in.
- Resolve internal references ("said housing", "the first member") by restating what they refer to, so the construction does not dangle.
- State scope-defining terms explicitly (e.g. "comprising" is open-ended; a numerical term's stated range or tolerance).
- Do NOT invent scope. If the description is silent, default to ordinary meaning. Leave the construction empty only if no term in the limitation needs construing.
- constructionBasis: a short pointer to where in the description the construction is supported (paragraph numbers / figures), so the attorney can check it. Empty if it rests on ordinary meaning alone.

Work only from the documents' actual text. Parse ONLY the claims specified — do not include others.`;

const schema = z.object({
	limitations: z
		.array(
			z.object({
				id: z.string().describe("Label, e.g. '1a' (claim number + letter)."),
				text: z.string().describe("Verbatim claim text for this limitation."),
				construction: z
					.string()
					.describe(
						"A self-contained construction of the key term(s); empty if none needs construing.",
					),
				constructionBasis: z
					.string()
					.describe(
						"Where in the description the construction is supported (paragraphs / figures); empty if ordinary meaning.",
					),
			}),
		)
		.describe("The limitations across the requested claims, in claim order."),
});

/** Parse + construe the requested claim(s) into limitations (each with a stable uid).
 *  `claims` is a spec like "1", "1-3", "1, 4" or "all independent". `constructionSupport`
 *  (optional) is a description doc to construe in light of (Art 69) when the claims doc
 *  doesn't itself carry the description (e.g. amended claims). */
export async function parseClaimSpine(
	folder: string,
	filename: string,
	ai: { provider: Provider; apiKey: string; model: string },
	claims: string,
	constructionSupport: string | undefined,
): Promise<ClaimLimitation[] | null> {
	const sources = [{ filename, kind: docKind(filename) }];
	if (constructionSupport && constructionSupport !== filename)
		sources.push({
			filename: constructionSupport,
			kind: docKind(constructionSupport),
		});
	const content = await pinnedSourcesMessage(folder, sources);
	// Header-only ⇒ the source couldn't be read; don't invent a claim.
	if (
		!content ||
		!Array.isArray(content.content) ||
		content.content.length <= 1
	)
		return null;

	const supportNote =
		constructionSupport && constructionSupport !== filename
			? " A separate description/specification document is also provided above — construe the claims in light of it."
			: "";
	const { object } = await generateObject({
		model: createModel(ai.provider, ai.apiKey, ai.model),
		schema,
		system: SYSTEM,
		messages: [
			{
				role: "user",
				content: `Parse exactly these claim(s): ${claims}. Interpret the spec literally — "1" means claim 1 only; "1-3" means claims 1, 2 and 3; "1, 4" means claims 1 and 4; "all independent" means every independent claim; "all" means every claim. Do not parse any claim not specified.${supportNote}`,
			},
			content,
		],
	});

	return object.limitations.map((l) => ({
		uid: crypto.randomUUID(),
		label: l.id,
		text: l.text,
		construction: l.construction,
		constructionBasis: l.constructionBasis || undefined,
	}));
}

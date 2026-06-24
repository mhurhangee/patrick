import { type ClaimLimitation, docKind, type Provider } from "@patrick/shared";
import { generateObject } from "ai";
import { z } from "zod";
import { pinnedSourcesMessage } from "./chat";
import { createModel } from "./model";

// Parse the requested claim(s) into limitations, construed in light of the description
// (Art 69 EPC + Protocol). One read covers all requested claims. See CLAIM-CHARTING.md.
//
// DRAFT PROMPT — the splitting granularity and the construction approach are legally
// load-bearing and meant for the attorney to tune.
const SYSTEM = `You parse patent claims into their limitations for a claim chart, for a European patent attorney.

From the attorney's document(s), find the requested claim(s) and break each into its constituent limitations:
- Split at the natural clause boundaries a practitioner would use (the preamble, then each element/step). Granularity = feature analysis: not so coarse that one limitation bundles several distinct features, not so fine that a single feature is fragmented.
- Label them by claim: claim 1 → 1a, 1b, 1c …; claim 2 → 2a, 2b …. Keep them in claim order.
- The limitation text MUST be VERBATIM from the claim — transcribe exactly, never paraphrase, summarise or correct. Where a long enumerated list is elided in the claim, you may use "[…]".
- Construe each limitation in light of the DESCRIPTION (Art 69 EPC and its Protocol on Interpretation): the description and drawings inform the scope of the claim terms — do NOT construe from the literal wording of the claims in isolation. Give a short construction of any key term(s) whose scope matters; leave empty if nothing needs construing.

Work only from the documents' actual text. Return no limitations for a claim that isn't present.`;

const schema = z.object({
	limitations: z
		.array(
			z.object({
				id: z.string().describe("Label, e.g. '1a' (claim number + letter)."),
				text: z.string().describe("Verbatim claim text for this limitation."),
				construction: z
					.string()
					.describe(
						"Construction of key term(s) read in light of the description; empty if none.",
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
				content: `Parse the following claim(s) into limitations: ${claims}.${supportNote}`,
			},
			content,
		],
	});

	return object.limitations.map((l) => ({
		uid: crypto.randomUUID(),
		label: l.id,
		text: l.text,
		construction: l.construction,
	}));
}

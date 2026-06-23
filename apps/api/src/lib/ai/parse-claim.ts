import { type ClaimLimitation, docKind, type Provider } from "@patrick/shared";
import { generateObject } from "ai";
import { z } from "zod";
import { pinnedSourcesMessage } from "./chat";
import { createModel } from "./model";

// Nodes 0–1 of the claim-charting pipeline: parse a claim into limitations and
// propose a construction, in one pass over the source document (which carries both
// the claims and the spec). The result is a *proposed* spine — the attorney edits
// and locks it at the HITL gate before any cell is built. See CLAIM-CHARTING.md.
//
// DRAFT PROMPT — the claim-splitting granularity and the construction approach are
// legally load-bearing and meant for the attorney to tune.
const SYSTEM = `You parse a patent claim into its limitations for a claim chart, for a European patent attorney.

From the attorney's document, find the requested independent claim and break it into its constituent limitations:
- Split at the natural clause boundaries a practitioner would use (the preamble, then each element/step). Keep splits at the granularity used in feature analysis — not so coarse that one limitation bundles several distinct features, not so fine that a single feature is fragmented.
- Label them 1a, 1b, 1c … in order (use the claim number, so claim 2 → 2a, 2b …).
- The limitation text MUST be VERBATIM from the claim — transcribe exactly, never paraphrase, summarise, or correct.
- For each limitation, propose a short construction of any key term(s) whose scope matters, read in light of the specification. If nothing in the limitation needs construing, leave the construction empty.

Work only from the document's actual text. If the requested claim isn't present, return no limitations.`;

const schema = z.object({
	claimNumber: z
		.string()
		.describe("The claim number parsed (echo back what was found, e.g. '1')."),
	limitations: z
		.array(
			z.object({
				id: z.string().describe("Stable label, e.g. '1a'."),
				text: z.string().describe("Verbatim claim text for this limitation."),
				construction: z
					.string()
					.describe("Proposed construction of key term(s); empty if none."),
			}),
		)
		.describe(
			"The limitations in claim order. Empty if the claim isn't found.",
		),
});

export type ParsedSpine = {
	claimNumber: string;
	limitations: ClaimLimitation[];
};

/** Parse + construe one claim from a source document into a proposed spine. */
export async function parseClaimSpine(
	folder: string,
	filename: string,
	ai: { provider: Provider; apiKey: string; model: string },
	claim: string,
): Promise<ParsedSpine | null> {
	const content = await pinnedSourcesMessage(folder, [
		{ filename, kind: docKind(filename) },
	]);
	// Header-only ⇒ the source couldn't be read; don't invent a claim.
	if (
		!content ||
		!Array.isArray(content.content) ||
		content.content.length <= 1
	)
		return null;

	const { object } = await generateObject({
		model: createModel(ai.provider, ai.apiKey, ai.model),
		schema,
		system: SYSTEM,
		messages: [
			{ role: "user", content: `Parse claim ${claim} into its limitations.` },
			content,
		],
	});

	return {
		claimNumber: object.claimNumber,
		limitations: object.limitations.map((l) => ({
			id: l.id,
			text: l.text,
			construction: l.construction,
		})),
	};
}

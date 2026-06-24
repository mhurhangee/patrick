import { type ClaimLimitation, docKind, type Provider } from "@patrick/shared";
import { generateObject } from "ai";
import { z } from "zod";
import { pinnedWithRequiredPrimary } from "./chat";
import { createModel } from "./model";

// Parse the requested claim(s) into limitations and construe each in light of the
// description (Art 69 EPC + Protocol), in one pass. The system prompt is passed in (the
// profile's, or the built-in default) — it's the attorney's to tune. See CLAIM-CHARTING.md.

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
	system: string,
	claims: string,
	constructionSupport: string | undefined,
): Promise<ClaimLimitation[] | null> {
	// The claims document MUST load; the description (construction support) is best-effort.
	const support =
		constructionSupport && constructionSupport !== filename
			? { filename: constructionSupport, kind: docKind(constructionSupport) }
			: undefined;
	const content = await pinnedWithRequiredPrimary(
		folder,
		{ filename, kind: docKind(filename) },
		support,
	);
	// Couldn't read the claims document ⇒ don't invent a claim.
	if (!content) return null;

	const supportNote =
		constructionSupport && constructionSupport !== filename
			? " A separate description/specification document is also provided above — construe the claims in light of it."
			: "";
	const { object } = await generateObject({
		model: createModel(ai.provider, ai.apiKey, ai.model),
		schema,
		system,
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

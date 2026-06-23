import {
	type ClaimLimitation,
	docKind,
	type LimitationRead,
	type PinnedSource,
	type Provider,
} from "@patrick/shared";
import { generateObject } from "ai";
import { z } from "zod";
import { pinnedSourcesMessage } from "./chat";
import { createModel } from "./model";

// The whole-document read (hybrid + full-doc methods): read the reference IN FULL and
// judge disclosure per limitation — fixing the myopia of per-passage search, which
// construes too narrowly and misses the paragraph that broadens everything. The
// reference (and optional primer) ride as a pinned, cached message — Patrick-native.
//
// DRAFT PROMPT — the disclosure rubric is the attorney's to tune. See CLAIM-CHARTING.md.
const SYSTEM = `You read a prior-art reference IN FULL and assess, for each claim limitation, whether the reference discloses it — for a European patent attorney's NOVELTY analysis. Read the reference as a WHOLE: a later passage may broaden or clarify an earlier one.

You are given the claim's limitations, each verbatim with its assumed construction. For each, under its construction, decide:
- Express — recited verbatim or near-verbatim.
- Derived — not literal, but directly and unambiguously derivable from the reference at the novelty (anticipation) threshold. Apply strictly: a mere possibility or a typical arrangement is not enough.
- Suggested — the reference points the skilled person toward it but below the anticipation threshold (obviousness, not novelty).
- Absent — not disclosed.

For each limitation also give:
- teaching: a concise summary of what the reference actually teaches on this point (or that it is silent).
- reasoning: self-contained ("the limitation, construed as X, is [disclosed because … | absent because …]").
- hint: a short phrase (a few words) capturing the specific disclosure, used to locate the exact supporting passage by search. Empty if Absent.
- citation: the single best VERBATIM passage from the reference that evidences the disclosure, with its location (paragraph/page if identifiable). null if Absent.

Work only from the reference's actual text — never invent passages.`;

const schema = z.object({
	reads: z.array(
		z.object({
			limitationId: z.string(),
			disclosed: z.enum(["Express", "Derived", "Suggested", "Absent"]),
			teaching: z.string(),
			reasoning: z.string(),
			hint: z.string(),
			citation: z
				.object({ quote: z.string(), location: z.string() })
				.nullable(),
		}),
	),
});

/** Read one reference in full and judge each limitation. `primer`, if given, shapes the
 *  analysis (e.g. the examiner's report). */
export async function readReference(
	folder: string,
	ai: { provider: Provider; apiKey: string; model: string },
	reference: string,
	primer: string | undefined,
	limitations: ClaimLimitation[],
): Promise<LimitationRead[] | null> {
	const sources: PinnedSource[] = [
		{ filename: reference, kind: docKind(reference) },
	];
	if (primer) sources.push({ filename: primer, kind: docKind(primer) });
	const content = await pinnedSourcesMessage(folder, sources);
	// Header-only ⇒ the reference couldn't be read (e.g. an un-extracted PDF).
	if (
		!content ||
		!Array.isArray(content.content) ||
		content.content.length <= 1
	)
		return null;

	const list = limitations
		.map(
			(l) =>
				`${l.id}: ${l.text}${l.construction ? `\n    Construction: ${l.construction}` : ""}`,
		)
		.join("\n");
	const primerNote = primer
		? `\n\nA primer document (${primer}) is also provided above — use it to focus and shape your analysis.`
		: "";

	const { object } = await generateObject({
		model: createModel(ai.provider, ai.apiKey, ai.model),
		schema,
		system: SYSTEM,
		messages: [
			content,
			{
				role: "user",
				content: `The claim's limitations:\n\n${list}\n\nFor each, judge its disclosure in the reference above.${primerNote}`,
			},
		],
	});

	return object.reads;
}

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
const SYSTEM = `You are an experienced European patent attorney assessing a prior-art reference for a novelty analysis. Read the reference IN FULL — it must be read as a whole, since a later passage may broaden, qualify or clarify an earlier one.

For each claim limitation (given verbatim with its assumed construction), give a fair, practitioner's assessment of whether the reference discloses it under that construction — neither straining to find disclosure nor dismissing a genuine one. Classify:
- Express — stated explicitly (verbatim or near-verbatim).
- Derived — not stated in words, but directly and unambiguously derivable by the skilled person from the reference read as a whole (the EPO anticipation standard).
- Suggested — the reference would point the skilled person toward it, but stops short of the anticipation standard (relevant to inventive step, not novelty).
- Absent — not disclosed.

For each limitation also give:
- teaching: a concise, neutral summary of what the reference actually teaches on this point (or that it is silent).
- reasoning: a self-contained explanation a colleague could read on its own ("limitation X, construed as Y, is [disclosed by … because … | not disclosed because …]").
- hint: a few words naming the specific disclosure, to locate the exact supporting passage by search. Empty if Absent.
- citation: the single best VERBATIM passage from the reference evidencing the disclosure, with its location (paragraph/page if identifiable). null if Absent.

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

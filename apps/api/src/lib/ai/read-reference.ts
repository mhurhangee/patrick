import {
	type ClaimLimitation,
	docKind,
	type LimitationRead,
	type Provider,
} from "@patrick/shared";
import { generateObject } from "ai";
import { z } from "zod";
import { pinnedWithRequiredPrimary } from "./chat";
import { createModel } from "./model";

// The whole-document read: read the reference IN FULL and judge disclosure per limitation
// — fixing the myopia of per-passage search, which construes too narrowly and misses the
// paragraph that broadens everything. The reference (and optional primer) ride as a
// pinned, cached message — Patrick-native. The system prompt is passed in (the profile's,
// or the built-in default) — the disclosure rubric is the attorney's to tune.

const schema = z.object({
	reads: z.array(
		z.object({
			limitationUid: z.string(),
			disclosed: z.enum(["Express", "Derived", "Suggested", "Absent"]),
			reasoning: z.string(),
			citations: z.array(
				z.object({ location: z.string(), snippet: z.string() }),
			),
		}),
	),
});

/** Read one reference in full and judge each limitation. `primer`, if given, shapes the
 *  analysis (e.g. the examiner's report). */
export async function readReference(
	folder: string,
	ai: { provider: Provider; apiKey: string; model: string },
	system: string,
	reference: string,
	primer: string | undefined,
	limitations: ClaimLimitation[],
): Promise<LimitationRead[] | null> {
	// The reference MUST load; the primer is best-effort. (A primer-only context would have
	// the model judge disclosure against the wrong document.)
	const content = await pinnedWithRequiredPrimary(
		folder,
		{ filename: reference, kind: docKind(reference) },
		primer ? { filename: primer, kind: docKind(primer) } : undefined,
	);
	if (!content) return null;

	const list = limitations
		.map(
			(l) =>
				`[id: ${l.uid}] ${l.label}: ${l.text}${l.construction ? `\n    Construction: ${l.construction}` : ""}`,
		)
		.join("\n");
	const primerNote = primer
		? `\n\nA primer document (${primer}) is also provided above — use it to focus and shape your analysis.`
		: "";

	const { object } = await generateObject({
		model: createModel(ai.provider, ai.apiKey, ai.model),
		schema,
		system,
		messages: [
			content,
			{
				role: "user",
				content: `The claim's limitations:\n\n${list}\n\nFor each, judge its disclosure in the reference above.${primerNote}`,
			},
		],
	});

	// An empty result is a model failure, not "nothing disclosed" (Absent is an explicit
	// verdict). Treat it as an error so the caller doesn't silently blank the column.
	if (object.reads.length === 0) return null;
	return object.reads;
}

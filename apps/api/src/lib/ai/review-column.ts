import {
	type ChartCell,
	type ClaimLimitation,
	docKind,
	type LimitationReview,
	type PinnedSource,
	type Provider,
} from "@patrick/shared";
import { generateObject } from "ai";
import { z } from "zod";
import { pinnedSourcesMessage } from "./chat";
import { createModel } from "./model";

// The reviewer pass: a second model critiques a finished column's analysis against the
// reference, to catch bad/missing citations, over/under-reading and contradictions. It
// FLAGS (advisory) — it does not rewrite the analysis. See CLAIM-CHARTING.md.
const SYSTEM = `You are a senior European patent attorney reviewing a colleague's novelty analysis for errors. You are given a prior-art reference IN FULL, and the colleague's analysis of each claim limitation (the verbatim limitation, its construction, the disclosure verdict, the reasoning, and the cited passages).

For each limitation, critically check the analysis against the reference and list any ISSUES a careful reviewer would flag, for example:
- a cited passage that does NOT actually appear in the reference, or that does not say what the analysis claims;
- a verdict not supported by the reasoning or the cited passages (over-reading or under-reading the reference);
- a relevant disclosure in the reference that the analysis missed;
- an internal contradiction, or the construction misapplied.

List concrete, concise issues per limitation. Return an empty list for a limitation whose analysis is sound. Do NOT rewrite the analysis — only flag problems. Echo each limitation's label.`;

const schema = z.object({
	reviews: z.array(
		z.object({
			limitationLabel: z.string(),
			issues: z.array(z.string()),
		}),
	),
});

/** Review a column's cells against the reference; returns issues per limitation. */
export async function reviewColumn(
	folder: string,
	ai: { provider: Provider; apiKey: string; model: string },
	reference: string,
	primer: string | undefined,
	limitations: ClaimLimitation[],
	cells: ChartCell[],
): Promise<LimitationReview[] | null> {
	const sources: PinnedSource[] = [
		{ filename: reference, kind: docKind(reference) },
	];
	if (primer) sources.push({ filename: primer, kind: docKind(primer) });
	const content = await pinnedSourcesMessage(folder, sources);
	if (
		!content ||
		!Array.isArray(content.content) ||
		content.content.length <= 1
	)
		return null;

	const byUid = new Map(cells.map((c) => [c.limitationUid, c]));
	const analysis = limitations
		.map((l) => {
			const c = byUid.get(l.uid);
			if (!c) return null;
			const cites =
				c.citations
					.map((ci) => `"${ci.quote}" (${ci.location || "?"})`)
					.join("; ") || "(none)";
			return `${l.label}: ${l.text}\n  Construction: ${l.construction || "(none)"}\n  Verdict: ${c.disclosureType}\n  Reasoning: ${c.reasoning}\n  Citations: ${cites}`;
		})
		.filter((x): x is string => x !== null)
		.join("\n\n");

	const { object } = await generateObject({
		model: createModel(ai.provider, ai.apiKey, ai.model),
		schema,
		system: SYSTEM,
		messages: [
			content,
			{
				role: "user",
				content: `The colleague's analysis to review:\n\n${analysis}\n\nReview each against the reference above.`,
			},
		],
	});
	return object.reviews;
}

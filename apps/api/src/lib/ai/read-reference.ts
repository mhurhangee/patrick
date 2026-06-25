import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type ChartCitation,
	type ClaimLimitation,
	docKind,
	type LimitationRead,
	normalizedIncludes,
	normalizeForMatch,
	type Provider,
	paragraphToken,
	parseLeaf,
} from "@patrick/shared";
import { generateText, Output } from "ai";
import { z } from "zod";
import { readExtractedText } from "../documents";
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

/** The reference's plain text (+ page count for PDFs), to check citations against. Null when
 *  we can't read it (an image-only PDF, a docx, an unreadable file) — then we skip
 *  verification and keep the citations as-is rather than drop blind. */
async function referenceText(
	folder: string,
	reference: string,
): Promise<{ text: string; pageCount: number } | null> {
	if (docKind(reference) === "pdf") {
		const ext = await readExtractedText(folder, reference);
		if (!ext) return null; // not extracted (image mode) — can't verify server-side
		return {
			text: ext.pages.map((p) => p.text).join("\n"),
			pageCount: ext.pages.length,
		};
	}
	if (docKind(reference) === "text") {
		try {
			return {
				text: await readFile(join(folder, reference), "utf8"),
				pageCount: 0,
			};
		} catch {
			return null;
		}
	}
	return null; // docx and others — skip verification
}

/** Drop citations that locate NOWHERE — neither the snippet nor the label resolves against the
 *  reference. We keep located citations AS-IS (never strip the snippet): the client matches the
 *  snippet against the live text layer, which is less lossy than our extracted text, so a snippet
 *  that misses here may still hit on click. The label resolves doc-type-aware: a paragraph marker
 *  present in the text, or — for a PDF only — a leaf within range (text docs have no leaves). The
 *  reference is normalized once for the whole pass. */
function verifyCitations(
	reads: LimitationRead[],
	ref: { text: string; pageCount: number },
): LimitationRead[] {
	const normText = normalizeForMatch(ref.text);
	const located = (c: ChartCitation): boolean => {
		if (c.snippet?.trim() && normalizedIncludes(normText, c.snippet))
			return true;
		const para = paragraphToken(c.location);
		if (para && normalizedIncludes(normText, para)) return true;
		if (ref.pageCount > 0) {
			const leaf = parseLeaf(c.location);
			if (leaf != null && leaf <= ref.pageCount) return true;
		}
		return false;
	};
	return reads.map((r) => ({ ...r, citations: r.citations.filter(located) }));
}

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

	// Doc-type-aware citation convention (the location label only — the snippet is the real
	// locator). PDFs: cite by LEAF (the actual page in the file), never the printed page —
	// "leaf" and "page" are kept distinct app-wide so a chart's leaf and an examiner's page
	// can't be confused. Text/markdown: cite paragraph numbers where present.
	const citationNote =
		docKind(reference) === "pdf"
			? `\n\nCiting this reference (a PDF): give each location as a LEAF — the actual sequential page in the file, counting from 1 and INCLUDING any cover and drawing pages (e.g. "leaf 6"); add a column and line range when the page has them ("leaf 6, col. 2, ll. 5–12"). Do NOT use the printed page number on the page, and never guess it — "leaf" (file position) and "page" (printed number) are different things. The snippet is what actually locates the passage, so give it for every citation.`
			: `\n\nCiting this reference: where the text carries paragraph numbers ([0001], [0002] …), cite those (e.g. "[0021]"); for a heading or figure without one, name it. The snippet is what actually locates the passage, so give it for every citation.`;

	const { output } = await generateText({
		model: createModel(ai.provider, ai.apiKey, ai.model),
		output: Output.object({ schema }),
		system,
		messages: [
			content,
			{
				role: "user",
				content: `The claim's limitations:\n\n${list}\n\nFor each, judge its disclosure in the reference above.${primerNote}${citationNote}`,
			},
		],
	});

	// An empty result is a model failure, not "nothing disclosed" (Absent is an explicit
	// verdict). Treat it as an error so the caller doesn't silently blank the column.
	if (output.reads.length === 0) return null;

	// Prune citations that don't actually locate in the reference (hallucinated / non-verbatim
	// snippets), when we can read the reference text. The verdict + reasoning stand; only the
	// unlocatable pin is dropped.
	const ref = await referenceText(folder, reference);
	return ref ? verifyCitations(output.reads, ref) : output.reads;
}

import { docKind, type Provider } from "@patrick/shared";
import { generateObject } from "ai";
import { z } from "zod";
import { mergeDocumentMeta } from "../documents";
import { pinnedSourcesMessage } from "./chat";
import { createModel } from "./model";

// Generate a label + a few follow-up prompts for a document directly (the kebab
// "Suggest a label" action), without going through the chat agent. One explicit
// call on the profile's model with reasoning off (generateObject passes no
// thinking budget) — labelling is a cheap, mechanical task.
const SYSTEM =
	"You label a patent-prosecution document for an attorney's working folder. From the document, produce: a concise one-line label (what it IS, in a few words — e.g. 'specification as filed', 'Smith reference (US7557198)', 'office action dated 12 March 2024'); and 2-3 short, specific follow-up prompts the attorney might next ask Patrick about THIS document, phrased as prompts to Patrick (e.g. 'Summarise the independent claims', 'Compare this with my draft'). Base everything on the document's actual content.";

const schema = z.object({
	label: z.string(),
	suggestions: z.array(z.string()).min(2).max(3),
});

export type LabelResult = z.infer<typeof schema>;

export async function generateDocumentLabel(
	folder: string,
	filename: string,
	ai: { provider: Provider; apiKey: string; model: string },
): Promise<LabelResult | null> {
	// Reuse the chat's content loader: PDF as image/text, docx as extracted text.
	const content = await pinnedSourcesMessage(folder, [
		{ filename, kind: docKind(filename) },
	]);
	// The message always carries a leading header part; require an actual document
	// part too. An unreadable source yields header-only — labelling it would make
	// the model invent a label from nothing.
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
		messages: [content],
	});

	await mergeDocumentMeta(folder, filename, {
		label: object.label,
		suggestions: object.suggestions,
	});
	return object;
}

import type { CellClassification, Provider } from "@patrick/shared";
import { generateObject } from "ai";
import { z } from "zod";
import { createModel } from "./model";

// The SEMANTIC baseline method: classify one limitation over a set of retrieved passages
// (NOT the whole document). This is the myopic method the test bed measures the whole-read
// methods against. The model cites passages by index — it can't fabricate.
const SYSTEM = `You assess whether a prior-art reference discloses a single claim limitation, for a European patent attorney's novelty analysis. You see ONLY a set of retrieved passages from the reference, not the whole document — judge from these.

Given the limitation (verbatim, with its construction), classify under that construction:
- Express — recited verbatim or near-verbatim in a passage.
- Derived — directly and unambiguously derivable from the passage(s) at the anticipation standard.
- Suggested — pointed to but below the anticipation standard (inventive step, not novelty).
- Absent — not disclosed by these passages.

Give self-contained reasoning, and list the indices of the passages you relied on (empty if Absent). Cite only the provided passages.`;

const schema = z.object({
	disclosureType: z.enum(["Express", "Derived", "Suggested", "Absent"]),
	reasoning: z.string(),
	passages: z
		.array(z.number().int())
		.describe("Indices of the relied-on passages; empty if Absent."),
});

/** Classify one cell over the client-retrieved passages (semantic baseline). */
export async function classifyCell(
	ai: { provider: Provider; apiKey: string; model: string },
	limitation: { id: string; text: string; construction: string },
	passages: { text: string; page: number }[],
): Promise<CellClassification> {
	const numbered = passages
		.map((p, i) => `[${i}] (page ${p.page})\n${p.text}`)
		.join("\n\n");
	const { object } = await generateObject({
		model: createModel(ai.provider, ai.apiKey, ai.model),
		schema,
		system: SYSTEM,
		messages: [
			{
				role: "user",
				content: `Limitation ${limitation.id}: ${limitation.text}\n\nAssumed construction: ${
					limitation.construction || "(none specified)"
				}\n\nRetrieved passages:\n\n${numbered}`,
			},
		],
	});
	return object;
}

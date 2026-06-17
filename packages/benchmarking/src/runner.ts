// The system under test: a LocalToolRunner that answers each item TRUE/FALSE and
// reports the provisions it cited + retrieved. Two arms, one harness:
//   tools: "none"    → the model answers from memory (the baseline)
//   tools: "patrick" → the model gets Patrick's real grounding tools
// The grounding ENGINE is the real shared @patrick/law (lookupProvisions,
// tableOfContents, resolveCitation) — the same code the product runs; only the
// thin tool wrappers + loop live here. Because both arms share this harness, the
// baseline-vs-grounded delta isolates exactly one thing: the grounding.
//
// ep_law_lookup's description and find_law's description/instructions are copied
// verbatim from apps/api/src/lib/ai (chat.ts, find-law.ts) — keep them in sync.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	fileCachedFetcher,
	lookupProvisions,
	resolveCitation,
	tableOfContents,
} from "@patrick/law";
import { generateObject, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { modelFor, modelId } from "./models";
import type { Contract, Item, SystemUnderTest } from "./types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fetcher = fileCachedFetcher(join(ROOT, ".cache"));

const SYSTEM = `You assist a European patent attorney. You are given a statement (sometimes with a fact pattern) and must decide whether it is TRUE or FALSE as a matter of European patent law, and identify the governing provision(s) — EPC Articles/Rules, Rules relating to Fees, the EPO Guidelines, or the Boards of Appeal case law. When law-lookup tools are available, retrieve the verbatim text and rely on it rather than your memory; getting the law slightly wrong is unacceptable. Reason carefully, then state your verdict and the provisions you relied on.`;

const FINAL_ASK =
	"Output your final verdict (TRUE or FALSE) and the citations of the provisions you relied on.";

const contractSchema = z.object({
	answer: z.enum(["TRUE", "FALSE"]),
	cited_provisions: z
		.array(z.string())
		.describe("Citations of the provisions the verdict relies on."),
});

// find_law scope → source id (mirrors apps/api/src/lib/ai/find-law.ts).
const SCOPES: Record<string, string> = {
	gl: "guidelines-epc",
	pct: "guidelines-pct",
	clboa: "caselaw",
};
const SCOPE_DESC =
	"gl = EPO Guidelines for Examination; pct = PCT-EPO Guidelines; clboa = Case Law of the Boards of Appeal";
const FIND_LAW_INSTRUCTIONS = `Below is the table of contents of a body of EPO guidance or case law, as a nested outline; each recallable section shows its citation in \`backticks\`. Given the attorney's query, identify the sections MOST relevant to it. Return up to 8, most relevant first, as the citation in backticks (e.g. \`G-VII 5.3\`), one per line, nothing else. Only return citations that appear in the contents below. If none are relevant, return nothing.`;

const tocCache = new Map<string, string>();
function toc(sourceId: string): string {
	const cached = tocCache.get(sourceId);
	if (cached) return cached;
	const t = tableOfContents(sourceId);
	tocCache.set(sourceId, t);
	return t;
}

/** The grounding tools, closing over `retrieved` to record what they surface. */
function patrickTools(
	retrieved: Set<string>,
	model: ReturnType<typeof modelFor>,
) {
	const ep_law_lookup = tool({
		description:
			"Look up European patent law and get its VERBATIM current text from epo.org: EPC Articles, Rules, and Rules relating to Fees; EPO Guidelines for Examination (EPC and PCT-EPO); and Case Law of the Boards of Appeal (the 'white book' sections). Call this WHENEVER a specific provision/section is cited (by an examiner, by the attorney, or one you are about to rely on), and quote the law ONLY from what this returns — never recite from memory, as getting it slightly wrong is unacceptable. Pass canonical keys: EPC 'A54' / 'A123(2)' / 'R137(3)' / 'RFees A2'; Guidelines 'G-VII 5.3' (EPC) or 'PCT G-VII 5' (PCT-EPO); case law 'II.E.1.3.1'; or a concept ('inventive step'). A paragraph in parentheses is noted as the focus. Each result carries the title, the in-force version/date, and (for EPC provisions) footnotes; unresolved refs come back as not_found.",
		inputSchema: z.object({
			refs: z.array(z.string()).min(1),
		}),
		execute: async ({ refs }) => {
			const results = await lookupProvisions(refs, fetcher);
			for (const r of results) if (r.status === "ok") retrieved.add(r.ref);
			return { results };
		},
	});

	const find_law = tool({
		description: `Find the most relevant sections of a body of EPO guidance or case law for a topic or question, when you don't already have the exact citation. Scopes: ${SCOPE_DESC}. Returns section citations — retrieve their verbatim text with ep_law_lookup and rely on that, not on memory. Call it once per body you want to search.`,
		inputSchema: z.object({
			query: z.string().min(1),
			scope: z.enum(["gl", "pct", "clboa"]),
		}),
		execute: async ({ query, scope }) => {
			const sourceId = SCOPES[scope];
			if (!sourceId) return { scope, sections: [], error: "unknown scope" };
			try {
				const result = await generateText({
					model,
					messages: [
						{
							role: "system",
							content: `${FIND_LAW_INSTRUCTIONS}\n\n${toc(sourceId)}`,
						},
						{ role: "user", content: query },
					],
					abortSignal: AbortSignal.timeout(60_000),
				});
				const candidates =
					result.text.match(/`[^`]+`/g)?.map((s) => s.slice(1, -1)) ??
					result.text.split("\n").map((l) => l.trim());
				const seen = new Set<string>();
				const sections: { ref: string; title: string | null }[] = [];
				for (const c of candidates) {
					const key = resolveCitation(c)?.entry.citationKey;
					if (key && !seen.has(key)) {
						seen.add(key);
						retrieved.add(key);
						sections.push({
							ref: key,
							title: resolveCitation(c)?.entry.title ?? null,
						});
					}
				}
				return { scope, sections };
			} catch (err) {
				return {
					scope,
					sections: [],
					error: err instanceof Error ? err.message : "find_law failed",
				};
			}
		},
	});

	return { ep_law_lookup, find_law };
}

function task(item: Item): string {
	const scenario = item.scenario ? `Fact pattern:\n${item.scenario}\n\n` : "";
	return `${scenario}Statement:\n${item.statement}\n\nDecide whether this statement is TRUE or FALSE as a matter of European patent law, and identify the governing provision(s).`;
}

/** A local two-arm runner. `tools: "none"` is the baseline; "patrick" grounds. */
export function localRunner(opts: {
	tools: "none" | "patrick";
	modelOverride?: string;
}): SystemUnderTest {
	const model = modelFor("system", opts.modelOverride);
	return {
		id: `local:${opts.tools}:${modelId("system", opts.modelOverride)}`,
		async run(item: Item): Promise<Contract> {
			const retrieved = new Set<string>();
			const tools =
				opts.tools === "patrick" ? patrickTools(retrieved, model) : undefined;

			const reasoning = await generateText({
				model,
				system: SYSTEM,
				prompt: task(item),
				tools,
				stopWhen: stepCountIs(8),
			});

			// Extract the contract from the reasoning text — decoupled from the tool
			// conversation, so it's provider-safe regardless of the arm.
			const { object } = await generateObject({
				model,
				schema: contractSchema,
				prompt: `${task(item)}\n\nAnalysis:\n${reasoning.text}\n\n${FINAL_ASK}`,
			});

			return {
				answer: object.answer,
				cited_provisions: object.cited_provisions,
				retrieved_provisions: [...retrieved],
			};
		},
	};
}

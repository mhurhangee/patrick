// The system under test: a LocalToolRunner that answers each item TRUE/FALSE and
// reports the provisions it cited + retrieved. Three arms, one harness:
//   tools: "none"    → the model answers from memory (the floor)
//   tools: "web"     → general web search (the realistic "without Patrick" baseline)
//   tools: "patrick" → Patrick's real verbatim EPO grounding tools
// The grounding ENGINE is the real shared @patrick/law (lookupProvisions,
// tableOfContents, resolveCitation) — the same code the product runs; only the
// thin tool wrappers + loop live here. Because all arms share this harness, the
// patrick-vs-web (and vs-none) delta isolates exactly the grounding.
//
// ep_law_lookup / find_law descriptions and the web-search tools are mirrored
// verbatim from apps/api/src/lib/ai (chat.ts, find-law.ts, web-search.ts) — keep
// them in sync.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import {
	fileCachedFetcher,
	lookupProvisions,
	resolveCitation,
	tableOfContents,
} from "@patrick/law";
import {
	generateObject,
	generateText,
	stepCountIs,
	type ToolSet,
	tool,
} from "ai";
import { z } from "zod";
import { modelFor, modelId } from "./models";
import type { Contract, Item, SystemUnderTest } from "./types";

/** The model's vendor from its gateway id (`vendor/model`). */
function vendorOf(id: string): "anthropic" | "openai" | "google" {
	const v = id.split("/")[0];
	return v === "openai" || v === "google" ? v : "anthropic";
}

// Patrick's web search, mirrored from apps/api/src/lib/ai/web-search.ts (provider-
// native, gateway-routable) — keep in sync. The realistic "without Patrick" arm:
// general web search instead of verbatim EPO retrieval.
function webTools(vendor: "anthropic" | "openai" | "google"): ToolSet {
	if (vendor === "openai") return { web_search: openai.tools.webSearch({}) };
	if (vendor === "google")
		return { google_search: google.tools.googleSearch({}) };
	return { web_search: anthropic.tools.webSearch_20250305({ maxUses: 4 }) };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fetcher = fileCachedFetcher(join(ROOT, ".cache"));

const SYSTEM = `You assist a European patent attorney. You are given a statement (sometimes with a fact pattern) and must decide whether it is TRUE or FALSE as a matter of European patent law, and identify the governing provision(s) — EPC Articles/Rules, Rules relating to Fees, the EPO Guidelines, or the Boards of Appeal case law. When tools are available to look up or search for the law, use them and rely on what you retrieve rather than your memory; getting the law slightly wrong is unacceptable. Reason carefully, then state your verdict and the provisions you relied on.`;

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
	epc: "epc",
	gl: "guidelines-epc",
	pct: "guidelines-pct",
	clboa: "caselaw",
};
const SCOPE_DESC =
	"epc = EPC Articles, Rules and Rules relating to Fees; gl = EPO Guidelines for Examination; pct = PCT-EPO Guidelines; clboa = Case Law of the Boards of Appeal";
const FIND_LAW_INSTRUCTIONS = `Below is the table of contents of a body of European patent law, guidance, or case law, as a nested outline; each recallable section shows its citation in \`backticks\`. Given the attorney's query, identify the sections MOST relevant to it. Return up to 8, most relevant first, as the citation in backticks (e.g. \`G-VII 5.3\`), one per line, nothing else. Only return citations that appear in the contents below. If none are relevant, return nothing.`;

const tocCache = new Map<string, string>();
function toc(sourceId: string): string {
	const cached = tocCache.get(sourceId);
	if (cached) return cached;
	const t = tableOfContents(sourceId);
	tocCache.set(sourceId, t);
	return t;
}

export interface Usage {
	input: number;
	output: number;
}

/** The grounding tools, closing over `retrieved` (what they surface) and `usage`
 *  (the find_law subagent's tokens, which the outer loop doesn't see). */
function patrickTools(
	retrieved: Set<string>,
	usage: Usage,
	model: ReturnType<typeof modelFor>,
) {
	const ep_law_lookup = tool({
		description:
			"Look up European patent law and get its VERBATIM current text from epo.org: EPC Articles, Rules, and Rules relating to Fees; EPO Guidelines for Examination (EPC and PCT-EPO); and Case Law of the Boards of Appeal (the 'white book' sections). Call this WHENEVER a specific provision/section is cited (by an examiner, by the attorney, or one you are about to rely on), and quote the law ONLY from what this returns — never recite from memory, as getting it slightly wrong is unacceptable. Pass canonical keys: EPC 'A54' / 'A123(2)' / 'R137(3)' / 'RFees A2'; Guidelines 'G-VII 5.3' (EPC) or 'PCT G-VII 5' (PCT-EPO); case law 'II.E.1.3.1'. If you don't have the exact citation, discover it with find_law first. A paragraph in parentheses is noted as the focus. Each result carries the title, the in-force version/date, and (for EPC provisions) footnotes; unresolved refs come back as not_found.",
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
		description: `Find the most relevant provisions/sections of a body of European patent law — the EPC itself, EPO guidance, or case law — for a topic or question, when you don't already have the exact citation. Scopes: ${SCOPE_DESC}. Returns citations — retrieve their verbatim text with ep_law_lookup and rely on that, not on memory. Call it once per body you want to search.`,
		inputSchema: z.object({
			query: z.string().min(1),
			scope: z.enum(["epc", "gl", "pct", "clboa"]),
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
							// The big static TOC is a cacheable prefix — mark it for Anthropic
							// (OpenAI/Google cache automatically), so repeated find_law calls in
							// a run don't re-pay it. Mirrors apps/api/src/lib/ai/find-law.ts.
							providerOptions: {
								anthropic: { cacheControl: { type: "ephemeral" } },
							},
						},
						{ role: "user", content: query },
					],
					// The system message carries the cacheable TOC (not user input), so the
					// prompt-injection warning is a false alarm here — allow it explicitly.
					allowSystemInMessages: true,
					abortSignal: AbortSignal.timeout(60_000),
				});
				usage.input += result.usage?.inputTokens ?? 0;
				usage.output += result.usage?.outputTokens ?? 0;
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

/** A local runner, one of three arms:
 *  - "none"    → no tools (the model answers from memory; the floor)
 *  - "web"     → general web search (the realistic "without Patrick" baseline)
 *  - "patrick" → Patrick's verbatim EPO grounding tools
 *  `usage` accumulates the model's input/output tokens across the whole session.
 *  Only "patrick" populates retrieved_provisions (web search surfaces pages, not
 *  provision keys), so retrieval-recall is a Patrick-specific metric. */
export function localRunner(opts: {
	tools: "none" | "web" | "patrick";
	modelOverride?: string;
}): SystemUnderTest & { usage: Usage; modelId: string } {
	const model = modelFor("system", opts.modelOverride);
	const id = modelId("system", opts.modelOverride);
	const usage: Usage = { input: 0, output: 0 };
	return {
		id: `local:${opts.tools}:${id}`,
		usage,
		modelId: id,
		async run(item: Item): Promise<Contract> {
			const retrieved = new Set<string>();
			const tools =
				opts.tools === "patrick"
					? patrickTools(retrieved, usage, model)
					: opts.tools === "web"
						? webTools(vendorOf(id))
						: undefined;

			const reasoning = await generateText({
				model,
				system: SYSTEM,
				prompt: task(item),
				tools,
				// Headroom for a few find_law → ep_law_lookup rounds before answering
				// (find_law alone can return 8 sections). Too low and a well-grounded
				// item hits the cap mid-retrieval, ending on a tool call.
				stopWhen: stepCountIs(16),
			});
			usage.input += reasoning.usage?.inputTokens ?? 0;
			usage.output += reasoning.usage?.outputTokens ?? 0;

			// `.text` is only the FINAL step's text — empty if the loop ended on a tool
			// call. Fall back to the whole step trail so the contract is extracted from
			// the tool-aware reasoning, not re-guessed from nothing.
			const analysis =
				reasoning.text.trim() ||
				(reasoning.steps ?? [])
					.map((s) => s.text)
					.filter(Boolean)
					.join("\n\n");

			// Extract the contract from the reasoning — decoupled from the tool
			// conversation, so it's provider-safe regardless of the arm.
			const { object, usage: u } = await generateObject({
				model,
				schema: contractSchema,
				prompt: `${task(item)}\n\nAnalysis:\n${analysis}\n\n${FINAL_ASK}`,
			});
			usage.input += u?.inputTokens ?? 0;
			usage.output += u?.outputTokens ?? 0;

			return {
				answer: object.answer,
				cited_provisions: object.cited_provisions,
				retrieved_provisions: [...retrieved],
			};
		},
	};
}

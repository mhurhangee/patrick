import { resolveCitation, tableOfContents } from "@patrick/law";
import type { FindLawSection, Provider } from "@patrick/shared";
import { generateText, tool } from "ai";
import { z } from "zod";
import { createModel } from "./model";

// find_law: an LLM-as-retriever over a body's table of contents. The subagent is
// handed the (cached) nested TOC of one source and returns the citations of the
// sections most relevant to the query; the main agent then grounds them verbatim
// via ep_law_lookup. Discovery without a search index — the TOC is the index.

const SCOPES: Record<string, string> = {
	gl: "guidelines-epc",
	pct: "guidelines-pct",
	clboa: "caselaw",
};
const SCOPE_DESC =
	"gl = EPO Guidelines for Examination; pct = PCT-EPO Guidelines; clboa = Case Law of the Boards of Appeal";

// The TOC is static — render each source once and reuse (also a cacheable prefix).
const tocCache = new Map<string, string>();
function toc(sourceId: string): string {
	const cached = tocCache.get(sourceId);
	if (cached) return cached;
	const t = tableOfContents(sourceId);
	tocCache.set(sourceId, t);
	return t;
}

const INSTRUCTIONS = `Below is the table of contents of a body of EPO guidance or case law, as a nested outline; each recallable section shows its citation in \`backticks\`. Given the attorney's query, identify the sections MOST relevant to it. Return up to 8, most relevant first, as the citation in backticks (e.g. \`G-VII 5.3\`), one per line, nothing else. Only return citations that appear in the contents below. If none are relevant, return nothing.`;

export type AiConfig = { provider: Provider; apiKey: string; modelId: string };

/** Build the find_law tool bound to the attorney's configured model. */
export function createFindLaw(ai: AiConfig) {
	return tool({
		description: `Find the most relevant sections of a body of EPO guidance or case law for a topic or question, when you don't already have the exact citation. Scopes: ${SCOPE_DESC}. Returns section citations — retrieve their verbatim text with ep_law_lookup and rely on that, not on memory. Call it once per body you want to search.`,
		inputSchema: z.object({
			query: z
				.string()
				.min(1)
				.describe("The point of law or practice to find sections for."),
			scope: z.enum(["gl", "pct", "clboa"]).describe(SCOPE_DESC),
		}),
		execute: async ({ query, scope }) => {
			const sourceId = SCOPES[scope];
			if (!sourceId) return { scope, sections: [], error: "unknown scope" };
			try {
				const result = await generateText({
					model: createModel(ai.provider, ai.apiKey, ai.modelId),
					messages: [
						{
							role: "system",
							content: `${INSTRUCTIONS}\n\n${toc(sourceId)}`,
							// Mark the (large, static) TOC cacheable for Anthropic; OpenAI and
							// Google cache the stable prefix automatically.
							providerOptions: {
								anthropic: { cacheControl: { type: "ephemeral" } },
							},
						},
						{ role: "user", content: query },
					],
					abortSignal: AbortSignal.timeout(60_000),
				});
				// Pull the backticked citations it returned (fall back to whole lines),
				// validate each against the maps, dedupe.
				const candidates =
					result.text.match(/`[^`]+`/g)?.map((s) => s.slice(1, -1)) ??
					result.text.split("\n").map((l) => l.trim());
				const seen = new Set<string>();
				const sections: FindLawSection[] = [];
				for (const c of candidates) {
					const hit = resolveCitation(c);
					const key = hit?.entry.citationKey;
					if (hit && key && !seen.has(key)) {
						seen.add(key);
						sections.push({ ref: key, title: hit.entry.title });
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
}

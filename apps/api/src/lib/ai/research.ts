import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { Provider, ResearchSource } from "@patrick/shared";
import { generateText, stepCountIs, type ToolSet, tool } from "ai";
import { z } from "zod";
import { createModel, vendorOf } from "./model";

// law_research: web search as DISCOVERY, run on the attorney's own model. It finds
// what the law/practice is and WHICH provisions/decisions govern it; the agent
// then grounds the substance verbatim via ep_law_lookup. Sources are shown as-is
// (no filtering — that would be deceptive when the summary leans on them).

const PROMPT = (query: string) =>
	`Research this point for a patent attorney using web search, favouring official patent-office sources (epo.org, uspto.gov, wipo.int) where possible. State concisely what the law or practice is, AND name which provisions, guideline sections, or board-of-appeal decisions govern it as citations (e.g. "Article 123(2) EPC", "Guidelines G-VII, 5.3", "G 1/15"). Always cite the source URLs. Do not rely on anything beyond what the search returns.\n\nQuestion: ${query}`;

// Each provider exposes a different native search tool; pick by vendor. Google's
// has no domain knob and Anthropic's 20260209 hangs via gateway, so we use the
// stable forms and don't restrict (we ground by recall, not by locking search).
function searchTools(vendor: "anthropic" | "openai" | "google"): ToolSet {
	if (vendor === "openai") return { web_search: openai.tools.webSearch({}) };
	if (vendor === "google")
		return { google_search: google.tools.googleSearch({}) };
	return { web_search: anthropic.tools.webSearch_20250305({ maxUses: 4 }) };
}

type Src = { url?: string; title?: string };
type Call = { input?: { query?: string } };
type Res = { output?: { action?: { query?: string; queries?: string[] } } };

// Google returns opaque vertexaisearch redirect URLs with the real domain in the
// title; everyone else returns the real URL. Normalise to a domain either way.
function domainOf(s: Src): string {
	try {
		const host = new URL(s.url ?? "").hostname.replace(/^www\./, "");
		if (host === "vertexaisearch.cloud.google.com")
			return (s.title ?? "?").toLowerCase();
		return host;
	} catch {
		return (s.title ?? "?").toLowerCase();
	}
}

function dedupeSources(sources: Src[]): ResearchSource[] {
	const seen = new Set<string>();
	const out: ResearchSource[] = [];
	for (const s of sources) {
		const url = s.url ?? "";
		if (!url || seen.has(url)) continue;
		seen.add(url);
		out.push({ url, title: s.title ?? null, domain: domainOf(s) });
	}
	return out;
}

function queriesOf(calls: Call[], results: Res[]): string[] {
	const qs = new Set<string>();
	for (const c of calls) if (c.input?.query) qs.add(c.input.query);
	for (const r of results) {
		const a = r.output?.action;
		if (a?.query) qs.add(a.query);
		for (const q of a?.queries ?? []) qs.add(q);
	}
	return [...qs];
}

export type AiConfig = { provider: Provider; apiKey: string; modelId: string };

/** Build the law_research tool bound to the attorney's configured model. */
export function createLawResearch(ai: AiConfig) {
	return tool({
		description:
			"Research a point of patent law or practice on the web — what it is, and WHICH provisions, guideline sections, or Board of Appeal decisions govern it, with sources. Use it to discover the relevant law when you don't already have the citation. The results are web sources and may include commentary, so treat them as pointers to verify — then ground the substance by retrieving the cited provisions verbatim with ep_law_lookup. EP/EPC focus today.",
		inputSchema: z.object({
			query: z
				.string()
				.min(1)
				.describe(
					"What to research, e.g. 'could-would approach to inventive step EPC' or 'partial priority G 1/15'.",
				),
		}),
		execute: async ({ query }) => {
			try {
				const vendor = vendorOf(ai.provider, ai.modelId);
				const result = await generateText({
					model: createModel(ai.provider, ai.apiKey, ai.modelId),
					prompt: PROMPT(query),
					tools: searchTools(vendor),
					stopWhen: stepCountIs(6),
					abortSignal: AbortSignal.timeout(60_000),
				});
				return {
					summary: result.text,
					queries: queriesOf(
						(result.toolCalls ?? []) as Call[],
						(result.toolResults ?? []) as Res[],
					),
					sources: dedupeSources((result.sources ?? []) as Src[]),
				};
			} catch (err) {
				return {
					summary: "",
					queries: [],
					sources: [],
					error:
						err instanceof Error ? err.message : "web search is unavailable",
				};
			}
		},
	});
}

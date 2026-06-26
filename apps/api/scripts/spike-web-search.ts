// Spike: provider-native web search through the AI Gateway, as DISCOVERY. No
// domain restriction and no post-filtering — restricting the displayed sources
// while the summary was built on the unfiltered set would be deceptive. Instead:
// search broadly, soft-prompt to favour official sources, and expose every source
// the answer actually used. Grounding precision comes from law_recall, not from
// locking the search. Reports queries + sources (domain + url) + text.
//
// Run:  AI_GATEWAY_API_KEY=sk-... bun apps/api/scripts/spike-web-search.ts

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createGateway, generateText, isStepCount } from "ai";

// Informational only — we don't filter on these, just mark them so we can see the
// official-vs-commentary spread each provider returns under a soft prompt.
const OFFICIAL = ["epo.org", "uspto.gov", "wipo.int"];

const QUESTIONS = [
	"What is the could-would approach to inventive step under the EPC?",
	"Under the EPC, what is the test for added subject-matter under Article 123(2)?",
	"What does the Enlarged Board decision G 1/15 hold about partial priority under the EPC?",
];

// Soft favour, not a restriction — and always cite the source URLs.
const scope = (q: string) =>
	`Use web search, favouring official patent-office sources (epo.org, uspto.gov, wipo.int) where possible, and cite the exact source URL(s). Question: ${q}`;

const MODELS = [
	{
		label: "OpenAI",
		modelId: "openai/gpt-5.4-mini",
		toolKey: "web_search",
		tool: openai.tools.webSearch({}),
	},
	{
		label: "Anthropic",
		modelId: "anthropic/claude-sonnet-4.6",
		toolKey: "web_search",
		tool: anthropic.tools.webSearch_20250305({ maxUses: 3 }),
	},
	{
		label: "Google",
		modelId: "google/gemini-3.5-flash",
		toolKey: "google_search",
		tool: google.tools.googleSearch({}),
	},
] as const;

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

const isOfficial = (domain: string) =>
	OFFICIAL.some((d) => domain === d || domain.endsWith(`.${d}`));

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

async function main(): Promise<void> {
	const apiKey = process.env.AI_GATEWAY_API_KEY;
	if (!apiKey) {
		console.error(
			"Set AI_GATEWAY_API_KEY and re-run:\n  AI_GATEWAY_API_KEY=sk-... bun apps/api/scripts/spike-web-search.ts",
		);
		process.exit(1);
	}
	const gateway = createGateway({ apiKey });

	for (const [qi, question] of QUESTIONS.entries()) {
		console.log(
			`\n\n${"#".repeat(72)}\n# Q${qi + 1}: ${question}\n${"#".repeat(72)}`,
		);
		for (const m of MODELS) {
			console.log(`\n== ${m.label} (${m.modelId}) ==`);
			try {
				const result = await generateText({
					model: gateway(m.modelId),
					prompt: scope(question),
					tools: { [m.toolKey]: m.tool },
					stopWhen: isStepCount(5),
					abortSignal: AbortSignal.timeout(60_000),
				});
				const queries = queriesOf(
					(result.toolCalls ?? []) as Call[],
					(result.toolResults ?? []) as Res[],
				);
				const rows = ((result.sources ?? []) as Src[]).map((s) => ({
					d: domainOf(s),
					s,
				}));
				const official = rows.filter((r) => isOfficial(r.d)).length;

				console.log(
					`queries (${queries.length}): ${queries.join(" | ") || "—"}`,
				);
				console.log(
					`sources (${rows.length}; ${official} official-leaning, shown as-is):`,
				);
				for (const { d, s } of rows.slice(0, 12))
					console.log(`  ${d.padEnd(22)} ${s.url ?? ""}`);
				if (rows.length > 12) console.log(`  … +${rows.length - 12} more`);
				console.log(`text: ${result.text.replace(/\s+/g, " ").slice(0, 360)}…`);
			} catch (err) {
				console.log(
					`ERROR: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}
}

main();

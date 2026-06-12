import { getAllDocs, getDocOrder } from "@/lib/docs";

// The llms.txt standard: a machine-readable index of the docs so an LLM can find
// and fetch the pages it needs. https://llmstxt.org
export const dynamic = "force-static";

const BASE = "https://usepatrick.com";

export async function GET() {
	const byUrl = new Map((await getAllDocs()).map((d) => [d.url, d]));
	const order = await getDocOrder();
	const lines = [
		"# Patrick",
		"",
		"> An agent-first patent-prosecution assistant — open, transparent, and yours. Patrick drafts and redlines office actions and claim amendments in your own Word files, as native tracked changes you approve, on your own computer.",
		"",
		"## Docs",
		"",
		...order.map((o) => {
			const desc = byUrl.get(o.url)?.frontmatter.description;
			return `- [${o.title}](${BASE}${o.url})${desc ? `: ${desc}` : ""}`;
		}),
		"",
		`Full text of every page: ${BASE}/llms-full.txt`,
		"",
	];
	return new Response(lines.join("\n"), {
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
}

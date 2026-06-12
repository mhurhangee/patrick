import { getAllDocs, getDocOrder } from "@/lib/docs";

// Every doc, concatenated as Markdown — drop the whole manual into an LLM.
export const dynamic = "force-static";

export async function GET() {
	const byUrl = new Map((await getAllDocs()).map((d) => [d.url, d]));
	const order = await getDocOrder();
	const body = order
		.map((o) => {
			const d = byUrl.get(o.url);
			return d ? `# ${d.frontmatter.title}\n\n${d.content.trim()}` : "";
		})
		.filter(Boolean)
		.join("\n\n---\n\n");
	return new Response(body, {
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
}

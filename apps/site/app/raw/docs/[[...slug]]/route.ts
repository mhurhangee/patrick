import { notFound } from "next/navigation";
import { getAllSlugs, getDoc } from "@/lib/docs";

// Raw Markdown for a page — the "view as markdown" target. Static, one per page.
export const dynamic = "force-static";

export async function generateStaticParams() {
	return (await getAllSlugs()).map((slug) => ({ slug }));
}

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ slug?: string[] }> },
) {
	const { slug = [] } = await params;
	const doc = await getDoc(slug);
	if (!doc) notFound();
	const body = `# ${doc.frontmatter.title}\n\n${doc.content.trim()}\n`;
	return new Response(body, {
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
}

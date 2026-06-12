import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { DocsToc } from "@/components/docs/docs-toc";
import { mdxComponents } from "@/components/mdx/mdx";
import { extractToc, getAllSlugs, getDoc } from "@/lib/docs";

export const dynamicParams = false;

type Params = { slug?: string[] };

export async function generateStaticParams() {
	return (await getAllSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<Params>;
}): Promise<Metadata> {
	const { slug = [] } = await params;
	const doc = await getDoc(slug);
	if (!doc) return {};
	return {
		title: doc.frontmatter.title,
		description: doc.frontmatter.description,
	};
}

const prettyCodeOptions = {
	theme: { light: "github-light-default", dark: "github-dark-default" },
	keepBackground: false,
} as const;

const autolinkOptions = {
	behavior: "append" as const,
	properties: {
		className: ["heading-anchor"],
		tabIndex: -1,
		ariaHidden: "true",
	},
	content: { type: "text" as const, value: "#" },
};

export default async function DocPage({ params }: { params: Promise<Params> }) {
	const { slug = [] } = await params;
	const doc = await getDoc(slug);
	if (!doc) notFound();

	const { content } = await compileMDX({
		source: doc.content,
		components: mdxComponents,
		options: {
			mdxOptions: {
				remarkPlugins: [remarkGfm],
				rehypePlugins: [
					rehypeSlug,
					[rehypePrettyCode, prettyCodeOptions],
					[rehypeAutolinkHeadings, autolinkOptions],
				],
			},
		},
	});

	const toc = extractToc(doc.content);

	return (
		<div className="grid gap-10 xl:grid-cols-[1fr_14rem]">
			<article className="docs-prose min-w-0">
				<header className="mb-8 border-b border-border pb-6">
					<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
						{doc.frontmatter.title}
					</h1>
					{doc.frontmatter.description && (
						<p className="mt-2 text-lg text-muted-foreground">
							{doc.frontmatter.description}
						</p>
					)}
				</header>
				{content}
			</article>
			<DocsToc items={toc} />
		</div>
	);
}

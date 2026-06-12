import { promises as fs } from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";
import matter from "gray-matter";

// The docs are plain .mdx files under content/docs — the source of truth. This
// reads them, builds the sidebar nav (grouped + ordered by frontmatter), and
// extracts an on-page TOC. No framework: just files + a few helpers we own.

const DOCS_DIR = path.join(process.cwd(), "content/docs");

type DocFrontmatter = {
	title: string;
	description?: string;
	/** Sidebar group heading. */
	group?: string;
	/** Sort order within the group (and the group's own order = its min). */
	order?: number;
};

export type Doc = {
	slug: string[];
	url: string;
	frontmatter: DocFrontmatter;
	content: string;
};

export type TocItem = { depth: 2 | 3; text: string; id: string };
export type NavGroup = {
	group: string;
	items: { title: string; url: string }[];
};

async function walk(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((e) => {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) return walk(full);
			return Promise.resolve(
				e.isFile() && e.name.endsWith(".mdx") ? [full] : [],
			);
		}),
	);
	return nested.flat();
}

function fileToSlug(file: string): string[] {
	const parts = path
		.relative(DOCS_DIR, file)
		.replace(/\.mdx$/, "")
		.split(path.sep);
	// index.mdx maps to its parent: content/docs/index.mdx → [], foo/index.mdx → [foo].
	if (parts.at(-1) === "index") parts.pop();
	return parts;
}

export async function getAllDocs(): Promise<Doc[]> {
	const files = await walk(DOCS_DIR);
	return Promise.all(
		files.map(async (file) => {
			const { data, content } = matter(await fs.readFile(file, "utf8"));
			const slug = fileToSlug(file);
			return {
				slug,
				url: `/docs${slug.length ? `/${slug.join("/")}` : ""}`,
				frontmatter: data as DocFrontmatter,
				content,
			};
		}),
	);
}

export async function getDoc(slug: string[]): Promise<Doc | null> {
	const key = slug.join("/");
	return (await getAllDocs()).find((d) => d.slug.join("/") === key) ?? null;
}

export async function getAllSlugs(): Promise<string[][]> {
	return (await getAllDocs()).map((d) => d.slug);
}

export async function getNav(): Promise<NavGroup[]> {
	const docs = await getAllDocs();
	const groups = new Map<string, Doc[]>();
	for (const d of docs) {
		const g = d.frontmatter.group ?? "Docs";
		groups.set(g, [...(groups.get(g) ?? []), d]);
	}
	return [...groups.entries()]
		.map(([group, items]) => ({
			group,
			min: Math.min(...items.map((d) => d.frontmatter.order ?? 99)),
			items: items
				.sort(
					(a, b) =>
						(a.frontmatter.order ?? 99) - (b.frontmatter.order ?? 99) ||
						a.frontmatter.title.localeCompare(b.frontmatter.title),
				)
				.map((d) => ({ title: d.frontmatter.title, url: d.url })),
		}))
		.sort((a, b) => a.min - b.min)
		.map(({ group, items }) => ({ group, items }));
}

// h2/h3 headings for the on-page TOC. A fresh GithubSlugger per doc matches the
// ids rehype-slug generates (same library, same order), so anchors line up.
export function extractToc(content: string): TocItem[] {
	const slugger = new GithubSlugger();
	const toc: TocItem[] = [];
	let inFence = false;
	for (const line of content.split("\n")) {
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
		if (!m) continue;
		const text = (m[2] as string).replace(/[*_`]/g, "");
		toc.push({
			depth: (m[1] as string).length as 2 | 3,
			text,
			id: slugger.slug(text),
		});
	}
	return toc;
}

import { promises as fs } from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";
import matter from "gray-matter";

// The docs are plain .mdx files under content/docs — the source of truth. The
// folder structure drives the sidebar: a folder is a (collapsible) section, a
// file is a page, an index.mdx is the section's landing page. This reads them,
// builds the nav tree + a flat reading order (for prev/next), and extracts an
// on-page TOC. No framework: just files + a few helpers we own.

const DOCS_DIR = path.join(process.cwd(), "content/docs");

type DocFrontmatter = {
	title: string;
	description?: string;
	/** Sort order within its folder (and a section's order = its index's order). */
	order?: number;
};

export type Doc = {
	slug: string[];
	url: string;
	frontmatter: DocFrontmatter;
	content: string;
};

export type TocItem = { depth: 2 | 3; text: string; id: string };
export type NavNode = {
	title: string;
	url?: string;
	order: number;
	children: NavNode[];
};

function humanize(s: string): string {
	return s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

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

// The sidebar nav tree, mirroring the folder structure. A folder's index.mdx
// supplies its section title/url/order; folders without one fall back to a
// humanized name and aren't clickable.
export async function getNav(): Promise<NavNode[]> {
	const docs = await getAllDocs();
	const root: NavNode = { title: "", order: 0, children: [] };
	const byPath = new Map<string, NavNode>([["", root]]);

	const ensure = (segs: string[]): NavNode => {
		const key = segs.join("/");
		const existing = byPath.get(key);
		if (existing) return existing;
		const node: NavNode = {
			title: humanize(segs.at(-1) ?? ""),
			order: 99,
			children: [],
		};
		byPath.set(key, node);
		const parent = segs.length === 1 ? root : ensure(segs.slice(0, -1));
		parent.children.push(node);
		return node;
	};

	for (const d of docs) {
		const node =
			d.slug.length === 0
				? (() => {
						const leaf: NavNode = { title: "", order: 99, children: [] };
						root.children.push(leaf);
						return leaf;
					})()
				: ensure(d.slug);
		node.title = d.frontmatter.title;
		node.url = d.url;
		node.order = d.frontmatter.order ?? 99;
	}

	const sort = (nodes: NavNode[]) => {
		nodes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
		for (const n of nodes) sort(n.children);
	};
	sort(root.children);
	return root.children;
}

// Flat reading order (depth-first over pages) for the prev/next pager.
export async function getDocOrder(): Promise<{ title: string; url: string }[]> {
	const flatten = (nodes: NavNode[]): { title: string; url: string }[] =>
		nodes.flatMap((n) => [
			...(n.url ? [{ title: n.title, url: n.url }] : []),
			...flatten(n.children),
		]);
	return flatten(await getNav());
}

// h2/h3 headings for the on-page TOC. A fresh GithubSlugger per doc matches the
// ids rehype-slug generates (same library, same order), so anchors line up.
export function extractToc(content: string): TocItem[] {
	const slugger = new GithubSlugger();
	const toc: TocItem[] = [];
	let inFence = false;
	for (const line of content.split("\n")) {
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
		if (!m) continue;
		// Match what rehype-slug sees (the rendered text): unwrap links to their
		// label and drop emphasis/code markers before slugging.
		const text = (m[2] as string)
			.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
			.replace(/[*_`]/g, "");
		toc.push({
			depth: (m[1] as string).length as 2 | 3,
			text,
			id: slugger.slug(text),
		});
	}
	return toc;
}

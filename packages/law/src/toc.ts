import { ENTRIES } from "./maps";
import { SOURCES } from "./sources";
import type { EpcMapEntry } from "./types";

// A source's table of contents as a nested markdown outline — the navigable index
// find_law gives a subagent. The hierarchy comes from the slug prefixes (a_i_1_1 →
// under a_i_1 → under a_i → under a); recallable leaves carry their `citation` tag,
// nav/index pages are untagged headings (you can't retrieve them, only their
// sections). The model returns the tags of the relevant leaves.
export function tableOfContents(sourceId: string): string {
	const label = SOURCES.find((s) => s.id === sourceId)?.label ?? sourceId;
	const entries = ENTRIES.filter((e) => e.source === sourceId);
	const bySlug = new Map(entries.map((e) => [e.slug, e]));

	// Nearest existing ancestor (skips levels that have no page of their own).
	const parentSlug = (slug: string): string | null => {
		let s = slug;
		while (s.includes("_")) {
			s = s.slice(0, s.lastIndexOf("_"));
			if (bySlug.has(s)) return s;
		}
		return null;
	};

	const childrenOf = new Map<string, EpcMapEntry[]>();
	const roots: EpcMapEntry[] = [];
	for (const e of entries) {
		const p = parentSlug(e.slug);
		if (p) {
			const kids = childrenOf.get(p) ?? [];
			kids.push(e);
			childrenOf.set(p, kids);
		} else {
			roots.push(e);
		}
	}

	const order = (a: EpcMapEntry, b: EpcMapEntry): number =>
		(a.citationKey ?? a.slug).localeCompare(
			b.citationKey ?? b.slug,
			undefined,
			{
				numeric: true,
			},
		);

	const lines: string[] = [`# ${label}`];
	const render = (e: EpcMapEntry, depth: number): void => {
		const indent = "  ".repeat(depth);
		const title = e.title ?? e.slug;
		lines.push(
			e.recallable && e.citationKey
				? `${indent}- \`${e.citationKey}\` ${title}`
				: `${indent}- ${title}`,
		);
		for (const c of (childrenOf.get(e.slug) ?? []).sort(order))
			render(c, depth + 1);
	};
	for (const r of roots.sort(order)) render(r, 0);
	return lines.join("\n");
}

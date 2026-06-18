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

	// Compact form: recallable leaves are flat `key title` lines (the key already
	// encodes the hierarchy), nav/index pages are markdown headings by depth. No
	// per-line indentation or bullets, and the leading section number is stripped
	// from the title (it's already in the key) — lossless, and a sizeable token
	// saving on the big TOCs that find_law sends to the model on every call.
	const lines: string[] = [`# ${label}`];
	const titleOf = (e: EpcMapEntry): string =>
		(e.title ?? e.slug).replace(/^\d+(?:\.\d+)*\.?\s+/, "");
	const render = (e: EpcMapEntry, depth: number): void => {
		lines.push(
			e.recallable && e.citationKey
				? `\`${e.citationKey}\` ${titleOf(e)}`
				: `${"#".repeat(Math.min(depth + 2, 6))} ${titleOf(e)}`,
		);
		for (const c of (childrenOf.get(e.slug) ?? []).sort(order))
			render(c, depth + 1);
	};
	for (const r of roots.sort(order)) render(r, 0);
	return lines.join("\n");
}

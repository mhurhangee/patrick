import {
	classifyCaselaw,
	classifyGuideline,
	classifySlug,
	type SlugClassification,
} from "./classify";

export interface Source {
	id: string;
	label: string;
	/** URL path after /en/legal/, with the edition year — bump when it rolls. */
	path: string;
	classify: (slug: string) => SlugClassification;
	/**
	 * Fetch each page's <head> for its title. Only the small EPC set is worth the
	 * crawl; the Guidelines/case-law maps are sitemap-only (citation key from the
	 * slug, title shown from the body on recall). See `build-map.ts`.
	 */
	fetchTitles: boolean;
}

export const SOURCES: Source[] = [
	{
		id: "epc",
		label: "EPC",
		path: "epc/2020",
		classify: classifySlug,
		fetchTitles: true,
	},
	{
		id: "guidelines-epc",
		label: "EPC Guidelines for Examination",
		path: "guidelines-epc/2026",
		classify: (s) => classifyGuideline(s, ""),
		fetchTitles: false,
	},
	{
		id: "guidelines-pct",
		label: "PCT-EPO Guidelines for Search and Examination",
		path: "guidelines-pct/2026",
		classify: (s) => classifyGuideline(s, "PCT "),
		fetchTitles: false,
	},
	{
		id: "caselaw",
		label: "Case Law of the Boards of Appeal",
		path: "case-law/2025",
		classify: classifyCaselaw,
		fetchTitles: false,
	},
];

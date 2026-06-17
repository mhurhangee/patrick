import {
	classifyCaselaw,
	classifyGuideline,
	classifySlug,
	type SlugClassification,
} from "./classify";

export interface Source {
	id: string;
	label: string;
	/** Short label for the in-force stamp on a recalled provision. */
	stamp: string;
	/** URL path after /en/legal/, with the edition year — bump when it rolls. */
	path: string;
	classify: (slug: string) => SlugClassification;
}

export const SOURCES: Source[] = [
	{
		id: "epc",
		label: "EPC",
		stamp: "EPC 2020",
		path: "epc/2020",
		classify: classifySlug,
	},
	{
		id: "guidelines-epc",
		label: "EPC Guidelines for Examination",
		stamp: "EPC Guidelines",
		path: "guidelines-epc/2026",
		classify: (s) => classifyGuideline(s, ""),
	},
	{
		id: "guidelines-pct",
		label: "PCT-EPO Guidelines for Search and Examination",
		stamp: "PCT-EPO Guidelines",
		path: "guidelines-pct/2026",
		classify: (s) => classifyGuideline(s, "PCT "),
	},
	{
		id: "caselaw",
		label: "Case Law of the Boards of Appeal",
		stamp: "Case Law of the Boards of Appeal",
		path: "case-law/2025",
		classify: classifyCaselaw,
	},
];

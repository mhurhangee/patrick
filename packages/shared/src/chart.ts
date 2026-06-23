// A "Chart" is a Patrick-generated analysis object — structured, task-scoped, and
// stored as JSON under <folder>/.patrick/charts/<id>.json (the chat pattern). The
// canonical artifact is this JSON; xlsx/docx/pdf are one-way exports. `type` is the
// open seam: claim-chart is the first kind, with timelines / FTO / family trees /
// decision trees to follow under the same envelope and sidebar section.
//
// See CLAIM-CHARTING.md for the design + the why.

/** The kind of analysis. The union grows as new chart types land. */
export type ChartType = "claim-chart";

/** Bumped when the on-disk shape changes, so the JSON stays portable (a stored
 *  chart records the schema it was written with). */
export const CHART_SCHEMA_VERSION = 1;

type ChartBase = {
	id: string;
	/** Display + rename target (the sidebar row, the export filename stem). */
	title: string;
	createdAt: string;
	updatedAt: string;
	/** The schema this record was written with (CHART_SCHEMA_VERSION). */
	schemaVersion: number;
	/** Floated to the top of the sidebar list when set. */
	starred?: boolean;
};

// ─── Claim chart ─────────────────────────────────────────────────────────────────

/** One claim limitation — a row of the spine: the write-once, HITL-locked backbone
 *  every block reads and none re-decides. */
export type ClaimLimitation = {
	/** Stable key across every block (e.g. "1a", "1b"). */
	id: string;
	/** Verbatim claim text — never paraphrased. */
	text: string;
	/** Assumed scope of the key term(s), construed in light of the spec. Locked at
	 *  the HITL gate; cells read it, never edit it. */
	construction: string;
};

/** A reference document being charted (a doc in the task). */
export type ChartReference = {
	/** The document's filename in the task folder. */
	filename: string;
	/** Short handle shown as the column header (e.g. "D1"); falls back to the label. */
	label?: string;
};

/** How a reference discloses a limitation (document-as-a-whole verdict). EP
 *  thresholds: Express = verbatim/near-verbatim; Derived = directly & unambiguously
 *  derivable (the anticipation threshold); Suggested = points the skilled person
 *  toward it, below the threshold (obviousness-only, non-anticipatory); Absent. */
export type DisclosureType = "Express" | "Derived" | "Suggested" | "Absent";

/** Evidence for a cell — a retrieved chunk the agent pointed at (by reference, so it
 *  can't be fabricated). The chunk text is embedded so the chart survives the search
 *  index being rebuilt or deleted. */
export type ChartCitation = {
	/** The retrieved chunk's text, embedded for durability. */
	chunkText: string;
	/** Best-effort source position (page / locator), for the jump-to-source link. */
	location?: string;
	/** Sub-spans worth emphasising. Lenient-matched against chunkText; on a miss the
	 *  whole chunk is shown. */
	highlights: string[];
};

/** One cell of the chart — a (limitation × reference) judgement. Four orthogonal
 *  fields, none a derivation of another: model verdict, model argument, grounded
 *  evidence, human sign-off. */
export type ChartCell = {
	limitationId: string;
	/** The reference's filename (keys to a ChartReference). */
	reference: string;
	disclosureType: DisclosureType;
	/** Self-contained reasoning ("limitation X, construed as Y, is disclosed by …
	 *  because …") — argument, not the citation of record. */
	reasoning: string;
	citations: ChartCitation[];
	/** The attorney has manually verified this cell's citations. */
	checked: boolean;
	/** The spine version this cell was built against; a mismatch with the chart's
	 *  spineVersion flags the cell as stale after the construction changes. */
	spineVersion: number;
};

export type ClaimChart = ChartBase & {
	type: "claim-chart";
	/** The limitations backbone. Locked at the HITL gate. */
	spine: ClaimLimitation[];
	/** Stamp bumped whenever the locked spine changes; cells carry the version they
	 *  were built against (stale-cell detection). */
	spineVersion: number;
	/** True once the attorney approves the spine; cells build only against a locked spine. */
	locked: boolean;
	/** The references being charted (the columns). */
	references: ChartReference[];
	/** The filled cells (sparse — one per analysed limitation × reference). */
	cells: ChartCell[];
};

/** The persisted analysis object. A discriminated union (over `type`) as new chart
 *  kinds land; one member today. */
export type Chart = ClaimChart;

/** Lightweight shape for the sidebar list. */
export type ChartSummary = {
	id: string;
	type: ChartType;
	title: string;
	updatedAt: string;
	starred?: boolean;
};

/** A blank claim chart — the spine is filled by the parse/construe nodes, then
 *  locked at the HITL gate before any cell is built. */
export function createClaimChart(
	id: string,
	title = "Untitled claim chart",
): ClaimChart {
	const now = new Date().toISOString();
	return {
		id,
		type: "claim-chart",
		title,
		createdAt: now,
		updatedAt: now,
		schemaVersion: CHART_SCHEMA_VERSION,
		spine: [],
		spineVersion: 0,
		locked: false,
		references: [],
		cells: [],
	};
}

export function chartSummary(chart: Chart): ChartSummary {
	return {
		id: chart.id,
		type: chart.type,
		title: chart.title,
		updatedAt: chart.updatedAt,
		starred: chart.starred,
	};
}

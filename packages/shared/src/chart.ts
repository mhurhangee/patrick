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

/** The extraction method used to fill a cell — the test-bed knob (see CLAIM-CHARTING.md):
 *  semantic = search-then-classify; hybrid = whole-read then search-for-citation;
 *  full-doc = whole-read with model-given citation. */
export type ChartMethod = "semantic" | "hybrid" | "full-doc";

/** A grounded citation: a verbatim passage from the reference + its location. Search-
 *  found (semantic/hybrid) or model-given (full-doc). */
export type ChartCitation = {
	quote: string;
	/** Best-effort source position (page / locator). */
	location?: string;
};

/** One cell — a (limitation × reference × method) judgement. Cells are tagged by method
 *  so a chart can hold and toggle between methods (the test bed). */
export type ChartCell = {
	limitationId: string;
	/** The reference's filename (keys to a ChartReference). */
	reference: string;
	method: ChartMethod;
	disclosureType: DisclosureType;
	/** What the reference teaches re: this limitation (the whole-read summary; absent for
	 *  the semantic method). */
	teaching?: string;
	/** Self-contained reasoning ("limitation X, construed as Y, is disclosed by … because …"). */
	reasoning: string;
	citations: ChartCitation[];
	/** The attorney has manually verified this cell. */
	checked: boolean;
	/** The spine version this cell was built against; a mismatch flags it as stale. */
	spineVersion: number;
};

/** The per-limitation result of a whole-document read (hybrid / full-doc). The read
 *  judges disclosure from the reference as a whole; the method then sources the citation
 *  from `citation` (full-doc, model-given) or by searching `hint` (hybrid). */
export type LimitationRead = {
	limitationId: string;
	disclosed: DisclosureType;
	teaching: string;
	reasoning: string;
	/** A short phrase to locate the supporting passage via search (hybrid). */
	hint: string;
	/** The model's own verbatim citation (full-doc); null if Absent. */
	citation: ChartCitation | null;
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
	/** Optional primer document (filename) fed into the whole read to shape the analysis
	 *  — the examiner's report (OA mode), a product description (FTO), etc. The "mode" is
	 *  just which primer. */
	primer?: string;
	/** The filled cells (sparse — one per analysed limitation × reference × method). */
	cells: ChartCell[];
};

/** The semantic baseline's classification of one cell over retrieved passages: the
 *  verdict + reasoning + which passages (by index) it relied on. The client turns the
 *  indices into citations against the passages it retrieved. */
export type CellClassification = {
	disclosureType: DisclosureType;
	reasoning: string;
	passages: number[];
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

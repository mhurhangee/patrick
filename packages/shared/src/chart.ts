// A "Chart" is a Patrick-generated analysis object — structured, task-scoped, and
// stored as JSON under <folder>/.patrick/charts/<id>.json (the chat pattern). The
// canonical artifact is this JSON; xlsx/docx/pdf are one-way exports. `type` is the
// open seam: claim-chart is the first kind, with timelines / FTO / family trees /
// decision trees to follow under the same envelope and sidebar section.
//
// See CLAIM-CHARTING.md for the design + the why.

/** The kind of analysis. The union grows as new chart types land. */
export type ChartType = "claim-chart";

/** Bumped when the on-disk shape changes, so the JSON stays portable. */
export const CHART_SCHEMA_VERSION = 3;

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

/** One claim limitation — a row of the table. */
export type ClaimLimitation = {
	/** Stable internal id. Cells key off THIS, never the label (which is editable). */
	uid: string;
	/** Display id ("1a", "1b" …), editable. */
	label: string;
	/** Verbatim claim text. */
	text: string;
	/** A SELF-CONTAINED construction of the key term(s) — a standalone statement of
	 *  meaning (read in light of the description, but usable without it; it's sent to the
	 *  rows for the novelty analysis). */
	construction: string;
	/** Where in the description the construction is supported (paragraphs / figures), so
	 *  the attorney can check it. */
	constructionBasis?: string;
};

/** A column of the table: one reference analysed against the limitations, optionally
 *  shaped by a primer (exam/search report …). Has its own id so the same reference can
 *  appear twice with different primers. */
export type ChartColumn = {
	id: string;
	/** The reference document's filename. */
	reference: string;
	/** Optional primer document (filename) fed into the read to shape the analysis. */
	primer?: string;
};

/** How a reference discloses a limitation, read as a whole. EP thresholds: Express =
 *  verbatim/near-verbatim; Derived = directly & unambiguously derivable (anticipation
 *  threshold); Suggested = points the skilled person toward it, below the threshold
 *  (inventive step, not novelty); Absent. */
export type DisclosureType = "Express" | "Derived" | "Suggested" | "Absent";

/** A citation to a passage in the reference. We show a human-checkable LOCATION (not a
 *  verbatim quote — that travels badly across languages and invites fabricated-quote
 *  distrust); the attorney clicks it to read the source. The optional `snippet` is a short
 *  verbatim phrase kept ONLY to anchor click-to-highlight precisely; it is never displayed. */
export type ChartCitation = {
	/** Where in the reference: `[0021]` for numbered text, page/column/line for PDFs. Shown. */
	location: string;
	/** A few exact words from the passage, to sharpen highlight/scroll. Not shown. */
	snippet?: string;
};

/** The trust/provenance state of a cell:
 *  - ai: drafted by the read, not yet approved.
 *  - edited: a human changed the verdict / citations / reasoning.
 *  - approved: a human signed off.
 *  - stale: the row's text or construction changed since this cell was produced. */
export type CellStatus = "ai" | "edited" | "approved" | "stale";

/** One cell — a (limitation × column) judgement, keyed by the limitation's uid and the
 *  column's id. */
export type ChartCell = {
	limitationUid: string;
	columnId: string;
	disclosureType: DisclosureType;
	/** Self-contained reasoning. */
	reasoning: string;
	citations: ChartCitation[];
	status: CellStatus;
};

/** The per-limitation result of a whole-document read. Echoes the limitation's `label`
 *  so the client can map it back to the row. */
export type LimitationRead = {
	limitationLabel: string;
	disclosed: DisclosureType;
	reasoning: string;
	/** The passages evidencing the disclosure, most on-point first; empty if Absent. */
	citations: ChartCitation[];
};

export type ClaimChart = ChartBase & {
	type: "claim-chart";
	/** The rows. */
	limitations: ClaimLimitation[];
	/** The analysis columns (each a reference × optional primer). */
	columns: ChartColumn[];
	/** The filled cells (sparse — one per analysed limitation × column). */
	cells: ChartCell[];
	/** Last-used construction-support doc (the description), to default the parse popover. */
	constructionSupport?: string;
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
		limitations: [],
		columns: [],
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

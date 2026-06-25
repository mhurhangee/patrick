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
	/** The model the analysis runs on (parse + read). Unset ⇒ the profile's default model.
	 *  Picked per chart because analysis quality is model-sensitive (weak models
	 *  mischaracterise disclosures). */
	model?: string;
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

/** The per-limitation result of a whole-document read. Echoes the limitation's stable
 *  `uid` (not the editable, non-unique label) so the client maps it back to the right row. */
export type LimitationRead = {
	limitationUid: string;
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
	/** Persisted column widths (px), keyed by column id (and "feature" for the first
	 *  column). Absent ⇒ the defaults. */
	columnWidths?: Record<string, number>;
	/** Last-used construction-support doc (the description), to default the parse popover. */
	constructionSupport?: string;
	/** Last-used claims document — the navigation target for a limitation's constructionBasis
	 *  when there's no separate construction-support doc (the claims doc held the description). */
	claimsDocument?: string;
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

/** Merge a column's whole-document reads onto its cells, keyed by the stable limitation uid
 *  the read echoes (never the editable, non-unique label). The single source of truth for the
 *  "re-run preserves human work" rule, used by BOTH the server agent tool and the viewer:
 *  - refresh AI / stale / new cells from the reads;
 *  - keep human-touched (edited / approved) cells unless `force`;
 *  - carry forward any existing cell whose limitation the read omitted (still a valid row) —
 *    don't silently drop a verdict the model just didn't re-emit;
 *  - mark a freshly-produced cell `stale` (not `ai`) when its row changed mid-read (`staleUids`).
 *  Returns the FULL cell set for the column; the caller swaps it in for that columnId. */
export function mergeColumnReads(params: {
	columnId: string;
	reads: LimitationRead[];
	/** The chart's current cells (any columns — filtered here). */
	cells: ChartCell[];
	/** Limitation uids that still exist (cells for removed rows are dropped). */
	validUids: Set<string>;
	force: boolean;
	/** Uids whose row text/construction changed while the read was in flight. */
	staleUids?: Set<string>;
}): ChartCell[] {
	const { columnId, reads, force, staleUids } = params;
	const existing = new Map(
		params.cells
			.filter((c) => c.columnId === columnId)
			.map((c) => [c.limitationUid, c]),
	);
	const seen = new Set<string>();
	const next: ChartCell[] = [];
	for (const r of reads) {
		if (!params.validUids.has(r.limitationUid)) continue;
		seen.add(r.limitationUid);
		const prev = existing.get(r.limitationUid);
		if (
			!force &&
			prev &&
			(prev.status === "edited" || prev.status === "approved")
		) {
			next.push(prev);
		} else {
			next.push({
				limitationUid: r.limitationUid,
				columnId,
				disclosureType: r.disclosed,
				reasoning: r.reasoning,
				citations: r.citations ?? [],
				status: staleUids?.has(r.limitationUid) ? "stale" : "ai",
			});
		}
	}
	// Carry forward existing cells the read omitted (still-valid limitations only).
	for (const [uid, cell] of existing)
		if (!seen.has(uid) && params.validUids.has(uid)) next.push(cell);
	return next;
}

/** The chart-driving agent tools, named once so the server (buildChartTools) and the client
 *  (the tool-name sets in agent-chat) can't drift. `read_chart` is read-only; the rest mutate
 *  the chart on disk, so a client seeing one of their results must refresh the open viewer. */
export const READ_CHART_TOOL = "read_chart";
export const MUTATING_CHART_TOOLS = [
	"create_chart",
	"parse_claim",
	"add_reference",
	"run_analysis",
	"edit_cell",
	"edit_limitation",
] as const;
export const CHART_TOOL_NAMES = [
	READ_CHART_TOOL,
	...MUTATING_CHART_TOOLS,
] as const;

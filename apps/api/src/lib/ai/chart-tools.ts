import { basename } from "node:path";
import {
	assembleClaimAnalysisPrompt,
	assembleClaimConstructionPrompt,
	type CHART_TOOL_NAMES,
	type Chart,
	type ChartCell,
	type ChartColumn,
	createClaimChart,
	DEFAULT_CLAIM_ANALYSIS_RUBRIC,
	DEFAULT_CLAIM_CONSTRUCTION_RUBRIC,
	mergeColumnReads,
	type Profile,
} from "@patrick/shared";
import { tool } from "ai";
import { z } from "zod";
import { loadCharts, mutateChart, readChart, saveChart } from "../charts";
import { listDocuments } from "../documents";
import { parseClaimSpine } from "./parse-claim";
import { readReference } from "./read-reference";

// Patrick drives the chart. These are server-executed (like ep_law_lookup): they read and
// write the Chart JSON on disk and run the same parse/read engines the UI does — so the
// agent can build a chart whether or not its tab is open. The open viewer refreshes via
// query invalidation when a result streams back. Filenames are resolved against the folder
// (the agent only ever sees basenames); the engines pin + cache the documents themselves.

/** The analysis model for a chart: its per-chart override, else the profile default. */
function chartModel(chart: Chart, profile: Profile): string {
	return chart.model?.trim() || profile.ai.model;
}

/** Count verdicts so the tool returns a compact summary the agent can narrate. */
function verdictTally(cells: ChartCell[]): Record<string, number> {
	const tally: Record<string, number> = {};
	for (const c of cells)
		tally[c.disclosureType] = (tally[c.disclosureType] ?? 0) + 1;
	return tally;
}

/** Render a chart to readable text for read_chart — limitations (with constructions) and,
 *  per reference column, the verdict / status / reasoning / citation locations. A chart is
 *  mutable Patrick-owned state, so it's read live through this tool (like the editable
 *  draft), never pinned as cached context. Internal uids are omitted; columns are headed by
 *  their reference filename (which is also how run_analysis identifies a column). */
function renderChart(chart: Chart): string {
	const out: string[] = [`# Claim chart: ${chart.title}`];
	if (chart.limitations.length === 0)
		return `${out.join("\n")}\n\n(No limitations yet — the chart is empty.)`;

	const cellByKey = new Map<string, ChartCell>();
	for (const c of chart.cells)
		cellByKey.set(`${c.limitationUid}|${c.columnId}`, c);
	const colHeader = (col: ChartColumn) =>
		`${col.reference}${col.primer ? ` (primer: ${col.primer})` : ""}`;

	if (chart.columns.length === 0)
		out.push("", "No reference columns yet — limitations only.");

	for (const lim of chart.limitations) {
		out.push(
			"",
			`## ${lim.label || "(unlabelled)"} [id: ${lim.uid}]: ${lim.text}`,
		);
		if (lim.construction?.trim())
			out.push(`Construction: ${lim.construction.trim()}`);
		if (lim.constructionBasis?.trim())
			out.push(`Construction basis: ${lim.constructionBasis.trim()}`);
		for (const col of chart.columns) {
			const cell = cellByKey.get(`${lim.uid}|${col.id}`);
			if (!cell) {
				out.push(`- ${colHeader(col)}: not yet analysed`);
				continue;
			}
			const cites = cell.citations.map((c) => c.location).filter(Boolean);
			const citeStr = cites.length ? ` | Citations: ${cites.join(", ")}` : "";
			out.push(
				`- ${colHeader(col)}: ${cell.disclosureType} [${cell.status}] — ${cell.reasoning}${citeStr}`,
			);
		}
	}
	return out.join("\n");
}

/** The chart-driving tools, bound to one task folder + profile. */
export function buildChartTools(folder: string, profile: Profile) {
	const constructionPrompt = assembleClaimConstructionPrompt(
		profile.prompts.claimConstruction?.trim() ||
			DEFAULT_CLAIM_CONSTRUCTION_RUBRIC,
	);
	const analysisPrompt = assembleClaimAnalysisPrompt(
		profile.prompts.claimAnalysis?.trim() || DEFAULT_CLAIM_ANALYSIS_RUBRIC,
	);

	// Resolve a filename the agent gave against the actual folder (basename match, so a
	// path or a stray label can't reach outside it). Returns null if it isn't a real doc.
	async function resolveDoc(name: string): Promise<string | null> {
		const want = basename(name);
		const docs = await listDocuments(folder);
		return docs.some((d) => d.filename === want) ? want : null;
	}

	// Read the chart, run a column's analysis, and persist the merged cells. Shared by
	// add_reference (fresh column) and run_analysis (re-run an existing one).
	async function analyseColumn(
		chartId: string,
		column: ChartColumn,
		force: boolean,
	): Promise<
		| { error: string }
		| { columnId: string; reference: string; verdicts: Record<string, number> }
	> {
		const chart = await readChart(folder, chartId);
		if (!chart) return { error: `no chart with id ${chartId}` };
		if (chart.limitations.length === 0)
			return {
				error: "the chart has no limitations yet — parse a claim first",
			};
		const reads = await readReference(
			folder,
			{ ...profile.ai, model: chartModel(chart, profile) },
			analysisPrompt,
			column.reference,
			column.primer,
			chart.limitations,
		);
		if (!reads)
			return {
				error: `couldn't read ${column.reference} (no extractable text?)`,
			};
		// Re-read and merge so edits the attorney made during the (multi-second) read aren't
		// clobbered; mergeColumnReads preserves their edited/approved cells + carries forward
		// any limitation the model omitted.
		const saved = await mutateChart(folder, chartId, (fresh) => ({
			...fresh,
			columns: fresh.columns.some((c) => c.id === column.id)
				? fresh.columns
				: [...fresh.columns, column],
			cells: [
				...fresh.cells.filter((c) => c.columnId !== column.id),
				...mergeColumnReads({
					columnId: column.id,
					reads,
					cells: fresh.cells,
					validUids: new Set(fresh.limitations.map((l) => l.uid)),
					force,
				}),
			],
		}));
		if (!saved) return { error: `no chart with id ${chartId}` };
		return {
			columnId: column.id,
			reference: column.reference,
			verdicts: verdictTally(
				saved.cells.filter((c) => c.columnId === column.id),
			),
		};
	}

	const read_chart = tool({
		description:
			"Read a claim chart's current contents — its limitations (with constructions) and, for each prior-art reference column, the disclosure verdict, status, reasoning and citation locations. Use this to answer questions about a chart, summarise it, or decide what to add or re-run. The chart is live state, so read it fresh rather than relying on earlier tool results.",
		inputSchema: z.object({
			chartId: z.string().describe("The chart to read (from the chart list)."),
		}),
		execute: async ({ chartId }) => {
			const chart = await readChart(folder, chartId);
			if (!chart) return { error: `no chart with id ${chartId}` };
			return { chart: renderChart(chart) };
		},
	});

	const create_chart = tool({
		description:
			"Create a new, empty claim chart for this matter — a table whose rows are claim limitations and columns are prior-art references analysed against them. Returns the chartId; use it for parse_claim / add_reference / run_analysis. Create one before charting; to extend an existing chart, reuse its id from the chart list instead.",
		inputSchema: z.object({
			title: z
				.string()
				.optional()
				.describe("A short title, e.g. 'Claim 1 vs the cited art'. Optional."),
		}),
		execute: async ({ title }) => {
			const chart = await saveChart(
				folder,
				createClaimChart(crypto.randomUUID(), title?.trim() || undefined),
			);
			return { chartId: chart.id, title: chart.title };
		},
	});

	const parse_claim = tool({
		description:
			"Parse claim(s) from a document into limitations and add them as rows to a chart. Each limitation is construed in light of the description (Art 69 EPC), so pass the description as constructionSupport when the claims document doesn't itself contain it (e.g. amended claims). Adds to whatever rows are already there.",
		inputSchema: z.object({
			chartId: z
				.string()
				.describe("The chart to add rows to (from create_chart)."),
			claimsDocument: z
				.string()
				.describe("Exact filename of the document holding the claims."),
			claims: z
				.string()
				.optional()
				.describe(
					"Which claims to parse: '1', '1-3', '1, 4', 'all independent', or 'all'. Defaults to '1'.",
				),
			constructionSupport: z
				.string()
				.optional()
				.describe(
					"Exact filename of the description/specification to construe in light of (Art 69). Omit if the claims document already contains the description.",
				),
		}),
		execute: async ({
			chartId,
			claimsDocument,
			claims,
			constructionSupport,
		}) => {
			const chart = await readChart(folder, chartId);
			if (!chart) return { error: `no chart with id ${chartId}` };
			const doc = await resolveDoc(claimsDocument);
			if (!doc)
				return { error: `no document named ${claimsDocument} in this matter` };
			const support = constructionSupport
				? await resolveDoc(constructionSupport)
				: null;
			if (constructionSupport && !support)
				return {
					error: `no document named ${constructionSupport} in this matter`,
				};
			const limitations = await parseClaimSpine(
				folder,
				doc,
				{ ...profile.ai, model: chartModel(chart, profile) },
				constructionPrompt,
				(claims ?? "1").trim() || "1",
				support ?? undefined,
			);
			if (!limitations || limitations.length === 0)
				return { error: "couldn't parse a claim from that document" };
			// Idempotent: drop any parsed limitation whose label is already in the chart, so a
			// retry / re-ask on the same claims doesn't double the rows. Re-read so a concurrent
			// edit during the parse isn't clobbered.
			let added: typeof limitations = [];
			const saved = await mutateChart(folder, chartId, (fresh) => {
				const have = new Set(fresh.limitations.map((l) => l.label));
				added = limitations.filter((l) => !have.has(l.label));
				return {
					...fresh,
					limitations: [...fresh.limitations, ...added],
					constructionSupport: support ?? fresh.constructionSupport,
				};
			});
			if (!saved) return { error: `no chart with id ${chartId}` };
			if (added.length === 0)
				return {
					added: 0,
					note: "those limitations are already in the chart (matched by label) — nothing added",
				};
			return {
				added: added.length,
				skipped: limitations.length - added.length,
				limitations: added.map((l) => ({ label: l.label, text: l.text })),
			};
		},
	});

	const add_reference = tool({
		description:
			"Add a prior-art reference as a new column and analyse it against every current limitation — reading the reference in full and judging each limitation (Express / Derived / Suggested / Absent) with checkable citations. Parse the claim(s) first so there are rows to analyse. Returns the verdict tally.",
		inputSchema: z.object({
			chartId: z.string().describe("The chart to add the column to."),
			reference: z
				.string()
				.describe("Exact filename of the prior-art reference to analyse."),
			primer: z
				.string()
				.optional()
				.describe(
					"Exact filename of an optional primer (an exam/search report, product description) that shapes the analysis.",
				),
		}),
		execute: async ({ chartId, reference, primer }) => {
			const ref = await resolveDoc(reference);
			if (!ref)
				return { error: `no document named ${reference} in this matter` };
			const prim = primer ? await resolveDoc(primer) : null;
			if (primer && !prim)
				return { error: `no document named ${primer} in this matter` };
			return analyseColumn(
				chartId,
				{ id: crypto.randomUUID(), reference: ref, primer: prim ?? undefined },
				false,
			);
		},
	});

	const run_analysis = tool({
		description:
			"Re-run the analysis for an existing column (e.g. after adding or editing limitations). Identify the column by its reference filename. By default this refreshes only AI / stale / new cells and preserves cells the attorney has edited or approved; set overwriteHumanEdits to redo the whole column.",
		inputSchema: z.object({
			chartId: z.string().describe("The chart whose column to re-run."),
			reference: z
				.string()
				.describe("Exact reference filename of the existing column to re-run."),
			overwriteHumanEdits: z
				.boolean()
				.optional()
				.describe("Also overwrite edited/approved cells. Defaults to false."),
		}),
		execute: async ({ chartId, reference, overwriteHumanEdits }) => {
			const chart = await readChart(folder, chartId);
			if (!chart) return { error: `no chart with id ${chartId}` };
			const want = basename(reference);
			const matches = chart.columns.filter((c) => c.reference === want);
			if (matches.length === 0)
				return {
					error: `no column for ${reference} in this chart — add it first`,
				};
			if (matches.length > 1)
				return {
					error: `${matches.length} columns use ${reference} (different primers) — re-running by reference is ambiguous; re-run it from the table instead`,
				};
			return analyseColumn(
				chartId,
				matches[0] as ChartColumn,
				overwriteHumanEdits === true,
			);
		},
	});

	const edit_cell = tool({
		description:
			"Update one cell of a claim chart — the disclosure analysis of a limitation in a reference column — at the attorney's direction (e.g. 'D1 doesn't disclose 1b: the construction is too broad and ignores X', or 'review 1b against D1 given …'). Identify the row by its limitation id (the [id: …] from read_chart) and the column by its reference filename. Provide only the fields to change. The cell is marked AI (you authored the change) — so a later column re-run will refresh it; tell the attorney to approve it in the table if they want it to survive a re-run. Read the chart first so you edit current state.",
		inputSchema: z.object({
			chartId: z.string().describe("The chart holding the cell."),
			limitationId: z
				.string()
				.describe("The limitation's id, copied from read_chart ([id: …])."),
			reference: z
				.string()
				.describe("Exact reference filename identifying the column."),
			verdict: z
				.enum(["Express", "Derived", "Suggested", "Absent"])
				.optional()
				.describe("New disclosure verdict."),
			reasoning: z
				.string()
				.optional()
				.describe("Replacement reasoning for the cell (self-contained)."),
			citations: z
				.array(z.string())
				.optional()
				.describe(
					"Replacement citation locations, e.g. ['[0021]', 'col 3 ln 5'] — replaces the cell's citations. Pass [] to clear them.",
				),
		}),
		execute: async ({
			chartId,
			limitationId,
			reference,
			verdict,
			reasoning,
			citations,
		}) => {
			const chart = await readChart(folder, chartId);
			if (!chart) return { error: `no chart with id ${chartId}` };
			const lim = chart.limitations.find((l) => l.uid === limitationId);
			if (!lim)
				return { error: `no limitation with id ${limitationId} in this chart` };
			const want = basename(reference);
			const matches = chart.columns.filter((c) => c.reference === want);
			if (matches.length === 0)
				return { error: `no column for ${reference} in this chart` };
			if (matches.length > 1)
				return {
					error: `${matches.length} columns use ${reference} — editing by reference is ambiguous; disambiguate in the table`,
				};
			const column = matches[0] as ChartColumn;
			if (
				verdict === undefined &&
				reasoning === undefined &&
				citations === undefined
			)
				return {
					error:
						"nothing to change — provide a verdict, reasoning, and/or citations",
				};
			const exists = chart.cells.some(
				(c) => c.limitationUid === lim.uid && c.columnId === column.id,
			);
			if (!exists && verdict === undefined)
				return {
					error:
						"this cell hasn't been analysed yet — provide a verdict to set it, or run the analysis first",
				};
			// Re-read so a concurrent edit isn't clobbered; apply the patch to the fresh cell.
			let result: ChartCell | undefined;
			const saved = await mutateChart(folder, chartId, (fresh) => {
				const prev = fresh.cells.find(
					(c) => c.limitationUid === lim.uid && c.columnId === column.id,
				);
				const next: ChartCell = prev
					? { ...prev }
					: {
							limitationUid: lim.uid,
							columnId: column.id,
							disclosureType: "Absent",
							reasoning: "",
							citations: [],
							status: "ai",
						};
				if (verdict !== undefined) next.disclosureType = verdict;
				if (reasoning !== undefined) next.reasoning = reasoning;
				if (citations !== undefined)
					next.citations = citations.map((location) => ({ location }));
				next.status = "ai";
				result = next;
				return {
					...fresh,
					cells: [
						...fresh.cells.filter(
							(c) => !(c.limitationUid === lim.uid && c.columnId === column.id),
						),
						next,
					],
				};
			});
			if (!saved || !result) return { error: `no chart with id ${chartId}` };
			return {
				limitation: lim.label,
				reference: column.reference,
				verdict: result.disclosureType,
				status: result.status,
			};
		},
	});

	const edit_limitation = tool({
		description:
			"Revise an existing limitation (row) of a claim chart — its construction, claim text, or display label — at the attorney's direction (e.g. 'narrow 1b's construction to require X'). Identify it by its id (the [id: …] from read_chart). Changing the text or construction marks that row's existing analysis cells stale (the verdicts may no longer hold) — offer to re-run the affected columns afterwards. Provide only the fields to change.",
		inputSchema: z.object({
			chartId: z.string().describe("The chart holding the limitation."),
			limitationId: z
				.string()
				.describe("The limitation's id, copied from read_chart ([id: …])."),
			label: z.string().optional().describe("New display label, e.g. '1b'."),
			text: z
				.string()
				.optional()
				.describe("New verbatim claim text for the limitation."),
			construction: z
				.string()
				.optional()
				.describe("New construction (the assumed scope)."),
			constructionBasis: z
				.string()
				.optional()
				.describe(
					"New basis pointer — where in the description the construction is supported (paragraphs / figures). Update this when you change the construction so the cited support still matches.",
				),
		}),
		execute: async ({
			chartId,
			limitationId,
			label,
			text,
			construction,
			constructionBasis,
		}) => {
			const chart = await readChart(folder, chartId);
			if (!chart) return { error: `no chart with id ${chartId}` };
			const lim = chart.limitations.find((l) => l.uid === limitationId);
			if (!lim)
				return { error: `no limitation with id ${limitationId} in this chart` };
			if (
				label === undefined &&
				text === undefined &&
				construction === undefined &&
				constructionBasis === undefined
			)
				return {
					error:
						"nothing to change — provide a label, text, construction, and/or construction basis",
				};
			// Re-read so a concurrent edit isn't clobbered; staling matches the table's inline
			// edit (text/construction change ⇒ every one of the row's cells goes stale).
			let staleRefs: string[] = [];
			const saved = await mutateChart(folder, chartId, (fresh) => {
				const target = fresh.limitations.find((l) => l.uid === limitationId);
				if (!target) return fresh; // vanished between read and write — no-op
				const updated = { ...target };
				if (label !== undefined) updated.label = label;
				if (text !== undefined) updated.text = text;
				if (construction !== undefined) updated.construction = construction;
				if (constructionBasis !== undefined)
					updated.constructionBasis = constructionBasis || undefined;
				const invalidates =
					(text !== undefined && text !== target.text) ||
					(construction !== undefined && construction !== target.construction);
				staleRefs = invalidates
					? [
							...new Set(
								fresh.cells
									.filter((c) => c.limitationUid === target.uid)
									.map(
										(c) =>
											fresh.columns.find((col) => col.id === c.columnId)
												?.reference,
									)
									.filter((r): r is string => !!r),
							),
						]
					: [];
				return {
					...fresh,
					limitations: fresh.limitations.map((l) =>
						l.uid === target.uid ? updated : l,
					),
					cells: invalidates
						? fresh.cells.map((c) =>
								c.limitationUid === target.uid ? { ...c, status: "stale" } : c,
							)
						: fresh.cells,
				};
			});
			if (!saved) return { error: `no chart with id ${chartId}` };
			return { limitation: label ?? lim.label, staleColumns: staleRefs };
		},
	});

	// `satisfies` ties the wired tools to the shared name list — add a name there without a
	// tool here (or vice versa) and this fails to compile, so the client's CHART_TOOLS /
	// invalidation can't silently drift from what the server actually ships.
	return {
		read_chart,
		create_chart,
		parse_claim,
		add_reference,
		run_analysis,
		edit_cell,
		edit_limitation,
	} satisfies Record<(typeof CHART_TOOL_NAMES)[number], unknown>;
}

/** A compact line per existing chart for the system manifest, so the agent can target or
 *  extend one by id (rows / columns already there), or read it with read_chart, rather than
 *  always creating a new one. `openChart` flags the chart tab the attorney is looking at, so
 *  deictic references ("this chart") resolve. */
export async function chartManifest(
	folder: string,
	openChart?: string | null,
): Promise<string> {
	const charts = await loadCharts(folder);
	if (charts.length === 0) return "";
	return charts
		.map(
			(c) =>
				`- ${c.title} (id: ${c.id}) — ${c.limitations.length} limitation(s), ${c.columns.length} reference column(s)${c.id === openChart ? " — OPEN (the chart the attorney is viewing)" : ""}`,
		)
		.join("\n");
}

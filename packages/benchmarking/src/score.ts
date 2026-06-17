// Scoring + the readable report (STRATEGY §7–8). The two axes are kept separate
// throughout — did the system *answer* correctly, and did it *ground* on the
// right provision — and never collapsed. Citations are compared as canonical keys
// (so paragraph spellings fold together). The headline the benchmark is built for
// is the cross-arm delta: how much the grounding tools lift accuracy and citation
// correctness over the identical ungrounded model.

import { citationKeys, citedKeysAndCount, overlap } from "./citations";
import type {
	Aggregate,
	Contract,
	Item,
	ItemScore,
	RunReport,
	Slice,
} from "./types";

export interface Scored {
	item: Item;
	/** One or more runs of the system on this item (>1 when resampled). */
	contracts: Contract[];
	score: ItemScore;
}

const mean = (xs: number[]): number =>
	xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

/** Score an item over N runs: the modal answer drives accuracy, the grounding
 *  metrics are averaged across runs, and reliability is how often the modal
 *  answer repeats (STRATEGY §7 — a tool that flips on rerun isn't usable).
 *
 *  NOTE: citations are scored at provision (article/rule/section) granularity —
 *  the canonical key drops the paragraph, so a cited A54(1) matches a gold A54(3).
 *  The gold is provision-level today; paragraph-precise scoring would need
 *  paragraph-level gold and is a deliberate, documented limitation. */
export function scoreItem(item: Item, contracts: Contract[]): ItemScore {
	const gold = citationKeys(item.gold_citations);
	const recalls: number[] = [];
	const precisions: number[] = [];
	const retrievals: number[] = [];
	let trues = 0;
	for (const c of contracts) {
		const cited = citedKeysAndCount(c.cited_provisions);
		const retrieved = citationKeys(c.retrieved_provisions);
		const hit = overlap(cited.keys, gold);
		recalls.push(gold.size ? hit / gold.size : 1);
		// Precision denominator includes unresolved cites, so padding/hallucinating
		// a non-resolving citation counts against precision rather than vanishing.
		precisions.push(cited.total ? hit / cited.total : 0);
		retrievals.push(gold.size ? overlap(retrieved, gold) / gold.size : 1);
		if (c.answer === "TRUE") trues++;
	}
	const n = contracts.length;
	const modal: "TRUE" | "FALSE" = trues * 2 >= n ? "TRUE" : "FALSE";
	const reliability = n ? Math.max(trues, n - trues) / n : 1;

	const citation_recall = mean(recalls);
	const citation_precision = mean(precisions);
	const answer_correct = modal === item.label;

	return {
		item_id: item.id,
		answer_correct,
		citation_recall,
		citation_precision,
		retrieval_recall: mean(retrievals),
		fully_correct:
			answer_correct && citation_recall === 1 && citation_precision === 1,
		reliability,
	};
}

function aggregate(rows: Scored[]): Aggregate {
	const n = rows.length;
	const meanRow = (f: (r: Scored) => number): number =>
		n ? rows.reduce((s, r) => s + f(r), 0) / n : 0;
	const allAnswers = rows.flatMap((r) => r.contracts.map((c) => c.answer));
	return {
		n,
		answer_accuracy: meanRow((r) => (r.score.answer_correct ? 1 : 0)),
		citation_recall: meanRow((r) => r.score.citation_recall),
		citation_precision: meanRow((r) => r.score.citation_precision),
		retrieval_recall: meanRow((r) => r.score.retrieval_recall),
		fully_correct: meanRow((r) => (r.score.fully_correct ? 1 : 0)),
		answered_true: allAnswers.length
			? allAnswers.filter((a) => a === "TRUE").length / allAnswers.length
			: 0,
		reliability: meanRow((r) => r.score.reliability),
		ci: n ? 1 / Math.sqrt(n) : 0,
	};
}

export function buildReport(systemId: string, rows: Scored[]): RunReport {
	const sliceBy = (key: (i: Item) => string): Record<string, Aggregate> => {
		const groups = new Map<string, Scored[]>();
		for (const r of rows) {
			const k = key(r.item);
			const g = groups.get(k) ?? [];
			g.push(r);
			groups.set(k, g);
		}
		return Object.fromEntries(
			[...groups].sort().map(([k, v]) => [k, aggregate(v)]),
		);
	};
	const by: Record<Slice, Record<string, Aggregate>> = {
		topic: sliceBy((i) => i.topic),
		distortion: sliceBy((i) => i.distortion),
		framing: sliceBy((i) => i.framing),
		jurisdiction: sliceBy((i) => i.jurisdiction),
	};
	return {
		system_id: systemId,
		generated_at: new Date().toISOString(),
		item_count: rows.length,
		overall: aggregate(rows),
		by,
		scores: rows.map((r) => r.score),
	};
}

// ── Rendering ──────────────────────────────────────────────────────────────

const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;
const band = (a: Aggregate): string => `±${pct(a.ci)}`;

/** A metric row for an aggregate (a slice or the overall). */
function row(label: string, a: Aggregate): string {
	return `| ${label} | ${a.n} | ${pct(a.answer_accuracy)} | ${pct(a.citation_recall)} | ${pct(a.citation_precision)} | ${pct(a.retrieval_recall)} | ${pct(a.fully_correct)} | ${pct(a.reliability)} | ${pct(a.answered_true)} |`;
}

const HEAD =
	"| | n | answer | cite-rec | cite-prec | retr-rec | fully | relia | %TRUE |\n|---|--:|--:|--:|--:|--:|--:|--:|--:|";

function sliceTable(title: string, slice: Record<string, Aggregate>): string {
	const rows = Object.entries(slice).map(([k, a]) => row(k, a));
	return `### By ${title}\n\n${HEAD}\n${rows.join("\n")}`;
}

/** Attribute each wrong answer to a cause (STRATEGY §8). */
function failureBreakdown(rows: Scored[]): string {
	const wrong = rows.filter((r) => !r.score.answer_correct);
	if (wrong.length === 0) return "No wrong answers.";
	let retrieval = 0;
	let citation = 0;
	let reasoning = 0;
	for (const { score } of wrong) {
		if (score.retrieval_recall < 1) retrieval++;
		else if (score.citation_recall < 1) citation++;
		else reasoning++;
	}
	return `${wrong.length} wrong — retrieval miss: ${retrieval} · cited-wrong/none: ${citation} · had-the-law reasoning error: ${reasoning}`;
}

export function renderReport(report: RunReport, rows?: Scored[]): string {
	const o = report.overall;
	const out = [
		`# Benchmark report — \`${report.system_id}\``,
		`${report.item_count} items · ${report.generated_at.slice(0, 16).replace("T", " ")}`,
		"",
		"## Overall",
		"",
		HEAD,
		row("overall", o),
		`\nProportions carry roughly ${band(o)} at this n — don't over-read gaps inside the band.`,
		"",
		sliceTable("distortion", report.by.distortion),
		"",
		sliceTable("framing", report.by.framing),
		"",
		sliceTable("topic", report.by.topic),
	];
	if (rows) out.push("", "## Failure attribution", "", failureBreakdown(rows));
	return out.join("\n");
}

// ── Comparison (the headline: tools vs no tools) ───────────────────────────

const ppDelta = (a: number, b: number): string => {
	const d = (b - a) * 100;
	return `${d >= 0 ? "+" : ""}${d.toFixed(0)}pp`;
};

function deltaRow(label: string, a: number, b: number): string {
	return `| ${label} | ${pct(a)} | ${pct(b)} | ${ppDelta(a, b)} |`;
}

/** Markdown delta of two arms over the same items — `b` is the grounded arm. */
export function compareReports(
	baseline: RunReport,
	patrick: RunReport,
): string {
	const a = baseline.overall;
	const b = patrick.overall;
	const regressions: string[] = [];
	if (b.citation_precision < a.citation_precision)
		regressions.push("citation precision dropped");
	if (b.answer_accuracy < a.answer_accuracy)
		regressions.push("answer accuracy dropped");
	return [
		`# Grounding lift — \`${patrick.system_id}\` vs \`${baseline.system_id}\``,
		`${patrick.item_count} items`,
		"",
		"| metric | baseline | grounded | Δ |",
		"|---|--:|--:|--:|",
		deltaRow("answer accuracy", a.answer_accuracy, b.answer_accuracy),
		deltaRow("citation recall", a.citation_recall, b.citation_recall),
		deltaRow("citation precision", a.citation_precision, b.citation_precision),
		deltaRow("retrieval recall", a.retrieval_recall, b.retrieval_recall),
		deltaRow("fully correct", a.fully_correct, b.fully_correct),
		deltaRow("reliability", a.reliability, b.reliability),
		"",
		regressions.length
			? `⚠ regressions: ${regressions.join("; ")}`
			: "No regressions.",
	].join("\n");
}

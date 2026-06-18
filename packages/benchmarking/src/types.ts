// The benchmark schema, end to end (plan §3–§7). Data flows:
//   AuthoredSourceSet ──hydrate──► SourceSet ──generate──► ProposedPair
//     ──judge──► JudgeResult ──accept/reject──► Item ──run──► Contract ──score──► RunReport
// One type per stage; the scripts only fill in logic.

import type { DistortionKey } from "./taxonomy";

export type Jurisdiction = "EP" | "PCT" | "US";
export type Framing = "atomic" | "scenario";
/** The verbatim source's authority class — binding law vs. non-binding guidance. */
export type ProvisionType =
	| "article"
	| "rule"
	| "guidelines"
	| "caselaw"
	| "other";
/** The two-valued benchmark label an item carries / a system must answer. */
export type Answer = "TRUE" | "FALSE";
/** The judge's three-valued verdict — UNVERIFIABLE flags a silent-spot distortion. */
export type JudgeVerdict = "TRUE" | "FALSE" | "UNVERIFIABLE";

// ── Source sets (plan §3) ──────────────────────────────────────────────────

/**
 * One parsed line of `data/source-sets.txt` — just the gold citations a human
 * pasted, plus the `# paper` / `## question` headers it sat under. Everything
 * else (id, topic, jurisdiction, URLs, verbatim text) is derived on hydrate.
 */
export interface AuthoredSourceSet {
	/** Resolvable citations, e.g. "Art. 76(1) EPC", "GL A-II 4.1". */
	citations: string[];
	/** Optional human override; otherwise topic = the primary provision's title. */
	topic?: string;
	/** The `# …` header in scope, e.g. "2026 Paper F". */
	paper?: string;
	/** The `## …` header in scope, e.g. "Q1". */
	question?: string;
	/** 1-based position within its paper+question, for a stable id. */
	seq: number;
}

export interface SourceSetProvision {
	citation: string;
	type: ProvisionType;
	/** Verbatim text, hydrated from @patrick/law (current in-force version). */
	text: string;
	/** The in-force stamp the text was pulled at, e.g. "EPC 2020 (consolidated …)". */
	version: string;
}

/** A hydrated source set — the text the generator reads AND the gold target. */
export interface SourceSet {
	id: string;
	jurisdiction: Jurisdiction;
	topic: string;
	/** Where the set came from, e.g. "2026 Paper F · Q1" — for coverage analysis. */
	provenance?: string;
	/** YYYY-MM the gold was hydrated; the trigger to re-validate when law changes. */
	law_date: string;
	provisions: SourceSetProvision[];
	source_refs?: string[];
}

// ── Generator (plan §4) ────────────────────────────────────────────────────

export interface ProposedPair {
	status: "proposed" | "rejected";
	jurisdiction: Jurisdiction;
	topic: string;
	framing: Framing;
	/** The invented fact pattern in scenario framing; null in atomic. */
	scenario: string | null;
	base_proposition: string;
	gold: {
		citations: string[];
		/** Exact substring of a provision.text that fixes the proposition. */
		supporting_text: string;
	};
	true_statement: string;
	false_statement: string;
	distortion_used: DistortionKey;
	distortion_explanation: string;
	needs_date_check: boolean;
	rejection_reason: string | null;
}

/** A generator proposal as persisted to data/runs/<ts>/proposed.jsonl, carrying
 *  the source set it came from and the distortion that was requested. */
export interface ProposalRecord {
	source_set_id: string;
	requested_distortion: string;
	pair: ProposedPair;
}

// ── Judge (plan §5) ────────────────────────────────────────────────────────

export interface JudgeStatement {
	verdict: JudgeVerdict;
	/** Exact substring of a provision.text that settles the verdict; "" if UNVERIFIABLE. */
	deciding_span: string;
	why: string;
}

export interface JudgeResult {
	A: JudgeStatement;
	B: JudgeStatement;
	changed_element: { in_A: string; in_B: string };
	distortion: DistortionKey | "multiple" | "none";
	citation_relied_on: string[];
}

// ── Items (plan §6) ────────────────────────────────────────────────────────

/** An accepted, scorable item — one per statement of an accepted pair. */
export interface Item {
	id: string;
	/** Links the TRUE/FALSE twins of a minimal pair. */
	pair_id: string;
	source_set_id: string;
	jurisdiction: Jurisdiction;
	topic: string;
	law_date: string;
	framing: Framing;
	scenario: string | null;
	statement: string;
	label: Answer;
	gold_citations: string[];
	distortion: DistortionKey;
	provenance: string;
	judge_deciding_span: string;
}

// ── System under test (the contract, plan §7) ──────────────────────────────

/** What a system must return per item — without cited_provisions, no grounding score. */
export interface Contract {
	answer: Answer;
	cited_provisions: string[];
	retrieved_provisions: string[];
}

/**
 * The seam between the harness and whatever is being benchmarked. Start with a
 * local tool-loop implementation; an HTTP-endpoint implementation can slot in
 * later without touching the scorer, harness, or dataset.
 */
export interface SystemUnderTest {
	/** Stable id for the report, e.g. "local:claude-opus-4-8". */
	id: string;
	run(item: Item): Promise<Contract>;
}

/** A system's answer to one item, as persisted to contracts.<arm>.jsonl. */
export interface ContractRecord {
	item_id: string;
	contract: Contract;
}

// ── Scoring & analysis (plan §7–§8) ────────────────────────────────────────

export interface ItemScore {
	item_id: string;
	/** Modal answer (over N runs) is correct. */
	answer_correct: boolean;
	/** |cited ∩ gold| / |gold|, averaged over runs. */
	citation_recall: number;
	/** |cited ∩ gold| / |cited|, averaged over runs — catches padded cites. */
	citation_precision: number;
	/** Was each gold citation in what the system retrieved? recall@k, averaged. */
	retrieval_recall: number;
	/** Right answer AND citation recall = 1 AND citation precision = 1. */
	fully_correct: boolean;
	/** Fraction of cited provisions that don't resolve to a real one — the
	 *  hallucinated/invented citations. Patrick ≈ 0 by construction (it cites only
	 *  what it retrieved); memory/web can cite provisions that don't exist. */
	hallucination: number;
	/** Fraction of runs reproducing the modal answer (1 for a single run). */
	reliability: number;
}

/** Aggregated metrics over a slice of items (overall or by topic/distortion/…). */
export interface Aggregate {
	n: number;
	answer_accuracy: number;
	citation_recall: number;
	citation_precision: number;
	retrieval_recall: number;
	fully_correct: number;
	/** Mean fraction of cited provisions that don't resolve — invented citations. */
	hallucination: number;
	/** Fraction the system answered TRUE (over all runs) — skew can fake accuracy. */
	answered_true: number;
	/** Mean answer reliability — how often the modal answer repeats on resampling. */
	reliability: number;
	/** Rough ±band on a proportion at this n (≈1/√n); don't over-read gaps inside it. */
	ci: number;
}

export type Slice = "topic" | "distortion" | "framing" | "jurisdiction";

export interface RunReport {
	system_id: string;
	generated_at: string;
	/** Item set the run scored, for reproducibility. */
	item_count: number;
	overall: Aggregate;
	by: Record<Slice, Record<string, Aggregate>>;
	/** Modal-answer reproduction rate when resampled; set only if the run resampled. */
	reliability?: number;
	scores: ItemScore[];
}

/** A side-by-side of two runs — the analysis layer's comparison view. */
export interface Comparison {
	a: string;
	b: string;
	/** metric → { a, b, delta }, overall and per slice value. */
	overall: Record<string, { a: number; b: number; delta: number }>;
	regressions: string[];
}

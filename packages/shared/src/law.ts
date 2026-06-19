// Law-domain types shared across the boundary: @patrick/law produces them
// (provision lookup), the API serves them (ep_law_lookup, /law/provisions), and
// the frontend renders them (the / picker, the provision card). Kept here rather
// than in @patrick/law because that package is node-side (node-html-parser,
// node:fs), while these are pure data the browser needs too.

export type EpcKind =
	| "article"
	| "rule"
	| "fee"
	| "guideline"
	| "caselaw"
	| "other";

/** One top-level block of a provision: a numbered paragraph, a fee item, etc. */
export interface ProvisionBlock {
	/** The source class — "prefixed" (paragraphs), "FMain"/"FSub" (fees), or tag. */
	kind: string;
	/** Verbatim text, current version only (superseded text removed), label intact. */
	text: string;
	/** Footnote numbers anchored to this block. */
	notes?: string[];
}

/** A fully extracted provision: verbatim current text + anchored footnotes. */
export interface Provision {
	slug: string;
	url: string;
	citationKey: string | null;
	title: string | null;
	instrument: string | null;
	part: string | null;
	chapter: string | null;
	/** Human-readable in-force stamp, e.g. "EPC 2020 (consolidated 2026-05-21)". */
	version: string;
	/** Footnote numbers attached to the title (e.g. case-law pointers). */
	titleNotes: string[];
	blocks: ProvisionBlock[];
	/** Footnote number → its text (G-decisions, amendment notes, …). */
	notes: Record<string, string>;
}

/** The body a provision belongs to — the `/` picker's group heading. */
export type ProvisionGroup =
	| "EPC"
	| "Guidelines"
	| "PCT Guidelines"
	| "Case Law";

/** A taggable provision for the chat `/` picker — no body. */
export interface ProvisionRef {
	/** Stable handle / citation key, e.g. "A54". */
	key: string;
	/** Readable, resolvable citation the tag shows and serialises: "Article 54 EPC". */
	cite: string;
	/** Descriptive part of the title: "Novelty". */
	name: string | null;
	kind: EpcKind;
	/** Picker group, precomputed from the source (not re-derived client-side). */
	group: ProvisionGroup;
}

/** A section find_law surfaced as relevant — to be grounded via ep_law_lookup. */
export interface FindLawSection {
	ref: string;
	title: string | null;
}

/** Result of find_law: the relevant section citations from a body's contents. */
export interface FindLawResult {
	scope: string;
	sections: FindLawSection[];
	error?: string;
}

export interface LookupResult {
	/** The caller's original reference, echoed back. */
	ref: string;
	status: "ok" | "not_found";
	/** The paragraph the citation pointed at, e.g. "(2)" in "A54(2)". */
	focus?: string | null;
	provision?: Provision;
}

// The EPC is published as ~560 linked pages under epo.org/.../epc/2020/. The map
// is a lightweight index of those pages (keys + URLs + head metadata) — the
// provision *text* is never stored here; it's fetched on demand and cached.

export type EpcKind = "article" | "rule" | "fee" | "other";

export interface EpcMapEntry {
	/** Page slug, e.g. "a54", "r41", "f2", "prorecog". */
	slug: string;
	/** Canonical page URL on epo.org. */
	url: string;
	kind: EpcKind;
	/**
	 * The token a citation resolves to — "A54", "R41", "RFees A2". Null for the
	 * ~190 named pages (protocols, annexes, contents) that have no numeric cite
	 * and are reached by title instead.
	 */
	citationKey: string | null;
	number: number | null;
	/** Trailing letter for inserted provisions: "a" in A4a, R7b, A105a. */
	suffix: string | null;
	title: string | null;
	/** Which instrument: "EPC Convention" / "EPC Implementing Regulations" / … */
	instrument: string | null;
	part: string | null;
	chapter: string | null;
	/** Consolidation date reported by the page (meta date_publication). */
	updated: string | null;
}

export interface EpcMap {
	generatedAt: string;
	source: string;
	version: string;
	count: number;
	entries: EpcMapEntry[];
}

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

export interface LookupResult {
	/** The caller's original reference, echoed back. */
	ref: string;
	status: "ok" | "not_found";
	/** The paragraph the citation pointed at, e.g. "(2)" in "A54(2)". */
	focus?: string | null;
	/** Set when a keyword resolved to a provision, e.g. "inventive step" → "A56". */
	resolvedFrom?: string;
	provision?: Provision;
}

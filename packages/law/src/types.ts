import type { EpcKind } from "@patrick/shared";
import type { SourceId } from "./sources";

// The provision/lookup domain types (EpcKind, Provision, ProvisionBlock,
// ProvisionRef, LookupResult) live in @patrick/shared so the browser can use them
// without pulling in this node-side package; re-exported from ./index. The map
// types below are build-only and stay here.

/** The EPC is published as ~560 linked pages under epo.org/.../epc/2020/. The map
 * is a lightweight index of those pages (keys + URLs + head metadata) — the
 * provision *text* is never stored here; it's fetched on demand and cached. */
export interface EpcMapEntry {
	/** Which source map this belongs to: "epc", "guidelines-epc", "caselaw", … */
	source: SourceId;
	/** Page slug, e.g. "a54", "r41", "g_vii_5_3", "clr_ii_e_1_3_1". */
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
	/**
	 * Whether the page has recallable content. Guidelines/case-law chapter and
	 * section *index* pages have an empty `.epolegal-content` (their subsection
	 * links live in the layout nav) — they're not recallable, but their title
	 * still forms a heading in the find_law table of contents.
	 */
	recallable: boolean;
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

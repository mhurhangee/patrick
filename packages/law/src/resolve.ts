import type { ProvisionRef } from "@patrick/shared";
import { ENTRIES } from "./maps";
import type { EpcMapEntry } from "./types";

// A readable, source-tagged citation — what a tag shows and serialises to.
// EPC provisions get a numbered form; Guidelines/case-law keys are already
// readable ("G-VII 5.3", "II.E.1.3.1") and just get a source word.
function citeOf(e: EpcMapEntry): string | null {
	if (!e.citationKey) return null;
	if (e.kind === "article" || e.kind === "rule" || e.kind === "fee") {
		if (e.number === null) return e.citationKey;
		const n = `${e.number}${e.suffix ?? ""}`;
		if (e.kind === "article") return `Article ${n} EPC`;
		if (e.kind === "rule") return `Rule ${n} EPC`;
		return `Article ${n} RFees`;
	}
	if (e.kind === "guideline")
		return e.citationKey.startsWith("PCT ")
			? `PCT Guidelines ${e.citationKey.slice(4)}`
			: `Guidelines ${e.citationKey}`;
	if (e.kind === "caselaw") return `CLBA ${e.citationKey}`;
	return e.citationKey;
}

/** The descriptive part of a title: "Article 54 – Novelty" → "Novelty". */
function shortName(title: string | null): string | null {
	if (!title) return null;
	const parts = title.split(/\s[–-]\s/);
	return parts.length > 1 ? parts.slice(1).join(" – ").trim() : title;
}

/** The taggable provisions (recallable, with a citation key), for the `/` picker. */
export function provisionList(): ProvisionRef[] {
	return ENTRIES.filter(
		(e): e is EpcMapEntry & { citationKey: string } =>
			e.citationKey !== null && e.recallable,
	).map((e) => ({
		key: e.citationKey,
		cite: citeOf(e) ?? e.citationKey,
		name: shortName(e.title),
		kind: e.kind,
	}));
}

// Fold a citation down to a comparison token: "[Art. 54 EPC]" → "A54",
// "Guidelines G-VII, 5.3" → "GVII53", "CLBA II.E.1.3.1" → "IIE131". Source words
// (Guidelines / Case Law / CLBA / EPC) are dropped; "PCT" is KEPT — it's the
// disambiguator between the EPC and PCT Guidelines (same section numbers).
function canonical(input: string): string {
	const stripped = input
		.toUpperCase()
		// Long-form fee name → the RFees disambiguator (before RULES → R below).
		.replace(/\bRULES? RELATING TO FEES\b/g, "RFEES")
		// Spelled-out Guidelines hierarchy "Part A, Chapter IV" → the "A-IV" key.
		.replace(/\bPART\s+([A-Z])[,\s]+CHAPTER\s+([IVXLC]+)\b/g, "$1-$2")
		// Verbose-citation noise words (so "EPO Guidelines for Examination,
		// Part B, Chapter I, Section 2.2" and "GL B-I 2.2" both fold to the key).
		.replace(/\bEPO\b/g, "")
		.replace(/\bFOR EXAMINATION\b/g, "")
		.replace(/\b(?:GL|SECTION|PART|CHAPTER)\b/g, "")
		.replace(/\b(?:ITEMS?|PARAGRAPHS?|SUBPARAGRAPHS?)\s+\d+[A-Z]*\b/g, "")
		.replace(/\bCASE ?LAW\b/g, "")
		.replace(/\bBOARDS? OF APPEAL\b/g, "")
		.replace(/\bGUIDELINES?\b/g, "")
		.replace(/\b(?:CLBA|CLR|BOA)\b/g, "")
		.replace(/\bEPC\b/g, "")
		// Spelled-out instrument names a verbatim citation drags along
		// ("Rule 6(1) EPC Implementing Regulations" becomes R6; "Article 87 of
		// the European Patent Convention" becomes A87) - pure noise, never a key.
		.replace(/\bIMPLEMENTING REGULATIONS?\b/g, "")
		.replace(/\bEUROPEAN PATENT (?:CONVENTION|OFFICE|ORGANISATION)\b/g, "")
		.replace(/\bARTICLES?\b|\bART\b/g, "A")
		.replace(/\bRULES?\b/g, "R")
		.replace(/\b(?:OF|THE)\b/g, "");
	// Drop separators, but keep a "." between adjacent digit groups so multi-level
	// Guidelines/case-law keys don’t collide ("5.3" ≠ "53").
	return stripped.replace(/[\s.,;:\-–—[\]()]+/g, (sep, i, str) =>
		/\d/.test(str[i - 1] ?? "") && /\d/.test(str[i + sep.length] ?? "")
			? "."
			: "",
	);
}

// Index every entry by its citation key and readable cite. Slugs are indexed only
// for EPC (where they're unique and resolve named pages like "prorecog"); the
// Guidelines trees share slugs (g_vii_5 in both EPC and PCT), so they resolve by
// their source-qualified key, never the bare slug.
const INDEX: Map<string, EpcMapEntry> = (() => {
	const idx = new Map<string, EpcMapEntry>();
	// Only recallable pages resolve — nav/index pages (empty content) aren't worth
	// retrieving; the agent reaches their sections via find_law instead.
	const entries = ENTRIES.filter((e) => e.recallable);
	for (const e of entries)
		if (e.source === "epc") idx.set(canonical(e.slug), e);
	for (const e of entries) {
		const cite = citeOf(e);
		if (cite) idx.set(canonical(cite), e);
		if (e.citationKey) idx.set(canonical(e.citationKey), e);
	}
	return idx;
})();

export interface Resolution {
	entry: EpcMapEntry;
	/** The sub-paragraph the citation pointed at, e.g. "(2)" — informational. */
	focus: string | null;
}

/** Resolve a citation string to a provision (or null). */
export function resolveCitation(input: string): Resolution | null {
	const raw = input.trim();

	// Pull paragraph references out wherever they sit, not just at the end — so a
	// trailing instrument suffix doesn't hide them: "Article 123(2) EPC" → focus
	// "(2)", key "Article 123 EPC"; "A54(2)" → focus "(2)", key "A54".
	const focusParts = raw.match(/\([^()]+\)/g);
	const focus = focusParts ? focusParts.join("") : null;
	const keyPart = (focusParts ? raw.replace(/\([^()]+\)/g, " ") : raw).trim();

	const entry = INDEX.get(canonical(keyPart));
	return entry ? { entry, focus } : null;
}

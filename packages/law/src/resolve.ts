import type { ProvisionRef } from "@patrick/shared";
import caselawData from "../data/caselaw-map.json" with { type: "json" };
import epcData from "../data/epc-map.json" with { type: "json" };
import guidelinesEpcData from "../data/guidelines-epc-map.json" with {
	type: "json",
};
import guidelinesPctData from "../data/guidelines-pct-map.json" with {
	type: "json",
};
import type { EpcMap, EpcMapEntry } from "./types";

const ENTRIES: EpcMapEntry[] = [
	epcData,
	guidelinesEpcData,
	guidelinesPctData,
	caselawData,
].flatMap((m) => (m as EpcMap).entries);

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

/** The taggable provisions (those with a citation key), for the chat `/` picker. */
export function provisionList(): ProvisionRef[] {
	return ENTRIES.filter(
		(e): e is EpcMapEntry & { citationKey: string } => e.citationKey !== null,
	).map((e) => ({
		key: e.citationKey,
		cite: citeOf(e) ?? e.citationKey,
		name: shortName(e.title),
		kind: e.kind,
	}));
}

// Concept → citation key. A small curated set so the agent can resolve the common
// objections by name, not just by number. Deliberately conservative — only
// unambiguous mappings; expand as needed. Keyed lowercase.
const ALIASES: Record<string, string> = {
	novelty: "A54",
	"inventive step": "A56",
	"industrial application": "A57",
	"sufficiency of disclosure": "A83",
	sufficiency: "A83",
	"added matter": "A123(2)",
	"added subject-matter": "A123(2)",
	"extension of protection": "A123(3)",
	clarity: "A84",
	priority: "A87",
	"grounds for opposition": "A100",
	"patentable inventions": "A52",
	exceptions: "A53",
	exclusions: "A53",
};

// Fold a citation down to a comparison token: "[Art. 54 EPC]" → "A54",
// "Guidelines G-VII, 5.3" → "GVII53", "CLBA II.E.1.3.1" → "IIE131". Source words
// (Guidelines / Case Law / CLBA / EPC) are dropped; "PCT" is KEPT — it's the
// disambiguator between the EPC and PCT Guidelines (same section numbers).
function canonical(input: string): string {
	return input
		.toUpperCase()
		.replace(/\bCASE ?LAW\b/g, "")
		.replace(/\bBOARDS? OF APPEAL\b/g, "")
		.replace(/\bGUIDELINES?\b/g, "")
		.replace(/\b(?:CLBA|CLR|BOA)\b/g, "")
		.replace(/\bEPC\b/g, "")
		.replace(/\bARTICLES?\b|\bART\b/g, "A")
		.replace(/\bRULES?\b/g, "R")
		.replace(/[\s.,;:\-–—[\]]/g, "");
}

// Index every entry by its citation key and readable cite. Slugs are indexed only
// for EPC (where they're unique and resolve named pages like "prorecog"); the
// Guidelines trees share slugs (g_vii_5 in both EPC and PCT), so they resolve by
// their source-qualified key, never the bare slug.
const INDEX: Map<string, EpcMapEntry> = (() => {
	const idx = new Map<string, EpcMapEntry>();
	for (const e of ENTRIES)
		if (e.source === "epc") idx.set(canonical(e.slug), e);
	for (const e of ENTRIES) {
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
	/** The keyword that resolved here, if it came via the alias table. */
	resolvedFrom?: string;
}

/** Resolve a citation string or concept keyword to a provision (or null). */
export function resolveCitation(input: string): Resolution | null {
	const raw = input.trim();

	// Pull paragraph references out wherever they sit, not just at the end — so a
	// trailing instrument suffix doesn't hide them: "Article 123(2) EPC" → focus
	// "(2)", key "Article 123 EPC"; "A54(2)" → focus "(2)", key "A54".
	const focusParts = raw.match(/\([^()]+\)/g);
	const focus = focusParts ? focusParts.join("") : null;
	const keyPart = (focusParts ? raw.replace(/\([^()]+\)/g, " ") : raw).trim();

	// Concept/keyword match on the paragraph-stripped phrase (e.g. "inventive step",
	// "added matter (3)"). An explicit focus on the input wins over the alias's own.
	const alias = ALIASES[keyPart.toLowerCase().replace(/\s+/g, " ")];
	if (alias) {
		const hit = resolveCitation(alias);
		return hit
			? { entry: hit.entry, focus: focus ?? hit.focus, resolvedFrom: raw }
			: null;
	}

	const entry = INDEX.get(canonical(keyPart));
	return entry ? { entry, focus } : null;
}

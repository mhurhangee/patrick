import mapData from "../data/epc-map.json" with { type: "json" };
import type { EpcMap, EpcMapEntry } from "./types";

const MAP = mapData as EpcMap;

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

/** Fold a citation/key down to a comparison token: "Art. 54 EPC" → "A54". */
function canonical(input: string): string {
	return input
		.toUpperCase()
		.replace(/\bEPC\b/g, "")
		.replace(/\bARTICLES?\b|\bART\b/g, "A")
		.replace(/\bRULES?\b/g, "R")
		.replace(/[\s.\-–—]/g, "");
}

// Index every entry by its key and its slug, so both "A54" and "a54" resolve, and
// named pages resolve by slug ("prorecog"). Keys win over slugs on any collision.
const INDEX: Map<string, EpcMapEntry> = (() => {
	const idx = new Map<string, EpcMapEntry>();
	for (const e of MAP.entries) idx.set(canonical(e.slug), e);
	for (const e of MAP.entries)
		if (e.citationKey) idx.set(canonical(e.citationKey), e);
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

	// Keyword/concept match (e.g. "inventive step") — may itself carry a focus.
	const aliasKey = raw.toLowerCase().replace(/\s+/g, " ");
	const alias = ALIASES[aliasKey];
	if (alias) {
		const hit = resolveCitation(alias);
		return hit ? { ...hit, resolvedFrom: raw } : null;
	}

	// Pull a trailing paragraph reference off the key: "A54(2)" → focus "(2)".
	const focusMatch = raw.match(/(\([^()]+\)(?:\([^()]+\))*)\s*$/);
	const focus = focusMatch?.[1] ?? null;
	const keyPart = focus ? raw.slice(0, raw.length - focus.length) : raw;

	const entry = INDEX.get(canonical(keyPart));
	return entry ? { entry, focus } : null;
}

import { resolveCitation } from "@patrick/law";

// Canonical citation keys via the product resolver, so different spellings of the
// same provision fold together — "R. 40(1) EPC", "Rule 40(3)", "Rule 40" all →
// R40. Used wherever citations are compared (judge basis check, scoring recall /
// precision): comparing keys, not raw strings, is what makes those metrics fair.
export function citationKeys(citations: string[]): Set<string> {
	const keys = new Set<string>();
	for (const c of citations) {
		const key = resolveCitation(c)?.entry.citationKey;
		if (key) keys.add(key);
	}
	return keys;
}

/** Count of shared keys between two sets. */
export function overlap(a: Set<string>, b: Set<string>): number {
	let n = 0;
	for (const k of a) if (b.has(k)) n++;
	return n;
}

/** Resolved keys PLUS the count of distinct provisions cited including ones that
 *  don't resolve. The unresolved count feeds the precision denominator so a system
 *  can't hide a hallucinated cite ("Article 999 EPC") by citing something the
 *  resolver drops — those still count against it. */
export function citedKeysAndCount(citations: string[]): {
	keys: Set<string>;
	total: number;
} {
	const keys = new Set<string>();
	const unresolved = new Set<string>();
	for (const c of citations) {
		const key = resolveCitation(c)?.entry.citationKey;
		if (key) keys.add(key);
		else {
			const norm = c.trim().toUpperCase().replace(/\s+/g, " ");
			if (norm) unresolved.add(norm);
		}
	}
	return { keys, total: keys.size + unresolved.size };
}

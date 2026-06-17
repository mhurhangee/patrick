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

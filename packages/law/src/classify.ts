import type { EpcKind } from "./types";

export interface SlugClassification {
	kind: EpcKind;
	citationKey: string | null;
	number: number | null;
	suffix: string | null;
}

// The numbered provisions follow a strict slug shape: a/r/f + number + optional
// inserted-provision letter (a4a, r7b, a105a). Everything else — protocols,
// annexes, contents, abbreviations — is a named page reached by title.
const ARTICLE = /^a(\d+)([a-z]?)$/;
const RULE = /^r(\d+)([a-z]?)$/;
const FEE = /^f(\d+)([a-z]?)$/;

export function classifySlug(slug: string): SlugClassification {
	const a = ARTICLE.exec(slug);
	if (a)
		return {
			kind: "article",
			number: Number(a[1]),
			suffix: a[2] || null,
			citationKey: `A${a[1]}${a[2]}`,
		};
	const r = RULE.exec(slug);
	if (r)
		return {
			kind: "rule",
			number: Number(r[1]),
			suffix: r[2] || null,
			citationKey: `R${r[1]}${r[2]}`,
		};
	const f = FEE.exec(slug);
	if (f)
		return {
			kind: "fee",
			number: Number(f[1]),
			suffix: f[2] || null,
			citationKey: `RFees A${f[1]}${f[2]}`,
		};
	return { kind: "other", number: null, suffix: null, citationKey: null };
}

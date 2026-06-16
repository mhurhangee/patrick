import type { EpcKind } from "@patrick/shared";

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

// Guidelines (EPC + PCT) sections: <part>_<chapter-roman>_<section…>, e.g.
// g_vii_5_3 → "G-VII 5.3", a_ii_1_1 → "A-II 1.1". `prefix` source-qualifies them
// — "" for EPC Guidelines, "PCT " for PCT-EPO Guidelines (the same slugs exist in
// both trees). Foreword/index/part-overview pages don't match → "other".
const GUIDELINE = /^([a-z])_([ivxlc]+)((?:_\d+[a-z]?)*)$/;

export function classifyGuideline(
	slug: string,
	prefix: string,
): SlugClassification {
	const m = GUIDELINE.exec(slug);
	if (!m)
		return { kind: "other", number: null, suffix: null, citationKey: null };
	const head = `${prefix}${(m[1] ?? "").toUpperCase()}-${(m[2] ?? "").toUpperCase()}`;
	const section = m[3] ? m[3].slice(1).replace(/_/g, ".") : "";
	return {
		kind: "guideline",
		number: null,
		suffix: null,
		citationKey: section ? `${head} ${section}` : head,
	};
}

// Case Law of the Boards of Appeal sections: clr_<chapter-roman>_<letter>_<n…>,
// e.g. clr_ii_e_1_3_1 → "II.E.1.3.1" (sections may end in a letter sub-point,
// clr_i_a_5_2_2_a → "I.A.5.2.2.a"). Foreword/toc/chapter-overview → "other".
const CASELAW = /^clr_([ivxlc]+)_([a-z])((?:_\d+)*(?:_[a-z])?)$/;

export function classifyCaselaw(slug: string): SlugClassification {
	const m = CASELAW.exec(slug);
	if (!m)
		return { kind: "other", number: null, suffix: null, citationKey: null };
	const head = `${(m[1] ?? "").toUpperCase()}.${(m[2] ?? "").toUpperCase()}`;
	const section = m[3] ? m[3].slice(1).replace(/_/g, ".") : "";
	return {
		kind: "caselaw",
		number: null,
		suffix: null,
		citationKey: section ? `${head}.${section}` : head,
	};
}

import type { ParsedFulltext } from "./parse";

// Assemble the retrieved publication as a structured, readable document. OPS
// returns the claims as a flat run of <claim-text> segments where each claim
// opens with its number ("1.", "2." …); we regroup on that so claims are
// numbered and laid out with three spacing levels: a clear gap between claims,
// a smaller gap between a claim's sub-paragraphs, and tight lines within one.
//
// The on-disk format is plain markdown-ish text (open, prompt-injectable): claim
// openers as `**N.**`, sub-paragraph lines tab-indented, blank lines between
// sub-paragraphs. The viewer's renderer reads the same conventions.

type Claim = { num: string; lines: string[] };

/**
 * Regroup the claims into numbered claims at the LINE level. OPS returns claims
 * two ways: EP as an array of `<claim-text>` segments, WO as a single blob — but
 * both delimit claims the same way, a newline then "1.", "2." … So we join the
 * segments, split on newlines, and start a new claim on any line that opens with
 * a number GREATER than the last claim's — claim numbers only ever increase (a
 * "Reserved" gap still jumps up), so this admits real claims while rejecting a
 * lower-numbered enumerated sub-clause (e.g. a "3. a housing" reference list
 * inside claim 5) that would otherwise fragment the set. `lines[0]` is the
 * claim's preamble; the rest are its sub-clauses. Lines before the first claim
 * (e.g. a "Claims" / "WHAT IS CLAIMED IS:" header) are dropped.
 */
function groupClaims(segments: string[]): Claim[] {
	const claims: Claim[] = [];
	let lastNum = 0;
	for (const raw of segments.join("\n").split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		const m = /^(\d+)\.\s+([\s\S]*)$/.exec(line);
		const n = m ? Number(m[1]) : 0;
		if (m && n > lastNum) {
			claims.push({ num: m[1] as string, lines: [(m[2] as string).trim()] });
			lastNum = n;
		} else if (claims.length > 0) {
			(claims[claims.length - 1] as Claim).lines.push(line);
		}
	}
	return claims;
}

export function toMarkdown(p: ParsedFulltext): string {
	const ref = `${p.number}${p.kind ?? ""}`;
	const lines: string[] = [`# ${ref}`, ""];

	const meta: string[] = [];
	if (p.title) meta.push(`**Title:** ${p.title}`);
	if (p.applicant) meta.push(`**Applicant:** ${p.applicant}`);
	meta.push(
		`**Source:** EPO Open Patent Services${p.lang ? ` (${p.lang})` : ""}`,
	);
	lines.push(meta.join("  \n"), "");

	const claims = groupClaims(p.claims);
	if (claims.length > 0) {
		lines.push("## Claims", "");
		claims.forEach((claim, i) => {
			const n = claim.num || String(i + 1);
			const [first = "", ...rest] = claim.lines;
			// Bold the number (so markdown can't renumber it), then the preamble; the
			// sub-clauses follow as tab-indented lines, each on its own line.
			lines.push(`**${n}.** ${first}`.trim());
			for (const l of rest) lines.push(`\t${l}`);
			lines.push("");
		});
	}

	if (p.description.length > 0) {
		lines.push("## Description", "");
		// Each paragraph already carries its [0001] marker; keep internal lines tight
		// and separate paragraphs with a blank line.
		for (const para of p.description) {
			for (const l of para
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean))
				lines.push(l);
			lines.push("");
		}
	}

	return `${lines
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim()}\n`;
}

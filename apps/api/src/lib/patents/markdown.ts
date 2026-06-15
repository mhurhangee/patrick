import type { Publication } from "./types";

/** The canonical reference string for a publication, e.g. "EP3707572B1". */
export const pubRef = (p: Publication): string => `${p.number}${p.kind ?? ""}`;

// Assemble a normalized Publication as the structured, readable markdown document
// Patrick saves and the viewer renders. Source-agnostic — claims/description are
// already normalized by the provider. Claims: bold number (so markdown can't
// renumber) + tab-indented sub-clauses; three spacing levels (between claims,
// between sub-clauses, within a line).

export function toMarkdown(p: Publication): string {
	const lines: string[] = [`# ${pubRef(p)}`, ""];

	const meta: string[] = [];
	if (p.title) meta.push(`**Title:** ${p.title}`);
	if (p.applicant) meta.push(`**Applicant:** ${p.applicant}`);
	const dates: string[] = [];
	if (p.publicationDate) dates.push(`**Published:** ${p.publicationDate}`);
	if (p.filingDate) dates.push(`**Filed:** ${p.filingDate}`);
	if (p.priorityDate) dates.push(`**Priority:** ${p.priorityDate}`);
	if (dates.length) meta.push(dates.join(" · "));
	// Source provenance — Google text is scraped public data, so flag it.
	meta.push(
		p.source === "Google Patents"
			? "**Source:** Google Patents — public data, verify against the original."
			: `**Source:** ${p.source}`,
	);
	lines.push(meta.join("  \n"), "");

	if (p.claims.length > 0) {
		lines.push("## Claims", "");
		for (const claim of p.claims) {
			const [first = "", ...rest] = claim.lines;
			lines.push(`**${claim.num}.** ${first}`.trim());
			for (const l of rest) lines.push(`\t${l}`);
			lines.push("");
		}
	}

	if (p.description.length > 0) {
		lines.push("## Description", "");
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

/** One-line human summary for the tool result / accept card. */
export function summarize(p: Publication): string {
	const ref = pubRef(p);
	const date = p.publicationDate ? ` (published ${p.publicationDate})` : "";
	const title = p.title ? ` Title: “${p.title}”.` : "";
	return `Saved ${ref}.md and pinned it — the full text${date} is now in context, via ${p.source}.${title}`;
}

import { type HTMLElement, parse } from "node-html-parser";
import { groupClaims } from "../claims";
import type { Claim, Publication } from "../types";

// Parse a Google Patents document page into a normalized Publication. The body
// is two clean sections (`itemprop="claims"` / `"description"`); biblio comes
// from meta tags + the itemprop dt/dd list. Claims arrive two ways depending on
// load-source: patent-office data is structured (`div.claim[num]` — number in
// the attribute), OCR'd data (PCT/WO) is flat text with numbers inline.

const lines = (s: string): string[] =>
	s
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

function parseClaims(section: HTMLElement | null): Claim[] {
	if (!section) return [];
	const structured = section.querySelectorAll("div.claim[num]");
	if (structured.length > 0) {
		return structured
			.map((div, i) => {
				const raw = (div.getAttribute("num") ?? "").replace(/^0+/, "");
				const num = raw || String(i + 1); // fall back to position if no attr
				const ls = lines(div.text);
				// US claim text repeats the number ("1. A system…"); the bold number
				// is added on render, so strip it to avoid "1. 1. A system…" — but
				// only when we have a real numeric label (a "?" would be a bad regex).
				if (ls[0] && raw)
					ls[0] = ls[0].replace(new RegExp(`^${raw}[.)]\\s*`), "").trim();
				return { num, lines: ls.filter(Boolean) };
			})
			.filter((c) => c.lines.length > 0);
	}
	// OCR (PCT/WO): numbers live in the text — reuse the shared grouping.
	return groupClaims(
		section.querySelectorAll("div.claim-text").map((e) => e.text),
	);
}

export function parseGoogle(html: string, input: string): Publication {
	const root = parse(html);
	const meta = (sel: string) =>
		root.querySelector(sel)?.getAttribute("content")?.trim() || undefined;
	const date = (prop: string) =>
		root
			.querySelector(`time[itemprop="${prop}"]`)
			?.getAttribute("datetime")
			?.trim() || undefined;

	const kind = meta('meta[itemprop="kindCode"]');
	const pubNumber =
		root.querySelector('[itemprop="publicationNumber"]')?.text?.trim() || input;
	// publicationNumber carries the kind (US11644834B2); strip it for the base.
	const number =
		kind && pubNumber.endsWith(kind)
			? pubNumber.slice(0, -kind.length)
			: pubNumber;

	const claims = parseClaims(root.querySelector('section[itemprop="claims"]'));
	const descSection = root.querySelector('section[itemprop="description"]');
	// Headings (US `<heading>`) sit between paragraphs — keep them, in document
	// order, bolded so the section structure survives.
	const description = descSection
		? descSection
				.querySelectorAll(
					"heading, div.description-paragraph, div.description-line",
				)
				.map((e) => {
					const t = e.text.trim();
					return e.tagName === "HEADING" ? `**${t}**` : t;
				})
				.filter((t) => t && t !== "**" && t !== "****")
		: [];

	return {
		number,
		kind,
		title: meta('meta[name="DC.title"]'),
		applicant: meta('meta[name="DC.contributor"][scheme="assignee"]'),
		abstract: meta('meta[name="description"]'),
		publicationDate: date("publicationDate"),
		filingDate: date("filingDate"),
		priorityDate: date("priorityDate"),
		claims,
		description,
		source: "Google Patents",
	};
}

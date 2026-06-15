// The normalized shape every provider produces, and the shared assembly renders.
// Providers (EPO OPS, Google Patents) differ wildly in wire format (namespaced
// JSON vs scraped HTML) but converge here, so toMarkdown + the route are
// source-agnostic.

/** One claim: its number and text lines (lines[0] = preamble, rest = sub-clauses). */
export type Claim = { num: string; lines: string[] };

type PublicationSource = "EPO OPS" | "Google Patents";

export type Publication = {
	number: string;
	kind?: string;
	title?: string;
	applicant?: string;
	publicationDate?: string;
	filingDate?: string;
	priorityDate?: string;
	abstract?: string;
	claims: Claim[];
	description: string[];
	source: PublicationSource;
};

/** A provider's output: a normalized publication, or a typed failure. The router
 *  turns the success into a PublicationResult (markdown + filename + summary). */
export type ProviderResult =
	| { ok: true; publication: Publication }
	| { ok: false; status: number; message: string };

export type PublicationResult =
	| {
			ok: true;
			filename: string;
			markdown: string;
			summary: string;
			source: PublicationSource;
	  }
	| { ok: false; status: number; message: string };

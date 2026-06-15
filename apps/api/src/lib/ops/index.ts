import type { OpsSettings } from "@patrick/shared";
import { OpsError } from "./auth";
import { fetchBiblio, fetchClaims, fetchDescription } from "./client";
import { toMarkdown } from "./markdown";
import { parseFulltext } from "./parse";

// The publication-retrieval provider seam. Today there is one provider (EPO OPS,
// EP/WO); the router picks it by the document's country so a USPTO provider (US
// full text, which OPS does not serve) can slot in here later with no caller
// change.

export type PublicationResult =
	| { ok: true; filename: string; markdown: string; summary: string }
	| { ok: false; status: number; message: string };

// Split a publication number into its parts. OPS epodoc requests take the
// country+number WITHOUT the kind code (e.g. "EP3707572"); the kind ("B1") is
// only used to name the saved file — and the response carries the real one
// anyway, so a kind in the input is optional.
function parseNumber(
	input: string,
): { country: string; request: string; kind?: string } | null {
	const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
	const m = /^([A-Z]{2})(\d+)([A-Z]\d*)?$/.exec(cleaned);
	if (!m) return null;
	const [, country, digits, kind] = m;
	return { country: country as string, request: `${country}${digits}`, kind };
}

export async function fetchPublication(
	creds: OpsSettings,
	input: string,
): Promise<PublicationResult> {
	const parsed = parseNumber(input);
	if (!parsed) {
		return {
			ok: false,
			status: 422,
			message: `“${input}” isn't a recognisable publication number (e.g. EP3707572).`,
		};
	}
	if (parsed.country !== "EP" && parsed.country !== "WO") {
		return {
			ok: false,
			status: 422,
			message: `${parsed.country} documents aren't supported yet — EPO OPS serves full text for EP and WO. US is planned via the USPTO.`,
		};
	}

	try {
		const [biblio, claims, description] = await Promise.all([
			fetchBiblio(creds, parsed.request),
			fetchClaims(creds, parsed.request),
			fetchDescription(creds, parsed.request),
		]);
		const ft = parseFulltext({
			number: parsed.request,
			biblio,
			claims,
			description,
		});
		if (ft.claims.length === 0 && ft.description.length === 0) {
			return {
				ok: false,
				status: 404,
				message: `No full text found for ${parsed.request} on EPO OPS (it may be unpublished or not held).`,
			};
		}
		// Prefer the kind code the response reports; fall back to one in the input.
		const ref = `${ft.number}${ft.kind ?? parsed.kind ?? ""}`;
		return {
			ok: true,
			filename: `${ref}.md`,
			markdown: toMarkdown(ft),
			summary: `Saved ${ref}.md and pinned it — the full text${ft.description.length ? ` (${ft.description.length} description paragraphs)` : ""} is now in context.${ft.title ? ` Title: “${ft.title}”.` : ""}`,
		};
	} catch (err) {
		if (err instanceof OpsError) {
			return { ok: false, status: err.status, message: err.message };
		}
		// Network failure reaching EPO, or an unexpected response shape — surface a
		// clean message rather than a bare 500 (this is the external boundary).
		return {
			ok: false,
			status: 502,
			message: "Couldn't reach EPO OPS. Check your connection and try again.",
		};
	}
}

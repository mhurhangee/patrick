import type { OpsSettings } from "@patrick/shared";
import type { ProviderResult } from "../types";
import { OpsError } from "./auth";
import { fetchBiblio, fetchClaims, fetchDescription } from "./client";
import { parseEpo } from "./parse";

// EPO Open Patent Services provider — the official source for EP/WO. `epodoc` is
// the country+number with the kind stripped (OPS doesn't want it; the real kind
// comes back in the response).
export async function fetchEpo(
	creds: OpsSettings,
	epodoc: string,
): Promise<ProviderResult> {
	try {
		const [biblio, claims, description] = await Promise.all([
			fetchBiblio(creds, epodoc),
			fetchClaims(creds, epodoc),
			fetchDescription(creds, epodoc),
		]);
		const publication = parseEpo({
			number: epodoc,
			biblio,
			claims,
			description,
		});
		if (
			publication.claims.length === 0 &&
			publication.description.length === 0
		) {
			return {
				ok: false,
				status: 404,
				message: `No full text found for ${epodoc} on EPO OPS.`,
			};
		}
		return { ok: true, publication };
	} catch (err) {
		if (err instanceof OpsError) {
			return { ok: false, status: err.status, message: err.message };
		}
		// Network failure / unexpected shape — clean message, not a bare 500.
		return {
			ok: false,
			status: 502,
			message: "Couldn't reach EPO OPS. Check your connection and try again.",
		};
	}
}

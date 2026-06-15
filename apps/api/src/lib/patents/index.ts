import { hasOpsCreds, type Profile } from "@patrick/shared";
import { fetchEpo } from "./epo";
import { fetchGoogle } from "./google";
import { pubRef, summarize, toMarkdown } from "./markdown";
import { parseNumber } from "./number";
import type { ProviderResult, PublicationResult } from "./types";

// The publication-retrieval router. Picks a provider by the number's country and
// the available credentials: EP/WO go to EPO OPS when a key is set (official,
// structured), and fall back to Google Patents on failure; everything else goes
// straight to Google. So retrieval works with no key at all — the OPS key is an
// optional "official source" upgrade.
export async function fetchPublication(
	input: string,
	profile: Profile | null,
): Promise<PublicationResult> {
	const parsed = parseNumber(input);
	if (!parsed) {
		return {
			ok: false,
			status: 422,
			message: `“${input}” isn't a recognisable publication number (e.g. EP3707572, US11644834, WO2019094843).`,
		};
	}

	const creds = profile?.ops;
	const preferEpo =
		(parsed.country === "EP" || parsed.country === "WO") &&
		hasOpsCreds(profile ?? undefined);

	let result: ProviderResult;
	if (preferEpo && creds) {
		const epo = await fetchEpo(creds, parsed.epodoc);
		if (epo.ok) {
			result = epo;
		} else {
			// Fall back to Google if OPS has no full text / errors — but if Google
			// also fails, surface the OPS error (a bad key / quota is more actionable
			// than Google's generic decline).
			const google = await fetchGoogle(parsed.google);
			result = google.ok ? google : epo;
		}
	} else {
		result = await fetchGoogle(parsed.google);
	}
	if (!result.ok) return result;

	const pub = result.publication;
	return {
		ok: true,
		filename: `${pubRef(pub)}.md`,
		markdown: toMarkdown(pub),
		summary: summarize(pub),
		source: pub.source,
	};
}

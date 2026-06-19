import type { LookupResult } from "@patrick/shared";
import { extractProvision } from "./extract";
import type { PageFetcher } from "./fetch-page";
import { resolveCitation } from "./resolve";

/**
 * Resolve a batch of citation keys / concept keywords to verbatim provisions.
 * Each ref is independent: an unresolvable one returns `not_found` rather than
 * sinking the batch. The agent must quote only from these results — never recite
 * law from memory.
 */
export async function lookupProvisions(
	refs: string[],
	fetchPage: PageFetcher,
): Promise<LookupResult[]> {
	return Promise.all(
		refs.map(async (ref): Promise<LookupResult> => {
			const hit = resolveCitation(ref);
			if (!hit) return { ref, status: "not_found" };
			try {
				const provision = extractProvision(
					await fetchPage(hit.entry.url),
					hit.entry,
				);
				return {
					ref,
					status: "ok",
					focus: hit.focus,
					provision,
				};
			} catch {
				return { ref, status: "not_found" };
			}
		}),
	);
}

import type { OpsSettings } from "@patrick/shared";
import { clearToken, getAccessToken, OpsError } from "./auth";

// Thin GET wrapper over the OPS published-data REST services. JSON in, JSON out.
// A 404 means "this section/document isn't available" (common — e.g. no full
// text for many authorities) and is returned as null rather than thrown, so the
// caller can assemble whatever sections did come back.

const BASE = "https://ops.epo.org/3.2/rest-services";

// biome-ignore lint/suspicious/noExplicitAny: OPS JSON is deeply namespaced + variant; parsed in parse.ts.
type OpsJson = any;

async function opsGet(
	creds: OpsSettings,
	path: string,
): Promise<OpsJson | null> {
	const url = `${BASE}${path}`;
	const call = async (token: string) =>
		fetch(url, {
			headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
		});

	let res = await call(await getAccessToken(creds));
	// Token may have been revoked/expired server-side: refresh once and retry.
	if (res.status === 401) {
		clearToken(creds);
		res = await call(await getAccessToken(creds));
	}
	if (res.status === 404) return null;
	if (!res.ok) {
		const detail =
			res.status === 403
				? " — fair-use quota may be exhausted, or the document is restricted."
				: "";
		throw new OpsError(
			`EPO OPS request failed (${res.status})${detail}`,
			res.status,
		);
	}
	return (await res.json()) as OpsJson;
}

const ref = (number: string) =>
	`/published-data/publication/epodoc/${encodeURIComponent(number)}`;

export const fetchBiblio = (creds: OpsSettings, number: string) =>
	opsGet(creds, `${ref(number)}/biblio`);

export const fetchClaims = (creds: OpsSettings, number: string) =>
	opsGet(creds, `${ref(number)}/claims`);

export const fetchDescription = (creds: OpsSettings, number: string) =>
	opsGet(creds, `${ref(number)}/description`);

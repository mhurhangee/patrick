import type { OpsSettings } from "@patrick/shared";

// EPO OPS OAuth2 (client_credentials): exchange the consumer key/secret for a
// short-lived bearer token (~20 min). Cached in-memory per consumer key and
// refreshed on expiry or a 401 (see client.ts), so a burst of section fetches
// for one reference authenticates once.

const AUTH_URL = "https://ops.epo.org/3.2/auth/accesstoken";

/** An OPS call failed in a way worth surfacing to the attorney (auth, quota…). */
export class OpsError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "OpsError";
	}
}

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

export function clearToken(creds: OpsSettings): void {
	tokenCache.delete(creds.consumerKey.trim());
}

/**
 * A one-off credential check: do the OAuth exchange directly (no token cache, so
 * a changed secret under the same key isn't masked by a cached token) and report
 * whether the key/secret are accepted. A real OPS request, behind the scenes.
 */
export async function verifyCredentials(creds: OpsSettings): Promise<boolean> {
	const key = creds.consumerKey.trim();
	const secret = creds.consumerSecret.trim();
	if (!key || !secret) return false;
	const basic = Buffer.from(`${key}:${secret}`).toString("base64");
	const res = await fetch(AUTH_URL, {
		method: "POST",
		headers: {
			Authorization: `Basic ${basic}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: "grant_type=client_credentials",
	});
	return res.ok;
}

export async function getAccessToken(creds: OpsSettings): Promise<string> {
	// Copy-pasting the key/secret from the EPO portal easily picks up stray
	// whitespace — trim before use so it doesn't silently break auth.
	const key = creds.consumerKey.trim();
	const secret = creds.consumerSecret.trim();
	if (!key || !secret) {
		throw new OpsError("No EPO OPS credentials configured.", 400);
	}
	// Reuse a cached token with a 30s safety margin before expiry.
	const cached = tokenCache.get(key);
	if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

	const basic = Buffer.from(`${key}:${secret}`).toString("base64");
	const res = await fetch(AUTH_URL, {
		method: "POST",
		headers: {
			Authorization: `Basic ${basic}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: "grant_type=client_credentials",
	});
	if (!res.ok) {
		const detail =
			res.status === 401 || res.status === 400
				? " — check your EPO OPS key/secret."
				: "";
		throw new OpsError(`EPO OPS authentication failed${detail}`, res.status);
	}
	const data = (await res.json()) as {
		access_token?: string;
		expires_in?: string;
	};
	if (!data.access_token)
		throw new OpsError("EPO OPS returned no access token.", 502);
	const ttlMs = (Number(data.expires_in) || 1200) * 1000;
	tokenCache.set(key, {
		token: data.access_token,
		expiresAt: Date.now() + ttlMs,
	});
	return data.access_token;
}

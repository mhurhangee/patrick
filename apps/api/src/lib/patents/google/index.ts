import type { ProviderResult } from "../types";
import { parseGoogle } from "./parse";

// Google Patents provider — keyless, universal (US/EP/WO/…), public-domain text.
// Fetches the public document page (the user's own device, one doc at a time)
// and parses the HTML. Used for US and as the fallback for EP/WO.

const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchGoogle(number: string): Promise<ProviderResult> {
	const url = `https://patents.google.com/patent/${encodeURIComponent(number)}/en`;
	let res: Response;
	try {
		// fetch follows the 301 redirect (kind-less → canonical page) by default.
		res = await fetch(url, {
			headers: { "User-Agent": UA, "Accept-Language": "en" },
		});
	} catch {
		return {
			ok: false,
			status: 502,
			message:
				"Couldn't reach Google Patents. Check your connection and try again.",
		};
	}
	if (res.status === 404) {
		return {
			ok: false,
			status: 404,
			message: `No page found for ${number} on Google Patents.`,
		};
	}
	const html = await res.text();
	if (
		!res.ok ||
		/consent\.google|Our systems have detected|recaptcha/.test(html)
	) {
		return {
			ok: false,
			status: 502,
			message:
				"Google Patents declined the request (likely a temporary rate limit). Try again shortly.",
		};
	}
	const publication = parseGoogle(html, number);
	if (publication.claims.length === 0 && publication.description.length === 0) {
		// Non-English pages carry only Google's machine translation (google-src-text
		// spans), not the structured text we parse — say so plainly.
		const nonEnglish = html.includes("google-src-text");
		return {
			ok: false,
			status: 404,
			message: nonEnglish
				? `${number} is a non-English publication — only English-language patents are supported for now (machine-translation support is planned).`
				: `No full text found for ${number} on Google Patents.`,
		};
	}
	return { ok: true, publication };
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Fetches a provision page's HTML. Injected so the app controls caching. */
export type PageFetcher = (url: string) => Promise<string>;

const DEFAULT_UA =
	"Patrick/0.1 (patent-prosecution assistant; on-demand legal-text lookup)";

/**
 * A page fetcher that caches HTML on disk under `cacheDir`, keyed by the page
 * slug. Immutable consolidated law ⇒ once fetched, a provision is served from
 * disk (offline, instant). Pass this the config-home law cache in the app.
 */
export function fileCachedFetcher(
	cacheDir: string,
	ua = DEFAULT_UA,
): PageFetcher {
	return async (url) => {
		// Key by the path after /en/legal/ — the slug alone collides across sources
		// (g_vii_5.html exists in both the EPC and PCT Guidelines trees).
		const key =
			url
				.replace(/^https?:\/\/[^/]+\/en\/legal\//, "")
				.replace(/[^\w.-]+/g, "_") || "page.html";
		const file = join(cacheDir, key);
		try {
			return await readFile(file, "utf8");
		} catch {
			// not cached yet — fetch and store
		}
		const res = await fetch(url, { headers: { "user-agent": ua } });
		if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
		const html = await res.text();
		await mkdir(dirname(file), { recursive: true });
		await writeFile(file, html);
		return html;
	};
}

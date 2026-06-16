// Builds data/epc-map.json: the index of every EPC 2020 page on epo.org, with
// its citation key and head metadata. One-time, dev-run, rerunnable. Raw HTML is
// cached under .cache/ so reruns are instant and don't re-hit epo.org; pass
// --refresh to bust the cache. The provision *text* is NOT stored here — that's
// fetched on demand by the lookup tool. Run: pnpm --filter @patrick/law build:map

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type HTMLElement, parse } from "node-html-parser";
import { classifySlug } from "../src/classify";
import type { EpcMap, EpcMapEntry } from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache");
const OUT = join(ROOT, "data", "epc-map.json");

const SITEMAP_INDEX = "https://www.epo.org/en/legal/assets/sitemap.xml";
const EPC_PAGE =
	/https:\/\/www\.epo\.org\/en\/legal\/epc\/2020\/([a-z0-9_]+)\.html/gi;
const UA =
	"Patrick-law-map/0.1 (one-time index build; https://github.com/mhurhangee/patrick)";
const CONCURRENCY = 6;
const refresh = process.argv.includes("--refresh");

async function fetchText(url: string, cacheKey: string): Promise<string> {
	const cached = join(CACHE, cacheKey);
	if (!refresh && existsSync(cached)) return readFile(cached, "utf8");
	const res = await fetch(url, { headers: { "user-agent": UA } });
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	const text = await res.text();
	await mkdir(dirname(cached), { recursive: true });
	await writeFile(cached, text);
	return text;
}

const locs = (xml: string): string[] =>
	[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => (m[1] ?? "").trim());

/** Walk the sitemap index → child sitemaps, collecting EPC 2020 pages by slug. */
async function discoverPages(): Promise<Map<string, string>> {
	const index = await fetchText(SITEMAP_INDEX, "sitemap/index.xml");
	const pages = new Map<string, string>();
	const children = locs(index);
	for (const [i, child] of children.entries()) {
		const xml = await fetchText(child, `sitemap/child-${i}.xml`);
		for (const m of xml.matchAll(EPC_PAGE)) {
			const slug = m[1];
			if (slug) pages.set(slug, m[0]);
		}
	}
	return pages;
}

const meta = (root: HTMLElement, name: string): string | null =>
	root.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim() ||
	null;

async function buildEntry(slug: string, url: string): Promise<EpcMapEntry> {
	const root = parse(await fetchText(url, `pages/${slug}.html`));
	const c = classifySlug(slug);
	return {
		slug,
		url,
		kind: c.kind,
		citationKey: c.citationKey,
		number: c.number,
		suffix: c.suffix,
		title: meta(root, "title"),
		instrument: meta(root, "booktitle"),
		part: meta(root, "parttitle"),
		chapter: meta(root, "chaptertitle"),
		updated: meta(root, "date_publication"),
	};
}

/** Run `fn` over `items` with a fixed-size worker pool (politeness + speed). */
async function pool<T>(
	items: T[],
	n: number,
	fn: (item: T) => Promise<void>,
): Promise<void> {
	let i = 0;
	await Promise.all(
		Array.from({ length: n }, async () => {
			while (i < items.length) {
				const item = items[i++];
				if (item !== undefined) await fn(item);
			}
		}),
	);
}

async function main(): Promise<void> {
	console.log("Discovering EPC 2020 pages from the sitemap…");
	const pages = await discoverPages();
	const list = [...pages.entries()];
	console.log(
		`Found ${list.length} pages. Reading head metadata${refresh ? " (refresh)" : " (cached)"}…`,
	);

	const entries: EpcMapEntry[] = [];
	let done = 0;
	await pool(list, CONCURRENCY, async ([slug, url]) => {
		try {
			entries.push(await buildEntry(slug, url));
		} catch (err) {
			console.warn(`  skip ${slug}: ${(err as Error).message}`);
		}
		if (++done % 50 === 0) console.log(`  ${done}/${list.length}`);
	});

	const rank: Record<EpcMapEntry["kind"], number> = {
		article: 0,
		rule: 1,
		fee: 2,
		other: 3,
	};
	entries.sort(
		(a, b) =>
			rank[a.kind] - rank[b.kind] ||
			(a.number ?? 0) - (b.number ?? 0) ||
			(a.suffix ?? "").localeCompare(b.suffix ?? "") ||
			a.slug.localeCompare(b.slug),
	);

	const map: EpcMap = {
		generatedAt: new Date().toISOString().slice(0, 10),
		source:
			"European Patent Convention, EPO — https://www.epo.org/en/legal/epc/2020/",
		version: "EPC 2020 (consolidated)",
		count: entries.length,
		entries,
	};
	await mkdir(dirname(OUT), { recursive: true });
	await writeFile(OUT, `${JSON.stringify(map, null, 2)}\n`);

	const byKind = entries.reduce<Record<string, number>>((acc, e) => {
		acc[e.kind] = (acc[e.kind] ?? 0) + 1;
		return acc;
	}, {});
	console.log(`\nWrote ${entries.length} entries → ${OUT}`);
	console.log("By kind:", byKind);
}

main();

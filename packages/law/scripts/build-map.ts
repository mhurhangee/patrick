// Builds data/<source>-map.json for each source in src/sources.ts: the index of
// every page on epo.org with its citation key, derived from the URL slug. The EPC
// set also fetches titles (small); the Guidelines/case-law sets are sitemap-only
// (titles come from the body on recall). One-time, rerunnable; raw HTML cached
// under .cache/ (--refresh to bust). Run all: pnpm --filter @patrick/law build:map
// One source:  pnpm --filter @patrick/law build:map -- guidelines-epc

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type HTMLElement, parse } from "node-html-parser";
import { SOURCES, type Source } from "../src/sources";
import type { EpcMap, EpcMapEntry } from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache");
const DATA = join(ROOT, "data");

const SITEMAP_INDEX = "https://www.epo.org/en/legal/assets/sitemap.xml";
const UA =
	"Patrick-law-map/0.1 (one-time index build; https://github.com/mhurhangee/patrick)";
const CONCURRENCY = 6;
const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const only = args.find((a) => !a.startsWith("-"));

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

/** The whole sitemap (index → children), concatenated and cached. */
async function sitemapXml(): Promise<string> {
	const index = await fetchText(SITEMAP_INDEX, "sitemap/index.xml");
	const parts: string[] = [];
	for (const [i, child] of locs(index).entries())
		parts.push(await fetchText(child, `sitemap/child-${i}.xml`));
	return parts.join("");
}

/** Pages of a source, by slug → url. */
function discover(xml: string, source: Source): Map<string, string> {
	const re = new RegExp(
		`https://www\\.epo\\.org/en/legal/${source.path}/([a-z0-9_]+)\\.html`,
		"gi",
	);
	const pages = new Map<string, string>();
	for (const m of xml.matchAll(re)) if (m[1]) pages.set(m[1], m[0]);
	return pages;
}

const meta = (root: HTMLElement, name: string): string | null =>
	root.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim() ||
	null;

async function buildEntry(
	source: Source,
	slug: string,
	url: string,
): Promise<EpcMapEntry> {
	const c = source.classify(slug);
	// Pages are crawled into .cache/pages/<source>/<slug>.html; read from there
	// (fetch on a miss). A page with empty .epolegal-content is a nav/index page.
	const root = parse(await fetchText(url, `pages/${source.id}/${slug}.html`));
	const body = root.querySelector(".epolegal-content");
	return {
		source: source.id,
		slug,
		url,
		kind: c.kind,
		citationKey: c.citationKey,
		number: c.number,
		suffix: c.suffix,
		recallable: (body?.text ?? "").trim().length > 0,
		title: meta(root, "title"),
		instrument: meta(root, "booktitle"),
		part: meta(root, "parttitle"),
		chapter: meta(root, "chaptertitle"),
		updated: meta(root, "date_publication"),
	};
}

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

async function buildSource(source: Source, xml: string): Promise<void> {
	const pages = [...discover(xml, source).entries()];
	const entries: EpcMapEntry[] = [];
	await pool(pages, CONCURRENCY, async ([slug, url]) => {
		entries.push(await buildEntry(source, slug, url));
	});

	const rank: Record<string, number> = {
		article: 0,
		rule: 1,
		fee: 2,
		guideline: 3,
		caselaw: 4,
		other: 5,
	};
	entries.sort(
		(a, b) =>
			(rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) ||
			(a.number ?? 0) - (b.number ?? 0) ||
			(a.citationKey ?? a.slug).localeCompare(b.citationKey ?? b.slug),
	);

	const map: EpcMap = {
		generatedAt: new Date().toISOString().slice(0, 10),
		source: `${source.label}, EPO — https://www.epo.org/en/legal/${source.path}/`,
		version: source.path,
		count: entries.length,
		entries,
	};
	await mkdir(DATA, { recursive: true });
	await writeFile(
		join(DATA, `${source.id}-map.json`),
		`${JSON.stringify(map, null, 2)}\n`,
	);
	const keyed = entries.filter((e) => e.citationKey).length;
	// Recallable count is a tripwire: it's derived from a single selector
	// (.epolegal-content non-empty), so a future EPO template change could quietly
	// collapse it — a sudden drop here means recall + the picker just lost pages.
	const recallable = entries.filter((e) => e.recallable).length;
	console.log(
		`${source.id.padEnd(16)} ${entries.length} pages (${keyed} keyed, ${recallable} recallable) → ${source.id}-map.json`,
	);
}

async function main(): Promise<void> {
	const targets = only ? SOURCES.filter((s) => s.id === only) : SOURCES;
	if (targets.length === 0) {
		console.error(
			`No source matches "${only}". Known: ${SOURCES.map((s) => s.id).join(", ")}`,
		);
		process.exit(1);
	}
	console.log("Reading sitemap…");
	const xml = await sitemapXml();
	for (const source of targets) await buildSource(source, xml);
}

main();

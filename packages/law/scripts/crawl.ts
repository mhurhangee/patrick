// One-time polite crawl: cache the full HTML of every Guidelines / PCT-Guidelines
// / Case-Law page locally, so all later work (titles, leaf-vs-nav detection, TOC
// building) iterates offline and never re-scrapes. Pages come from the cached
// sitemap; EPC is already cached so it's skipped. Resumable — skips files already
// on disk. Run: pnpm --filter @patrick/law crawl

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES, type Source } from "../src/sources";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITEMAP = join(ROOT, ".cache", "sitemap");
const PAGES = join(ROOT, ".cache", "pages");
const UA =
	"Patrick-law-crawl/0.1 (one-time guidelines/case-law cache; https://github.com/mhurhangee/patrick)";
const CONCURRENCY = 3;
const DELAY_MS = 250;
const TIMEOUT_MS = 30_000;

const sleep = (ms: number): Promise<void> =>
	new Promise((r) => setTimeout(r, ms));

async function sitemapXml(): Promise<string> {
	const files = (await readdir(SITEMAP)).filter((f) => f.startsWith("child"));
	const parts = await Promise.all(
		files.map((f) => readFile(join(SITEMAP, f), "utf8")),
	);
	return parts.join("");
}

function discover(xml: string, source: Source): Map<string, string> {
	const re = new RegExp(
		`https://www\\.epo\\.org/en/legal/${source.path}/([a-z0-9_]+)\\.html`,
		"gi",
	);
	const pages = new Map<string, string>();
	for (const m of xml.matchAll(re)) if (m[1]) pages.set(m[1], m[0]);
	return pages;
}

async function fetchPage(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { "user-agent": UA },
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.text();
}

async function crawlSource(source: Source, xml: string): Promise<void> {
	const dir = join(PAGES, source.id);
	await mkdir(dir, { recursive: true });
	const pages = [...discover(xml, source).entries()];
	let done = 0;
	let fetched = 0;
	let failed = 0;
	let i = 0;
	console.log(`\n${source.id} (${source.path}): ${pages.length} pages`);
	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			while (i < pages.length) {
				const page = pages[i++];
				if (!page) continue;
				const [slug, url] = page;
				done++;
				const file = join(dir, `${slug}.html`);
				if (existsSync(file)) continue;
				try {
					await writeFile(file, await fetchPage(url));
					fetched++;
				} catch (_e) {
					try {
						await sleep(1000);
						await writeFile(file, await fetchPage(url));
						fetched++;
					} catch (err) {
						failed++;
						console.warn(`  fail ${slug}: ${(err as Error).message}`);
					}
				}
				if (done % 100 === 0)
					console.log(`  ${source.id}: ${done}/${pages.length} (+${fetched})`);
				await sleep(DELAY_MS);
			}
		}),
	);
	console.log(
		`${source.id}: done — fetched ${fetched}, already-cached ${done - fetched - failed}, failed ${failed}`,
	);
}

async function main(): Promise<void> {
	const targets = SOURCES.filter((s) => s.id !== "epc");
	const xml = await sitemapXml();
	for (const source of targets) await crawlSource(source, xml);
	console.log("\nCrawl complete.");
}

main();

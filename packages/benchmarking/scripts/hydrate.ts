// Hydrate source sets: parse data/source-sets.txt (one set per line, citations
// only) and derive everything else from @patrick/law — id, topic, jurisdiction,
// source URLs, and the verbatim in-force text — using the same resolver + fetcher
// the product's ep_law_lookup uses, so the gold can never drift from the corpus
// the system retrieves against. Output is the frozen gold the items are built and
// scored against — committed, and re-run (diff the result) whenever the law
// changes. Non-EP sets (PCT / EPO-PCT) are skipped until they're in the corpus.
//
//   pnpm --filter @patrick/benchmarking hydrate

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	fileCachedFetcher,
	lookupProvisions,
	resolveCitation,
	type Resolution,
} from "@patrick/law";
import type { EpcKind } from "@patrick/shared";
import type {
	AuthoredSourceSet,
	ProvisionType,
	SourceSet,
	SourceSetProvision,
} from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = join(ROOT, "data", "source-sets.txt");
const HYDRATED = join(ROOT, "data", "hydrated");
const fetchPage = fileCachedFetcher(join(ROOT, ".cache"));
const lawDate = new Date().toISOString().slice(0, 7);

// ── Parsing ────────────────────────────────────────────────────────────────

/** Parse the text file into one authored set per citation line, carrying the
 *  `# paper` / `## question` headers in scope as provenance. */
function parseInput(text: string): AuthoredSourceSet[] {
	const sets: AuthoredSourceSet[] = [];
	let paper: string | undefined;
	let question: string | undefined;
	const seq = new Map<string, number>();
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		if (line.startsWith("##")) {
			question = line.replace(/^#+\s*/, "");
			continue;
		}
		if (line.startsWith("#")) {
			paper = line.replace(/^#+\s*/, "");
			question = undefined;
			continue;
		}
		const eq = line.indexOf("=");
		const topic =
			eq !== -1 ? line.slice(0, eq).replace(/^topic/i, "").trim() : undefined;
		const body = eq !== -1 ? line.slice(eq + 1) : line;
		const key = `${paper ?? ""}|${question ?? ""}`;
		const n = (seq.get(key) ?? 0) + 1;
		seq.set(key, n);
		sets.push({
			citations: splitCitations(body),
			seq: n,
			...(topic ? { topic } : {}),
			...(paper ? { paper } : {}),
			...(question ? { question } : {}),
		});
	}
	return sets;
}

/** Split a line into citations on ; or , — rejoining a Guidelines section whose
 *  subsection was comma-separated ("GL A-II, 4.1" → "GL A-II 4.1") and dropping a
 *  trailing fee-item reference ("…RFees, item 1" → the item isn't its own
 *  provision; the governing article is). */
function splitCitations(body: string): string[] {
	const parts = body
		.split(/[;,]/)
		.map((c) => c.trim())
		.filter((c) => c && !/^items?\s+\d+/i.test(c));
	const out: string[] = [];
	for (const part of parts) {
		const prev = out[out.length - 1];
		if (prev && /^\d/.test(part) && /\b(?:GL|Guidelines)\b/i.test(prev)) {
			out[out.length - 1] = `${prev} ${part}`;
		} else out.push(part);
	}
	return out;
}

/** Map exam shorthand to forms the resolver accepts. */
function normalize(citation: string): string {
	return citation
		.replace(/^GL\b\.?\s*/i, "Guidelines ") // GL A-II 4.1 → Guidelines A-II 4.1
		.replace(/^R?Fees?\b\.?\s+(\d+)[\d.]*/i, "Article $1 RFees") // RFees 2.15 → Article 2 RFees
		.replace(/\bArt\.?s\.?\s+/i, "Articles ") // Art.s 89 → Articles 89
		.trim();
}

// ── Classification ─────────────────────────────────────────────────────────

type Classified =
	| { kind: "ep"; citation: string; resolution: Resolution }
	| { kind: "pct"; citation: string }
	| { kind: "unresolved"; citation: string };

function classify(raw: string): Classified {
	const citation = normalize(raw);
	const resolution = resolveCitation(citation);
	if (resolution) {
		return resolution.entry.source === "guidelines-pct"
			? { kind: "pct", citation }
			: { kind: "ep", citation, resolution };
	}
	if (/\bPCT\b/i.test(raw)) return { kind: "pct", citation };
	return { kind: "unresolved", citation };
}

function provisionType(kind: EpcKind): ProvisionType {
	if (kind === "guideline") return "guidelines";
	if (kind === "article" || kind === "rule" || kind === "caselaw") return kind;
	return "other";
}

const kebab = (s: string): string =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

// ── Hydration ──────────────────────────────────────────────────────────────

async function hydrate(
	authored: AuthoredSourceSet,
	usedIds: Set<string>,
): Promise<SourceSet | null> {
	const classes = authored.citations.map(classify);
	const where = [authored.paper, authored.question].filter(Boolean).join(" ");
	const at = where ? `[${where}] ` : "";

	if (classes.some((c) => c.kind === "pct")) {
		console.log(
			`  ⏭  ${at}skipped (PCT / EPO-PCT, not yet in corpus): ${authored.citations.join(", ")}`,
		);
		return null;
	}
	const unresolved = classes.filter((c) => c.kind === "unresolved");
	if (unresolved.length > 0) {
		console.warn(
			`  ⚠  ${at}skipped — couldn't resolve: ${unresolved.map((c) => c.citation).join(", ")}`,
		);
		return null;
	}
	const eps = classes as Extract<Classified, { kind: "ep" }>[];
	const primary = eps[0]?.resolution.entry;
	if (!primary) return null; // line had no resolvable citations
	// Prefer a stable provenance-based id (2026-f-q1-1); fall back to the primary
	// citation for bare lines with no paper/question header.
	const base =
		authored.paper && authored.question
			? `${kebab(authored.paper.replace(/paper/i, ""))}-${kebab(authored.question)}-${authored.seq}`
			: `ep-${kebab(primary.citationKey ?? primary.slug)}`;
	let id = base;
	for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
	usedIds.add(id);

	const provenance =
		authored.paper && authored.question
			? `${authored.paper} · ${authored.question}`
			: authored.paper;

	const lookups = await lookupProvisions(
		eps.map((c) => c.citation),
		fetchPage,
	);
	const provisions: SourceSetProvision[] = [];
	lookups.forEach((r, i) => {
		const ep = eps[i];
		if (!ep || r.status !== "ok" || !r.provision) {
			console.warn(`  ⚠  ${id}: "${r.ref}" has no text — dropped`);
			return;
		}
		provisions.push({
			citation: r.ref,
			type: provisionType(ep.resolution.entry.kind),
			text: r.provision.blocks.map((b) => b.text).join("\n"),
			version: r.provision.version,
		});
	});

	return {
		id,
		jurisdiction: "EP",
		topic: authored.topic ?? primary.title ?? id,
		...(provenance ? { provenance } : {}),
		law_date: lawDate,
		provisions,
		source_refs: eps.map((c) => c.resolution.entry.url),
	};
}

async function main(): Promise<void> {
	await rm(HYDRATED, { recursive: true, force: true });
	await mkdir(HYDRATED, { recursive: true });
	const authored = parseInput(await readFile(INPUT, "utf8"));
	const usedIds = new Set<string>();
	let written = 0;
	for (const set of authored) {
		const hydrated = await hydrate(set, usedIds);
		if (!hydrated) continue;
		await writeFile(
			join(HYDRATED, `${hydrated.id}.json`),
			`${JSON.stringify(hydrated, null, 2)}\n`,
		);
		written++;
		console.log(
			`${hydrated.id.padEnd(16)} ${hydrated.provisions.length} provisions · "${hydrated.topic}"`,
		);
	}
	console.log(`\n${written}/${authored.length} sets hydrated → data/hydrated/`);
}

main();

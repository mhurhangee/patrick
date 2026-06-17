// Hydrate authored source sets into gold source sets: each authored file lists
// citations only; here we pull the verbatim in-force text for each via
// @patrick/law (the same resolver + fetcher the product's ep_law_lookup uses), so
// the gold can never drift from the corpus the system retrieves against. Output
// is the frozen gold the items are built and scored against — committed, and
// re-run (diff the result) whenever the underlying law changes.
//
//   pnpm --filter @patrick/benchmarking hydrate

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	fileCachedFetcher,
	lookupProvisions,
	resolveCitation,
} from "@patrick/law";
import type { EpcKind } from "@patrick/shared";
import type {
	AuthoredSourceSet,
	ProvisionType,
	SourceSet,
	SourceSetProvision,
} from "../src/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUTHORED = join(ROOT, "data", "source-sets");
const HYDRATED = join(ROOT, "data", "hydrated");
const fetchPage = fileCachedFetcher(join(ROOT, ".cache"));
const lawDate = new Date().toISOString().slice(0, 7);

function provisionType(kind: EpcKind): ProvisionType {
	if (kind === "guideline") return "guidelines";
	if (kind === "article" || kind === "rule" || kind === "caselaw") return kind;
	return "other";
}

async function hydrate(authored: AuthoredSourceSet): Promise<SourceSet> {
	const results = await lookupProvisions(authored.citations, fetchPage);
	const provisions: SourceSetProvision[] = [];
	for (const r of results) {
		if (r.status !== "ok" || !r.provision) {
			console.warn(`  ⚠ ${authored.id}: "${r.ref}" did not resolve — dropped`);
			continue;
		}
		const kind = resolveCitation(r.ref)?.entry.kind ?? "other";
		provisions.push({
			citation: r.ref,
			type: provisionType(kind),
			text: r.provision.blocks.map((b) => b.text).join("\n"),
			version: r.provision.version,
		});
	}
	return {
		id: authored.id,
		jurisdiction: authored.jurisdiction,
		topic: authored.topic,
		law_date: lawDate,
		provisions,
		...(authored.source_refs ? { source_refs: authored.source_refs } : {}),
	};
}

async function main(): Promise<void> {
	await mkdir(HYDRATED, { recursive: true });
	const files = (await readdir(AUTHORED)).filter((f) => f.endsWith(".json"));
	for (const file of files) {
		const authored = JSON.parse(
			await readFile(join(AUTHORED, file), "utf8"),
		) as AuthoredSourceSet;
		const set = await hydrate(authored);
		await writeFile(
			join(HYDRATED, `${set.id}.json`),
			`${JSON.stringify(set, null, 2)}\n`,
		);
		console.log(
			`${set.id.padEnd(24)} ${set.provisions.length}/${authored.citations.length} provisions → hydrated/${set.id}.json`,
		);
	}
}

main();

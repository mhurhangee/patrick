// Smoke-test the lookup end to end against real EPO pages. Reuses the build's
// page cache (.cache/pages) so it runs offline once the map has been built.
// Run: pnpm --filter @patrick/law exec bun scripts/try-lookup.ts

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fileCachedFetcher } from "../src/fetch-page";
import { lookupProvisions } from "../src/lookup";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fetchPage = fileCachedFetcher(join(ROOT, ".cache", "pages"));

const refs = [
	"A54(2)",
	"Article 56 EPC",
	"R137(3)",
	"RFees A2",
	"inventive step",
	"prorecog",
	"A999",
];

const results = await lookupProvisions(refs, fetchPage);
for (const r of results) {
	if (r.status !== "ok" || !r.provision) {
		console.log(`\n❌ ${r.ref} → not_found`);
		continue;
	}
	const p = r.provision;
	console.log(`\n✅ ${r.ref}${r.focus ? ` focus=${r.focus}` : ""}`);
	console.log(`   ${p.title}  [${p.version}]`);
	console.log(`   ${p.citationKey ?? p.slug} · ${p.instrument ?? "—"}`);
	for (const b of p.blocks.slice(0, 3))
		console.log(`     ${b.text.slice(0, 88)}`);
	if (p.blocks.length > 3) console.log(`     … +${p.blocks.length - 3} blocks`);
	const noteKeys = Object.keys(p.notes);
	if (noteKeys.length)
		console.log(
			`   notes: ${noteKeys.join(", ")}${p.titleNotes.length ? ` · title→${p.titleNotes.join(",")}` : ""}`,
		);
}

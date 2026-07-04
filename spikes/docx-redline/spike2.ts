// Spike 2: redline a real USPTO Non-Final Rejection docx and measure collateral damage.
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import {
	acceptTrackedChangesInOoxml,
	configureXmlProvider,
	ensureCommentsArtifactsInZip,
	injectCommentsIntoOoxml,
	rejectTrackedChangesInOoxml,
	setDefaultAuthor,
} from "@ansonlai/docx-redline-js";
import { applyOperationToDocumentXml } from "@ansonlai/docx-redline-js/services/standalone-operation-runner.js";

configureXmlProvider({ DOMParser, XMLSerializer });
setDefaultAuthor("Patrick");

const buf = await Bun.file("Non-Final Rejection(1).docx").arrayBuffer();
const zip = await JSZip.loadAsync(buf);
const before = await zip.file("word/document.xml")!.async("string");

const target =
	"This communication is a First Office Action Non-Final Rejection on the merits.";
const modified =
	"This communication is a First Office Action Non-Final Rejection on the merits, responsive to the amendment filed 12 May 2026.";

const r1 = await applyOperationToDocumentXml(
	before,
	{ type: "redline", target, modified },
	"Patrick",
);
console.log("redline 1:", r1.status, "| hasChanges:", r1.hasChanges);

// A replace-heavy edit in the §103 rationale paragraph
const target2 =
	"Heinla and Iagnemma both teach analogous arts of autonomous vehicle control using LIDAR and camera sensor and processing units.";
const modified2 =
	"Heinla and Iagnemma are directed to unrelated fields and do not teach autonomous vehicle control combining LIDAR and camera sensing.";
const r2 = await applyOperationToDocumentXml(
	r1.documentXml,
	{ type: "redline", target: target2, modified: modified2 },
	"Patrick",
);
console.log("redline 2:", r2.status, "| hasChanges:", r2.hasChanges);

const commented = await injectCommentsIntoOoxml(r2.documentXml, [
	{
		paragraphIndex: 10,
		textToFind: "Claims 1 – 5 and 53 are currently pending",
		commentContent: "@Michael: check the pending-claims list against our last amendment.",
	},
]);
console.log("comment:", commented.commentsApplied, "applied | warnings:", JSON.stringify(commented.warnings));

const finalXml: string = commented.commentsApplied > 0 ? commented.oxml : r2.documentXml;
zip.file("word/document.xml", finalXml);
if (commented.commentsXml) await ensureCommentsArtifactsInZip(zip, commented.commentsXml);
await Bun.write("uspto-redlined.docx", await zip.generateAsync({ type: "uint8array" }));

// --- Collateral-damage metrics ---
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
console.log("\n-- collateral metrics (before -> after) --");
console.log("w:rPrChange:", count(before, /<w:rPrChange/g), "->", count(finalXml, /<w:rPrChange/g));
console.log("w:ins:", count(before, /<w:ins /g), "->", count(finalXml, /<w:ins /g));
console.log("w:del:", count(before, /<w:del /g), "->", count(finalXml, /<w:del /g));
console.log('explicit w:b val=0:', count(before, /<w:b w:val="0"/g), "->", count(finalXml, /<w:b w:val="0"/g));

// How many paragraphs were touched at all?
const parasOf = (s: string) => s.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
const pb = parasOf(before);
const pa = parasOf(finalXml);
console.log("paragraph count:", pb.length, "->", pa.length);
let touched = 0;
for (let i = 0; i < Math.min(pb.length, pa.length); i++) if (pb[i] !== pa[i]) touched++;
console.log("paragraphs byte-modified:", touched, "(expect ~3: two edits + one comment anchor)");

// Accept/reject round-trip on the real doc
const textOf = (xml: string) =>
	[...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
const acc = acceptTrackedChangesInOoxml(finalXml, { allAuthors: true });
const rej = rejectTrackedChangesInOoxml(finalXml, { allAuthors: true });
const accXml = (acc as any).oxml ?? (acc as any).documentXml ?? acc;
const rejXml = (rej as any).oxml ?? (rej as any).documentXml ?? rej;
console.log("\naccept -> modified text present:", textOf(accXml).includes("responsive to the amendment filed 12 May 2026"));
console.log("reject -> original text restored:", textOf(rejXml).includes(target) && textOf(rejXml).includes(target2));

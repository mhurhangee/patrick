// Spike: can docx-redline-js produce native Word tracked changes headlessly under Bun?
// Flow: build a minimal "createdInPatrick"-style docx → apply a redline edit →
// inject a comment → validate → verify accept/reject round-trips → write output files.
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import {
	acceptTrackedChangesInOoxml,
	configureXmlProvider,
	ensureCommentsArtifactsInZip,
	injectCommentsIntoOoxml,
	rejectTrackedChangesInOoxml,
	setDefaultAuthor,
	validateDocxPackage,
} from "@ansonlai/docx-redline-js";
import { applyOperationToDocumentXml } from "@ansonlai/docx-redline-js/services/standalone-operation-runner.js";

configureXmlProvider({ DOMParser, XMLSerializer });
setDefaultAuthor("Patrick");

// --- 1. Build a minimal docx (stands in for a Patrick-generated draft) ---
const paragraphs = [
	"Amended Claims — Response to Communication under Article 94(3) EPC",
	"Claim 1. A widget comprising a housing, a sensor disposed within the housing, and a controller configured to receive signals from the sensor.",
	"Claim 2. The widget of claim 1, wherein the sensor is a temperature sensor.",
	"The applicant respectfully submits that the cited document D1 does not disclose a controller configured to receive signals from the sensor.",
];

const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs.map(p).join("")}<w:sectPr/></w:body></w:document>`;

const zip = new JSZip();
zip.file(
	"[Content_Types].xml",
	`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
);
zip.file(
	"_rels/.rels",
	`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
);
zip.file(
	"word/_rels/document.xml.rels",
	`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
);
zip.file("word/document.xml", documentXml);
await Bun.write("base.docx", await zip.generateAsync({ type: "uint8array" }));
console.log("1. base.docx written");

// --- 2. Redline edit: amend claim 1 (the paragraph-scoped reconciliation model) ---
const original =
	"Claim 1. A widget comprising a housing, a sensor disposed within the housing, and a controller configured to receive signals from the sensor.";
const modified =
	"Claim 1. A widget comprising a housing, a temperature sensor disposed within the housing, and a controller configured to receive and process signals from the temperature sensor.";

const redlined = await applyOperationToDocumentXml(
	await zip.file("word/document.xml")!.async("string"),
	{ type: "redline", target: original, modified },
	"Patrick",
);
console.log("2. redline applied:", redlined.status, "| hasChanges:", redlined.hasChanges);

// Second edit with real deletions: rewrite the argument sentence
const arg = paragraphs[3];
const argModified =
	"The applicant submits that D1 fails to disclose a controller configured to receive and process signals from a temperature sensor.";
const redlined2 = await applyOperationToDocumentXml(
	redlined.documentXml,
	{ type: "redline", target: arg, modified: argModified },
	"Patrick",
);
console.log("2b. second redline:", redlined2.status, "| hasChanges:", redlined2.hasChanges);

// --- 3. Inject a comment anchored to a text range ---
const commented = await injectCommentsIntoOoxml(redlined2.documentXml, [
	{
		paragraphIndex: 3,
		textToFind: "temperature sensor",
		commentContent:
			"@Michael: D1 ¶[0032] arguably discloses a signal-receiving controller — consider narrowing to 'process' language here too.",
	},
]);
console.log("3. comment injected:", commented.commentsApplied, "applied | warnings:", JSON.stringify(commented.warnings));

let finalDocXml: string = commented.oxml ?? commented.documentXml ?? commented;
zip.file("word/document.xml", finalDocXml);
if (commented.commentsXml) {
	await ensureCommentsArtifactsInZip(zip, commented.commentsXml);
	console.log("   comments.xml merged into package");
}

// --- 4. Validate + write output ---
const validation = await validateDocxPackage(zip);
console.log("4. validateDocxPackage:", JSON.stringify(validation));
await Bun.write("redlined.docx", await zip.generateAsync({ type: "uint8array" }));
console.log("   redlined.docx written");

// --- 5. Programmatic verification: accept → modified text; reject → original text ---
const textOf = (xml: string) =>
	[...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

const accepted = await acceptTrackedChangesInOoxml(finalDocXml, { allAuthors: true });
const acceptedXml = accepted.oxml ?? accepted.documentXml ?? accepted;
const rejected = await rejectTrackedChangesInOoxml(finalDocXml, { allAuthors: true });
const rejectedXml = rejected.oxml ?? rejected.documentXml ?? rejected;

console.log("5. accept contains modified text:", textOf(acceptedXml).includes("receive and process signals from the temperature sensor"));
console.log("   reject restores original claim:", textOf(rejectedXml).includes(original.slice(9)), "| original argument:", textOf(rejectedXml).includes("respectfully submits that the cited document D1"));
console.log("   redlined has w:ins:", finalDocXml.includes("<w:ins"), "| w:del:", finalDocXml.includes("<w:del"));

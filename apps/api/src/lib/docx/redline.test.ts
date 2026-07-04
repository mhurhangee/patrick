import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	acceptTrackedChangesInOoxml,
	rejectTrackedChangesInOoxml,
} from "@ansonlai/docx-redline-js";
import JSZip from "jszip";
import {
	addComment,
	applyRedline,
	extractDocxText,
	listComments,
	readDraftParagraphs,
	readDraftRuns,
} from "./redline";

// A real USPTO office action — styles, numbering, header, examiner comments.
const FIXTURE = join(
	process.cwd(),
	"e2e",
	"fixtures",
	"uspto-office-action.docx",
);

const fixtureBytes = async () =>
	new Uint8Array(await Bun.file(FIXTURE).arrayBuffer());

const documentXmlOf = async (bytes: Uint8Array) => {
	const zip = await JSZip.loadAsync(bytes);
	const entry = zip.file("word/document.xml");
	if (!entry) throw new Error("no document.xml");
	return entry.async("string");
};

const textOf = (xml: string) =>
	[...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

const TARGET =
	"This communication is a First Office Action Non-Final Rejection on the merits.";
const MODIFIED =
	"This communication is a First Office Action Non-Final Rejection on the merits, responsive to the amendment filed 12 May 2026.";

describe("readDraftParagraphs / extractDocxText", () => {
	test("reads paragraphs 1-based in document order", async () => {
		const paragraphs = await readDraftParagraphs(await fixtureBytes());
		expect(paragraphs.length).toBeGreaterThan(50);
		expect(paragraphs[0]?.index).toBe(1);
		expect(paragraphs.some((p) => p.text === TARGET)).toBe(true);
	});

	test("extracts plain text with empty paragraphs dropped", async () => {
		const text = await extractDocxText(await fixtureBytes());
		expect(text).toContain(TARGET);
		expect(text).not.toMatch(/\n\s*\n\s*\n/);
	});
});

describe("applyRedline", () => {
	test("produces tracked changes; accept yields new text, reject restores original", async () => {
		const result = await applyRedline(await fixtureBytes(), {
			targetText: TARGET,
			newText: MODIFIED,
		});
		expect(result.applied).toBe(true);
		if (!result.applied) return;

		const xml = await documentXmlOf(result.bytes);
		expect(xml).toContain("<w:ins w:id=");
		expect(xml).toContain('w:author="Patrick"');

		const accepted = acceptTrackedChangesInOoxml(xml, { allAuthors: true });
		expect(textOf(accepted.oxml)).toContain(
			"responsive to the amendment filed 12 May 2026",
		);
		const rejected = rejectTrackedChangesInOoxml(xml, { allAuthors: true });
		expect(textOf(rejected.oxml)).toContain(TARGET);
	});

	test("strips ghost format revisions (the engine's rPrChange noise)", async () => {
		const result = await applyRedline(await fixtureBytes(), {
			targetText: TARGET,
			newText: MODIFIED,
		});
		expect(result.applied).toBe(true);
		if (!result.applied) return;
		const xml = await documentXmlOf(result.bytes);
		expect(xml).not.toMatch(/<w:rPrChange [^>]*w:author="Patrick"/);
	});

	test("reports applied:false when the target text locates nowhere", async () => {
		const result = await applyRedline(await fixtureBytes(), {
			targetText: "text that does not exist anywhere in this document",
			newText: "irrelevant",
		});
		expect(result.applied).toBe(false);
	});

	test("re-editing a redlined paragraph supersedes (no stacked duplication)", async () => {
		const first = await applyRedline(await fixtureBytes(), {
			targetText: TARGET,
			newText: MODIFIED,
		});
		expect(first.applied).toBe(true);
		if (!first.applied) return;
		const paragraphs = await readDraftParagraphs(first.bytes);
		// The agent reads the as-if-accepted view and targets THAT text.
		expect(paragraphs.some((p) => p.text.includes("12 May 2026"))).toBe(true);

		const FINAL = `${MODIFIED} All claims stand rejected.`;
		const second = await applyRedline(first.bytes, {
			targetText: MODIFIED,
			newText: FINAL,
		});
		expect(second.applied).toBe(true);
		if (!second.applied) return;

		// Accept-all must yield FINAL exactly once — the first redline was
		// superseded, not stacked under the second.
		const accepted = acceptTrackedChangesInOoxml(
			await documentXmlOf(second.bytes),
			{ allAuthors: true },
		);
		const text = textOf(accepted.oxml);
		expect(text).toContain(FINAL);
		expect(text.match(/12 May 2026/g)?.length).toBe(1);
		// Reject-all still restores the untouched original.
		const rejected = rejectTrackedChangesInOoxml(
			await documentXmlOf(second.bytes),
			{ allAuthors: true },
		);
		expect(textOf(rejected.oxml)).toContain(TARGET);
	});

	test("rejects an ambiguous target (text appearing in two paragraphs)", async () => {
		// The fixture repeats this examiner boilerplate in two claim-2 paragraphs.
		const result = await applyRedline(await fixtureBytes(), {
			targetText:
				"As per claim 2, the combination of Heinla, Iagnemma and Chen teaches element of:",
			newText: "never applied",
		});
		expect(result.applied).toBe(false);
		if (result.applied) return;
		expect(result.reason).toContain("matches 2 paragraphs");
	});
});

// Minimal hand-built docx: real enough for the engine, small enough to shape
// exactly the structures a test needs (text boxes, tabs, shared base text).
async function buildDocx(bodyXml: string): Promise<Uint8Array> {
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
		"word/document.xml",
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
<w:body>${bodyXml}<w:sectPr/></w:body></w:document>`,
	);
	return zip.generateAsync({ type: "uint8array" });
}

const para = (t: string) =>
	`<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;

describe("guards", () => {
	test("refuses to edit a paragraph carrying the attorney's tracked changes", async () => {
		// The attorney's own pending revision (author ≠ Patrick) in the paragraph.
		const withTheirs = await applyRedline(
			await fixtureBytes(),
			{ targetText: TARGET, newText: `${TARGET} Their own addition.` },
			"Michael Hurhangee",
		);
		expect(withTheirs.applied).toBe(true);
		if (!withTheirs.applied) return;

		const result = await applyRedline(withTheirs.bytes, {
			targetText: "Their own addition",
			newText: "Patrick tramples the attorney's revision.",
		});
		expect(result.applied).toBe(false);
		if (result.applied) return;
		expect(result.reason).toContain("attorney's own pending tracked changes");
	});

	test("wrong-paragraph engine match is refused, not silently accepted", async () => {
		// Two paragraphs share BASE text; a Patrick redline makes the second one's
		// accepted view unique. The engine matches by FIRST base occurrence (the
		// wrong paragraph) — the strict at-index verification must refuse rather
		// than let newText-elsewhere vouch for it.
		const SHARED = "The same boilerplate sentence appears twice in this draft.";
		const bytes = await buildDocx(
			[para(SHARED), para("A middle paragraph."), para(SHARED)].join(""),
		);
		const first = await applyRedline(bytes, {
			targetText: SHARED,
			newText: "irrelevant",
		});
		// Ambiguous by accepted view — refused outright.
		expect(first.applied).toBe(false);

		const unique = await buildDocx(
			[para(SHARED), para("A middle paragraph."), para(`${SHARED} Tail.`)].join(
				"",
			),
		);
		const edit = await applyRedline(unique, {
			targetText: `${SHARED} Tail.`,
			newText: "Completely new third paragraph.",
		});
		// Either the engine hits the right paragraph (applied, verified at index 3)
		// or it base-matched paragraph 1 and verification refused — never a silent
		// wrong-paragraph write.
		if (edit.applied) {
			const paragraphs = await readDraftParagraphs(edit.bytes);
			expect(paragraphs[2]?.text.replace(/\s+/g, " ").trim()).toBe(
				"Completely new third paragraph.",
			);
			expect(paragraphs[0]?.text).toBe(SHARED);
		} else {
			expect(edit.reason).toContain("did not land");
		}
	});
});

describe("structure handling", () => {
	test("tabs and breaks extract as separators, not fused text", async () => {
		const bytes = await buildDocx(
			`<w:p><w:r><w:t>Applicant:</w:t><w:tab/><w:t>Acme Corp</w:t></w:r></w:p>`,
		);
		const paragraphs = await readDraftParagraphs(bytes);
		expect(paragraphs[0]?.text).toBe("Applicant:\tAcme Corp");
	});

	test("text-box content is not duplicated and stays unambiguous", async () => {
		const box =
			`<w:p><w:r><w:t>Host paragraph.</w:t>` +
			`<mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><w:txbxContent><w:p><w:r><w:t>Box text here</w:t></w:r></w:p></w:txbxContent></w:drawing></mc:Choice>` +
			`<mc:Fallback><w:pict><w:txbxContent><w:p><w:r><w:t>Box text here</w:t></w:r></w:p></w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent>` +
			`</w:r></w:p>` +
			para("A normal second paragraph.");
		const bytes = await buildDocx(box);
		const paragraphs = await readDraftParagraphs(bytes);
		// Box paragraphs are hidden; host paragraph doesn't absorb their text.
		const texts = paragraphs.map((p) => p.text);
		expect(texts.join(" ")).not.toContain("Box text here");
		expect(texts).toContain("Host paragraph.");
		expect(texts).toContain("A normal second paragraph.");
		// Indices keep the engine-aligned slots (nested w:p still counted).
		expect(paragraphs.at(-1)?.index).toBeGreaterThan(paragraphs.length);
	});
});

describe("readDraftRuns", () => {
	test("pending redlines surface as ins/del runs for the preview", async () => {
		const result = await applyRedline(await fixtureBytes(), {
			targetText: TARGET,
			newText: MODIFIED,
		});
		expect(result.applied).toBe(true);
		if (!result.applied) return;
		const paragraphs = await readDraftRuns(result.bytes);
		const edited = paragraphs.find((p) => p.hasRevisions);
		expect(edited).toBeDefined();
		expect(edited?.runs.some((r) => r.kind === "ins")).toBe(true);
		// Joined ins+text runs equal the accepted view.
		const accepted = edited?.runs
			.filter((r) => r.kind !== "del")
			.map((r) => r.text)
			.join("");
		expect(accepted?.replace(/\s+/g, " ")).toContain("12 May 2026");
	});
});

describe("addComment / listComments", () => {
	test("anchors a comment and lists it back", async () => {
		const bytes = await fixtureBytes();
		const paragraphs = await readDraftParagraphs(bytes);
		const anchor = paragraphs.find((p) => p.text === TARGET);
		expect(anchor).toBeDefined();
		if (!anchor) return;

		const before = await listComments(bytes);
		const result = await addComment(bytes, {
			paragraphIndex: anchor.index,
			textToFind: "Non-Final Rejection",
			text: "@Michael: check the response deadline.",
		});
		expect(result.applied).toBe(true);
		if (!result.applied) return;

		const after = await listComments(result.bytes);
		expect(after.length).toBe(before.length + 1);
		const mine = after.find((c) => c.text.includes("response deadline"));
		expect(mine?.author).toBe("Patrick");
	});

	test("reports applied:false for an anchor that isn't in the paragraph", async () => {
		const result = await addComment(await fixtureBytes(), {
			paragraphIndex: 1,
			textToFind: "text not present in paragraph one",
			text: "never lands",
		});
		expect(result.applied).toBe(false);
	});
});

import { join } from "node:path";
import {
	acceptTrackedChangesInOoxml,
	rejectTrackedChangesInOoxml,
} from "@ansonlai/docx-redline-js";
import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import {
	addComment,
	applyRedline,
	extractDocxText,
	listComments,
	readDraftParagraphs,
} from "./redline";

// A real USPTO office action — styles, numbering, header, examiner comments.
const FIXTURE = join(process.cwd(), "e2e", "fixtures", "uspto-office-action.docx");

const fixtureBytes = async () =>
	new Uint8Array(await Bun.file(FIXTURE).arrayBuffer());

const documentXmlOf = async (bytes: Uint8Array) => {
	const zip = await JSZip.loadAsync(bytes);
	return zip.file("word/document.xml")!.async("string");
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
		expect(xml).toContain('<w:ins w:id=');
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

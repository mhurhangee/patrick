import {
	configureXmlProvider,
	ensureCommentsArtifactsInZip,
	injectCommentsIntoOoxml,
	setDefaultAuthor,
} from "@ansonlai/docx-redline-js";
import { applyOperationToDocumentXml } from "@ansonlai/docx-redline-js/services/standalone-operation-runner.js";
import type { DraftComment } from "@patrick/shared";
import {
	DOMParser,
	XMLSerializer,
	type Document as XmlDocument,
	type Element as XmlElement,
	type Node as XmlNode,
} from "@xmldom/xmldom";
import JSZip from "jszip";

// The ONLY import point for @ansonlai/docx-redline-js. Patrick edits .docx on
// disk as native tracked changes (w:ins/w:del) via paragraph-scoped
// reconciliation; the attorney reviews in Word.
//
// The engine is powerful but has sharp edges (measured, not assumed), and this
// adapter's job is to file them off:
// - Its paragraph matcher FUZZY-falls-back: a target that exists nowhere can
//   still redline some other paragraph. So we resolve the paragraph ourselves
//   (exact, unambiguous) and hand the engine the full paragraph text — its
//   fuzzy path never triggers.
// - It matches against the paragraph's BASE text (as if revisions were
//   rejected), and re-redlining an already-redlined paragraph double-applies.
//   So before re-editing we reject OUR OWN pending revisions in that one
//   paragraph (safe: Patrick only ever emits plain w:ins/w:del wrappers) — a
//   paragraph's redline is always original → latest, never stacked.
// - It stamps spurious formatting revisions (w:rPrChange + explicit off-flags)
//   on rebuilt runs. Patrick makes text edits only, so Patrick-authored
//   rPrChange is always noise and is stripped from every write.
// - Comment anchoring searches the VISIBLE text, which a redline fragments —
//   callers should comment first or anchor to untouched text.

configureXmlProvider({
	DOMParser,
	XMLSerializer,
} as unknown as Parameters<typeof configureXmlProvider>[0]);
setDefaultAuthor("Patrick");

export const REDLINE_AUTHOR = "Patrick";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export type DraftParagraph = {
	/** 1-based position among ALL paragraphs (tables included), document order. */
	index: number;
	/** The paragraph's text as if all tracked changes were accepted. */
	text: string;
	/** The paragraph carries pending tracked changes (any author). */
	hasRevisions: boolean;
};

async function documentXmlOf(zip: JSZip): Promise<string> {
	const entry = zip.file("word/document.xml");
	if (!entry) throw new Error("not a .docx (word/document.xml missing)");
	return entry.async("string");
}

const parseXml = (xml: string): XmlDocument =>
	new DOMParser().parseFromString(xml, "text/xml");
const serializeXml = (node: XmlNode) =>
	new XMLSerializer().serializeToString(node);

function paragraphsOf(doc: XmlDocument): XmlElement[] {
	const list = doc.getElementsByTagNameNS(W_NS, "p");
	const out: XmlElement[] = [];
	for (let i = 0; i < list.length; i++) {
		const p = list[i];
		if (p) out.push(p);
	}
	return out;
}

function hasAncestor(
	node: XmlNode,
	localName: string,
	until: XmlNode,
): boolean {
	for (let n = node.parentNode; n && n !== until; n = n.parentNode) {
		if (
			n.nodeType === 1 &&
			(n as XmlElement).localName === localName &&
			(n as XmlElement).namespaceURI === W_NS
		)
			return true;
	}
	return false;
}

/** Paragraph text in a given view: accepted (ins in, del out) or base (the reverse). */
function paragraphText(p: XmlElement, view: "accepted" | "base"): string {
	let text = "";
	const walk = (node: XmlNode) => {
		for (let c = node.firstChild; c; c = c.nextSibling) {
			if (c.nodeType !== 1) continue;
			const el = c as XmlElement;
			if (el.namespaceURI === W_NS && el.localName === "t") {
				if (view === "accepted" || !hasAncestor(el, "ins", p))
					text += el.textContent ?? "";
				continue;
			}
			if (el.namespaceURI === W_NS && el.localName === "delText") {
				if (view === "base") text += el.textContent ?? "";
				continue;
			}
			walk(el);
		}
	};
	walk(p);
	return text;
}

function paragraphHasRevisions(p: XmlElement): boolean {
	return (
		p.getElementsByTagNameNS(W_NS, "ins").length > 0 ||
		p.getElementsByTagNameNS(W_NS, "del").length > 0
	);
}

export async function readDraftParagraphs(
	bytes: Uint8Array,
): Promise<DraftParagraph[]> {
	const zip = await JSZip.loadAsync(bytes);
	const doc = parseXml(await documentXmlOf(zip));
	return paragraphsOf(doc).map((p, i) => ({
		index: i + 1,
		text: paragraphText(p, "accepted"),
		hasRevisions: paragraphHasRevisions(p),
	}));
}

export type DraftRun = { text: string; kind: "text" | "ins" | "del" };
export type DraftParagraphRuns = {
	index: number;
	runs: DraftRun[];
	hasRevisions: boolean;
};

/** Paragraph content split into runs with revision kind — the preview's shape,
 *  so pending redlines render as real ins/del marks, not invisible text. */
function paragraphRuns(p: XmlElement): DraftRun[] {
	const runs: DraftRun[] = [];
	const push = (text: string, kind: DraftRun["kind"]) => {
		if (!text) return;
		const last = runs[runs.length - 1];
		if (last && last.kind === kind) last.text += text;
		else runs.push({ text, kind });
	};
	const walk = (node: XmlNode) => {
		for (let c = node.firstChild; c; c = c.nextSibling) {
			if (c.nodeType !== 1) continue;
			const el = c as XmlElement;
			if (el.namespaceURI === W_NS && el.localName === "t") {
				push(el.textContent ?? "", hasAncestor(el, "ins", p) ? "ins" : "text");
				continue;
			}
			if (el.namespaceURI === W_NS && el.localName === "delText") {
				push(el.textContent ?? "", "del");
				continue;
			}
			walk(el);
		}
	};
	walk(p);
	return runs;
}

export async function readDraftRuns(
	bytes: Uint8Array,
): Promise<DraftParagraphRuns[]> {
	const zip = await JSZip.loadAsync(bytes);
	const doc = parseXml(await documentXmlOf(zip));
	return paragraphsOf(doc).map((p, i) => ({
		index: i + 1,
		runs: paragraphRuns(p),
		hasRevisions: paragraphHasRevisions(p),
	}));
}

/** Plain text of a .docx (paragraphs joined by newlines) — context extraction. */
export async function extractDocxText(bytes: Uint8Array): Promise<string> {
	const paragraphs = await readDraftParagraphs(bytes);
	return paragraphs
		.map((p) => p.text)
		.filter((t) => t.trim())
		.join("\n")
		.trim();
}

// Whitespace-insensitive comparison: the engine normalises tabs/breaks and run
// boundaries, so byte-equality is the wrong test for "is this the same text".
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Reject one author's pending revisions inside ONE paragraph — DOM surgery,
 * not the engine: Patrick only ever emits plain `w:ins` (drop whole) and
 * `w:del` (unwrap, delText → t) wrappers, so this is exact for our own edits.
 */
function rejectAuthorRevisionsIn(p: XmlElement, author: string): void {
	const doc = p.ownerDocument;
	if (!doc) return;
	const byAuthor = (el: XmlElement) =>
		el.getAttributeNS(W_NS, "author") === author;

	const collect = (localName: string): XmlElement[] => {
		const list = p.getElementsByTagNameNS(W_NS, localName);
		const out: XmlElement[] = [];
		for (let i = 0; i < list.length; i++) {
			const el = list[i] as XmlElement;
			if (el && byAuthor(el)) out.push(el);
		}
		return out;
	};

	for (const ins of collect("ins")) ins.parentNode?.removeChild(ins);
	for (const del of collect("del")) {
		const parent = del.parentNode;
		if (!parent) continue;
		// delText → t inside the wrapper, then lift its children out.
		const delTexts = del.getElementsByTagNameNS(W_NS, "delText");
		for (let i = delTexts.length - 1; i >= 0; i--) {
			const dt = delTexts[i] as XmlElement;
			if (!dt) continue;
			const t = doc.createElementNS(W_NS, "w:t");
			t.setAttribute("xml:space", "preserve");
			t.textContent = dt.textContent ?? "";
			dt.parentNode?.replaceChild(t, dt);
		}
		while (del.firstChild) parent.insertBefore(del.firstChild, del);
		parent.removeChild(del);
	}
}

// Patrick never makes formatting-only edits, so any Patrick-authored
// w:rPrChange is engine noise (ghost "Format" revisions in review panes).
function stripGhostFormatRevisions(xml: string, author: string): string {
	const a = author.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return xml
		.replace(
			new RegExp(
				`<w:rPrChange w:id="[^"]*" w:author="${a}"[^>]*>[\\s\\S]*?</w:rPrChange>`,
				"g",
			),
			"",
		)
		.replace(
			new RegExp(`<w:rPrChange w:id="[^"]*" w:author="${a}"[^>]*/>`, "g"),
			"",
		);
}

async function writeDocumentXml(zip: JSZip, xml: string): Promise<Uint8Array> {
	zip.file("word/document.xml", xml);
	// DEFLATE to match how Word writes .docx — STORE would bloat the file ~5x.
	return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export type RedlineEdit = {
	/** The target paragraph's current text (as read) — or a unique portion of it. */
	targetText: string;
	/** The paragraph's full revised text. */
	newText: string;
};

export type RedlineResult =
	| { applied: true; bytes: Uint8Array; paragraphIndex: number }
	| { applied: false; reason: string };

/**
 * Apply one paragraph-scoped reconciliation redline. The paragraph is resolved
 * here (exact match on the as-read text, must be unambiguous), any pending
 * Patrick revisions in it are superseded (redline stays original → latest),
 * and the result is verified before it's returned — a failure never mutates.
 */
export async function applyRedline(
	bytes: Uint8Array,
	edit: RedlineEdit,
	author = REDLINE_AUTHOR,
): Promise<RedlineResult> {
	const target = norm(edit.targetText);
	if (!target) return { applied: false, reason: "empty target text" };

	const zip = await JSZip.loadAsync(bytes);
	const doc = parseXml(await documentXmlOf(zip));
	const paragraphs = paragraphsOf(doc);

	const matches = paragraphs
		.map((p, i) => ({ p, i }))
		.filter(({ p }) => norm(paragraphText(p, "accepted")).includes(target));
	if (matches.length === 0)
		return {
			applied: false,
			reason:
				"target text not found in the draft — read the draft and quote the paragraph's current text exactly",
		};
	if (matches.length > 1)
		return {
			applied: false,
			reason: `target text matches ${matches.length} paragraphs — quote more of the paragraph so the target is unique`,
		};

	const { p, i } = matches[0] as { p: XmlElement; i: number };

	// Supersede: strip our own pending revisions from this one paragraph so the
	// engine rebuilds original → newText instead of stacking redlines.
	rejectAuthorRevisionsIn(p, author);
	const baseTarget = paragraphText(p, "base");
	if (!norm(baseTarget))
		return { applied: false, reason: "target paragraph is empty" };

	const result = await applyOperationToDocumentXml(
		serializeXml(doc),
		{ type: "redline", target: baseTarget, modified: edit.newText },
		author,
	);
	if (!result.hasChanges)
		return {
			applied: false,
			reason: `the redline engine could not apply the edit (status: ${result.status})`,
		};

	// Verify before returning: the paragraph's as-if-accepted text must now be
	// the requested text (same index, or anywhere if the edit split paragraphs).
	const outXml = stripGhostFormatRevisions(result.documentXml, author);
	const outDoc = parseXml(outXml);
	const outParagraphs = paragraphsOf(outDoc);
	const wanted = norm(edit.newText);
	const atIndex = outParagraphs[i]
		? norm(paragraphText(outParagraphs[i] as XmlElement, "accepted"))
		: "";
	const landed =
		atIndex === wanted ||
		norm(
			outParagraphs.map((op) => paragraphText(op, "accepted")).join(" "),
		).includes(wanted);
	if (!landed)
		return {
			applied: false,
			reason:
				"the edit did not land as requested (engine mismatch) — nothing was changed",
		};

	return {
		applied: true,
		bytes: await writeDocumentXml(zip, outXml),
		paragraphIndex: i + 1,
	};
}

export type CommentRequest = {
	/** 1-based paragraph index (from readDraftParagraphs). */
	paragraphIndex: number;
	/** Visible text within that paragraph to anchor the comment to. */
	textToFind: string;
	text: string;
};

export type CommentResult =
	| { applied: true; bytes: Uint8Array }
	| { applied: false; reason: string };

export async function addComment(
	bytes: Uint8Array,
	request: CommentRequest,
	author = REDLINE_AUTHOR,
): Promise<CommentResult> {
	const zip = await JSZip.loadAsync(bytes);
	const result = (await injectCommentsIntoOoxml(
		await documentXmlOf(zip),
		[
			{
				paragraphIndex: request.paragraphIndex,
				textToFind: request.textToFind,
				commentContent: request.text,
			},
		],
		{ author },
	)) as {
		oxml: string;
		commentsXml?: string;
		commentsApplied: number;
		warnings: string[];
	};
	if (result.commentsApplied < 1)
		return {
			applied: false,
			reason:
				result.warnings.join("; ") || "anchor text not found in that paragraph",
		};
	if (result.commentsXml)
		await ensureCommentsArtifactsInZip(zip, result.commentsXml);
	return { applied: true, bytes: await writeDocumentXml(zip, result.oxml) };
}

/** All comments in the draft (word/comments.xml), in document order. */
export async function listComments(bytes: Uint8Array): Promise<DraftComment[]> {
	const zip = await JSZip.loadAsync(bytes);
	const entry = zip.file("word/comments.xml");
	if (!entry) return [];
	const doc = parseXml(await entry.async("string"));
	const comments = doc.getElementsByTagNameNS(W_NS, "comment");
	const out: DraftComment[] = [];
	for (let i = 0; i < comments.length; i++) {
		const el = comments[i] as XmlElement;
		if (!el) continue;
		const texts = el.getElementsByTagNameNS(W_NS, "t");
		let text = "";
		for (let j = 0; j < texts.length; j++) text += texts[j]?.textContent ?? "";
		out.push({
			id: el.getAttributeNS(W_NS, "id") ?? String(i),
			author: el.getAttributeNS(W_NS, "author") ?? "",
			text,
		});
	}
	return out;
}

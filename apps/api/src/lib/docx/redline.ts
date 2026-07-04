import {
	configureXmlProvider,
	ensureCommentsArtifactsInZip,
	ensureNumberingArtifactsInZip,
	injectCommentsIntoOoxml,
	setDefaultAuthor,
} from "@ansonlai/docx-redline-js";
import { seedRevisionIdsFromDocument } from "@ansonlai/docx-redline-js/core/types.js";
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

const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";

// Elements a text walk must NOT descend into: text-box bodies (their inner w:p
// would otherwise be read twice — inside the host paragraph AND as their own
// paragraph) and mc:Fallback (a duplicate of the mc:Choice next to it). Box
// text is therefore invisible to Patrick — a documented limitation, like the
// old editor's render-only headers — rather than duplicated and corrupting.
function isOpaque(el: XmlElement): boolean {
	return (
		(el.namespaceURI === W_NS && el.localName === "txbxContent") ||
		(el.namespaceURI === MC_NS && el.localName === "Fallback")
	);
}

type ParagraphEntry = {
	el: XmlElement;
	/** Inside another paragraph (a text box) — hidden from reads and edits, but
	 *  it keeps its slot so indices stay aligned with the comment engine's
	 *  all-`w:p` numbering. */
	nested: boolean;
};

function paragraphsOf(doc: XmlDocument): ParagraphEntry[] {
	const list = doc.getElementsByTagNameNS(W_NS, "p");
	const out: ParagraphEntry[] = [];
	for (let i = 0; i < list.length; i++) {
		const p = list[i];
		if (p) out.push({ el: p, nested: hasAncestor(p, "p", doc) });
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
	const include = (el: XmlElement) =>
		view === "accepted"
			? !hasAncestor(el, "del", p)
			: !hasAncestor(el, "ins", p);
	const walk = (node: XmlNode) => {
		for (let c = node.firstChild; c; c = c.nextSibling) {
			if (c.nodeType !== 1) continue;
			const el = c as XmlElement;
			if (isOpaque(el)) continue;
			if (el.namespaceURI === W_NS && el.localName === "t") {
				if (view === "accepted" || !hasAncestor(el, "ins", p))
					text += el.textContent ?? "";
				continue;
			}
			if (el.namespaceURI === W_NS && el.localName === "delText") {
				if (view === "base") text += el.textContent ?? "";
				continue;
			}
			// Tabs and breaks are visible separators — losing them would fuse
			// "Applicant:<tab>Acme" into "Applicant:Acme" and break matching.
			if (
				el.namespaceURI === W_NS &&
				(el.localName === "tab" ||
					el.localName === "br" ||
					el.localName === "cr")
			) {
				if (include(el)) text += el.localName === "tab" ? "\t" : "\n";
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
	// Nested (text-box) paragraphs are dropped but keep their index slot, so
	// [n] numbering stays aligned with the comment engine's all-w:p count.
	return paragraphsOf(doc)
		.map((p, i) => ({ entry: p, index: i + 1 }))
		.filter(({ entry }) => !entry.nested)
		.map(({ entry, index }) => ({
			index,
			text: paragraphText(entry.el, "accepted"),
			hasRevisions: paragraphHasRevisions(entry.el),
		}));
}

export type DraftRun = {
	text: string;
	kind: "text" | "ins" | "del";
	/** The enclosing revision's w:id — the accept/reject handle (ins/del only). */
	revisionId?: number;
	/** The revision's author (ins/del only) — the attorney's own show distinctly. */
	author?: string;
};
export type DraftParagraphRuns = {
	index: number;
	runs: DraftRun[];
	hasRevisions: boolean;
};

/** The nearest enclosing w:ins/w:del of a node (with its id + author), if any. */
function revisionAncestor(
	node: XmlNode,
	until: XmlNode,
): { kind: "ins" | "del"; id: number; author: string } | null {
	for (let n = node.parentNode; n && n !== until; n = n.parentNode) {
		if (n.nodeType !== 1 || (n as XmlElement).namespaceURI !== W_NS) continue;
		const el = n as XmlElement;
		if (el.localName === "ins" || el.localName === "del")
			return {
				kind: el.localName,
				id: Number(el.getAttributeNS(W_NS, "id") ?? "-1"),
				author: el.getAttributeNS(W_NS, "author") ?? "",
			};
	}
	return null;
}

/** Paragraph content split into runs with revision kind/id/author — the review
 *  view's shape, so pending redlines render as real ins/del marks each carrying
 *  its own accept/reject handle. */
function paragraphRuns(p: XmlElement): DraftRun[] {
	const runs: DraftRun[] = [];
	const push = (text: string, rev: ReturnType<typeof revisionAncestor>) => {
		if (!text) return;
		const kind = rev?.kind ?? "text";
		const last = runs[runs.length - 1];
		if (last && last.kind === kind && last.revisionId === rev?.id)
			last.text += text;
		else
			runs.push(
				rev
					? { text, kind, revisionId: rev.id, author: rev.author }
					: { text, kind },
			);
	};
	const walk = (node: XmlNode) => {
		for (let c = node.firstChild; c; c = c.nextSibling) {
			if (c.nodeType !== 1) continue;
			const el = c as XmlElement;
			if (isOpaque(el)) continue;
			const isText = el.namespaceURI === W_NS && el.localName === "t";
			const isDel = el.namespaceURI === W_NS && el.localName === "delText";
			const isSep =
				el.namespaceURI === W_NS &&
				(el.localName === "tab" ||
					el.localName === "br" ||
					el.localName === "cr");
			if (isText || isDel || isSep) {
				const text = isSep
					? el.localName === "tab"
						? "\t"
						: "\n"
					: (el.textContent ?? "");
				push(text, revisionAncestor(el, p));
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
	return paragraphsOf(doc)
		.map((p, i) => ({ entry: p, index: i + 1 }))
		.filter(({ entry }) => !entry.nested)
		.map(({ entry, index }) => ({
			index,
			runs: paragraphRuns(entry.el),
			hasRevisions: paragraphHasRevisions(entry.el),
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

/**
 * Accept one author's pending revisions inside ONE paragraph — the mirror of
 * rejectAuthorRevisionsIn: an insertion is kept (unwrap the `w:ins`), a deletion
 * is made permanent (drop the `w:del` and its text). Same safe DOM surgery.
 */
function acceptAuthorRevisionsIn(p: XmlElement, author: string): void {
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
	// Deletion accepted → the text goes away.
	for (const del of collect("del")) del.parentNode?.removeChild(del);
	// Insertion accepted → keep the runs, drop the wrapper.
	for (const ins of collect("ins")) {
		const parent = ins.parentNode;
		if (!parent) continue;
		while (ins.firstChild) parent.insertBefore(ins.firstChild, ins);
		parent.removeChild(ins);
	}
}

export type ResolveResult =
	| { applied: true; bytes: Uint8Array }
	| { applied: false; reason: string };

/**
 * Accept or reject Patrick's pending redline in ONE paragraph, in place — the
 * in-app equivalent of Word's accept/reject, without opening Word. A paragraph
 * only ever carries one round of Patrick's revisions (the adapter supersedes),
 * so the paragraph IS the change unit. Only `author`'s revisions are touched;
 * the attorney's own are left intact.
 */
export async function resolveParagraphRevision(
	bytes: Uint8Array,
	paragraphIndex: number,
	action: "accept" | "reject",
	author = REDLINE_AUTHOR,
): Promise<ResolveResult> {
	const zip = await JSZip.loadAsync(bytes);
	const doc = parseXml(await documentXmlOf(zip));
	const entry = paragraphsOf(doc)[paragraphIndex - 1];
	if (!entry || entry.nested)
		return { applied: false, reason: `no paragraph ${paragraphIndex}` };
	if (!paragraphHasRevisions(entry.el))
		return { applied: false, reason: "that paragraph has no pending redline" };
	if (action === "accept") acceptAuthorRevisionsIn(entry.el, author);
	else rejectAuthorRevisionsIn(entry.el, author);
	return {
		applied: true,
		bytes: await writeDocumentXml(zip, serializeXml(doc)),
	};
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
		.map((entry, i) => ({ entry, i }))
		.filter(
			({ entry }) =>
				!entry.nested &&
				norm(paragraphText(entry.el, "accepted")).includes(target),
		);
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

	const { entry, i } = matches[0] as { entry: ParagraphEntry; i: number };
	const p = entry.el;

	// The ATTORNEY's own pending tracked changes are theirs to resolve — editing
	// through them risks absorbing their revisions into a Patrick-authored
	// change (destroying authorship and what reject-all restores). Refuse.
	if (hasOtherAuthorsRevisions(p, author))
		return {
			applied: false,
			reason:
				"this paragraph has the attorney's own pending tracked changes — ask them to accept/reject those in Word first, or add a comment instead of editing",
		};

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

	// Verify before returning — STRICTLY at the edited position: the accepted
	// text of the paragraph at index i (or, when the engine split the edit into
	// several paragraphs, of the contiguous block i..i+delta) must equal the
	// requested text. No document-wide fallback: newText legitimately appearing
	// elsewhere (claim boilerplate) must never vouch for a mangled application.
	const outXml = stripGhostFormatRevisions(result.documentXml, author);
	const outDoc = parseXml(outXml);
	const outParagraphs = paragraphsOf(outDoc);
	const wanted = norm(edit.newText);
	const delta = Math.max(0, outParagraphs.length - paragraphs.length);
	const blockText = norm(
		outParagraphs
			.slice(i, i + delta + 1)
			.map((op) => paragraphText(op.el, "accepted"))
			.join(" "),
	);
	if (blockText !== wanted)
		return {
			applied: false,
			reason:
				"the edit did not land as requested (engine mismatch) — nothing was changed",
		};

	// List-shaped rewrites can mint numbering definitions — merge them or the
	// document references w:numId entries that don't exist (Word repair prompt).
	if (result.numberingXml)
		await ensureNumberingArtifactsInZip(zip, result.numberingXml);

	return {
		applied: true,
		bytes: await writeDocumentXml(zip, outXml),
		paragraphIndex: i + 1,
	};
}

/** Any pending w:ins/w:del in the paragraph NOT authored by `author`. */
function hasOtherAuthorsRevisions(p: XmlElement, author: string): boolean {
	for (const localName of ["ins", "del"]) {
		const list = p.getElementsByTagNameNS(W_NS, localName);
		for (let i = 0; i < list.length; i++) {
			const el = list[i] as XmlElement;
			if (el && el.getAttributeNS(W_NS, "author") !== author) return true;
		}
	}
	return false;
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
	const documentXml = await documentXmlOf(zip);
	// The engine's revision-id counter is process-global and resets on restart;
	// seed it past every id already in the document or a comment added to a
	// draft commented in an earlier session throws "Duplicate comment id".
	seedRevisionIdsFromDocument(parseXml(documentXml));
	const result = (await injectCommentsIntoOoxml(
		documentXml,
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

/** commentId → 1-based paragraph index, from the anchors in document.xml. The
 *  anchor (`w:commentRangeStart`) lives in the body, not in comments.xml. */
function commentAnchors(doc: XmlDocument): Map<string, number> {
	const anchors = new Map<string, number>();
	const paragraphs = paragraphsOf(doc);
	paragraphs.forEach((entry, i) => {
		const starts = entry.el.getElementsByTagNameNS(W_NS, "commentRangeStart");
		for (let j = 0; j < starts.length; j++) {
			const id = (starts[j] as XmlElement).getAttributeNS(W_NS, "id");
			if (id && !anchors.has(id)) anchors.set(id, i + 1);
		}
	});
	return anchors;
}

/** All comments in the draft (word/comments.xml), in document order, each with
 *  the paragraph its anchor sits in. */
export async function listComments(bytes: Uint8Array): Promise<DraftComment[]> {
	const zip = await JSZip.loadAsync(bytes);
	const entry = zip.file("word/comments.xml");
	if (!entry) return [];
	const doc = parseXml(await entry.async("string"));
	const anchors = commentAnchors(parseXml(await documentXmlOf(zip)));
	const comments = doc.getElementsByTagNameNS(W_NS, "comment");
	const out: DraftComment[] = [];
	for (let i = 0; i < comments.length; i++) {
		const el = comments[i] as XmlElement;
		if (!el) continue;
		const texts = el.getElementsByTagNameNS(W_NS, "t");
		let text = "";
		for (let j = 0; j < texts.length; j++) text += texts[j]?.textContent ?? "";
		const id = el.getAttributeNS(W_NS, "id") ?? String(i);
		out.push({
			id,
			author: el.getAttributeNS(W_NS, "author") ?? "",
			text,
			paragraphIndex: anchors.get(id),
		});
	}
	return out;
}

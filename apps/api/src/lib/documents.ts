import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { Document, DocumentMeta, ExtractedDoc } from "@patrick/shared";
import { parse, stringify } from "yaml";
import { ensureParaIds } from "./docx";

// What counts as a "document" in the attorney's folder. Plain-text (.md/.txt)
// covers Patrick-retrieved references like prior art fetched from EPO OPS.
const DOC_EXTENSIONS = new Set([".pdf", ".docx", ".doc", ".md", ".txt"]);

// A real (minimal, empty) .docx minted from the editor — copied for "New document".
const BLANK_DOCX = join(import.meta.dir, "..", "..", "assets", "blank.docx");

// Document awareness (labels/exclude/star) lives with the folder, not in the
// config home — portable and readable without Patrick.
function metaPath(folder: string): string {
	return join(folder, ".patrick", "documents.yaml");
}

export async function folderExists(folder: string): Promise<boolean> {
	try {
		return (await stat(folder)).isDirectory();
	} catch {
		return false;
	}
}

export async function readDocumentMeta(folder: string): Promise<DocumentMeta> {
	try {
		return (
			(parse(await readFile(metaPath(folder), "utf8")) as DocumentMeta) ?? {}
		);
	} catch {
		return {};
	}
}

export async function writeDocumentMeta(
	folder: string,
	meta: DocumentMeta,
): Promise<void> {
	const path = metaPath(folder);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, stringify(meta), "utf8");
}

async function fileExists(folder: string, name: string): Promise<boolean> {
	try {
		return (await stat(join(folder, name))).isFile();
	} catch {
		return false;
	}
}

/** Merge a single document's awareness entry without disturbing the others. */
export async function mergeDocumentMeta(
	folder: string,
	filename: string,
	patch: DocumentMeta[string],
): Promise<void> {
	const meta = await readDocumentMeta(folder);
	meta[filename] = { ...meta[filename], ...patch };
	await writeDocumentMeta(folder, meta);
}

/** "report.docx" → "report (Patrick).docx". */
function patrickCopyName(original: string): string {
	const ext = extname(original);
	return `${original.slice(0, original.length - ext.length)} (Patrick)${ext}`;
}

/** Pick a sibling name that doesn't collide: "x.docx" → "x 2.docx" → … */
async function uniqueName(folder: string, candidate: string): Promise<string> {
	const ext = extname(candidate);
	const base = candidate.slice(0, candidate.length - ext.length);
	let name = candidate;
	let n = 2;
	while (await fileExists(folder, name)) {
		name = `${base} ${n}${ext}`;
		n++;
	}
	return name;
}

/** Normalise user input to a safe, basename-only ".docx" name (no traversal). */
function asDocxName(input: string | undefined): string {
	const base = (input ?? "").trim().replaceAll(/[/\\]/g, "");
	if (!base) return "Untitled.docx";
	return base.toLowerCase().endsWith(".docx") ? base : `${base}.docx`;
}

/** Create a blank Patrick-owned .docx in the folder. Returns the chosen name. */
export async function createBlankDocument(
	folder: string,
	candidate?: string,
): Promise<string> {
	const name = await uniqueName(folder, asDocxName(candidate));
	// Backfill paragraph ids so the agent's anchor-by-id tools work from the start.
	await writeFile(
		join(folder, name),
		await ensureParaIds(await readFile(BLANK_DOCX)),
	);
	await mergeDocumentMeta(folder, name, { createdInPatrick: true });
	return name;
}

/**
 * Save a Patrick-retrieved publication (full text fetched from EPO OPS or Google
 * Patents) as a plain-text file in the folder, tagged `retrieved` + its `source`
 * so the UI can group and attribute it. It's Patrick-owned (so it's deletable)
 * but not editable (not a .docx). Refreshes in place if we already own that name;
 * otherwise picks a non-colliding one so an attorney's own file is never
 * overwritten.
 */
export async function saveRetrievedDocument(
	folder: string,
	filename: string,
	content: string,
	label?: string,
	source?: string,
): Promise<string> {
	const meta = await readDocumentMeta(folder);
	const exists = await fileExists(folder, filename);
	const name =
		exists && !meta[filename]?.createdInPatrick
			? await uniqueName(folder, filename)
			: filename;
	await writeFile(join(folder, name), content, "utf8");
	await mergeDocumentMeta(folder, name, {
		createdInPatrick: true,
		retrieved: true,
		...(label ? { label } : {}),
		...(source ? { source } : {}),
	});
	return name;
}

/**
 * Unlock an original for editing: copy its bytes to a visible "(Patrick)" sibling
 * in the same folder, carrying its label. The original is never touched.
 * Returns the new filename, or null if the source is missing or not a .docx —
 * only Word documents are editable (editable ≡ createdInPatrick && .docx), so an
 * "editable copy" of a PDF would be an owned-but-uneditable dead end.
 */
export async function unlockDocumentCopy(
	folder: string,
	source: string,
): Promise<string | null> {
	if (!source.toLowerCase().endsWith(".docx")) return null;
	if (!(await fileExists(folder, source))) return null;
	const dest = await uniqueName(folder, patrickCopyName(source));
	// Backfill paragraph ids: real filings often have none, which breaks the
	// agent's anchor-by-id comment/suggest tools on the editable copy.
	await writeFile(
		join(folder, dest),
		await ensureParaIds(await readFile(join(folder, source))),
	);
	const meta = await readDocumentMeta(folder);
	await mergeDocumentMeta(folder, dest, {
		createdInPatrick: true,
		label: meta[source]?.label,
	});
	return dest;
}

export type SaveResult = "ok" | "not-found" | "forbidden";

/**
 * Overwrite a document's bytes. Guards the attorney's originals: only files
 * Patrick created (createdInPatrick) may be written — never an original.
 */
export async function saveDocumentBytes(
	folder: string,
	filename: string,
	bytes: ArrayBuffer,
): Promise<SaveResult> {
	if (!(await fileExists(folder, filename))) return "not-found";
	const meta = await readDocumentMeta(folder);
	if (!meta[filename]?.createdInPatrick) return "forbidden";
	await writeFile(join(folder, filename), Buffer.from(bytes));
	return "ok";
}

/** Delete a Patrick-owned document (file + its meta entry). Originals refused. */
export async function deleteDocument(
	folder: string,
	filename: string,
): Promise<SaveResult> {
	if (!(await fileExists(folder, filename))) return "not-found";
	const meta = await readDocumentMeta(folder);
	if (!meta[filename]?.createdInPatrick) return "forbidden";
	await rm(join(folder, filename));
	delete meta[filename];
	await writeDocumentMeta(folder, meta);
	return "ok";
}

export type RenameResult = { status: SaveResult; filename?: string };

/** Rename a Patrick-owned document (file + its meta entry). Originals refused. */
export async function renameDocument(
	folder: string,
	from: string,
	to: string,
): Promise<RenameResult> {
	if (!(await fileExists(folder, from))) return { status: "not-found" };
	const meta = await readDocumentMeta(folder);
	if (!meta[from]?.createdInPatrick) return { status: "forbidden" };
	const desired = asDocxName(to);
	if (desired === from) return { status: "ok", filename: from };
	const dest = await uniqueName(folder, desired);
	await rename(join(folder, from), join(folder, dest));
	meta[dest] = meta[from];
	delete meta[from];
	await writeDocumentMeta(folder, meta);
	return { status: "ok", filename: dest };
}

export async function listDocuments(folder: string): Promise<Document[]> {
	let names: string[];
	try {
		names = await readdir(folder);
	} catch {
		return [];
	}
	const meta = await readDocumentMeta(folder);
	const extracted = await extractedSet(folder);
	const docs: Document[] = [];
	for (const name of names) {
		if (name.startsWith(".")) continue;
		const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
		if (!DOC_EXTENSIONS.has(ext)) continue;
		const m = meta[name] ?? {};
		docs.push({
			filename: name,
			label: m.label,
			excluded: m.excluded,
			starred: m.starred,
			createdInPatrick: m.createdInPatrick,
			retrieved: m.retrieved,
			source: m.source,
			// Derived from the sidecar's existence, not stored in the writable meta.
			extracted: extracted.has(name) || undefined,
			contextMode: m.contextMode,
			suggestions: m.suggestions,
		});
	}
	return docs.sort((a, b) => a.filename.localeCompare(b.filename));
}

// Extracted text (text layer or OCR) for a PDF lives hidden under
// .patrick/extracted/, keyed by the PDF's filename — not a visible document. The
// sidecar's existence IS the `extracted` flag (derived in listDocuments), so a
// full-overwrite meta save from the client can't clobber it. Drives the
// selectable overlay and the agent's text context mode.
function extractedDir(folder: string): string {
	return join(folder, ".patrick", "extracted");
}
function extractedPath(folder: string, filename: string): string {
	return join(extractedDir(folder), `${filename}.json`);
}

export async function saveExtractedText(
	folder: string,
	filename: string,
	doc: ExtractedDoc,
): Promise<void> {
	if (!filename.toLowerCase().endsWith(".pdf")) return;
	if (!(await fileExists(folder, filename))) return;
	const path = extractedPath(folder, filename);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(doc), "utf8");
}

/** Filenames that have an extracted-text sidecar (the source of truth for `extracted`). */
async function extractedSet(folder: string): Promise<Set<string>> {
	try {
		const files = await readdir(extractedDir(folder));
		return new Set(
			files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)),
		);
	} catch {
		return new Set();
	}
}

export async function readExtractedText(
	folder: string,
	filename: string,
): Promise<ExtractedDoc | null> {
	try {
		return JSON.parse(
			await readFile(extractedPath(folder, filename), "utf8"),
		) as ExtractedDoc;
	} catch {
		return null;
	}
}

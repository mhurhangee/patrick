import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Document, DocumentMeta } from "@patrick/shared";
import { parse, stringify } from "yaml";

// What counts as a "document" in the attorney's folder.
const DOC_EXTENSIONS = new Set([".pdf", ".docx", ".doc"]);

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

async function readDocumentMeta(folder: string): Promise<DocumentMeta> {
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

export async function listDocuments(folder: string): Promise<Document[]> {
	let names: string[];
	try {
		names = await readdir(folder);
	} catch {
		return [];
	}
	const meta = await readDocumentMeta(folder);
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
		});
	}
	return docs.sort((a, b) => a.filename.localeCompare(b.filename));
}

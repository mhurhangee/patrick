// A task is the attorney's folder on disk + a living "brief" (markdown) that
// primes Patrick on what the matter is and the objective, kept current by the
// attorney and Patrick. Tasks are global (not scoped to a profile). The registry
// entry lives in the config home; the folder holds the documents + their labels.

export type Task = {
	id: string;
	/** Absolute path to the attorney's folder. */
	folder: string;
	/** Short display name (sidebar / switcher). Falls back to the folder. */
	name?: string;
	/**
	 * The living brief (markdown): what this matter is + the objective + the
	 * running record. Edited by the attorney and Patrick (suggestBrief, which can
	 * replace it or append a note); injected into every system prompt.
	 */
	brief: string;
	createdAt: string;
	lastOpenedAt?: string;
};

export type TaskSummary = {
	id: string;
	name?: string;
	folder: string;
};

/** What to show as the task's name in lists. */
export function taskDisplayName(t: { name?: string; folder: string }): string {
	return t.name?.trim() || t.folder.split("/").at(-1) || "Untitled task";
}

// A document is any file in the task folder (PDF/DOCX, pre-existing or AI-made —
// no distinction). `label` is the free-text awareness one-liner (signpost).
export type Document = {
	filename: string;
	label?: string;
	excluded?: boolean;
	starred?: boolean;
	/** True if Patrick created this file (vs an original the attorney added). */
	createdInPatrick?: boolean;
	/** True if Patrick fetched this from a data service (a retrieved publication). */
	retrieved?: boolean;
	/** Where a retrieved publication came from (e.g. "EPO OPS", "Google Patents"). */
	source?: string;
	/** True if text has been extracted from this PDF (text layer or OCR). Derived
	 *  from the extracted-text sidecar's existence, not stored in meta. */
	extracted?: boolean;
	/** How a PDF enters Patrick's context: the original image, or the extracted
	 *  text (cheaper). Absent ⇒ image (the default). */
	contextMode?: "image" | "text";
};

/** Per-folder document awareness keyed by filename. Stored with the folder. */
export type DocumentMeta = Record<
	string,
	{
		label?: string;
		excluded?: boolean;
		starred?: boolean;
		createdInPatrick?: boolean;
		retrieved?: boolean;
		source?: string;
		contextMode?: "image" | "text";
	}
>;

/** A word with its box, normalized to page fraction (0–1) so it scales to any
 *  zoom; from OCR (positions the selectable overlay over a scan). */
export type ExtractedWord = {
	t: string;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
};
export type ExtractedPage = { text: string; words?: ExtractedWord[] };
/** The extracted-text sidecar for a PDF (stored under .patrick/extracted/). */
export type ExtractedDoc = {
	source: "pdf" | "ocr";
	pages: ExtractedPage[];
};

export function taskSummary(t: Task): TaskSummary {
	return { id: t.id, name: t.name, folder: t.folder };
}

// New tasks seed the short name from the folder; the brief starts empty for the
// attorney (and Patrick) to fill.
export function createTask(id: string, folder: string, name: string): Task {
	return { id, folder, name, brief: "", createdAt: new Date().toISOString() };
}

/** Collapse a document list back to the stored meta map (dropping empties). */
export function toDocumentMeta(documents: Document[]): DocumentMeta {
	const meta: DocumentMeta = {};
	for (const d of documents) {
		const entry: DocumentMeta[string] = {};
		if (d.label?.trim()) entry.label = d.label.trim();
		if (d.excluded) entry.excluded = true;
		if (d.starred) entry.starred = true;
		if (d.createdInPatrick) entry.createdInPatrick = true;
		if (d.retrieved) entry.retrieved = true;
		if (d.source) entry.source = d.source;
		if (d.contextMode) entry.contextMode = d.contextMode;
		if (Object.keys(entry).length > 0) meta[d.filename] = entry;
	}
	return meta;
}

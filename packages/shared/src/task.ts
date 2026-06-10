// A task is the attorney's folder on disk + a free-text label that primes the
// AI (<TASK>). Tasks are global (not scoped to a profile). The registry entry
// lives in the config home; the folder holds the documents + their labels.

export type Task = {
	id: string;
	/** Absolute path to the attorney's folder. */
	folder: string;
	/** Short display name (sidebar / switcher). Falls back to label/folder. */
	name?: string;
	/** Free-text "what this task is" — the brief, fed to Patrick as <TASK>. */
	label: string;
	/** Running task notes (human + Patrick via saveNote) — also fed to <TASK>. */
	notes?: string;
	createdAt: string;
	lastOpenedAt?: string;
};

export type TaskSummary = {
	id: string;
	name?: string;
	label: string;
	folder: string;
};

/** What to show as the task's name in lists. */
export function taskDisplayName(t: {
	name?: string;
	label?: string;
	folder: string;
}): string {
	return (
		t.name?.trim() ||
		t.label?.trim() ||
		t.folder.split("/").at(-1) ||
		"Untitled task"
	);
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
};

/** Per-folder document awareness keyed by filename. Stored with the folder. */
export type DocumentMeta = Record<
	string,
	{
		label?: string;
		excluded?: boolean;
		starred?: boolean;
		createdInPatrick?: boolean;
	}
>;

export function taskSummary(t: Task): TaskSummary {
	return { id: t.id, name: t.name, label: t.label, folder: t.folder };
}

// New tasks seed the short name from the folder; the brief (label) starts empty
// for the attorney to fill.
export function createTask(id: string, folder: string, name: string): Task {
	return { id, folder, name, label: "", createdAt: new Date().toISOString() };
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
		if (Object.keys(entry).length > 0) meta[d.filename] = entry;
	}
	return meta;
}

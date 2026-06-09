// A task is the attorney's folder on disk + a free-text label that primes the
// AI (<TASK>). Tasks are global (not scoped to a profile). The registry entry
// lives in the config home; the folder holds the documents + their labels.

export type Task = {
	id: string;
	/** Absolute path to the attorney's folder. */
	folder: string;
	/** Free-text "what this task is" — shown in lists and fed to AgentPat. */
	label: string;
	createdAt: string;
	lastOpenedAt?: string;
};

export type TaskSummary = {
	id: string;
	label: string;
	folder: string;
};

// A document is any file in the task folder (PDF/DOCX, pre-existing or AI-made —
// no distinction). `label` is the free-text awareness one-liner (signpost).
export type Document = {
	filename: string;
	label?: string;
	excluded?: boolean;
	starred?: boolean;
};

/** Per-folder document awareness keyed by filename. Stored with the folder. */
export type DocumentMeta = Record<
	string,
	{ label?: string; excluded?: boolean; starred?: boolean }
>;

export function taskSummary(t: Task): TaskSummary {
	return { id: t.id, label: t.label, folder: t.folder };
}

export function createTask(id: string, folder: string, label: string): Task {
	return { id, folder, label, createdAt: new Date().toISOString() };
}

/** Collapse a document list back to the stored meta map (dropping empties). */
export function toDocumentMeta(documents: Document[]): DocumentMeta {
	const meta: DocumentMeta = {};
	for (const d of documents) {
		const entry: DocumentMeta[string] = {};
		if (d.label?.trim()) entry.label = d.label.trim();
		if (d.excluded) entry.excluded = true;
		if (d.starred) entry.starred = true;
		if (Object.keys(entry).length > 0) meta[d.filename] = entry;
	}
	return meta;
}

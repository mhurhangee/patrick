import { estimatePdfTokens, estimateTextTokens } from "@patrick/shared";
import { useSyncExternalStore } from "react";

// A read-only source can only become chat context once it's been opened (OPEN =
// CONTEXT), and at open time the client knows its size — pdfjs gives a PDF's page
// count, the text viewer has the character count. We capture that model-independent
// size here (persisted to localStorage, keyed by task+filename) so the context
// control can estimate the tokens a doc will cost, for any model, without re-reading
// the file. Estimates only — exact counts come from the provider after a turn.

export type DocSize = { pages?: number; chars?: number };

const KEY = "patrick:doc-sizes";
// Task ids are UUIDs (no spaces), so a space cleanly separates task from filename.
const SEP = " ";
type Store = Record<string, DocSize>;

function load(): Store {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
	} catch {
		return {};
	}
}

let store: Store = load();
const listeners = new Set<() => void>();
const keyOf = (taskId: string, filename: string) =>
	`${taskId}${SEP}${filename}`;

/** Capture a doc's size when it's opened (PDF pages / text chars). */
export function recordDocSize(taskId: string, filename: string, size: DocSize) {
	// Skip until the task resolves — a key under "" can never be read back.
	if (!taskId) return;
	const k = keyOf(taskId, filename);
	const prev = store[k];
	if (prev && prev.pages === size.pages && prev.chars === size.chars) return;
	store = { ...store, [k]: { ...prev, ...size } };
	try {
		localStorage.setItem(KEY, JSON.stringify(store));
	} catch {
		// localStorage unavailable (private mode etc.) — estimates degrade, no crash.
	}
	for (const l of listeners) l();
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

/** A reactive getter for captured doc sizes in the active task. */
export function useDocSize(
	taskId: string | undefined,
): (filename: string) => DocSize | undefined {
	const snap = useSyncExternalStore(subscribe, () => store);
	return (filename: string) =>
		taskId ? snap[keyOf(taskId, filename)] : undefined;
}

/** Token estimate for a captured size against a model; null when size unknown. */
export function estimateDocTokens(
	size: DocSize | undefined,
	modelId: string,
): number | null {
	if (!size) return null;
	if (size.pages != null) return estimatePdfTokens(size.pages, modelId);
	if (size.chars != null) return estimateTextTokens(size.chars);
	return null;
}

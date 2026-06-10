import type {
	Document,
	DocumentMeta,
	PinnedSource,
	Task,
	TaskSummary,
} from "@patrick/shared";
import { api, BASE_URL } from "./client";

export type ChatPreviewBody = {
	profileId: string;
	pinnedSources: PinnedSource[];
	activeDraft: string | null;
	templateOverride?: string | null;
};

export const tasksApi = {
	list: () => api.get<TaskSummary[]>("/tasks"),
	get: (id: string) => api.get<Task>(`/tasks/${id}`),
	/** Resolve the exact system prompt a turn would send, without a model call. */
	chatPreview: (id: string, body: ChatPreviewBody) =>
		api.post<{ system: string }>(`/tasks/${id}/chat/preview`, body),
	/** Raw URL for a document's bytes (for the PDF/docx viewers). */
	fileUrl: (id: string, filename: string) =>
		`${BASE_URL}/tasks/${id}/documents/${encodeURIComponent(filename)}`,
	create: (folder: string) => api.post<Task>("/tasks", { folder }),
	update: (task: Task) => api.put<Task>(`/tasks/${task.id}`, task),
	remove: (id: string) => api.del<{ ok: boolean }>(`/tasks/${id}`),
	documents: (id: string) => api.get<Document[]>(`/tasks/${id}/documents`),
	saveDocuments: (id: string, meta: DocumentMeta) =>
		api.put<{ ok: boolean }>(`/tasks/${id}/documents`, meta),
	/** Create a new blank Patrick-owned .docx; returns its filename. */
	createDocument: (id: string, filename?: string) =>
		api.post<{ filename: string }>(`/tasks/${id}/documents`, { filename }),
	/** Unlock an original → working copy; returns the copy's filename. */
	unlockDocument: (id: string, filename: string) =>
		api.post<{ filename: string }>(
			`/tasks/${id}/documents/${encodeURIComponent(filename)}/copy`,
			{},
		),
	/** Rename a Patrick-owned doc; returns the (possibly deduped) new filename. */
	renameDocument: (id: string, from: string, to: string) =>
		api.post<{ filename: string }>(
			`/tasks/${id}/documents/${encodeURIComponent(from)}/rename`,
			{ to },
		),
	/** Delete a Patrick-owned doc. */
	removeDocument: (id: string, filename: string) =>
		api.del<{ ok: boolean }>(
			`/tasks/${id}/documents/${encodeURIComponent(filename)}`,
		),
	/** Overwrite a Patrick-owned doc's bytes (editor autosave). */
	saveFile: async (id: string, filename: string, bytes: ArrayBuffer) => {
		const res = await fetch(
			`${BASE_URL}/tasks/${id}/documents/${encodeURIComponent(filename)}`,
			{ method: "PUT", body: bytes },
		);
		if (!res.ok) throw new Error(`save ${filename} failed: ${res.status}`);
	},
};

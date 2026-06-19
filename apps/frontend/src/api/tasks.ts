import type {
	Chat,
	ChatSummary,
	Document,
	DocumentMeta,
	ExtractedDoc,
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
	/** Persisted chats for a task (sidebar list). */
	chats: (id: string) => api.get<ChatSummary[]>(`/tasks/${id}/chats`),
	/** Load a full persisted chat (messages + locked template + pinned set). */
	chat: (id: string, chatId: string) =>
		api.get<Chat>(`/tasks/${id}/chats/${chatId}`),
	removeChat: (id: string, chatId: string) =>
		api.del<{ ok: boolean }>(`/tasks/${id}/chats/${chatId}`),
	/** Star / rename a chat (attorney-set meta). */
	updateChatMeta: (
		id: string,
		chatId: string,
		patch: { starred?: boolean; customTitle?: string },
	) => api.post<{ ok: boolean }>(`/tasks/${id}/chats/${chatId}/meta`, patch),
	/** Write a chat record directly (Fork: materialise a sliced copy). */
	saveChat: (
		id: string,
		chatId: string,
		body: Pick<Chat, "systemTemplate" | "pinnedSources" | "messages">,
	) => api.put<Chat>(`/tasks/${id}/chats/${chatId}`, body),
	/** Raw URL for a document's bytes (for the PDF/docx viewers). */
	fileUrl: (id: string, filename: string) =>
		`${BASE_URL}/tasks/${id}/documents/${encodeURIComponent(filename)}`,
	create: (folder: string) => api.post<Task>("/tasks", { folder }),
	update: (task: Task) => api.put<Task>(`/tasks/${task.id}`, task),
	remove: (id: string) => api.del<{ ok: boolean }>(`/tasks/${id}`),
	documents: (id: string) => api.get<Document[]>(`/tasks/${id}/documents`),
	saveDocuments: (id: string, meta: DocumentMeta) =>
		api.put<{ ok: boolean }>(`/tasks/${id}/documents`, meta),
	/** AI-generate + apply a label (and chat suggestions) for one document. */
	generateLabel: (id: string, filename: string, profileId: string) =>
		api.post<{ label: string; suggestions: string[] }>(
			`/tasks/${id}/documents/${encodeURIComponent(filename)}/label`,
			{ profileId },
		),
	/** Create a new blank Patrick-owned .docx; returns its filename. */
	createDocument: (id: string, filename?: string) =>
		api.post<{ filename: string }>(`/tasks/${id}/documents`, { filename }),
	/** The extracted text (text layer / OCR) for a PDF, for the selectable overlay. */
	extractedText: (id: string, filename: string) =>
		api.get<ExtractedDoc>(
			`/tasks/${id}/documents/${encodeURIComponent(filename)}/text`,
		),
	/** Persist a PDF's extracted text (the frontend does the extraction). */
	saveExtractedText: (id: string, filename: string, doc: ExtractedDoc) =>
		api.put<{ ok: boolean }>(
			`/tasks/${id}/documents/${encodeURIComponent(filename)}/text`,
			doc,
		),
	/** Fetch an EP/WO publication's full text from EPO OPS → saved document.
	 *  Surfaces the server's error message (bad number, US unsupported, missing
	 *  key) so Patrick can relay it. */
	fetchPublication: async (id: string, number: string, profileId: string) => {
		const res = await fetch(`${BASE_URL}/tasks/${id}/publication`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ number, profileId }),
		});
		const data = (await res.json().catch(() => ({}))) as {
			filename?: string;
			summary?: string;
			error?: string;
		};
		if (!res.ok)
			throw new Error(data.error ?? `publication fetch failed: ${res.status}`);
		return data as { filename: string; summary: string };
	},
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

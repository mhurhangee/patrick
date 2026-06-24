import type {
	Chart,
	ChartCell,
	ChartSummary,
	Chat,
	ChatSummary,
	ClaimLimitation,
	Document,
	DocumentMeta,
	ExtractedDoc,
	LimitationRead,
	LimitationReview,
	SearchIndex,
	Task,
	TaskSummary,
} from "@patrick/shared";
import { api, BASE_URL } from "./client";

export const tasksApi = {
	list: () => api.get<TaskSummary[]>("/tasks"),
	get: (id: string) => api.get<Task>(`/tasks/${id}`),
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
		body: Pick<Chat, "systemTemplate" | "model" | "pinnedSources" | "messages">,
	) => api.put<Chat>(`/tasks/${id}/chats/${chatId}`, body),
	/** Charts (claim charts + future analysis types) for a task — sidebar list. */
	charts: (id: string) => api.get<ChartSummary[]>(`/tasks/${id}/charts`),
	/** Load a full chart record. */
	chart: (id: string, chartId: string) =>
		api.get<Chart>(`/tasks/${id}/charts/${chartId}`),
	/** Create a blank claim chart; returns the new record. */
	createChart: (id: string, title?: string) =>
		api.post<Chart>(`/tasks/${id}/charts`, { title }),
	/** Parse the requested claim(s) into limitations (rows), construed re: the description. */
	parseChart: (
		id: string,
		chartId: string,
		body: {
			filename: string;
			profileId: string;
			claims: string;
			constructionSupport?: string;
		},
	) =>
		api.post<{ limitations: ClaimLimitation[] }>(
			`/tasks/${id}/charts/${chartId}/parse`,
			body,
		),
	/** Save a chart record wholesale (the editor owns the full object). */
	saveChart: (id: string, chartId: string, body: Chart) =>
		api.put<Chart>(`/tasks/${id}/charts/${chartId}`, body),
	/** Whole-document read of one reference → per-limitation judgements (hybrid/full-doc). */
	readReference: (
		id: string,
		chartId: string,
		body: {
			profileId: string;
			reference: string;
			primer?: string;
			limitations: ClaimLimitation[];
		},
	) => api.post<LimitationRead[]>(`/tasks/${id}/charts/${chartId}/read`, body),
	/** Reviewer pass over a column's cells → issues per limitation. */
	reviewColumn: (
		id: string,
		chartId: string,
		body: {
			profileId: string;
			reference: string;
			primer?: string;
			limitations: ClaimLimitation[];
			cells: ChartCell[];
		},
	) =>
		api.post<LimitationReview[]>(`/tasks/${id}/charts/${chartId}/review`, body),
	removeChart: (id: string, chartId: string) =>
		api.del<{ ok: boolean }>(`/tasks/${id}/charts/${chartId}`),
	/** Star / rename a chart (attorney-set meta). */
	updateChartMeta: (
		id: string,
		chartId: string,
		patch: { starred?: boolean; title?: string },
	) => api.post<{ ok: boolean }>(`/tasks/${id}/charts/${chartId}/meta`, patch),
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
	/** The persisted search index for a document (chunks + embeddings); 404 if none. */
	searchIndex: (id: string, filename: string) =>
		api.get<SearchIndex>(
			`/tasks/${id}/documents/${encodeURIComponent(filename)}/index`,
		),
	/** Persist a document's search index (the frontend builds it in the webview). */
	saveSearchIndex: (id: string, filename: string, index: SearchIndex) =>
		api.put<{ ok: boolean }>(
			`/tasks/${id}/documents/${encodeURIComponent(filename)}/index`,
			index,
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

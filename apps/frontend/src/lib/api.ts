import type {
	ApiChat,
	ApiChatMessage,
	ApiTask,
	ExtractionRecord,
	ExtractionSummary,
	Flags,
	Settings,
	TaskType,
} from "@patrickos/shared"

export const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, init)
	if (!res.ok) {
		// Surface the server's { error } message when present
		let detail = ""
		try {
			const body = (await res.json()) as { error?: string }
			if (body?.error) detail = ` — ${body.error}`
		} catch {
			// non-JSON body
		}
		throw new Error(`API ${res.status}: ${path}${detail}`)
	}
	return res.json() as Promise<T>
}

function json(body: unknown, init?: RequestInit): RequestInit {
	return {
		...init,
		headers: { "Content-Type": "application/json", ...init?.headers },
		body: JSON.stringify(body),
	}
}

type DeepPartial<T> = T extends object
	? { [K in keyof T]?: DeepPartial<T[K]> }
	: T

export const api = {
	config: {
		getDir: () => request<{ configDir: string }>("/config/dir"),
		setDir: (configDir: string) =>
			request<{ ok: boolean; configDir: string }>(
				"/config/dir",
				json({ configDir }, { method: "PUT" }),
			),
		probe: (dir: string) =>
			request<{ exists: boolean }>(
				`/config/probe?dir=${encodeURIComponent(dir)}`,
			),
	},
	settings: {
		get: () => request<Settings>("/settings"),
		update: (patch: DeepPartial<Settings>) =>
			request<Settings>("/settings", json(patch, { method: "PUT" })),
	},
	extractpat: {
		// assetType: a specific source type id, or "auto" to classify first
		extract: (
			filePath: string,
			assetType: string,
			provider: string,
			apiKey: string,
			model: string,
		) =>
			request<ExtractionRecord>(
				"/ai/extractpat/extract",
				json(
					{ filePath, assetType, provider, apiKey, model },
					{ method: "POST" },
				),
			),
	},
	extractpatStream: {
		// Streams the extraction. Calls handlers as NDJSON lines arrive.
		run: async (
			filePath: string,
			assetType: string,
			provider: string,
			apiKey: string,
			model: string,
			handlers: {
				onMeta?: (assetType: string) => void
				onPartial?: (object: Record<string, unknown>) => void
				onDone?: (record: ExtractionRecord) => void
			},
		) => {
			const res = await fetch(`${BASE_URL}/ai/extractpat/extract/stream`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ filePath, assetType, provider, apiKey, model }),
			})
			if (!res.ok || !res.body) {
				let detail = ""
				try {
					const body = (await res.json()) as { error?: string }
					if (body?.error) detail = ` — ${body.error}`
				} catch {}
				throw new Error(`API ${res.status}${detail}`)
			}
			const reader = res.body.getReader()
			const decoder = new TextDecoder()
			let buf = ""
			for (;;) {
				const { done, value } = await reader.read()
				if (done) break
				buf += decoder.decode(value, { stream: true })
				let nl: number
				// biome-ignore lint/suspicious/noAssignInExpressions: stream line splitting
				while ((nl = buf.indexOf("\n")) >= 0) {
					const line = buf.slice(0, nl).trim()
					buf = buf.slice(nl + 1)
					if (!line) continue
					const msg = JSON.parse(line) as {
						type: string
						assetType?: string
						object?: Record<string, unknown>
						record?: ExtractionRecord
						message?: string
					}
					if (msg.type === "meta" && msg.assetType)
						handlers.onMeta?.(msg.assetType)
					else if (msg.type === "partial" && msg.object)
						handlers.onPartial?.(msg.object)
					else if (msg.type === "done" && msg.record)
						handlers.onDone?.(msg.record)
					else if (msg.type === "error")
						throw new Error(msg.message ?? "Extraction failed.")
				}
			}
		},
	},
	extractions: {
		list: (taskPath: string) =>
			request<ExtractionSummary[]>(
				`/extractions?taskPath=${encodeURIComponent(taskPath)}`,
			),
		get: (taskPath: string, filename: string) =>
			request<ExtractionRecord | null>(
				`/extractions/file?taskPath=${encodeURIComponent(taskPath)}&filename=${encodeURIComponent(filename)}`,
			),
		save: (taskPath: string, record: ExtractionRecord) =>
			request<ExtractionRecord>(
				"/extractions/file",
				json({ taskPath, record }, { method: "PUT" }),
			),
		delete: (taskPath: string, filename: string) =>
			request<{ ok: boolean }>(
				`/extractions/file?taskPath=${encodeURIComponent(taskPath)}&filename=${encodeURIComponent(filename)}`,
				{ method: "DELETE" },
			),
	},
	// Per-file flags (excluded + starred) — one file, meta/flags.json.
	flags: {
		get: (taskPath: string) =>
			request<Flags>(`/flags?taskPath=${encodeURIComponent(taskPath)}`),
		set: (taskPath: string, flags: Flags) =>
			request<{ ok: boolean }>(
				"/flags",
				json({ taskPath, flags }, { method: "PUT" }),
			),
	},
	// Per-source notes — Plate JSON in notes/{filename}.json.
	notes: {
		get: (taskPath: string, filename: string) =>
			request<{ content: string } | null>(
				`/notes/file?taskPath=${encodeURIComponent(taskPath)}&filename=${encodeURIComponent(filename)}`,
			),
		save: (taskPath: string, filename: string, content: string) =>
			request<{ ok: boolean }>(
				"/notes/file",
				json({ taskPath, filename, content }, { method: "PUT" }),
			),
		delete: (taskPath: string, filename: string) =>
			request<{ ok: boolean }>(
				`/notes/file?taskPath=${encodeURIComponent(taskPath)}&filename=${encodeURIComponent(filename)}`,
				{ method: "DELETE" },
			),
	},
	ai: {
		verifyKey: (provider: string, apiKey: string) =>
			request<{ valid: boolean; error?: string }>(
				"/ai/verify",
				json({ provider, apiKey }, { method: "POST" }),
			),
		getModels: (apiKey: string) =>
			request<{
				models: {
					id: string
					name: string
					description?: string | null
					pricing?: { input: string; output: string } | null
					specification: { provider: string; modelId: string }
				}[]
			}>("/ai/models", json({ apiKey }, { method: "POST" })),
	},
	tasks: {
		list: () => request<ApiTask[]>("/tasks"),
		probe: (path: string) =>
			request<{ exists: boolean; sourceCount: number }>(
				`/tasks/probe?path=${encodeURIComponent(path)}`,
			),
		create: (path: string, name?: string, taskType?: TaskType) =>
			request<ApiTask>(
				"/tasks",
				json({ path, name, taskType }, { method: "POST" }),
			),
		update: (path: string, patch: { name?: string; taskType?: TaskType }) =>
			request<ApiTask>("/tasks", json({ path, ...patch }, { method: "PATCH" })),
		delete: (path: string) =>
			request<{ ok: boolean }>("/tasks", json({ path }, { method: "DELETE" })),
		listFiles: (path: string) =>
			request<{
				sources: { filename: string; path: string; ext: string }[]
				artifacts: {
					filename: string
					path: string
					ext: string
					createdAt: string
					updatedAt: string
				}[]
			}>(`/tasks/files?path=${encodeURIComponent(path)}`),
	},
	artifacts: {
		create: (taskPath: string, title: string) =>
			request<{
				filename: string
				path: string
				taskPath: string
				title: string
			}>("/artifacts", json({ taskPath, title }, { method: "POST" })),
		rename: (taskPath: string, filename: string, newTitle: string) =>
			request<{
				filename: string
				path: string
				taskPath: string
				title: string
			}>(
				"/artifacts/rename",
				json({ taskPath, filename, newTitle }, { method: "PUT" }),
			),
		delete: (taskPath: string, filename: string) =>
			request<{ ok: boolean }>(
				`/artifacts?taskPath=${encodeURIComponent(taskPath)}&filename=${encodeURIComponent(filename)}`,
				{ method: "DELETE" },
			),
	},
	chats: {
		list: (taskPath: string) =>
			request<ApiChat[]>(`/chats?taskPath=${encodeURIComponent(taskPath)}`),
		create: (taskPath: string, title: string, id?: string) =>
			request<ApiChat>(
				"/chats",
				json({ taskPath, title, ...(id ? { id } : {}) }, { method: "POST" }),
			),
		update: (
			id: string,
			taskPath: string,
			patch: { title?: string; starred?: boolean },
		) =>
			request<ApiChat>(
				`/chats/${id}`,
				json({ taskPath, ...patch }, { method: "PATCH" }),
			),
		delete: (id: string, taskPath: string) =>
			request<{ ok: boolean }>(
				`/chats/${id}?taskPath=${encodeURIComponent(taskPath)}`,
				{ method: "DELETE" },
			),
		getMessages: (chatId: string, taskPath: string) =>
			request<ApiChatMessage[]>(
				`/chats/${chatId}/messages?taskPath=${encodeURIComponent(taskPath)}`,
			),
		summarize: (
			chatId: string,
			taskPath: string,
			provider: string,
			apiKey: string,
			model: string,
		) =>
			request<{ summary: string }>(
				`/chats/${chatId}/summarize`,
				json({ taskPath, provider, apiKey, model }, { method: "POST" }),
			),
		fork: (chatId: string, taskPath: string, uptoMessageId: string) =>
			request<ApiChat>(
				`/chats/${chatId}/fork`,
				json({ taskPath, uptoMessageId }, { method: "POST" }),
			),
	},
}

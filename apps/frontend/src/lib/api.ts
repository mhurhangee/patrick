import type {
	AnalysisRecord,
	AnalysisSummary,
	ApiChat,
	ApiChatMessage,
	ApiProject,
	Settings,
} from "@patrickos/shared"

export const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, init)
	if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
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
			request<AnalysisRecord>(
				"/ai/extractpat/extract",
				json(
					{ filePath, assetType, provider, apiKey, model },
					{ method: "POST" },
				),
			),
	},
	analysis: {
		list: (projectPath: string) =>
			request<AnalysisSummary[]>(
				`/analysis?projectPath=${encodeURIComponent(projectPath)}`,
			),
		get: (projectPath: string, filename: string) =>
			request<AnalysisRecord | null>(
				`/analysis/file?projectPath=${encodeURIComponent(projectPath)}&filename=${encodeURIComponent(filename)}`,
			),
		save: (projectPath: string, record: AnalysisRecord) =>
			request<AnalysisRecord>(
				"/analysis/file",
				json({ projectPath, record }, { method: "PUT" }),
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
	projects: {
		list: () => request<ApiProject[]>("/projects"),
		create: (path: string, name?: string) =>
			request<ApiProject>(
				"/projects",
				json({ path, name }, { method: "POST" }),
			),
		rename: (path: string, name: string) =>
			request<ApiProject>(
				"/projects",
				json({ path, name }, { method: "PATCH" }),
			),
		delete: (path: string) =>
			request<{ ok: boolean }>(
				"/projects",
				json({ path }, { method: "DELETE" }),
			),
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
			}>(`/projects/files?path=${encodeURIComponent(path)}`),
	},
	artifacts: {
		create: (projectPath: string, title: string) =>
			request<{
				filename: string
				path: string
				projectPath: string
				title: string
			}>("/artifacts", json({ projectPath, title }, { method: "POST" })),
	},
	chats: {
		list: (projectPath: string) =>
			request<ApiChat[]>(
				`/chats?projectPath=${encodeURIComponent(projectPath)}`,
			),
		create: (projectPath: string, title: string, id?: string) =>
			request<ApiChat>(
				"/chats",
				json({ projectPath, title, ...(id ? { id } : {}) }, { method: "POST" }),
			),
		update: (id: string, projectPath: string, title: string) =>
			request<ApiChat>(
				`/chats/${id}`,
				json({ projectPath, title }, { method: "PATCH" }),
			),
		delete: (id: string, projectPath: string) =>
			request<{ ok: boolean }>(
				`/chats/${id}?projectPath=${encodeURIComponent(projectPath)}`,
				{ method: "DELETE" },
			),
		getMessages: (chatId: string, projectPath: string) =>
			request<ApiChatMessage[]>(
				`/chats/${chatId}/messages?projectPath=${encodeURIComponent(projectPath)}`,
			),
	},
}

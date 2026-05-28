import type {
	ApiAsset,
	ApiChat,
	ApiChatMessage,
	ApiProject,
	ApiSettings,
	ProjectType,
} from "@patrickos/db"

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

export const api = {
	settings: {
		get: () => request<ApiSettings>("/settings"),
		update: (patch: Partial<Omit<ApiSettings, "id">>) =>
			request<ApiSettings>("/settings", json(patch, { method: "PUT" })),
	},
	extractpat: {
		extract: (
			assetId: string,
			provider: string,
			apiKey: string,
			model: string,
		) =>
			request<{ extracted: Record<string, unknown>; assetType: string }>(
				"/ai/extractpat/extract",
				json({ assetId, provider, apiKey, model }, { method: "POST" }),
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
		create: (name: string, type: ProjectType = "office-action-response") =>
			request<ApiProject>(
				"/projects",
				json({ name, type }, { method: "POST" }),
			),
		update: (id: string, patch: { name?: string; type?: ProjectType }) =>
			request<ApiProject>(`/projects/${id}`, json(patch, { method: "PUT" })),
		delete: (id: string) =>
			request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
	},
	chats: {
		list: (projectId: string) =>
			request<ApiChat[]>(`/chats?projectId=${projectId}`),
		create: (projectId: string, title: string, id?: string) =>
			request<ApiChat>(
				"/chats",
				json({ projectId, title, ...(id ? { id } : {}) }, { method: "POST" }),
			),
		update: (id: string, title: string) =>
			request<ApiChat>(`/chats/${id}`, json({ title }, { method: "PATCH" })),
		delete: (id: string) =>
			request<{ ok: boolean }>(`/chats/${id}`, { method: "DELETE" }),
		getMessages: (chatId: string) =>
			request<ApiChatMessage[]>(`/chats/${chatId}/messages`),
	},
	assets: {
		list: (projectId: string) =>
			request<ApiAsset[]>(`/assets?projectId=${projectId}`),
		create: (
			data: Pick<ApiAsset, "projectId" | "title" | "type" | "kind"> &
				Partial<Pick<ApiAsset, "content" | "date" | "notes">>,
		) => request<ApiAsset>("/assets", json(data, { method: "POST" })),
		createSource: (formData: FormData) =>
			request<ApiAsset>("/assets", { method: "POST", body: formData }),
		update: (
			id: string,
			patch: Partial<
				Pick<
					ApiAsset,
					"title" | "content" | "type" | "kind" | "date" | "notes" | "details"
				>
			>,
		) => request<ApiAsset>(`/assets/${id}`, json(patch, { method: "PUT" })),
		delete: (id: string) =>
			request<{ ok: boolean }>(`/assets/${id}`, { method: "DELETE" }),
	},
}

import type { AssetKind, AssetType } from "@patrickos/db"

export const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

export type ApiProject = {
	id: string
	name: string
	createdAt: string
	updatedAt: string
}

export type ApiAsset = {
	id: string
	projectId: string
	title: string
	content: string
	type: AssetType
	kind: AssetKind
	date: string
	notes: string
	metadata: string
	createdAt: string
	updatedAt: string
}

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
	projects: {
		list: () => request<ApiProject[]>("/projects"),
		create: (name: string) =>
			request<ApiProject>("/projects", json({ name }, { method: "POST" })),
		rename: (id: string, name: string) =>
			request<ApiProject>(`/projects/${id}`, json({ name }, { method: "PUT" })),
		delete: (id: string) =>
			request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
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
				Pick<ApiAsset, "title" | "content" | "type" | "kind" | "date" | "notes">
			>,
		) => request<ApiAsset>(`/assets/${id}`, json(patch, { method: "PUT" })),
		delete: (id: string) =>
			request<{ ok: boolean }>(`/assets/${id}`, { method: "DELETE" }),
	},
}

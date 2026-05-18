import type { ArtifactKind, ArtifactType } from "@patrickos/db"

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

export type ApiProject = {
	id: string
	name: string
	createdAt: string
	updatedAt: string
}

export type ApiArtifact = {
	id: string
	projectId: string
	title: string
	content: string
	type: ArtifactType
	kind: ArtifactKind
	date: string
	notes: string
	createdAt: string
	updatedAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, init)
	if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
	return res.json() as Promise<T>
}

function json(body: unknown, init?: RequestInit): RequestInit {
	return { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, body: JSON.stringify(body) }
}

export const api = {
	projects: {
		list: () => request<ApiProject[]>("/projects"),
		create: (name: string) => request<ApiProject>("/projects", json({ name }, { method: "POST" })),
	},
	artifacts: {
		list: (projectId: string) => request<ApiArtifact[]>(`/artifacts?projectId=${projectId}`),
		create: (data: Pick<ApiArtifact, "projectId" | "title" | "type" | "kind"> & Partial<Pick<ApiArtifact, "content" | "date" | "notes">>) =>
			request<ApiArtifact>("/artifacts", json(data, { method: "POST" })),
		update: (id: string, patch: Partial<Pick<ApiArtifact, "title" | "content" | "type" | "kind" | "date" | "notes">>) =>
			request<ApiArtifact>(`/artifacts/${id}`, json(patch, { method: "PUT" })),
		delete: (id: string) => request<{ ok: boolean }>(`/artifacts/${id}`, { method: "DELETE" }),
	},
}

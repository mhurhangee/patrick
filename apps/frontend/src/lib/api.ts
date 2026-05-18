const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

export type ApiProject = {
	id: string
	name: string
	createdAt: string
	updatedAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, init)
	if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
	return res.json() as Promise<T>
}

export const api = {
	projects: {
		list: () => request<ApiProject[]>("/projects"),
		create: (name: string) =>
			request<ApiProject>("/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			}),
	},
}

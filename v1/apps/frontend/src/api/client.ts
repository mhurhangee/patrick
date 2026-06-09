const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		headers: { "Content-Type": "application/json" },
		...init,
	});
	if (!res.ok) {
		throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
	}
	return res.json() as Promise<T>;
}

export const api = {
	get: <T>(path: string) => request<T>(path),
	post: <T>(path: string, body: unknown) =>
		request<T>(path, { method: "POST", body: JSON.stringify(body) }),
	put: <T>(path: string, body: unknown) =>
		request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
	del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

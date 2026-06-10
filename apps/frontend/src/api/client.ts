declare global {
	interface Window {
		// Injected by the Tauri shell before page load — the sidecar API's port.
		__API_URL__?: string;
	}
}

// In the desktop app the Tauri host spawns the API on a private port and injects
// its URL; in browser dev we fall back to the configured/default local server.
export const BASE_URL =
	(typeof window !== "undefined" && window.__API_URL__) ||
	import.meta.env.VITE_API_URL ||
	"http://localhost:3001";

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

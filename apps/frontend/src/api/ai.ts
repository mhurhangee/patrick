import type { Provider } from "@patrick/shared";
import { api } from "./client";

export const aiApi = {
	verify: (provider: Provider, apiKey: string) =>
		api.post<{ valid: boolean; error?: string }>("/ai/verify", {
			provider,
			apiKey,
		}),
};

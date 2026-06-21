import { api } from "./client";

export const opsApi = {
	verify: (consumerKey: string, consumerSecret: string) =>
		api.post<{ valid: boolean; error?: string }>("/ops/verify", {
			consumerKey,
			consumerSecret,
		}),
};

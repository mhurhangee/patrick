import type { Provider } from "@patrick/shared";
import { useQuery } from "@tanstack/react-query";
import { aiApi } from "@/api/ai";

export type KeyStatus = "idle" | "verifying" | "valid" | "invalid";

/**
 * Verify a provider + API key, cached app-wide by [provider, key]. Pass
 * `enabled` to auto-verify (e.g. the sidebar reading the saved key); leave it
 * off for manual verification via `refetch()` (the profile AI tab).
 */
export function useKeyVerification(
	provider: Provider | undefined,
	apiKey: string | undefined,
	options?: { enabled?: boolean },
) {
	return useQuery({
		queryKey: ["ai-verify", provider, apiKey] as const,
		queryFn: () => aiApi.verify(provider as Provider, apiKey as string),
		enabled: (options?.enabled ?? false) && !!provider && !!apiKey,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
}

export function keyStatusOf(query: {
	isFetching: boolean;
	isError: boolean;
	data?: { valid: boolean };
}): KeyStatus {
	if (query.isFetching) return "verifying";
	if (query.isError) return "invalid";
	if (query.data) return query.data.valid ? "valid" : "invalid";
	return "idle";
}

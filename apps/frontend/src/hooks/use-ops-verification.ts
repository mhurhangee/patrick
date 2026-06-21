import { useQuery } from "@tanstack/react-query";
import { opsApi } from "@/api/ops";

/**
 * Verify EPO OPS credentials, cached by [key, secret]. Pass `enabled` to
 * auto-verify; the result feeds `keyStatusOf` (from use-key-verification) like
 * the AI key check.
 */
export function useOpsVerification(
	consumerKey: string | undefined,
	consumerSecret: string | undefined,
	options?: { enabled?: boolean },
) {
	return useQuery({
		queryKey: ["ops-verify", consumerKey, consumerSecret] as const,
		queryFn: () =>
			opsApi.verify(consumerKey as string, consumerSecret as string),
		enabled: (options?.enabled ?? false) && !!consumerKey && !!consumerSecret,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		// Only retries real network/5xx blips (bad creds are a 200 {valid:false}).
		retry: 2,
	});
}

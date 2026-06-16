import { useQuery } from "@tanstack/react-query";
import { lawApi } from "@/api/law";

// The taggable EPC provisions for the chat `/` picker. The map is bundled in the
// API, so this never changes within a session — fetch once and keep it.
export function useLawProvisions() {
	return useQuery({
		queryKey: ["law", "provisions"],
		queryFn: lawApi.provisions,
		staleTime: Number.POSITIVE_INFINITY,
	});
}

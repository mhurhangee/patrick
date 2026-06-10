import type { Profile, ProfileSummary } from "@patrick/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { profilesApi } from "@/api/profiles";

const keys = {
	list: ["profiles"] as const,
	one: (id: string) => ["profiles", id] as const,
};

export function useProfiles() {
	return useQuery({ queryKey: keys.list, queryFn: profilesApi.list });
}

export function useProfile(id: string | undefined) {
	return useQuery({
		queryKey: keys.one(id ?? ""),
		queryFn: () => profilesApi.get(id as string),
		enabled: !!id,
	});
}

export function useCreateProfile() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (name: string) => profilesApi.create(name),
		onSuccess: () => qc.invalidateQueries({ queryKey: keys.list }),
	});
}

export function useUpdateProfile() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (profile: Profile) => profilesApi.update(profile),
		onSuccess: (saved) => {
			qc.setQueryData(keys.one(saved.id), saved);
			qc.invalidateQueries({ queryKey: keys.list });
		},
	});
}

export function useDeleteProfile() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => profilesApi.remove(id),
		// Optimistic: drop it from the list now so leaving is instant.
		onMutate: async (id) => {
			await qc.cancelQueries({ queryKey: keys.list });
			const prev = qc.getQueryData<ProfileSummary[]>(keys.list);
			qc.setQueryData<ProfileSummary[]>(keys.list, (xs) =>
				xs?.filter((p) => p.id !== id),
			);
			return { prev };
		},
		onError: (_e, _id, ctx) => {
			if (ctx?.prev) qc.setQueryData(keys.list, ctx.prev);
		},
		onSettled: () => qc.invalidateQueries({ queryKey: keys.list }),
	});
}

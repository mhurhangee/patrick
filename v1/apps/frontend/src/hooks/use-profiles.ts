import type { Profile } from "@patrick/shared";
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

import type { Profile, ProfileSummary } from "@patrick/shared";
import { api } from "./client";

export const profilesApi = {
	list: () => api.get<ProfileSummary[]>("/profiles"),
	get: (id: string) => api.get<Profile>(`/profiles/${id}`),
	create: (name: string) => api.post<Profile>("/profiles", { name }),
	update: (profile: Profile) =>
		api.put<Profile>(`/profiles/${profile.id}`, profile),
};

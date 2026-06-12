import { applyProfileTemplate, type ProfileTemplate } from "@patrick/shared";
import { useNavigate } from "@tanstack/react-router";
import { useCreateProfile, useUpdateProfile } from "@/hooks/use-profiles";
import { useCreateTask } from "@/hooks/use-tasks";
import { useActiveProfile } from "@/lib/active-profile";
import { useActiveTask } from "@/lib/active-task";
import { pickFolder } from "@/lib/desktop";

// Create-then-configure flows shared by the switchers and the empty states:
// create the entity, make it active, and open its surface. Keeps the "new X"
// behaviour in one place instead of duplicated across the sidebar and the
// empty-state CTAs.

export function useNewProfile() {
	const navigate = useNavigate();
	const { setActiveProfileId } = useActiveProfile();
	const create = useCreateProfile();
	const update = useUpdateProfile();

	// Optionally pre-fill from a template (practice context + Patrick's prompt),
	// then open the profile surface to review/tweak.
	const newProfile = (template: ProfileTemplate | null) =>
		create.mutate("Untitled profile", {
			onSuccess: (profile) => {
				const open = () => {
					setActiveProfileId(profile.id);
					navigate({ to: "/profile" });
				};
				if (template)
					update.mutate(applyProfileTemplate(profile, template), {
						onSuccess: open,
					});
				else open();
			},
		});

	return { newProfile, pending: create.isPending || update.isPending };
}

export function useNewTask() {
	const navigate = useNavigate();
	const { setActiveTaskId } = useActiveTask();
	const create = useCreateTask();

	const newTaskFromFolder = (path: string) =>
		create.mutate(path.trim(), {
			onSuccess: (task) => {
				setActiveTaskId(task.id);
				navigate({ to: "/workspace" });
			},
		});

	// Desktop: native folder picker. Browser callers pass a typed path instead.
	const pickAndCreate = async () => {
		const path = await pickFolder();
		if (path) newTaskFromFolder(path);
	};

	return {
		newTaskFromFolder,
		pickAndCreate,
		pending: create.isPending,
		isError: create.isError,
		error: create.error,
	};
}

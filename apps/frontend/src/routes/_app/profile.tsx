import { Skeleton } from "@patrick/ui/components/skeleton";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProfileForm } from "@/components/profile/profile-form";
import { SurfaceScaffold } from "@/components/workspace/surface-scaffold";
import {
	useDeleteProfile,
	useProfile,
	useUpdateProfile,
} from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";

export const Route = createFileRoute("/_app/profile")({
	component: ProfileSurface,
});

// The profile editor as an in-panel surface — the shell (sidebar + Patrick)
// stays put around it. Edits the active profile.
function ProfileSurface() {
	const navigate = useNavigate();
	const { activeProfileId, setActiveProfileId } = useActiveProfile();
	const { data: profile, isLoading } = useProfile(activeProfileId);
	const update = useUpdateProfile();
	const del = useDeleteProfile();

	// Delete clears to the empty state (pick/create) rather than silently
	// switching to another profile.
	const deleteProfile = async () => {
		if (!activeProfileId) return;
		await del.mutateAsync(activeProfileId);
		setActiveProfileId(undefined);
		navigate({ to: "/workspace" });
	};

	return (
		<SurfaceScaffold>
			{isLoading || !profile ? (
				<div className="mx-auto max-w-4xl space-y-4 px-6 py-8">
					<Skeleton className="h-9 w-72" />
					<Skeleton className="h-28 w-full" />
					<Skeleton className="h-28 w-full" />
				</div>
			) : (
				<ProfileForm
					key={profile.id}
					profile={profile}
					saving={update.isPending}
					onSave={(next) => update.mutate(next)}
					onDelete={deleteProfile}
				/>
			)}
		</SurfaceScaffold>
	);
}

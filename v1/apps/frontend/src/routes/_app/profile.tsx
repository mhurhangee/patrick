import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ProfileForm } from "@/components/profile/profile-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useDeleteProfile,
	useProfile,
	useUpdateProfile,
} from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";

export const Route = createFileRoute("/_app/profile")({
	component: Profile,
});

function Profile() {
	const navigate = useNavigate();
	const { activeProfileId, setActiveProfileId } = useActiveProfile();
	const { data: profile, isLoading } = useProfile(activeProfileId);
	const update = useUpdateProfile();
	const del = useDeleteProfile();

	const deleteProfile = async (id: string) => {
		await del.mutateAsync(id);
		setActiveProfileId(undefined);
		navigate({ to: "/profiles" });
	};

	const nav = (
		<div className="flex items-center justify-between">
			<Button asChild variant="ghost" size="sm" className="-ml-2">
				<Link to="/workspace">
					<ArrowLeft />
					Workspace
				</Link>
			</Button>
			<Button asChild variant="ghost" size="sm">
				<Link to="/profiles">Switch profile</Link>
			</Button>
		</div>
	);

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto max-w-3xl space-y-6 p-8">
				{isLoading || !profile ? (
					<div className="space-y-4">
						{nav}
						<Skeleton className="h-9 w-72" />
						<Skeleton className="h-28 w-full" />
						<Skeleton className="h-28 w-full" />
					</div>
				) : (
					<ProfileForm
						key={profile.id}
						profile={profile}
						nav={nav}
						saving={update.isPending}
						onSave={(next) => update.mutate(next)}
						onDelete={() => deleteProfile(profile.id)}
					/>
				)}
			</div>
		</div>
	);
}

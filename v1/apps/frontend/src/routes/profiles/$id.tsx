import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { ProfileForm } from "@/components/profile/profile-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useDeleteProfile,
	useProfile,
	useUpdateProfile,
} from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";

export const Route = createFileRoute("/profiles/$id")({
	component: ProfileSetup,
});

function ProfileSetup() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const { setActiveProfileId } = useActiveProfile();
	const { data: profile, isLoading } = useProfile(id);
	const update = useUpdateProfile();
	const del = useDeleteProfile();

	// Picking/creating a profile here makes it the active one.
	useEffect(() => setActiveProfileId(id), [id, setActiveProfileId]);

	const deleteProfile = async () => {
		await del.mutateAsync(id);
		setActiveProfileId(undefined);
		navigate({ to: "/profiles" });
	};

	const back = (
		<Button asChild variant="ghost" size="sm" className="-ml-2">
			<Link to="/profiles">
				<ArrowLeft />
				Profiles
			</Link>
		</Button>
	);

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto max-w-3xl space-y-6 p-8">
				{isLoading || !profile ? (
					<div className="space-y-4">
						{back}
						<Skeleton className="h-9 w-72" />
						<Skeleton className="h-28 w-full" />
						<Skeleton className="h-28 w-full" />
					</div>
				) : (
					<ProfileForm
						key={profile.id}
						profile={profile}
						nav={back}
						fallbackTitle="Set up your profile"
						subtitle="Review your details, then continue to pick a task."
						saving={update.isPending}
						onSave={(next) => update.mutate(next)}
						onDelete={deleteProfile}
						primaryAction={{
							label: "Continue to tasks →",
							onClick: () => navigate({ to: "/tasks" }),
						}}
					/>
				)}
			</div>
		</div>
	);
}

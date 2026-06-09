import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { ProfileForm } from "@/components/profile/profile-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile, useUpdateProfile } from "@/hooks/use-profiles";
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

	// Picking/creating a profile here makes it the active one.
	useEffect(() => setActiveProfileId(id), [id, setActiveProfileId]);

	const proceed = (next: Parameters<typeof update.mutate>[0]) =>
		update.mutate(next, { onSuccess: () => navigate({ to: "/tasks" }) });

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto max-w-2xl space-y-6 p-8">
				<div className="space-y-3">
					<Button asChild variant="ghost" size="sm" className="-ml-2">
						<Link to="/profiles">
							<ArrowLeft />
							Profiles
						</Link>
					</Button>
					<div>
						<h1>{profile?.identity.name || "Set up your profile"}</h1>
						<p className="text-sm text-muted-foreground">
							Review your details, then continue to pick a task.
						</p>
					</div>
				</div>

				{isLoading || !profile ? (
					<div className="space-y-4">
						<Skeleton className="h-9 w-72" />
						<Skeleton className="h-28 w-full" />
						<Skeleton className="h-28 w-full" />
					</div>
				) : (
					<ProfileForm
						key={profile.id}
						profile={profile}
						saving={update.isPending}
						saveLabel="Continue to tasks →"
						allowClean
						onSave={proceed}
					/>
				)}
			</div>
		</div>
	);
}

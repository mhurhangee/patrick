import {
	applyProfileTemplate,
	PROFILE_TEMPLATES,
	type ProfileTemplate,
} from "@patrick/shared";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useCreateProfile,
	useProfiles,
	useUpdateProfile,
} from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";
import { initialsOf } from "@/lib/text";

export const Route = createFileRoute("/profiles/")({
	component: ProfilesPicker,
});

function ProfilesPicker() {
	const navigate = useNavigate();
	const { activeProfileId } = useActiveProfile();
	const { data: profiles, isLoading } = useProfiles();
	const create = useCreateProfile();
	const update = useUpdateProfile();

	const review = (id: string) =>
		navigate({ to: "/profiles/$id", params: { id } });

	// New profile, optionally pre-filled from a template (practice context +
	// Patrick's prompt). The attorney sets their own name/firm in the editor.
	const createWith = (template: ProfileTemplate | null) =>
		create.mutate("Untitled profile", {
			onSuccess: (profile) => {
				if (template)
					update.mutate(applyProfileTemplate(profile, template), {
						onSuccess: () => review(profile.id),
					});
				else review(profile.id);
			},
		});

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
				<div className="flex h-8 items-center justify-end">
					{activeProfileId && (
						<Button asChild variant="ghost" size="sm">
							<Link to="/tasks">
								Tasks
								<ArrowRight />
							</Link>
						</Button>
					)}
				</div>

				<div className="flex items-center gap-3">
					<Patrick size={32} />
					<div>
						<h1>Patrick</h1>
						<p className="text-sm text-muted-foreground">
							Choose a profile to continue.
						</p>
					</div>
				</div>

				<div className="grid gap-3 sm:grid-cols-2">
					{isLoading
						? [0, 1].map((i) => (
								<Skeleton key={i} className="h-20 rounded-lg" />
							))
						: profiles?.map((p) => (
								<button
									type="button"
									key={p.id}
									onClick={() => review(p.id)}
									className="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
								>
									<span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
										{initialsOf(p.name)}
									</span>
									<div className="min-w-0 flex-1">
										<div className="truncate font-medium">
											{p.name || "Untitled profile"}
										</div>
										{p.firm && (
											<div className="truncate text-sm text-muted-foreground">
												{p.firm}
											</div>
										)}
									</div>
								</button>
							))}

					<Popover>
						<PopoverTrigger asChild>
							<button
								type="button"
								disabled={create.isPending || update.isPending}
								className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
							>
								<Plus className="size-4" />
								{create.isPending || update.isPending
									? "Creating…"
									: "New profile"}
							</button>
						</PopoverTrigger>
						<PopoverContent align="center" className="w-80 p-1">
							<p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
								Start from a template
							</p>
							{PROFILE_TEMPLATES.map((t) => (
								<button
									type="button"
									key={t.id}
									onClick={() => createWith(t)}
									className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent"
								>
									<div className="text-sm font-medium">{t.name}</div>
									<div className="text-xs text-muted-foreground">
										{t.description}
									</div>
								</button>
							))}
							<div className="my-1 border-t" />
							<button
								type="button"
								onClick={() => createWith(null)}
								className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
							>
								Blank profile
							</button>
						</PopoverContent>
					</Popover>
				</div>
			</div>
		</div>
	);
}

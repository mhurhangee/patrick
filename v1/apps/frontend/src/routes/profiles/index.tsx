import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Logo } from "@/components/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateProfile, useProfiles } from "@/hooks/use-profiles";
import { initialsOf } from "@/lib/text";

export const Route = createFileRoute("/profiles/")({
	component: ProfilesPicker,
});

function ProfilesPicker() {
	const navigate = useNavigate();
	const { data: profiles, isLoading } = useProfiles();
	const create = useCreateProfile();

	const review = (id: string) =>
		navigate({ to: "/profiles/$id", params: { id } });

	const createNew = () =>
		create.mutate("Untitled profile", {
			onSuccess: (profile) => review(profile.id),
		});

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-8 p-8">
				<div className="flex items-center gap-3">
					<Logo size={32} />
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

					<button
						type="button"
						onClick={createNew}
						disabled={create.isPending}
						className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
					>
						<Plus className="size-4" />
						{create.isPending ? "Creating…" : "New profile"}
					</button>
				</div>
			</div>
		</div>
	);
}

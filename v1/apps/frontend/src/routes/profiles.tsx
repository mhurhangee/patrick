import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Logo } from "@/components/logo";
import { mockProfiles } from "@/lib/mock-data";

export const Route = createFileRoute("/profiles")({
	component: Profiles,
});

function Profiles() {
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
					{mockProfiles.map((p) => (
						<Link
							key={p.id}
							to="/tasks"
							className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
						>
							<span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
								{p.initials}
							</span>
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">{p.name}</div>
								<div className="truncate text-sm text-muted-foreground">
									{p.firm}
								</div>
								<div className="mt-0.5 text-xs text-muted-foreground">
									{p.taskCount} tasks · {p.lastUsed}
								</div>
							</div>
						</Link>
					))}

					<button
						type="button"
						className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<Plus className="size-4" />
						New profile
					</button>
				</div>
			</div>
		</div>
	);
}

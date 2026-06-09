import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profiles";
import { useActiveProfile } from "@/lib/active-profile";
import { mockTasks } from "@/lib/mock-data";

export const Route = createFileRoute("/tasks")({
	component: Tasks,
});

function Tasks() {
	const { activeProfileId } = useActiveProfile();
	const { data: profile } = useProfile(activeProfileId);
	const subtitle = [profile?.identity.name, profile?.identity.firm]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-8 p-8">
				<div className="space-y-3">
					<Button asChild variant="ghost" size="sm" className="-ml-2">
						<Link to="/profiles">
							<ArrowLeft />
							Profiles
						</Link>
					</Button>
					<div>
						<h1>Tasks</h1>
						{subtitle && (
							<p className="text-sm text-muted-foreground">{subtitle}</p>
						)}
					</div>
				</div>

				<div className="space-y-2">
					{mockTasks.map((t) => (
						<Link
							key={t.id}
							to="/workspace"
							className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
						>
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">{t.title}</div>
								<div className="truncate text-sm text-muted-foreground">
									{t.reference}
								</div>
							</div>
							<Badge variant="secondary">{t.type}</Badge>
							<div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
								{t.docCount} docs · {t.lastOpened}
							</div>
						</Link>
					))}

					<button
						type="button"
						className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<FolderOpen className="size-4" />
						Open a folder as a task
					</button>
				</div>
			</div>
		</div>
	);
}

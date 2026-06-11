import { createFileRoute } from "@tanstack/react-router";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6">
			<Patrick size={64} />
			<Patrick variant="tile" size={64} />
			<Patrick variant="drawing" size={64} />
			<Patrick variant="scanning" size={64} />
			<h1 className="font-heading text-4xl font-semibold tracking-tighter">
				Patrick
			</h1>
			<p className="max-w-xs text-center text-muted-foreground">
				Open-source, agent-first patent prosecution assistant.
			</p>
			<Button size="lg" asChild>
				<a href="/profiles" className="text-sm font-medium">
					Workspace
				</a>
			</Button>
		</div>
	);
}

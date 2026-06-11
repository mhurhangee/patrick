import { createFileRoute, Link } from "@tanstack/react-router";
import { Patrick } from "@/components/patrick";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/docs")({ component: Docs });

function Docs() {
	return (
		<div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-28 text-center">
			<Patrick size={48} />
			<h1 className="text-3xl sm:text-4xl">Docs are on the way</h1>
			<p className="text-lg leading-relaxed text-muted-foreground">
				Getting started, setting up your AI key, and working with Patrick — all
				landing with the alpha. In the meantime, the app walks you through setup
				on first run.
			</p>
			<Button asChild className="h-11 rounded-lg px-6 text-sm">
				<Link to="/">Back home</Link>
			</Button>
		</div>
	);
}

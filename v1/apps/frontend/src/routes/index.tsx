import { createFileRoute } from "@tanstack/react-router";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6">
			<Logo size={40} />
			<h1 className="font-heading text-4xl font-semibold tracking-tighter">
				Patrick
			</h1>
		</div>
	);
}

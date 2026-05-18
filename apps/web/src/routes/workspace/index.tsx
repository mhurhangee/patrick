import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/workspace/")({
	component: WorkspacePage,
})

function WorkspacePage() {
	return (
		<div className="flex min-h-svh items-center justify-center">
			<p className="text-muted-foreground text-sm">Workspace — coming soon</p>
		</div>
	)
}

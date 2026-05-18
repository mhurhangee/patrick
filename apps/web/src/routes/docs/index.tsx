import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/docs/")({
	component: DocsPage,
})

function DocsPage() {
	return (
		<div className="flex min-h-svh items-center justify-center">
			<p className="text-muted-foreground text-sm">Docs — coming soon</p>
		</div>
	)
}

import { createFileRoute } from "@tanstack/react-router"
import Content from "@/content/docs/desktop.mdx"

export const Route = createFileRoute("/docs/desktop")({
	component: () => (
		<div className="prose prose-stone dark:prose-invert max-w-2xl">
			<Content />
		</div>
	),
})

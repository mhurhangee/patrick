import { createFileRoute } from "@tanstack/react-router"
import Content from "@/content/docs/getting-started.mdx"

export const Route = createFileRoute("/docs/getting-started")({
	component: () => (
		<div className="prose prose-stone dark:prose-invert max-w-2xl">
			<Content />
		</div>
	),
})

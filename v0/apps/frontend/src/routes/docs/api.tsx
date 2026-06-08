import { createFileRoute } from "@tanstack/react-router"
import Content from "@/content/docs/api.mdx"

export const Route = createFileRoute("/docs/api")({
	component: () => (
		<div className="prose prose-stone dark:prose-invert max-w-2xl">
			<Content />
		</div>
	),
})

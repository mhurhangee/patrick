import { createFileRoute } from "@tanstack/react-router"
import Content from "@/content/docs/ai.mdx"

export const Route = createFileRoute("/docs/ai")({
	component: () => (
		<div className="prose prose-stone dark:prose-invert max-w-2xl">
			<Content />
		</div>
	),
})
